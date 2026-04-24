export const runtime = "nodejs";
export const preferredRegion = "fra1";

// app/api/catalogue/v1/products/product/get/route.js
import { NextResponse } from "next/server";
import { loadActiveCheckoutReservationMap } from "@/lib/cart/checkout-reservations";
import { getMarketplaceProductEngagementBadgeSnapshotMap } from "@/lib/analytics/product-engagement";
import { PRODUCT_ENGAGEMENT_BADGE_CONFIG } from "@/lib/analytics/product-engagement-badges";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadProductEngagementBadgeSettings } from "@/lib/platform/product-engagement-badge-settings";
import { normalizeSellerDeliveryProfile, sellerDeliverySettingsReady } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByIdentifier, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { normalizeSellerCourierProfile } from "@/lib/integrations/easyship-profile";
import {
  getSellerUnavailableReason,
  isSellerAccountUnavailable,
} from "@/lib/seller/account-status";
import { getCanonicalOfferBarcode as resolveCanonicalOfferBarcode, pickPrimaryOfferVariant } from "@/lib/catalogue/offer-group";
import {
  productHasListableAvailability,
  variantCanContinueSellingOutOfStock,
  variantTotalInStockItemsAvailable,
} from "@/lib/catalogue/availability";
import { buildProductStatus } from "@/lib/catalogue/product-status";
import { readShopperAreaFromSearchParams, resolveCourierRouteEligibilityServer } from "@/lib/shipping/shopper-country";
import { resolveShopperVisibleProducts } from "@/lib/catalogue/shopper-listing";

const ok  =(p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });
const is8 =(s)=>/^\d{8}$/.test(String(s||"").trim());
const toNumOrNull = (v)=>{
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Treat "", "null", "undefined" (any case) as absent */
function normStr(v){
  const s = String(v ?? "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low === "null" || low === "undefined") return "";
  return s;
}

/** Parse tri-state booleans; "", "null", "undefined" => null (omit) */
function toBool(v){
  if (typeof v === "boolean") return v;
  const s = normStr(v).toLowerCase();
  if (!s) return null;
  if (["true","1","yes"].includes(s)) return true;
  if (["false","0","no"].includes(s)) return false;
  return null;
}

function tsToIso(v){ return v && typeof v?.toDate==="function" ? v.toDate().toISOString() : v ?? null; }
function isoToDate(value){
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function getFirstPublishedAt(data){
  return data?.marketplace?.firstPublishedAt || data?.timestamps?.createdAt || null;
}
function isNewArrival(firstPublishedAt, windowDays = 30){
  const publishedDate = isoToDate(firstPublishedAt);
  if (!publishedDate) return false;
  const ageMs = Date.now() - publishedDate.getTime();
  if (ageMs < 0) return true;
  return ageMs <= windowDays * 24 * 60 * 60 * 1000;
}
function normalizeTimestamps(doc){
  if (!doc || typeof doc!=="object") return doc;
  const ts = doc.timestamps;
  return {
    ...doc,
    ...(ts ? { timestamps: { createdAt: tsToIso(ts.createdAt), updatedAt: tsToIso(ts.updatedAt) } } : {})
  };
}

function getPublicMarketplaceSource(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const status = normStr(doc?.moderation?.status).toLowerCase();
  const liveSnapshot = doc?.live_snapshot && typeof doc.live_snapshot === "object"
    ? normalizeTimestamps(doc.live_snapshot)
    : null;
  if (liveSnapshot && status === "in_review") {
    return liveSnapshot;
  }
  return doc;
}

function getSellerIdentifier(data) {
  return normStr(
    data?.seller?.sellerCode ||
    data?.seller?.activeSellerCode ||
    data?.seller?.groupSellerCode ||
    data?.seller?.sellerSlug ||
    data?.product?.sellerCode ||
    data?.product?.sellerSlug ||
    data?.product?.vendorSlug,
  );
}

function attachProductStatus(data) {
  if (!data || typeof data !== "object") return data;
  return {
    ...data,
    status: buildProductStatus(data),
  };
}

function applySellerDisplayData(data, sellerOwner) {
  if (!sellerOwner || !sellerOwner.data) return data;
  const seller = sellerOwner.data?.seller && typeof sellerOwner.data.seller === "object" ? sellerOwner.data.seller : {};
  const sellerCode = normStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode);
  const vendorName = normStr(seller?.vendorName || seller?.groupVendorName || "");
  const vendorDescription = normStr(seller?.vendorDescription || seller?.description || "");
  const deliveryProfile = normalizeSellerDeliveryProfile(
    seller?.deliveryProfile && typeof seller.deliveryProfile === "object" ? seller.deliveryProfile : {},
  );
  const courierProfile = normalizeSellerCourierProfile(
    seller?.courierProfile && typeof seller.courierProfile === "object" ? seller.courierProfile : {},
  );

  return {
    ...data,
    seller: {
      ...(data?.seller && typeof data.seller === "object" ? data.seller : {}),
      sellerCode: sellerCode || null,
      vendorName: vendorName || null,
      vendorDescription: vendorDescription || null,
      baseLocation: normStr(seller?.baseLocation || data?.seller?.baseLocation) || null,
      sellerSlug: normStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.seller?.sellerSlug),
      activeSellerSlug: normStr(seller?.activeSellerSlug || seller?.sellerSlug || data?.seller?.activeSellerSlug),
      groupSellerSlug: normStr(seller?.groupSellerSlug || seller?.sellerSlug || data?.seller?.groupSellerSlug),
      deliveryProfile,
      courierProfile,
    },
    product: {
      ...(data?.product && typeof data.product === "object" ? data.product : {}),
      vendorName: vendorName || data?.product?.vendorName || null,
      vendorDescription: vendorDescription || data?.product?.vendorDescription || null,
      sellerCode: sellerCode || data?.product?.sellerCode || null,
      sellerSlug: normStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.product?.sellerSlug) || null,
    },
  };
}

