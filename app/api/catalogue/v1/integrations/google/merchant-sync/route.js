export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { createSign } from "crypto";
import { db, collection, getDocs } from "@/lib/firebase/admin-firestore";
import { formatMoneyExact, normalizeMoneyAmount } from "@/lib/money";
import { resolveGoogleTargetCountries, resolveMarketplaceSeller } from "@/lib/integrations/google-marketplace";
import { loadGoogleMerchantSettings } from "@/lib/platform/google-merchant-settings";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";
import { normalizeSellerDeliveryProfile, sellerDeliverySettingsReady } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getCanonicalOfferBarcode } from "@/lib/catalogue/offer-group";
import {
  claimPendingGoogleSyncJobs,
  completeGoogleSyncJobs,
  failGoogleSyncJobs,
} from "@/lib/integrations/google-sync-queue";

const PRODUCTS_COLLECTION = "products_v2";
const VAT = 0.15;

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CONTENT_API_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";

const GOOGLE_MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID || "";
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
const GOOGLE_MERCHANT_SYNC_SECRET = process.env.GOOGLE_MERCHANT_SYNC_SECRET || "";
const GOOGLE_FEED_CURRENCY = (process.env.GOOGLE_FEED_CURRENCY || "ZAR").toUpperCase();
const GOOGLE_FEED_TARGET_COUNTRY = (process.env.GOOGLE_FEED_TARGET_COUNTRY || "ZA").toUpperCase();
const GOOGLE_FEED_CONTENT_LANGUAGE = (process.env.GOOGLE_FEED_CONTENT_LANGUAGE || "en").toLowerCase();
const sellerOwnerCache = new Map();

const ok = (p = {}, s = 200) => Response.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  Response.json({ ok: false, title: t, message: m, ...e }, { status: s });

const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
const slugify = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const hasNumber = (v) => typeof v === "number" && Number.isFinite(v);
const stripHtml = (v) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
const toTitleCase = (v) =>
  String(v ?? "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
const toStr = (value, fallback = "") => (value == null ? fallback : String(value).trim());
const prettifyTaxonomyPart = (v) => {
  const value = String(v ?? "").trim();
  if (!value) return "";
  if (/coca[\s-]?cola/i.test(value)) return "Coca-Cola";
  return toTitleCase(value);
};
const getGoogleCondition = (product) => {
  const category = toStr(product?.grouping?.category).toLowerCase();
  const condition = toStr(product?.product?.condition).toLowerCase();
  if (category === "pre-loved" || category === "preloved") return "used";
  if (condition && condition !== "new") return "used";
  return "new";
};
const getGoogleAgeGroup = (variant) => {
  const ageRange = toStr(variant?.ageRange).toLowerCase();
  if (!ageRange) return undefined;
  if (ageRange.includes("month") || ageRange.startsWith("0-") || ageRange.startsWith("3-")) return "infant";
  if (ageRange.includes("2-4") || ageRange.includes("toddler")) return "toddler";
  return undefined;
};
const getGoogleShippingWeight = (variant) => {
  const weight = Number(variant?.logistics?.billable_weight_kg ?? variant?.logistics?.weight_kg);
  return Number.isFinite(weight) && weight > 0 ? `${weight.toFixed(2)} kg` : undefined;
};
const getGoogleOptionalAttributes = (variant) => ({
  color: toStr(variant?.color || variant?.shade, undefined),
  size: toStr(variant?.size, undefined),
  material: toStr(variant?.material, undefined),
  ageGroup: getGoogleAgeGroup(variant),
  shippingWeight: getGoogleShippingWeight(variant),
});
const escBase64Url = (v) =>
  Buffer.from(v)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const moneyIncl = (excl) => {
  const n = Number(excl);
  if (!Number.isFinite(n) || n <= 0) return null;
  return normalizeMoneyAmount(n * (1 + VAT));
};
const explicitMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? normalizeMoneyAmount(n) : null;
};
const resolveSellingPriceIncl = (variant) => {
  if (hasNumber(variant?.pricing?.selling_price_incl)) {
    return explicitMoney(variant.pricing.selling_price_incl);
  }
  return moneyIncl(variant?.pricing?.selling_price_excl);
};
const resolveSalePriceIncl = (variant) => {
  if (!isSaleLive(variant)) return null;
  if (hasNumber(variant?.sale?.sale_price_incl)) {
    return explicitMoney(variant.sale.sale_price_incl);
  }
  return moneyIncl(variant?.sale?.sale_price_excl);
};

