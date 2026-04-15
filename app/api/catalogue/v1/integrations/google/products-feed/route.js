export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { db, collection, getDocs } from "@/lib/firebase/admin-firestore";
import { formatMoneyExact } from "@/lib/money";
import { resolveGoogleTargetCountries, resolveMarketplaceSeller } from "@/lib/integrations/google-marketplace";
import { loadGoogleMerchantSettings } from "@/lib/platform/google-merchant-settings";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";
import { normalizeSellerDeliveryProfile, sellerDeliverySettingsReady } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getCanonicalOfferBarcode } from "@/lib/catalogue/offer-group";
import { googleFeedAvailabilityForVariant, variantIsListable } from "@/lib/catalogue/availability";

const VAT = 0.15;
const FEED_TITLE = "Piessang Product Feed";
const FEED_DESC = "Google Merchant product feed for Piessang marketplace";
const FEED_LINK = "https://piessang.com";

const PRODUCTS_COLLECTION = "products_v2";
const GOOGLE_FEED_SECRET = process.env.GOOGLE_FEED_SECRET || "";
const sellerOwnerCache = new Map();

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
  if (!ageRange) return "";
  if (ageRange.includes("month") || ageRange.startsWith("0-") || ageRange.startsWith("3-")) return "infant";
  if (ageRange.includes("2-4") || ageRange.includes("toddler")) return "toddler";
  return "";
};
const getGoogleShippingWeight = (variant) => {
  const weight = Number(variant?.logistics?.billable_weight_kg ?? variant?.logistics?.weight_kg);
  return Number.isFinite(weight) && weight > 0 ? `${weight.toFixed(2)} kg` : "";
};
const hasNumber = (v) => typeof v === "number" && Number.isFinite(v);
const slugify = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const toStr = (value, fallback = "") => (value == null ? fallback : String(value).trim());

const moneyIncl = (excl) => {
  const n = Number(excl);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatMoneyExact(n * (1 + VAT), { currencySymbol: "", space: false });
};
const explicitMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0
    ? formatMoneyExact(n, { currencySymbol: "", space: false })
    : null;
};

const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
const isEligibleProduct = async (p, merchantCountryCodes) =>
  p?.placement?.isActive === true &&
  p?.placement?.supplier_out_of_stock !== true &&
  String(p?.moderation?.status || "").trim().toLowerCase() === "published" &&
  !isSellerAccountUnavailable(p) &&
  sellerDeliverySettingsReady(p?.seller?.deliveryProfile || {}) &&
  (await resolveGoogleTargetCountries({
    seller: p?.seller,
    sellerCountry: p?.seller?.sellerCountry,
    deliveryProfile: p?.seller?.deliveryProfile,
    merchantCountryCodes,
  })).length > 0;

function buildActiveSlugSet(rows, slugReader) {
  return new Set(
    rows
      .filter((r) => r?.placement?.isActive === true)
      .map(slugReader)
      .map((s) => String(s || "").trim())
      .filter(Boolean)
  );
}

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