function productMissingSellerDeliverySettings(data, sellerOwner) {
  const fulfillmentMode = String(data?.fulfillment?.mode ?? "seller").trim().toLowerCase();
  if (fulfillmentMode !== "seller") return false;
  const seller = sellerOwner?.data?.seller && typeof sellerOwner.data.seller === "object" ? sellerOwner.data.seller : {};
  return !sellerDeliverySettingsReady(seller?.deliveryProfile || {});
}

function normText(v){
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyScore(hay, needle){
  if (!needle) return 0;
  if (!hay) return 0;
  if (hay === needle) return 100;
  if (hay.includes(needle)) return 90;

  const hTokens = hay.split(" ");
  const nTokens = needle.split(" ");
  let tokenHits = 0;
  for (const nt of nTokens){
    if (!nt) continue;
    if (hTokens.some(ht => ht.startsWith(nt) || ht.includes(nt))) tokenHits++;
  }
  let score = tokenHits > 0 ? 60 + Math.min(30, tokenHits * 10) : 0;

  // Subsequence match as a fallback
  let i = 0;
  for (const ch of needle){
    i = hay.indexOf(ch, i);
    if (i === -1) return score;
    i++;
  }
  score = Math.max(score, 40);
  return score;
}

/**
 * Inclusive grouping matcher:
 * - If a product declares a grouping level and it conflicts with a provided filter, exclude it.
 * - If any of the provided filters match a declared level, include it.
 * - Requires at least one positive match when any filter is provided (prevents unrelated items).
 */
function matchesGrouping(data, { category, subCategory, brand }) {
  const g = data?.grouping || {};
  const recordBrand = normStr(g?.brand || data?.brand?.slug);
  // Hard conflicts (product declares a level that doesn't match filter)
  if (brand && recordBrand && recordBrand !== brand) return false;
  if (subCategory && g.subCategory && g.subCategory !== subCategory) return false;
  if (category && g.category && g.category !== category) return false;

  const anyFilterProvided = !!(brand || subCategory || category);
  const anyPositiveMatch =
    (brand && recordBrand === brand) ||
    (subCategory && g.subCategory === subCategory) ||
    (category && g.category === category);

  return anyFilterProvided ? anyPositiveMatch : true;
}

function sanitizeVariantForMarketplace(v){
  if (!v || typeof v !== "object") return v;
  const next = { ...v };
  if (next?.pricing && typeof next.pricing === "object") {
    next.pricing = { ...next.pricing };
    delete next.pricing.deposit_included;
  }
  delete next.rental;
  delete next.returnable;
  return next;
}

function variantEffectivePriceExcl(v){
  if (v?.sale?.is_on_sale) return Number(v?.sale?.sale_price_excl ?? 0);
  return Number(v?.pricing?.selling_price_excl ?? 0);
}

function variantMatchesPack(v, { packUnitCount, packUnitVolume, packUnit }){
  const pack = v?.pack || {};
  if (packUnitCount != null && Number(pack?.unit_count ?? 0) !== packUnitCount) return false;
  if (packUnitVolume != null && Number(pack?.volume ?? 0) !== packUnitVolume) return false;
  if (packUnit){
    const unit = String(pack?.volume_unit ?? "").toLowerCase();
    if (unit !== packUnit) return false;
  }
  return true;
}

function variantInventoryHasStock(variant){
  const rows = Array.isArray(variant?.inventory) ? variant.inventory : [];
  if (!rows.length) return false;

  return rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    if (row?.in_stock === false) return false;
    if (row?.supplier_out_of_stock === true) return false;

    const qty = Number(
      row?.in_stock_qty ??
      row?.unit_stock_qty ??
      row?.qty_available ??
      row?.quantity ??
      row?.qty ??
      0
    );
    return Number.isFinite(qty) && qty > 0;
  });
}

function hasInStockVariants(data){
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  return variants.some((variant) => {
    if (typeof variant?.total_in_stock_items_available === "number") {
      return Number(variant.total_in_stock_items_available) > 0;
    }
    return variantTotalInStockItemsAvailable(variant) > 0;
  });
}

function enrichVariantsWithAvailability(variants, reservationMap = new Map()){
  const list = Array.isArray(variants) ? variants : [];
  return list.map((variant) => ({
    ...sanitizeVariantForMarketplace(variant),
    total_in_stock_items_available: Math.max(
      0,
      variantCanContinueSellingOutOfStock(variant)
        ? variantTotalInStockItemsAvailable(variant)
        : variantTotalInStockItemsAvailable(variant) - Number(reservationMap.get(normStr(variant?.variant_id)) || 0),
    ),
    checkout_reserved_qty: Number(reservationMap.get(normStr(variant?.variant_id)) || 0),
    checkout_reserved_unavailable:
      !variantCanContinueSellingOutOfStock(variant) &&
      variantTotalInStockItemsAvailable(variant) > 0 &&
      Math.max(0, variantTotalInStockItemsAvailable(variant) - Number(reservationMap.get(normStr(variant?.variant_id)) || 0)) <= 0,
  }));
}

function productInStock(data){
  const placement = data?.placement || {};
  if (placement?.in_stock === false) return false;
  if (placement?.supplier_out_of_stock === true) return false;

  const inv = Array.isArray(data?.inventory) ? data.inventory : [];
  if (inv.length > 0){
    return inv.some(r =>
      (r?.in_stock ?? true) === true &&
      Number(r?.unit_stock_qty ?? r?.in_stock_qty ?? 0) > 0 &&
      r?.supplier_out_of_stock !== true
    );
  }

  const vars = Array.isArray(data?.variants) ? data.variants : [];
  const vInvRows = vars.flatMap(v => (Array.isArray(v?.inventory) ? v.inventory : []));
  if (vInvRows.length > 0){
    return vInvRows.some(r => Number(r?.in_stock_qty ?? r?.unit_stock_qty ?? 0) > 0);
  }

  return placement?.in_stock !== false;
}