const sumInventory = (variant) =>
  Array.isArray(variant?.inventory)
    ? variant.inventory.reduce((sum, row) => {
        if (!row || typeof row !== "object") return sum;
        if (row?.in_stock === false) return sum;
        if (row?.supplier_out_of_stock === true) return sum;
        const qty = toNum(
          row?.in_stock_qty ??
            row?.unit_stock_qty ??
            row?.qty_available ??
            row?.quantity ??
            row?.qty
        );
        return qty > 0 ? sum + qty : sum;
      }, 0)
    : 0;

const isSaleLive = (variant) =>
  variant?.sale?.is_on_sale === true &&
  variant?.sale?.disabled_by_admin !== true &&
  toNum(variant?.sale?.qty_available) > 0;

const hasPublishedModeration = (product) =>
  String(product?.moderation?.status || "").trim().toLowerCase() === "published";

function availabilityForVariant(variant) {
  const continueSelling = variant?.placement?.continue_selling_out_of_stock === true;
  const invQty = sumInventory(variant);
  const saleQty = isSaleLive(variant) ? toNum(variant?.sale?.qty_available) : 0;

  if (invQty + saleQty > 0) return "in stock";
  if (continueSelling) return "in stock";
  return "out of stock";
}

function buildGoogleCategory(grouping) {
  const category = String(grouping?.category || "").toLowerCase();
  const subCategory = String(grouping?.subCategory || "").toLowerCase();
  const has = (s) => subCategory.includes(s);

  if (category === "water" || has("water")) return "Food, Beverages & Tobacco > Beverages > Water";
  if (category === "liquor") return "Food, Beverages & Tobacco > Beverages > Alcoholic Beverages";
  if (has("beer") || has("cider")) return "Food, Beverages & Tobacco > Beverages > Beer";
  if (has("wine")) return "Food, Beverages & Tobacco > Beverages > Wine";
  if (has("spirits") || has("liqueur")) return "Food, Beverages & Tobacco > Beverages > Spirits";
  if (has("energy")) return "Food, Beverages & Tobacco > Beverages > Energy Drinks";
  if (has("sports")) return "Food, Beverages & Tobacco > Beverages > Sports Drinks";
  return "Food, Beverages & Tobacco > Beverages";
}

function marketplaceLink(uniqueId, title, variantId) {
  const slug = slugify(title) || "product";
  const params = new URLSearchParams();
  params.set("unique_id", String(uniqueId || ""));
  if (String(variantId || "").trim()) {
    params.set("variant_id", String(variantId).trim());
  }
  return `https://piessang.com/products/${slug}?${params.toString()}`;
}

function buildActiveSlugSet(rows, slugReader) {
  return new Set(
    rows
      .filter((r) => r?.placement?.isActive === true)
      .map(slugReader)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
  );
}

function resolveVariantImage(product, variant) {
  const variantImage = Array.isArray(variant?.media?.images)
    ? variant.media.images.find((entry) => Boolean(entry?.imageUrl))?.imageUrl
    : null;
  if (variantImage) return String(variantImage).trim();
  const productImage = Array.isArray(product?.media?.images)
    ? product.media.images.find((entry) => Boolean(entry?.imageUrl))?.imageUrl
    : null;
  return productImage ? String(productImage).trim() : null;
}

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
  const hasEmbeddedDeliveryProfile =
    embeddedSeller?.deliveryProfile && typeof embeddedSeller.deliveryProfile === "object";
  const hasEmbeddedSellerIdentity =
    Boolean(
      embeddedSeller?.sellerCode ||
        embeddedSeller?.activeSellerCode ||
        embeddedSeller?.groupSellerCode ||
        embeddedSeller?.sellerSlug ||
        product?.product?.sellerCode ||
        product?.product?.sellerSlug
    );

  if (hasEmbeddedDeliveryProfile && hasEmbeddedSellerIdentity) {
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
      activeSellerSlug:
        toStr(sellerNode?.activeSellerSlug || sellerNode?.sellerSlug || embeddedSeller?.activeSellerSlug) || null,
      groupSellerSlug:
        toStr(sellerNode?.groupSellerSlug || sellerNode?.sellerSlug || embeddedSeller?.groupSellerSlug) || null,
      sellerCountry:
        toStr(
          sellerNode?.sellerCountry ||
            sellerNode?.businessDetails?.country ||
            embeddedSeller?.sellerCountry
        ) || null,
      vendorName:
        toStr(sellerNode?.vendorName || sellerNode?.groupVendorName || embeddedSeller?.vendorName || product?.product?.vendorName) ||
        null,
      deliveryProfile: normalizeSellerDeliveryProfile(
        sellerNode?.deliveryProfile && typeof sellerNode.deliveryProfile === "object"
          ? sellerNode.deliveryProfile
          : embeddedSeller?.deliveryProfile && typeof embeddedSeller.deliveryProfile === "object"
            ? embeddedSeller.deliveryProfile
            : {}
      ),
    },
  };
}

