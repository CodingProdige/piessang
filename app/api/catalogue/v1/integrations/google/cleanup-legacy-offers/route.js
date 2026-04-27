export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { db, collection, getDocs } from "@/lib/firebase/admin-firestore";
import { loadGoogleMerchantSettings } from "@/lib/platform/google-merchant-settings";
import { resolveGoogleTargetCountries } from "@/lib/integrations/google-marketplace";
import { buildShippingSettingsFromLegacySeller } from "@/lib/shipping/settings";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { appendGoogleMerchantLog, deleteGoogleMerchantOffers } from "@/lib/integrations/google-merchant-admin";

const PRODUCTS_COLLECTION = "products_v2";

const GOOGLE_MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID || "";
const GOOGLE_MERCHANT_SYNC_SECRET = process.env.GOOGLE_MERCHANT_SYNC_SECRET || "";
const GOOGLE_FEED_TARGET_COUNTRY = (process.env.GOOGLE_FEED_TARGET_COUNTRY || "ZA").toUpperCase();
const GOOGLE_FEED_CONTENT_LANGUAGE = (process.env.GOOGLE_FEED_CONTENT_LANGUAGE || "en").toLowerCase();

const sellerOwnerCache = new Map();

const ok = (p = {}, s = 200) => Response.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  Response.json({ ok: false, title: t, message: m, ...e }, { status: s });

const toStr = (value, fallback = "") => (value == null ? fallback : String(value).trim());

function getSellerIdentifier(product = {}) {
  return toStr(
    product?.seller?.sellerCode ||
      product?.seller?.activeSellerCode ||
      product?.seller?.groupSellerCode ||
      product?.seller?.sellerSlug ||
      product?.product?.sellerCode ||
      product?.product?.sellerSlug ||
      product?.product?.vendorSlug
  );
}

async function hydrateProductSeller(product = {}) {
  const embeddedSeller =
    product?.seller && typeof product.seller === "object" ? product.seller : {};
  const hasEmbeddedShippingSettings =
    embeddedSeller?.shippingSettings && typeof embeddedSeller.shippingSettings === "object";
  const hasEmbeddedSellerIdentity =
    Boolean(
      embeddedSeller?.sellerCode ||
        embeddedSeller?.activeSellerCode ||
        embeddedSeller?.groupSellerCode ||
        embeddedSeller?.sellerSlug ||
        product?.product?.sellerCode ||
        product?.product?.sellerSlug
    );

  if (hasEmbeddedShippingSettings && hasEmbeddedSellerIdentity) {
    return product;
  }

  const sellerIdentifier = getSellerIdentifier(product);
  if (!sellerIdentifier) return product;

  if (!sellerOwnerCache.has(sellerIdentifier)) {
    sellerOwnerCache.set(sellerIdentifier, await findSellerOwnerByIdentifier(sellerIdentifier));
  }

  const sellerOwner = sellerOwnerCache.get(sellerIdentifier);
  const sellerNode =
    sellerOwner?.data?.seller && typeof sellerOwner.data.seller === "object"
      ? sellerOwner.data.seller
      : null;
  if (!sellerNode) return product;

  return {
    ...product,
    seller: {
      ...embeddedSeller,
      sellerCode:
        toStr(
          sellerNode?.sellerCode ||
            sellerNode?.activeSellerCode ||
            sellerNode?.groupSellerCode ||
            embeddedSeller?.sellerCode ||
            product?.product?.sellerCode
        ) || null,
      sellerSlug:
        toStr(
          sellerNode?.sellerSlug ||
            sellerNode?.activeSellerSlug ||
            sellerNode?.groupSellerSlug ||
            embeddedSeller?.sellerSlug ||
            product?.product?.sellerSlug
        ) || null,
      sellerCountry:
        toStr(
          sellerNode?.sellerCountry ||
            sellerNode?.businessDetails?.country ||
            embeddedSeller?.sellerCountry
        ) || null,
      shippingSettings: buildShippingSettingsFromLegacySeller(
        sellerNode || embeddedSeller || {},
      ),
    },
  };
}

async function collectLegacyOfferIds(limit = null) {
  const [productsSnap, merchantSettings] = await Promise.all([
    getDocs(collection(db, PRODUCTS_COLLECTION)),
    loadGoogleMerchantSettings(),
  ]);
  const merchantCountryCodes = merchantSettings.countryCodes || [];

  const rawProducts = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const allProducts = await Promise.all(rawProducts.map((product) => hydrateProductSeller(product)));
  const selectedProducts = limit != null ? allProducts.slice(0, limit) : allProducts;

  const legacyOfferIds = new Set();
  for (const product of selectedProducts) {
    const uniqueId = toStr(product?.product?.unique_id);
    if (!uniqueId) continue;

    const targetCountries = await resolveGoogleTargetCountries({
      seller: product?.seller,
      sellerCountry: product?.seller?.sellerCountry,
      shippingSettings: product?.seller?.shippingSettings,
      merchantCountryCodes,
    });
    const countryCodes = targetCountries.length ? targetCountries : [GOOGLE_FEED_TARGET_COUNTRY];

    for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
      const variantId = toStr(variant?.variant_id);
      if (!variantId) continue;
      for (const countryCode of countryCodes) {
        legacyOfferIds.add(`${uniqueId}-${variantId}-${String(countryCode || GOOGLE_FEED_TARGET_COUNTRY).trim().toUpperCase()}`);
      }
    }
  }

  return Array.from(legacyOfferIds);
}

export async function runCleanup({ secret = "", limit = null, dryRun = false } = {}) {
  if (GOOGLE_MERCHANT_SYNC_SECRET && String(secret) !== GOOGLE_MERCHANT_SYNC_SECRET) {
    return err(401, "Unauthorized", "Invalid cleanup secret.");
  }

  if (!GOOGLE_MERCHANT_ID) {
    return err(400, "Missing Merchant ID", "Set GOOGLE_MERCHANT_ID.");
  }

  const offerIds = await collectLegacyOfferIds(limit);
  const entries = offerIds.map((offerId, index) => ({
    batchId: index + 1,
    merchantId: GOOGLE_MERCHANT_ID,
    method: "delete",
    productId: `online:${GOOGLE_FEED_CONTENT_LANGUAGE}:${GOOGLE_FEED_TARGET_COUNTRY}:${offerId}`,
  }));

  if (dryRun) {
    return ok({
      mode: "dry_run",
      merchant_id: GOOGLE_MERCHANT_ID,
      offers_to_delete: offerIds.length,
      preview: entries.slice(0, 20),
    });
  }

  const result = await deleteGoogleMerchantOffers(offerIds);
  await appendGoogleMerchantLog({
    source: "manual",
    action: "cleanup_legacy_offers",
    ok: true,
    summary: {
      merchantId: result.merchantId,
      offersDeleted: result.offersDeleted,
      batches: result.batches,
    },
  }).catch(() => null);

  return ok({
    mode: "delete",
    merchant_id: GOOGLE_MERCHANT_ID,
    offers_deleted: result.offersDeleted,
    batches: result.batches,
  });
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = String(searchParams.get("secret") || "");
    const dryRun = String(searchParams.get("dry_run") || "").toLowerCase() === "true";
    const rawLimit = Number.parseInt(String(searchParams.get("limit") || "").trim(), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
    return await runCleanup({ secret, limit, dryRun });
  } catch (e) {
    console.error("google/cleanup-legacy-offers failed:", e);
    return err(500, "Cleanup Failed", "Failed to delete legacy Google offers.", {
      details: String(e?.message ?? "").slice(0, 500),
    });
  }
}