function getVariantPriceIncl(variant) {
  if (!variant || typeof variant !== "object") return null;
  if (variant?.sale?.is_on_sale === true && Number.isFinite(Number(variant?.sale?.sale_price_incl))) {
    return Number(variant.sale.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_incl))) {
    return Number(variant.pricing.selling_price_incl);
  }
  if (variant?.sale?.is_on_sale === true && Number.isFinite(Number(variant?.sale?.sale_price_excl))) {
    return Number(variant.sale.sale_price_excl) * 1.15;
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_excl))) {
    return Number(variant.pricing.selling_price_excl) * 1.15;
  }
  return null;
}

function getVariantAvailabilityRank(variant) {
  if (!variant || typeof variant !== "object") return 0;
  if (variantTotalInStockItemsAvailable(variant) > 0) return 2;
  if (variantCanContinueSellingOutOfStock(variant)) return 1;
  return 0;
}

function getCanonicalOfferBarcode(data) {
  const stored = normStr(data?.marketplace?.canonical_offer_barcode).toUpperCase();
  if (stored) return stored;
  return resolveCanonicalOfferBarcode(Array.isArray(data?.variants) ? data.variants : []);
}

function buildAlternateOfferSummary(item) {
  const data = item?.data || {};
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  const selectedVariant = pickPrimaryOfferVariant(variants);
  const priceIncl = getVariantPriceIncl(selectedVariant);
  return {
    productId: normStr(data?.product?.unique_id || item?.id),
    title: normStr(data?.product?.title),
    titleSlug: normStr(data?.product?.titleSlug),
    sellerCode: normStr(data?.product?.sellerCode || data?.seller?.sellerCode),
    sellerSlug: normStr(data?.seller?.sellerSlug || data?.product?.sellerSlug),
    vendorName: normStr(data?.product?.vendorName || data?.seller?.vendorName),
    variantId: normStr(selectedVariant?.variant_id),
    variantLabel: normStr(selectedVariant?.label),
    barcode: normStr(selectedVariant?.barcode).toUpperCase(),
    priceIncl: Number.isFinite(priceIncl) ? Math.round(priceIncl * 100) / 100 : null,
    hasInStockVariants: data?.has_in_stock_variants === true,
    imageUrl:
      normStr(selectedVariant?.media?.images?.[0]?.imageUrl) ||
      normStr(data?.media?.images?.[0]?.imageUrl) ||
      null,
  };
}

function compareAlternateOffers(a, b) {
  const aReady = a?.hasInStockVariants === true ? 1 : 0;
  const bReady = b?.hasInStockVariants === true ? 1 : 0;
  if (bReady !== aReady) return bReady - aReady;
  const aPrice = Number.isFinite(a?.priceIncl) ? Number(a.priceIncl) : Number.POSITIVE_INFINITY;
  const bPrice = Number.isFinite(b?.priceIncl) ? Number(b.priceIncl) : Number.POSITIVE_INFINITY;
  if (aPrice !== bPrice) return aPrice - bPrice;
  return String(a?.vendorName || "").localeCompare(String(b?.vendorName || ""), "en", { sensitivity: "base" });
}