function isEligibleVariantForGoogle(product, variant) {
  const variantId = String(variant?.variant_id || "").trim();
  const variantActive = variant?.placement?.isActive !== false;
  const imageLink = resolveVariantImage(product, variant);
  const priceIncl = resolveSellingPriceIncl(variant);
  const hasListableAvailability =
    sumInventory(variant) + (isSaleLive(variant) ? toNum(variant?.sale?.qty_available) : 0) > 0 ||
    variant?.placement?.continue_selling_out_of_stock === true;
  return (
    Boolean(variantId) &&
    variantActive &&
    Boolean(imageLink) &&
    Boolean(priceIncl) &&
    hasListableAvailability
  );
}

function isEligibleProductForGoogle(product) {
  return (
    product?.placement?.isActive === true &&
    product?.placement?.supplier_out_of_stock !== true &&
    hasPublishedModeration(product) &&
    !isSellerAccountUnavailable(product)
  );
}

async function getProductGoogleSkipReasons(product, activeSets, merchantCountryCodes) {
  const reasons = [];
  if (product?.placement?.isActive !== true) reasons.push("product_inactive");
  if (product?.placement?.supplier_out_of_stock === true) reasons.push("supplier_out_of_stock");
  if (!hasPublishedModeration(product)) reasons.push("product_not_published");
  if (isSellerAccountUnavailable(product)) reasons.push("seller_unavailable");

  const category = String(product?.grouping?.category || "").trim();
  const subCategory = String(product?.grouping?.subCategory || "").trim();
  const brand = String(product?.grouping?.brand || "").trim();

  if (!category) reasons.push("missing_category");
  if (!subCategory) reasons.push("missing_subcategory");
  if (!brand) reasons.push("missing_brand");
  if (category && !activeSets.categorySlugs.has(category)) reasons.push("inactive_category");
  if (subCategory && !activeSets.subCategorySlugs.has(subCategory)) reasons.push("inactive_subcategory");
  if (brand && !activeSets.brandSlugs.has(brand)) reasons.push("inactive_brand");
  if (!sellerDeliverySettingsReady(product?.seller?.deliveryProfile || {})) {
    reasons.push("missing_delivery_settings");
  }
  if (!(await resolveGoogleTargetCountries({
    seller: product?.seller,
    sellerCountry: product?.seller?.sellerCountry,
    deliveryProfile: product?.seller?.deliveryProfile,
    merchantCountryCodes,
  })).length) {
    reasons.push("no_supported_google_target_countries");
  }

  return reasons;
}

function getVariantGoogleSkipReasons(product, variant) {
  const reasons = [];
  if (!String(variant?.variant_id || "").trim()) reasons.push("missing_variant_id");
  if (variant?.placement?.isActive === false) reasons.push("variant_inactive");
  if (!resolveVariantImage(product, variant)) reasons.push("missing_variant_image");
  if (!resolveSellingPriceIncl(variant)) reasons.push("missing_variant_price");
  const hasListableAvailability =
    sumInventory(variant) + (isSaleLive(variant) ? toNum(variant?.sale?.qty_available) : 0) > 0 ||
    variant?.placement?.continue_selling_out_of_stock === true;
  if (!hasListableAvailability) reasons.push("variant_out_of_stock");
  return reasons;
}