function availabilityForVariant(variant) {
  return googleFeedAvailabilityForVariant(variant);
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

function productLink(uniqueId, title, variantId) {
  const slug = slugify(title) || "product";
  const params = new URLSearchParams();
  params.set("unique_id", String(uniqueId || ""));
  if (String(variantId || "").trim()) {
    params.set("variant_id", String(variantId).trim());
  }
  return `https://piessang.com/products/${slug}?${params.toString()}`;
}

function variantPriceFields(variant) {
  const baseIncl = hasNumber(variant?.pricing?.selling_price_incl)
    ? explicitMoney(variant.pricing.selling_price_incl)
    : moneyIncl(variant?.pricing?.selling_price_excl);
  if (!baseIncl) return null;

  if (isSaleLive(variant)) {
    const saleIncl = hasNumber(variant?.sale?.sale_price_incl)
      ? explicitMoney(variant.sale.sale_price_incl)
      : moneyIncl(variant?.sale?.sale_price_excl);
    if (saleIncl) {
      return {
        price: `${baseIncl} ZAR`,
        salePrice: `${saleIncl} ZAR`,
      };
    }
  }

  return {
    price: `${baseIncl} ZAR`,
    salePrice: null,
  };
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

function isEligibleVariantForGoogle(product, variant) {
  const variantId = String(variant?.variant_id || "").trim();
  const variantActive = variant?.placement?.isActive !== false;
  const image = resolveVariantImage(product, variant);
  return (
    Boolean(variantId) &&
    variantActive &&
    Boolean(image) &&
    Boolean(variantPriceFields(variant)) &&
    variantIsListable(variant)
  );
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

function getGoogleCandidatePrice(variant) {
  const priced = variantPriceFields(variant);
  if (!priced?.salePrice && !priced?.price) return Number.POSITIVE_INFINITY;
  const value = String(priced.salePrice || priced.price || "")
    .replace(/[^\d.]/g, "")
    .trim();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function pickCheapestGroupedFeedItems(items = []) {
  const grouped = new Map();

  for (const item of items) {
    const barcode = String(item?.canonicalBarcode || "").trim().toUpperCase();
    const targetCountry = String(item?.targetCountry || "").trim().toUpperCase();
    const groupKey = barcode && targetCountry ? `${barcode}::${targetCountry}` : null;
    if (!groupKey) {
      grouped.set(`__ungrouped__${grouped.size}`, item);
      continue;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, item);
      continue;
    }

    const current = grouped.get(groupKey);
    if (item.priceIncl < current.priceIncl) {
      grouped.set(groupKey, item);
      continue;
    }

    if (item.priceIncl === current.priceIncl && String(item.offerId).localeCompare(String(current.offerId)) < 0) {
      grouped.set(groupKey, item);
    }
  }

  return Array.from(grouped.values());
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    if (GOOGLE_FEED_SECRET) {
      const secret = String(searchParams.get("secret") || "");
      if (secret !== GOOGLE_FEED_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const rawLimit = Number.parseInt(String(searchParams.get("limit") || "").trim(), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;

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

    const rawProductRows = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const productRows = await Promise.all(rawProductRows.map((product) => hydrateProductSeller(product)));
    let products = [];
    for (const product of productRows) {
      if (!hasActiveParents(product)) continue;
      if (!(await isEligibleProduct(product, merchantCountryCodes))) continue;
      products.push(product);
    }
    if (limit != null) products = products.slice(0, limit);

    const now = new Date().toUTCString();
    const candidateItems = [];

    for (const p of products) {
      const uniqueId = String(p?.product?.unique_id || "").trim();
      const title = String(p?.product?.title || "").trim();
      if (!uniqueId || !title) continue;

      const desc =
        stripHtml(p?.product?.description) || `${title} available on Piessang Marketplace`;
      const brand = prettifyTaxonomyPart(p?.grouping?.brand) || "Piessang";
      const category = prettifyTaxonomyPart(p?.grouping?.category);
      const subCategory = prettifyTaxonomyPart(p?.grouping?.subCategory);
      const googleCategory = buildGoogleCategory(p?.grouping);
      const marketplaceSeller = resolveMarketplaceSeller({
        product: p?.product,
        seller: p?.seller,
        vendor: p?.vendor,
      });

      const variants = Array.isArray(p?.variants) ? p.variants.filter((variant) => isEligibleVariantForGoogle(p, variant)) : [];
      const canonicalBarcode =
        String(
          p?.marketplace?.canonical_offer_barcode ||
            getCanonicalOfferBarcode(variants) ||
            ""
        )
          .trim()
          .toUpperCase() || null;
      for (const v of variants) {
        const variantId = String(v?.variant_id || "").trim();
        if (!variantId) continue;

        const priceFields = variantPriceFields(v);
        if (!priceFields) continue;
        const image = resolveVariantImage(p, v);

        const vLabel = String(v?.label || "").trim();
        const itemTitle = vLabel ? `${title} - ${vLabel}` : title;
        const sku = String(v?.sku || "").trim();
        const gtin = String(v?.barcode || "").trim();
        const googleCondition = getGoogleCondition(p);
        const googleColor = toStr(v?.color || v?.shade);
        const googleSize = toStr(v?.size);
        const googleMaterial = toStr(v?.material);
        const googleAgeGroup = getGoogleAgeGroup(v);
        const googleShippingWeight = getGoogleShippingWeight(v);
        const availability = availabilityForVariant(v);
        const targetCountries = await resolveGoogleTargetCountries({
          seller: p?.seller,
          sellerCountry: p?.seller?.sellerCountry,
          deliveryProfile: p?.seller?.deliveryProfile,
          merchantCountryCodes,
        });

        for (const targetCountry of targetCountries) {
          const link = productLink(uniqueId, title, variantId);
          const normalizedTargetCountry = String(targetCountry || "ZA").trim().toUpperCase();
          const offerId = `${uniqueId}-${variantId}`;
          const xml = [
            "<item>",
            `<g:id>${esc(offerId)}</g:id>`,
            `<g:item_group_id>${esc(uniqueId)}</g:item_group_id>`,
            `<title>${esc(itemTitle)}</title>`,
            `<description>${esc(desc)}</description>`,
            `<link>${esc(link)}</link>`,
            image ? `<g:image_link>${esc(image)}</g:image_link>` : "",
            `<g:brand>${esc(brand)}</g:brand>`,
            `<g:external_seller_id>${esc(marketplaceSeller.externalSellerId)}</g:external_seller_id>`,
            `<g:condition>${esc(googleCondition)}</g:condition>`,
            `<g:availability>${esc(availability)}</g:availability>`,
            `<g:price>${esc(priceFields.price)}</g:price>`,
            priceFields.salePrice ? `<g:sale_price>${esc(priceFields.salePrice)}</g:sale_price>` : "",
            gtin ? `<g:gtin>${esc(gtin)}</g:gtin>` : "",
            sku ? `<g:mpn>${esc(sku)}</g:mpn>` : "",
            googleColor ? `<g:color>${esc(googleColor)}</g:color>` : "",
            googleSize ? `<g:size>${esc(googleSize)}</g:size>` : "",
            googleMaterial ? `<g:material>${esc(googleMaterial)}</g:material>` : "",
            googleAgeGroup ? `<g:age_group>${esc(googleAgeGroup)}</g:age_group>` : "",
            googleShippingWeight ? `<g:shipping_weight>${esc(googleShippingWeight)}</g:shipping_weight>` : "",
            `<g:google_product_category>${esc(googleCategory)}</g:google_product_category>`,
            `<g:product_type>${esc([category, subCategory].filter(Boolean).join(" > "))}</g:product_type>`,
            `<g:target_country>${esc(normalizedTargetCountry)}</g:target_country>`,
            "</item>",
          ]
            .filter(Boolean)
            .join("");

          candidateItems.push({
            xml,
            canonicalBarcode,
            targetCountry: normalizedTargetCountry,
            priceIncl: getGoogleCandidatePrice(v),
            offerId,
          });
        }
      }
    }

    const items = pickCheapestGroupedFeedItems(candidateItems).map((item) => item.xml);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(FEED_TITLE)}</title>
    <link>${esc(FEED_LINK)}</link>
    <description>${esc(FEED_DESC)}</description>
    <lastBuildDate>${esc(now)}</lastBuildDate>
    ${items.join("\n")}
  </channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    console.error("google/products-feed failed:", e);
    return new Response(
      JSON.stringify({
        ok: false,
        title: "Unexpected Error",
        message: "Failed to generate Google products feed.",
        details: String(e?.message ?? "").slice(0, 300),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