function groupItemsByCanonicalBarcode(items) {
  const buckets = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = getCanonicalOfferBarcode(item?.data);
    const bucketKey = key || `product:${normStr(item?.data?.product?.unique_id || item?.id)}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(item);
  }

  return Array.from(buckets.values()).map((bucket) => {
    if (bucket.length === 1) {
      const [item] = bucket;
      const offerSummary = buildAlternateOfferSummary(item);
      return {
        ...item,
        data: {
          ...item.data,
          seller_offer_count: 1,
          alternate_offers: offerSummary.productId ? [offerSummary] : [],
          canonical_offer_barcode: offerSummary.barcode || null,
        },
      };
    }

    const sortedBucket = [...bucket].sort((a, b) =>
      compareAlternateOffers(buildAlternateOfferSummary(a), buildAlternateOfferSummary(b)),
    );
    const primary = sortedBucket[0];
    const alternateOffers = sortedBucket.map(buildAlternateOfferSummary).filter((offer) => offer.productId);
    return {
      ...primary,
      data: {
        ...primary.data,
        seller_offer_count: alternateOffers.length,
        alternate_offers: alternateOffers,
        canonical_offer_barcode: alternateOffers[0]?.barcode || null,
      },
    };
  });
}

function annotateItemsWithOfferGroupContext(items) {
  const counts = new Map();
  for (const item of items) {
    const barcode = getCanonicalOfferBarcode(item?.data);
    if (!barcode) continue;
    counts.set(barcode, (counts.get(barcode) || 0) + 1);
  }

  return items.map((item) => {
    const barcode = getCanonicalOfferBarcode(item?.data);
    const sellerOfferCount = barcode ? counts.get(barcode) || 1 : 1;
    return {
      ...item,
      data: {
        ...item.data,
        seller_offer_count: sellerOfferCount,
        canonical_offer_barcode: barcode || null,
      },
    };
  });
}

function getBadgeIconKeyForType(badge, badgeSettings) {
  if (badge === "best_seller") return badgeSettings?.bestSellerIcon || null;
  if (badge === "popular") return badgeSettings?.popularIcon || null;
  if (badge === "trending_now") return badgeSettings?.trendingNowIcon || null;
  if (badge === "rising_star") return badgeSettings?.risingStarIcon || null;
  return null;
}

function getBadgeIconUrlForType(badge, badgeSettings) {
  if (badge === "best_seller") return badgeSettings?.bestSellerIconUrl || null;
  if (badge === "popular") return badgeSettings?.popularIconUrl || null;
  if (badge === "trending_now") return badgeSettings?.trendingNowIconUrl || null;
  if (badge === "rising_star") return badgeSettings?.risingStarIconUrl || null;
  return null;
}

function getBadgeColorKeyForType(badge, badgeSettings) {
  if (badge === "best_seller") return badgeSettings?.bestSellerColor || null;
  if (badge === "popular") return badgeSettings?.popularColor || null;
  if (badge === "trending_now") return badgeSettings?.trendingNowColor || null;
  if (badge === "rising_star") return badgeSettings?.risingStarColor || null;
  return null;
}

function getBadgeBackgroundColorForType(badge, badgeSettings) {
  if (badge === "best_seller") return badgeSettings?.bestSellerBackgroundColor || null;
  if (badge === "popular") return badgeSettings?.popularBackgroundColor || null;
  if (badge === "trending_now") return badgeSettings?.trendingNowBackgroundColor || null;
  if (badge === "rising_star") return badgeSettings?.risingStarBackgroundColor || null;
  return null;
}

function getBadgeForegroundColorForType(badge, badgeSettings) {
  if (badge === "best_seller") return badgeSettings?.bestSellerForegroundColor || null;
  if (badge === "popular") return badgeSettings?.popularForegroundColor || null;
  if (badge === "trending_now") return badgeSettings?.trendingNowForegroundColor || null;
  if (badge === "rising_star") return badgeSettings?.risingStarForegroundColor || null;
  return null;
}

function applyEngagementBadges(items, badgeMap = new Map(), badgeSettings = null) {
  return items.map((item) => {
    const productId = normStr(item?.data?.product?.unique_id || item?.id);
    const engagement = badgeMap.get(productId);
    if (!engagement) return item;
    return {
      ...item,
      data: {
        ...item.data,
        analytics: {
          ...(item?.data?.analytics && typeof item.data.analytics === "object" ? item.data.analytics : {}),
          clicks: engagement.clicks,
          productViews: engagement.productViews,
          hovers: engagement.hovers,
          score: engagement.score,
          recentSalesUnits: engagement.recentSalesUnits || 0,
          previousSalesUnits: engagement.previousSalesUnits || 0,
          salesGrowthMultiplier: engagement.salesGrowthMultiplier || 0,
          hasHighClicks: engagement.hasHighClicks === true,
          badge: engagement.badge || null,
          badgeLabel: engagement.badgeLabel || null,
          badgeIconKey: getBadgeIconKeyForType(engagement.badge, badgeSettings),
          badgeIconUrl: getBadgeIconUrlForType(engagement.badge, badgeSettings),
          badgeColorKey: getBadgeColorKeyForType(engagement.badge, badgeSettings),
          badgeBackgroundColor: getBadgeBackgroundColorForType(engagement.badge, badgeSettings),
          badgeForegroundColor: getBadgeForegroundColorForType(engagement.badge, badgeSettings),
        },
      },
    };
  });
}

async function buildAlternateOffersForBarcode(db, barcode, includeUnavailable = false) {
  const normalizedBarcode = normStr(barcode).toUpperCase();
  if (!normalizedBarcode) return [];

  let docs = [];
  try {
    const constrainedSnap = await db
      .collection("products_v2")
      .where("marketplace.canonical_offer_barcode", "==", normalizedBarcode)
      .limit(24)
      .get();
    docs = constrainedSnap.docs;
  } catch {
    docs = [];
  }

  if (!docs.length) {
    const fallbackSnap = await db.collection("products_v2").get();
    docs = fallbackSnap.docs.filter((docSnap) => {
      const source = normalizeTimestamps(docSnap.data() || {});
      return getCanonicalOfferBarcode(source) === normalizedBarcode;
    });
  }

  const items = docs.map((d) => {
    const rawData = normalizeTimestamps(d.data() || {});
    return {
      id: d.id,
      rawData: attachProductStatus(rawData),
      data: attachProductStatus(includeUnavailable ? rawData : getPublicMarketplaceSource(rawData)),
    };
  });

  const sellerIdentifierSet = new Set();
  for (const item of items) {
    const sellerIdentifier = getSellerIdentifier(item?.data);
    if (sellerIdentifier) sellerIdentifierSet.add(sellerIdentifier);
  }

  const sellerMetaMap = new Map();
  await Promise.all(
    Array.from(sellerIdentifierSet).map(async (sellerIdentifier) => {
      try {
        sellerMetaMap.set(sellerIdentifier, await findSellerOwnerByIdentifier(sellerIdentifier));
      } catch {
        sellerMetaMap.set(sellerIdentifier, null);
      }
    }),
  );

  const offers = await Promise.all(
    items
      .filter((item) => getCanonicalOfferBarcode(item?.data) === normalizedBarcode)
      .map(async (item) => {
      const reservationMap = await buildVariantCheckoutReservationMap(item?.data);
      const enrichedVariants = enrichVariantsWithAvailability(item?.data?.variants, reservationMap);
      const dataWithVariantAvailability = { ...item.data, variants: enrichedVariants };
      const sellerIdentifier = getSellerIdentifier(dataWithVariantAvailability);
      const sellerOwner = sellerIdentifier ? sellerMetaMap.get(sellerIdentifier) : null;
      if (!includeUnavailable && sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) return null;
      if (!includeUnavailable && productMissingSellerDeliverySettings(dataWithVariantAvailability, sellerOwner)) return null;
      if (!includeUnavailable && !productHasListableAvailability(dataWithVariantAvailability)) return null;
      const displayData = applySellerDisplayData(
        {
          ...dataWithVariantAvailability,
          has_in_stock_variants: hasInStockVariants(dataWithVariantAvailability),
        },
        sellerOwner,
      );
      return buildAlternateOfferSummary({ id: item.id, data: displayData });
    }),
  );
  return offers.filter(Boolean).sort(compareAlternateOffers);
}

async function buildVariantCheckoutReservationMap(data) {
  const productId = normStr(data?.product?.unique_id || data?.docId);
  const variantIds = Array.isArray(data?.variants) ? data.variants.map((variant) => normStr(variant?.variant_id)).filter(Boolean) : [];
  if (!productId || !variantIds.length) return new Map();
  try {
    return await loadActiveCheckoutReservationMap({ productId, variantIds });
  } catch {
    return new Map();
  }
}

export async function GET(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { searchParams } = new URL(req.url);
    const includeUnavailable = toBool(searchParams.get("includeUnavailable")) === true;
    const badgeSettings = includeUnavailable
      ? null
      : await loadProductEngagementBadgeSettings().catch(() => ({
          ...PRODUCT_ENGAGEMENT_BADGE_CONFIG,
        }));
    const idsRaw = normStr(searchParams.get("ids"));

    if (idsRaw) {
      const requestedIds = idsRaw
        .split(",")
        .map((value) => normStr(value))
        .filter((value, index, array) => is8(value) && array.indexOf(value) === index)
        .slice(0, 60);

      if (!requestedIds.length) {
        return err(400, "Invalid Ids", "'ids' must contain one or more 8-digit product ids.");
      }

      const snapshots = await Promise.all(
        requestedIds.map((id) => db.collection("products_v2").doc(id).get()),
      );

      const items = [];
      const badgeMap = includeUnavailable
        ? new Map()
        : await getMarketplaceProductEngagementBadgeSnapshotMap({
            productIds: items.map((item) => normStr(item?.data?.product?.unique_id || item?.id)).filter(Boolean),
            days: badgeSettings?.windowDays || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays,
          }).catch(() => new Map());
      for (const snap of snapshots) {
        if (!snap.exists) continue;
        const rawData = normalizeTimestamps(snap.data() || {});
        let data = includeUnavailable ? rawData : getPublicMarketplaceSource(rawData);
        const reservationMap = await buildVariantCheckoutReservationMap(data);
        data = {
          ...data,
          variants: enrichVariantsWithAvailability(data?.variants, reservationMap),
        };

        const shouldResolveSellerOwner = includeUnavailable !== true;
        let sellerOwner = null;
        const sellerIdentifier = shouldResolveSellerOwner
          ? getSellerIdentifier({
              seller: data?.seller,
              product: data?.product,
            })
          : "";

        if (sellerIdentifier) {
          sellerOwner = await findSellerOwnerByIdentifier(sellerIdentifier);
          if (sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) {
            continue;
          }
          if (sellerOwner) {
            data = applySellerDisplayData(data, sellerOwner);
          }
        }

        const hasListableAvailability = productHasListableAvailability(data);
        const missingDelivery =
          sellerIdentifier && productMissingSellerDeliverySettings(data, sellerOwner);

        if (includeUnavailable !== true && (!hasListableAvailability || missingDelivery)) {
          continue;
        }

        items.push({
          id: snap.id,
          data: {
            ...data,
            seller_offer_count: data?.seller_offer_count ?? 1,
            canonical_offer_barcode: getCanonicalOfferBarcode(data) || null,
            has_in_stock_variants: hasInStockVariants(data),
            is_eligible_by_variant_availability: hasListableAvailability,
            is_unavailable_for_listing: !hasListableAvailability || Boolean(missingDelivery),
            status: buildProductStatus(rawData),
          },
        });
      }

      return ok({
        total: items.length,
        count: items.length,
        items: applyEngagementBadges(items, badgeMap, badgeSettings),
      });
    }

    // --- Single by id (docId == unique_id) ---
    const byId = normStr(searchParams.get("id"));
    if (byId){
      if (!is8(byId)) return err(400,"Invalid Id","'id' must be an 8-digit string.");
      const ref = db.collection("products_v2").doc(byId);
      const snap = await ref.get();
      if (!snap.exists) return err(404,"Not Found",`No product with id '${byId}'.`);
      const rawData = normalizeTimestamps(snap.data()||{});
      const data = includeUnavailable ? rawData : getPublicMarketplaceSource(rawData);
      const reservationMap = await buildVariantCheckoutReservationMap(data);
      let dataWithVariantAvailability = {
        ...data,
        variants: enrichVariantsWithAvailability(data?.variants, reservationMap)
      };
      const shouldResolveSellerOwner = includeUnavailable !== true;
      let singleSellerOwner = null;
      const sellerIdentifier = shouldResolveSellerOwner
        ? (
            getSellerIdentifier({
              seller: data?.seller,
              product: data?.product,
            }) || normStr(searchParams.get("sellerCode") || searchParams.get("sellerSlug") || searchParams.get("vendor"))
          )
        : "";
      if (sellerIdentifier) {
        const sellerOwner = await findSellerOwnerByIdentifier(sellerIdentifier);
        singleSellerOwner = sellerOwner;
        if (sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) {
          const unavailable = getSellerUnavailableReason(sellerOwner.data);
          return ok({
            id: snap.id,
            data: {
              ...dataWithVariantAvailability,
              is_favorite: false,
              has_in_stock_variants: hasInStockVariants(dataWithVariantAvailability),
              is_eligible_by_variant_availability: productHasListableAvailability(dataWithVariantAvailability),
              is_unavailable_for_listing: true,
              seller_unavailable: true,
              seller_unavailable_reason_code: unavailable.reasonCode,
              seller_unavailable_reason_message: unavailable.reasonMessage,
              seller_account_status: sellerOwner?.data?.seller?.status || sellerOwner?.data?.sellerStatus || "closed",
            }
          });
        }
        if (sellerOwner) {
          dataWithVariantAvailability = applySellerDisplayData(dataWithVariantAvailability, sellerOwner);
        }
      }
      const userId = normStr(searchParams.get("userId"));
      let isFavorite = false;
      if (userId){
        const userSnap = await db.collection("users").doc(userId).get();
        const userData = userSnap.exists ? userSnap.data() : null;
        const favorites = Array.isArray(userData?.preferences?.favoriteProducts)
          ? userData.preferences.favoriteProducts.map(v=>String(v).trim()).filter(Boolean)
          : [];
        const uid = String(dataWithVariantAvailability?.product?.unique_id ?? "");
        isFavorite = favorites.length > 0 && uid ? favorites.includes(uid) : false;
      }
      const alternateOffers = includeUnavailable
        ? []
        : await buildAlternateOffersForBarcode(db, getCanonicalOfferBarcode(dataWithVariantAvailability), includeUnavailable);
      const badgeMap = includeUnavailable
        ? new Map()
        : await getMarketplaceProductEngagementBadgeSnapshotMap({
            productIds: [normStr(dataWithVariantAvailability?.product?.unique_id || snap.id)].filter(Boolean),
            days: badgeSettings?.windowDays || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays,
          }).catch(() => new Map());
      const engagement = badgeMap.get(normStr(dataWithVariantAvailability?.product?.unique_id || snap.id));
      return ok({
        id: snap.id,
        data: {
          ...dataWithVariantAvailability,
          is_favorite: isFavorite,
          seller_offer_count: alternateOffers.length || 1,
          alternate_offers: alternateOffers,
          canonical_offer_barcode: getCanonicalOfferBarcode(dataWithVariantAvailability) || null,
          has_in_stock_variants: hasInStockVariants(dataWithVariantAvailability),
          is_eligible_by_variant_availability: productHasListableAvailability(dataWithVariantAvailability),
          is_unavailable_for_listing:
            !productHasListableAvailability(dataWithVariantAvailability) ||
            (sellerIdentifier ? productMissingSellerDeliverySettings(dataWithVariantAvailability, singleSellerOwner) : false),
          listing_block_reason_code:
            sellerIdentifier && productMissingSellerDeliverySettings(dataWithVariantAvailability, singleSellerOwner)
              ? "missing_delivery_settings"
              : null,
          listing_block_reason_message:
            sellerIdentifier && productMissingSellerDeliverySettings(dataWithVariantAvailability, singleSellerOwner)
              ? "This self-fulfilled product is hidden until delivery settings are completed."
              : null,
          analytics: engagement
            ? {
                clicks: engagement.clicks,
                productViews: engagement.productViews,
                hovers: engagement.hovers,
                score: engagement.score,
                recentSalesUnits: engagement.recentSalesUnits || 0,
                previousSalesUnits: engagement.previousSalesUnits || 0,
                salesGrowthMultiplier: engagement.salesGrowthMultiplier || 0,
                hasHighClicks: engagement.hasHighClicks === true,
                badge: engagement.badge || null,
                badgeLabel: engagement.badgeLabel || null,
                badgeIconKey: getBadgeIconKeyForType(engagement.badge, badgeSettings),
                badgeIconUrl: getBadgeIconUrlForType(engagement.badge, badgeSettings),
                badgeColorKey: getBadgeColorKeyForType(engagement.badge, badgeSettings),
                badgeBackgroundColor: getBadgeBackgroundColorForType(engagement.badge, badgeSettings),
                badgeForegroundColor: getBadgeForegroundColorForType(engagement.badge, badgeSettings),
              }
            : null,
          status: buildProductStatus(rawData),
        }
      });
    }

    // --- List mode (ALL in memory, then filter/sort/limit) ---
    const category     = normStr(searchParams.get("category"));
    const subCategory  = normStr(searchParams.get("subCategory"));
    const brand        = normStr(searchParams.get("brand"));
    const vendorName   = normStr(searchParams.get("vendorName"));
    const sellerCode   = normStr(searchParams.get("sellerCode"));
    const sellerSlug   = normStr(searchParams.get("sellerSlug") || searchParams.get("vendor"));
    const kind         = normStr(searchParams.get("kind"));
    const keywordsRaw  = normStr(searchParams.get("keywords"));
    const searchRaw    = normStr(searchParams.get("search"));
    const userId       = normStr(searchParams.get("userId"));
    const newArrivals  = toBool(searchParams.get("newArrivals"));
    const isActive     = toBool(searchParams.get("isActive"));
    const isFeatured   = toBool(searchParams.get("isFeatured"));
    const groupByBrand = toBool(searchParams.get("group_by_brand")) === true;
    const favoritesOnly = toBool(searchParams.get("favoritesOnly")) === true;
    const onSale       = toBool(searchParams.get("onSale"));
    const inStock      = toBool(searchParams.get("inStock"));
    const numParam = (k)=>{
      const raw = normStr(searchParams.get(k));
      return raw === "" ? null : toNumOrNull(raw);
    };
    const priceMin     = numParam("priceMin");
    const priceMax     = numParam("priceMax");
    const packUnitCount= numParam("packUnitCount");
    const packUnitVolume= numParam("packUnitVolume");
    const packUnit     = normStr(searchParams.get("packUnit")).toLowerCase() || "";
    const shopperArea = readShopperAreaFromSearchParams(searchParams);

    const keywords = keywordsRaw
      ? keywordsRaw.split(/[,\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean)
      : [];

    if (sellerCode || sellerSlug) {
      const sellerOwner = sellerCode
        ? await findSellerOwnerByIdentifier(sellerCode)
        : await findSellerOwnerBySlug(sellerSlug);
      if (sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) {
        if (groupByBrand) return ok({ total: 0, count: 0, groups: [] });
        return ok({ total: 0, count: 0, items: [] });
      }
    }

    let favorites = [];
    if (userId){
      const userSnap = await db.collection("users").doc(userId).get();
      const userData = userSnap.exists ? userSnap.data() : null;
      favorites = Array.isArray(userData?.preferences?.favoriteProducts)
        ? userData.preferences.favoriteProducts.map(v=>String(v).trim()).filter(Boolean)
        : [];
      if (favoritesOnly && favorites.length === 0){
        if (groupByBrand) return ok({ total: 0, count: 0, groups: [] });
        return ok({ total: 0, count: 0, items: [] });
      }
    }

    // limit handling: default 24; support 'all'
    const rawLimitNorm = normStr(searchParams.get("limit"));
    const rawLimit = (rawLimitNorm || "24").toLowerCase();
    const noTopLimit = rawLimit === "all";
    let lim = noTopLimit ? null : Number.parseInt(rawLimit,10);
    if (!noTopLimit && (!Number.isFinite(lim) || lim<=0)) lim = 24;

    // 1) Load collection with optional query constraints to reduce scan
    const constraints = [];

    // AND filters that must match (keep to fields that are reliably typed)
    if (kind) constraints.push(["grouping.kind","==",kind]);

    // OR grouping filters to reduce scan while preserving inclusive grouping logic
    const groupWheres = [];
    if (brand) groupWheres.push(["grouping.brand","==",brand]);
    if (subCategory) groupWheres.push(["grouping.subCategory","==",subCategory]);
    if (category) groupWheres.push(["grouping.category","==",category]);

    let queryRef = db.collection("products_v2");
    if (kind) queryRef = queryRef.where("grouping.kind","==",kind);
    if (groupWheres.length === 1) {
      const [field, op, value] = groupWheres[0];
      queryRef = queryRef.where(field, op, value);
    }
    if (groupWheres.length > 1) {
      // Firestore admin SDK does not support OR natively here, so fall back to full scan below.
    }

    let rs = await queryRef.get();
    // Fallback: if constrained query returns nothing but grouping filters were provided,
    // re-scan full collection to preserve legacy behavior.
    if (rs.empty && (brand || subCategory || category)) {
      rs = await db.collection("products_v2").get();
    }

    // 2) Map + timestamp normalize
    let items = rs.docs.map(d=>({
      id:d.id,
      rawData: attachProductStatus(normalizeTimestamps(d.data()||{})),
      data: attachProductStatus(
        includeUnavailable
          ? normalizeTimestamps(d.data()||{})
          : getPublicMarketplaceSource(normalizeTimestamps(d.data()||{})),
      ),
    }));
    const sellerBlockMap = new Map();
    const sellerIdentifierSet = new Set();
    for (const item of items) {
      const sellerIdentifier = getSellerIdentifier(item?.data);
      if (sellerIdentifier) sellerIdentifierSet.add(sellerIdentifier);
    }
    const sellerMetaMap = new Map();
    await Promise.all(
      Array.from(sellerIdentifierSet).map(async (sellerIdentifier) => {
        try {
          const sellerOwner = await findSellerOwnerByIdentifier(sellerIdentifier);
          sellerMetaMap.set(sellerIdentifier, sellerOwner);
          sellerBlockMap.set(sellerIdentifier, Boolean(sellerOwner && isSellerAccountUnavailable(sellerOwner.data)));
        } catch {
          sellerMetaMap.set(sellerIdentifier, null);
          sellerBlockMap.set(sellerIdentifier, false);
        }
      }),
    );
    // 3) In-memory filters (inclusive grouping logic + others)
    items = items.filter(({ data })=>{
      const productSellerIdentifier = getSellerIdentifier(data);
      if (productSellerIdentifier && sellerBlockMap.get(productSellerIdentifier) === true) return false;
      if (
        productSellerIdentifier &&
        !includeUnavailable &&
        productMissingSellerDeliverySettings(data, sellerMetaMap.get(productSellerIdentifier))
      ) return false;
      if (!includeUnavailable && !productHasListableAvailability(data)) return false;
      if (!matchesGrouping(data, { category, subCategory, brand })) return false;
      if (sellerCode) {
        const recordSellerCode = normStr(
          data?.product?.sellerCode ||
          data?.seller?.sellerCode ||
          data?.seller?.activeSellerCode ||
          data?.seller?.groupSellerCode ||
          ""
        );
        if (recordSellerCode !== sellerCode) return false;
      }
      if (sellerSlug) {
        const recordSellerSlug = normStr(
          data?.product?.sellerSlug ||
          data?.seller?.sellerSlug ||
          data?.seller?.activeSellerSlug ||
          data?.seller?.groupSellerSlug ||
          ""
        );
        if (recordSellerSlug !== sellerSlug) return false;
      }
      if (vendorName){
        const recordVendor = normText(
          data?.product?.vendorName ||
          data?.seller?.vendorName ||
          data?.shopify?.vendorName ||
          ""
        );
        if (recordVendor !== normText(vendorName)) return false;
      }
      if (kind        && data?.grouping?.kind !== kind) return false;
      if (keywords.length > 0){
        const list = Array.isArray(data?.product?.keywords) ? data.product.keywords : [];
        const lower = list.map(k=>String(k).toLowerCase());
        if (!keywords.some(k=>lower.includes(k))) return false;
      }
      if (favoritesOnly && favorites.length > 0){
        const uid = String(data?.product?.unique_id ?? "");
        if (!favorites.includes(uid)) return false;
      }
      if (newArrivals !== null){
        const matchesNewArrival = isNewArrival(getFirstPublishedAt(data));
        if (matchesNewArrival !== newArrivals) return false;
      }
      if (isActive    !== null && !!data?.placement?.isActive   !== isActive)   return false;
      if (isFeatured  !== null && !!data?.placement?.isFeatured !== isFeatured) return false;
      if (inStock     !== null){
        const isInStock = productInStock(data);
        if (isInStock !== inStock) return false;
      }

      const vars = Array.isArray(data?.variants) ? data.variants : [];

      if (onSale !== null){
        const hasSale = vars.some(v => v?.sale?.is_on_sale === true);
        if (hasSale !== onSale) return false;
      }

      if (packUnitCount != null || packUnitVolume != null || packUnit){
        const matchesPack = vars.some(v => variantMatchesPack(v, {
          packUnitCount,
          packUnitVolume,
          packUnit
        }));
        if (!matchesPack) return false;
      }

      if (priceMin != null || priceMax != null){
        const matchesPrice = vars.some(v => {
          const price = variantEffectivePriceExcl(v);
          if (priceMin != null && price < priceMin) return false;
          if (priceMax != null && price > priceMax) return false;
          return true;
        });
        if (!matchesPrice) return false;
      }

      return true;
    });

    items = await Promise.all(items.map(async ({ id, data })=>{
      const reservationMap = await buildVariantCheckoutReservationMap(data);
      const enrichedVariants = enrichVariantsWithAvailability(data?.variants, reservationMap);
      const dataWithVariantAvailability = {
        ...data,
        variants: enrichedVariants
      };
      const sellerIdentifier = getSellerIdentifier(dataWithVariantAvailability);
      const sellerOwner = sellerIdentifier ? sellerMetaMap.get(sellerIdentifier) : null;
      const dataWithSellerDisplay = applySellerDisplayData(dataWithVariantAvailability, sellerOwner);
      const vars = Array.isArray(dataWithVariantAvailability?.variants) ? dataWithVariantAvailability.variants : [];
      const hasSaleVariant = vars.some(v => v?.sale?.is_on_sale === true);
      const uid = String(dataWithSellerDisplay?.product?.unique_id ?? "");
      const isFavorite = userId ? (favorites.length > 0 && uid ? favorites.includes(uid) : false) : false;
      const isEligibleByVariantAvailability = productHasListableAvailability(dataWithSellerDisplay);
      const hiddenByDeliverySettings = productMissingSellerDeliverySettings(dataWithSellerDisplay, sellerOwner);
      const firstPublishedAt = getFirstPublishedAt(dataWithSellerDisplay);
      return {
        id,
        data: {
          ...dataWithSellerDisplay,
          has_sale_variant: hasSaleVariant,
          is_new_arrival: isNewArrival(firstPublishedAt),
          marketplace: {
            ...(dataWithSellerDisplay?.marketplace && typeof dataWithSellerDisplay.marketplace === "object"
              ? dataWithSellerDisplay.marketplace
              : {}),
            firstPublishedAt,
          },
          is_favorite: isFavorite,
          has_in_stock_variants: hasInStockVariants(dataWithSellerDisplay),
          is_eligible_by_variant_availability: isEligibleByVariantAvailability,
          is_unavailable_for_listing: !isEligibleByVariantAvailability || hiddenByDeliverySettings,
          listing_block_reason_code: hiddenByDeliverySettings ? "missing_delivery_settings" : null,
          listing_block_reason_message: hiddenByDeliverySettings
            ? "This self-fulfilled product is hidden until delivery settings are completed."
            : null,
          status: buildProductStatus(dataWithSellerDisplay),
        }
      };
    }));

    // 4) Optional fuzzy search on product.title (after filters)
    const search = normText(searchRaw);
    if (search){
      items = items
        .map(it=>{
          const title = normText(it?.data?.product?.title);
          const score = fuzzyScore(title, search);
          return score > 0 ? { ...it, _score: score } : null;
        })
        .filter(Boolean);

      items.sort((a,b)=>{
        const fa = a.data?.placement?.isFeatured ? 1 : 0;
        const fb = b.data?.placement?.isFeatured ? 1 : 0;
        if (fb !== fa) return fb - fa;
        const sa = a._score || 0;
        const sb = b._score || 0;
        if (sb !== sa) return sb - sa;
        const pa = +a.data?.placement?.position || 0;
        const pb = +b.data?.placement?.position || 0;
        return pa - pb;
      });
    }else{
      // 4) Sort by placement.position asc (missing -> 0)
      items.sort((a,b)=>{
        const fa = a.data?.placement?.isFeatured ? 1 : 0;
        const fb = b.data?.placement?.isFeatured ? 1 : 0;
        if (fb !== fa) return fb - fa;
        const pa = +a.data?.placement?.position || 0;
        const pb = +b.data?.placement?.position || 0;
        return pa - pb;
      });
    }

    if (!includeUnavailable && items.length) {
      const badgeMap = await getMarketplaceProductEngagementBadgeSnapshotMap({
        productIds: items.map((item) => normStr(item?.data?.product?.unique_id || item?.id)).filter(Boolean),
        days: badgeSettings?.windowDays || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays,
      }).catch(() => new Map());
      items = applyEngagementBadges(items, badgeMap, badgeSettings);
    }

    const finalListing = await resolveShopperVisibleProducts({
      items,
      shopperLocation: shopperArea,
      page: 1,
      pageSize: noTopLimit ? items.length : lim ?? 24,
      getCourierContext: async ({ seller, shopperLocation }) => {
        const originCountry = String(seller?.origin?.countryCode || seller?.origin?.country || "").trim();
        const shopperCountry = String(shopperLocation?.countryCode || "").trim();
        const handoverMode = String((seller?.courierProfile || {})?.handoverMode || "pickup").trim() || "pickup";
        if (!originCountry || !shopperCountry) return { courierRouteSupported: null };
        const courierRouteSupported = await resolveCourierRouteEligibilityServer({
          originCountry,
          shopperCountry,
          handoverMode,
        });
        return { courierRouteSupported };
      },
    });

    if (!groupByBrand) {
      return ok({
        total: finalListing.total,
        count: finalListing.items.length,
        items: finalListing.items,
        filters: finalListing.filters,
      });
    }

    const grouped = new Map();
    for (const item of finalListing.items) {
      const key = String(item.brandLabel || "unknown");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }

    const groups = Array.from(grouped.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([brand, groupedItems]) => ({ brand, items: groupedItems }));

    return ok({
      total: finalListing.total,
      count: finalListing.items.length,
      groups,
      filters: finalListing.filters,
    });
  }catch(e){
    console.error("products_v2/get (in-memory) failed:", e);
    return err(500,"Unexpected Error","Something went wrong while fetching products.");
  }
}