function buildContentApiProduct(product, variant, targetCountry = GOOGLE_FEED_TARGET_COUNTRY) {
  const uniqueId = String(product?.product?.unique_id || "").trim();
  const variantId = String(variant?.variant_id || "").trim();
  const normalizedTargetCountry = String(targetCountry || GOOGLE_FEED_TARGET_COUNTRY).trim().toUpperCase();
  const offerId = `${uniqueId}-${variantId}`;
  const priceIncl = resolveSellingPriceIncl(variant);
  if (!offerId || !priceIncl) return null;

  const saleIncl = resolveSalePriceIncl(variant);

  const baseTitle = String(product?.product?.title || "").trim();
  const variantLabel = String(variant?.label || "").trim();
  const title = variantLabel ? `${baseTitle} - ${variantLabel}` : baseTitle;
  const description =
    stripHtml(product?.product?.description) || `${title} available on Piessang Marketplace`;
  const imageLink = resolveVariantImage(product, variant);
  const brand = prettifyTaxonomyPart(product?.grouping?.brand) || "Piessang";
  const productType = [product?.grouping?.category, product?.grouping?.subCategory]
    .filter(Boolean)
    .map(prettifyTaxonomyPart)
    .join(" > ");
  const marketplaceSeller = resolveMarketplaceSeller({
    product: product?.product,
    seller: product?.seller,
    vendor: product?.vendor,
  });

  const payload = {
    offerId,
    title,
    description,
    link: marketplaceLink(uniqueId, baseTitle, variantId),
    imageLink: imageLink || undefined,
    contentLanguage: GOOGLE_FEED_CONTENT_LANGUAGE,
    targetCountry: normalizedTargetCountry,
    channel: "online",
    externalSellerId: marketplaceSeller.externalSellerId,
    availability: availabilityForVariant(variant),
    condition: getGoogleCondition(product),
    brand,
    gtin: String(variant?.barcode || "").trim() || undefined,
    mpn: String(variant?.sku || "").trim() || undefined,
    googleProductCategory: buildGoogleCategory(product?.grouping),
    productTypes: productType ? [productType] : undefined,
    price: {
      value: formatMoneyExact(priceIncl, { currencySymbol: "", space: false }),
      currency: GOOGLE_FEED_CURRENCY,
    },
  };

  if (saleIncl && saleIncl > 0) {
    payload.salePrice = {
      value: formatMoneyExact(saleIncl, { currencySymbol: "", space: false }),
      currency: GOOGLE_FEED_CURRENCY,
    };
  }

  const optionalAttributes = getGoogleOptionalAttributes(variant);
  if (optionalAttributes.color) payload.color = optionalAttributes.color;
  if (optionalAttributes.size) payload.sizes = [optionalAttributes.size];
  if (optionalAttributes.material) payload.material = optionalAttributes.material;
  if (optionalAttributes.ageGroup) payload.ageGroup = optionalAttributes.ageGroup;
  if (optionalAttributes.shippingWeight) payload.shippingWeight = {
    value: optionalAttributes.shippingWeight.replace(" kg", ""),
    unit: "kg",
  };

  return payload;
}

function getGoogleCandidatePrice(variant) {
  const saleIncl = resolveSalePriceIncl(variant);
  if (saleIncl && saleIncl > 0) return saleIncl;
  return resolveSellingPriceIncl(variant);
}

function pickCheapestGroupedEntries(entries = []) {
  const grouped = new Map();

  for (const entry of entries) {
    const barcode = String(
      entry?.product?.gtin ||
        entry?.source?.canonicalBarcode ||
        ""
    )
      .trim()
      .toUpperCase();
    const targetCountry = String(entry?.product?.targetCountry || "").trim().toUpperCase();
    const groupKey = barcode && targetCountry ? `${barcode}::${targetCountry}` : null;
    if (!groupKey) {
      grouped.set(`__ungrouped__${grouped.size}`, entry);
      continue;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, entry);
      continue;
    }

    const current = grouped.get(groupKey);
    const currentPrice = Number(current?.source?.priceIncl ?? Number.POSITIVE_INFINITY);
    const nextPrice = Number(entry?.source?.priceIncl ?? Number.POSITIVE_INFINITY);
    if (nextPrice < currentPrice) {
      grouped.set(groupKey, entry);
      continue;
    }

    if (nextPrice === currentPrice) {
      const currentOfferId = String(current?.product?.offerId || "");
      const nextOfferId = String(entry?.product?.offerId || "");
      if (nextOfferId.localeCompare(currentOfferId) < 0) {
        grouped.set(groupKey, entry);
      }
    }
  }

  return Array.from(grouped.values());
}

function buildJwtAssertion() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/content",
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp,
  };

  const encodedHeader = escBase64Url(JSON.stringify(header));
  const encodedClaim = escBase64Url(JSON.stringify(claim));
  const unsigned = `${encodedHeader}.${encodedClaim}`;

  const privateKey = GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n");
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");

  return `${unsigned}.${signature}`;
}

async function getGoogleAccessToken() {
  const assertion = buildJwtAssertion();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.access_token) {
    throw new Error(
      `OAuth token request failed: ${res.status} ${json ? JSON.stringify(json) : raw.slice(0, 500)}`
    );
  }
  return json.access_token;
}

async function pushBatch(accessToken, entries) {
  const res = await fetch(`${GOOGLE_CONTENT_API_BASE}/products/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ entries }),
  });

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(
      `Google batch failed: ${res.status} ${json ? JSON.stringify(json) : raw.slice(0, 1200)}`
    );
  }

  if (!json) {
    throw new Error(`Google batch returned non-JSON success response: ${raw.slice(0, 1200)}`);
  }

  return json;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runSync({ secret = "", dryRun = false, limit = null, productIds = null } = {}) {
  if (GOOGLE_MERCHANT_SYNC_SECRET && String(secret) !== GOOGLE_MERCHANT_SYNC_SECRET) {
    return err(401, "Unauthorized", "Invalid sync secret.");
  }

  if (!GOOGLE_MERCHANT_ID) {
    return err(400, "Missing Merchant ID", "Set GOOGLE_MERCHANT_ID.");
  }

  const [productsSnap, categoriesSnap, subCategoriesSnap, brandsSnap, merchantSettings] = await Promise.all([
    getDocs(collection(db, PRODUCTS_COLLECTION)),
    getDocs(collection(db, "categories")),
    getDocs(collection(db, "sub_categories")),
    getDocs(collection(db, "brands")),
    loadGoogleMerchantSettings(),
  ]);
  const merchantCountryCodes = merchantSettings.countryCodes || [];

  const activeCategorySlugs = buildActiveSlugSet(
    categoriesSnap.docs.map((d) => d.data() || {}),
    (x) => x?.category?.slug
  );
  const activeSubCategorySlugs = buildActiveSlugSet(
    subCategoriesSnap.docs.map((d) => d.data() || {}),
    (x) => x?.subCategory?.slug
  );
  const activeBrandSlugs = buildActiveSlugSet(
    brandsSnap.docs.map((d) => d.data() || {}),
    (x) => x?.brand?.slug
  );
  const activeSets = {
    categorySlugs: activeCategorySlugs,
    subCategorySlugs: activeSubCategorySlugs,
    brandSlugs: activeBrandSlugs,
  };

  const hasActiveParents = (p) => {
    const c = String(p?.grouping?.category || "").trim();
    const s = String(p?.grouping?.subCategory || "").trim();
    const b = String(p?.grouping?.brand || "").trim();
    return (
      Boolean(c) &&
      Boolean(s) &&
      Boolean(b) &&
      activeCategorySlugs.has(c) &&
      activeSubCategorySlugs.has(s) &&
      activeBrandSlugs.has(b)
    );
  };

  const rawProducts = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const allProducts = await Promise.all(rawProducts.map((product) => hydrateProductSeller(product)));
  const skippedProducts = [];
  const skippedVariants = [];

  let products = [];
  for (const product of allProducts) {
    if (Array.isArray(productIds) && productIds.length) {
      const productId = String(product?.product?.unique_id || product?.id || "").trim();
      if (!productIds.includes(productId)) continue;
    }
    const reasons = await getProductGoogleSkipReasons(product, activeSets, merchantCountryCodes);
    if (reasons.length) {
      skippedProducts.push({
        productId: String(product?.product?.unique_id || product?.id || "").trim() || null,
        title: String(product?.product?.title || "").trim() || "Untitled product",
        reasons,
      });
      continue;
    }
    products.push(product);
  }

  if (limit != null) products = products.slice(0, limit);

  const candidateEntries = [];
  for (const p of products) {
    const variants = Array.isArray(p?.variants) ? p.variants : [];
    const eligibleVariants = [];
    for (const variant of variants) {
      const reasons = getVariantGoogleSkipReasons(p, variant);
      if (reasons.length) {
        skippedVariants.push({
          productId: String(p?.product?.unique_id || p?.id || "").trim() || null,
          title: String(p?.product?.title || "").trim() || "Untitled product",
          variantId: String(variant?.variant_id || "").trim() || null,
          variantLabel: String(variant?.label || "").trim() || null,
          reasons,
        });
        continue;
      }
      eligibleVariants.push(variant);
    }

    const canonicalBarcode =
      String(
        p?.marketplace?.canonical_offer_barcode ||
          getCanonicalOfferBarcode(eligibleVariants) ||
          ""
      )
        .trim()
        .toUpperCase() || null;

    const targetCountries = await resolveGoogleTargetCountries({
      seller: p?.seller,
      sellerCountry: p?.seller?.sellerCountry,
      deliveryProfile: p?.seller?.deliveryProfile,
      merchantCountryCodes,
    });

    for (const v of eligibleVariants) {
      for (const targetCountry of targetCountries) {
        const productPayload = buildContentApiProduct(p, v, targetCountry);
        if (!productPayload) continue;
        candidateEntries.push({
          merchantId: GOOGLE_MERCHANT_ID,
          method: "insert",
          product: productPayload,
          source: {
            canonicalBarcode,
            priceIncl: getGoogleCandidatePrice(v),
          },
        });
      }
    }
  }

  const selectedEntries = pickCheapestGroupedEntries(candidateEntries);
  const entries = selectedEntries.map((entry, index) => ({
    batchId: index + 1,
    merchantId: entry.merchantId,
    method: entry.method,
    product: entry.product,
  }));

  if (dryRun) {
    return ok({
      mode: "dry_run",
      merchant_id: GOOGLE_MERCHANT_ID,
      products_scanned: products.length,
      entries_prepared: entries.length,
      skipped_products: skippedProducts.slice(0, 50),
      skipped_variants: skippedVariants.slice(0, 100),
      skipped_summary: {
        products: skippedProducts.length,
        variants: skippedVariants.length,
      },
      preview: entries.slice(0, 5).map((entry) => ({
        ...entry,
        target_countries: entry?.product?.targetCountry
            ? [entry.product.targetCountry]
            : [],
      })),
    });
  }

  const accessToken = await getGoogleAccessToken();
  const parts = chunk(entries, 900);
  const results = [];

  for (const part of parts) {
    const pushed = await pushBatch(accessToken, part);
    results.push(pushed);
  }

  return ok({
    mode: "push",
    merchant_id: GOOGLE_MERCHANT_ID,
    products_scanned: products.length,
    entries_pushed: entries.length,
    batches: results.length,
  });
}

export async function runQueuedSync({ secret = "", limit = 100, dryRun = false } = {}) {
  const jobs = await claimPendingGoogleSyncJobs({ limit, worker: "google-merchant-cron" });
  if (!jobs.length) {
    return ok({
      mode: dryRun ? "queue_dry_run" : "queue_push",
      merchant_id: GOOGLE_MERCHANT_ID,
      queued_jobs_claimed: 0,
      products_scanned: 0,
      entries_pushed: 0,
      batches: 0,
    });
  }

  const productIds = jobs.map((job) => String(job?.productId || "").trim()).filter(Boolean);

  try {
    const response = await runSync({ secret, dryRun, limit: null, productIds });
    if (response?.ok) {
      await completeGoogleSyncJobs(productIds);
    } else {
      await failGoogleSyncJobs(productIds, response?.message || response?.title || "Google sync failed");
    }
    return response;
  } catch (error) {
    await failGoogleSyncJobs(productIds, String(error?.message || error || "").slice(0, 1000));
    throw error;
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = String(searchParams.get("secret") || "");
    const dryRun = String(searchParams.get("dry_run") || "").toLowerCase() === "true";
    const rawLimit = Number.parseInt(String(searchParams.get("limit") || "").trim(), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
    return await runSync({ secret, dryRun, limit });
  } catch (e) {
    console.error("google/merchant-sync failed:", e);
    return err(500, "Merchant Sync Failed", "Failed to sync products to Google Merchant.", {
      details: String(e?.message ?? "").slice(0, 500),
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = String(body?.secret || "");
    const dryRun = body?.dry_run === true;
    const limit = Number.isFinite(+body?.limit) && +body.limit > 0 ? Math.trunc(+body.limit) : null;
    return await runSync({ secret, dryRun, limit });
  } catch (e) {
    console.error("google/merchant-sync failed:", e);
    return err(500, "Merchant Sync Failed", "Failed to sync products to Google Merchant.", {
      details: String(e?.message ?? "").slice(0, 500),
    });
  }
}
