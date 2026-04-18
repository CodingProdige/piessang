import { getAdminDb } from "@/lib/firebase/admin";
import { PRODUCT_ENGAGEMENT_BADGE_CONFIG } from "@/lib/analytics/product-engagement-badges";
import { loadProductEngagementBadgeSettings } from "@/lib/platform/product-engagement-badge-settings";
import { getFrozenLineTotalIncl } from "@/lib/orders/frozen-money";

const BADGE_MAP_CACHE_TTL_MS = 60 * 1000;
const badgeMapCache = new Map();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeEngagementScore(entry = {}) {
  return toNum(entry?.productViews) * 4 + toNum(entry?.clicks) * 2 + toNum(entry?.hovers);
}

function getOrderCreatedAt(order = {}) {
  return toStr(
    order?.lifecycle?.createdAt ||
      order?.meta?.createdAt ||
      order?.timestamps?.createdAt ||
      order?.createdAt,
  );
}

function getOrderPaymentStatus(order = {}) {
  return toStr(order?.lifecycle?.paymentStatus || order?.status?.payment || order?.payment?.status || "unknown").toLowerCase();
}

function getOrderFulfillmentStatus(order = {}) {
  return toStr(order?.lifecycle?.fulfillmentStatus || order?.status?.fulfillment || "unknown").toLowerCase();
}

function isFinanciallyCountableOrder(order = {}) {
  const paymentStatus = getOrderPaymentStatus(order);
  const fulfillmentStatus = getOrderFulfillmentStatus(order);
  return fulfillmentStatus !== "cancelled" && !["refunded", "partial_refund"].includes(paymentStatus);
}

function buildProductSalesMap(orders = [], { days = 30, offsetDays = 0 } = {}) {
  const safeDays = Math.max(1, Math.min(365, toNum(days) || 30));
  const safeOffset = Math.max(0, toNum(offsetDays) || 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - safeOffset);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (safeDays - 1));

  const map = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    const createdAt = new Date(getOrderCreatedAt(order));
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt.getTime() < start.getTime() || createdAt.getTime() > end.getTime()) continue;
    if (!isFinanciallyCountableOrder(order)) continue;

    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      const productId = toStr(
        item?.product_unique_id ||
          item?.product_snapshot?.product?.unique_id ||
          item?.product_snapshot?.unique_id ||
          item?.product_snapshot?.docId,
      );
      if (!productId) continue;
      const title = toStr(item?.product_snapshot?.product?.title || item?.product_snapshot?.name || item?.name || "Product");
      const quantity = Math.max(1, toNum(item?.quantity) || 1);
      const revenue = getFrozenLineTotalIncl(item);
      const current = map.get(productId) || { productId, title, units: 0, revenue: 0, orders: 0 };
      current.units += quantity;
      current.revenue += revenue;
      current.orders += 1;
      map.set(productId, current);
    }
  }
  return map;
}

function isoNow() {
  return new Date().toISOString();
}

function getDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export async function recordProductEngagementEvent(input = {}) {
  const db = getAdminDb();
  if (!db) return null;

  const productId = toStr(input?.productId);
  const action = toStr(input?.action).toLowerCase();
  const vendorName = toStr(input?.vendorName);
  const sellerCode = toStr(input?.sellerCode);
  const sellerSlug = toStr(input?.sellerSlug);
  if (!productId || !action || (!vendorName && !sellerCode && !sellerSlug)) return null;

  const payload = {
    productId,
    action,
    vendorName: vendorName || null,
    sellerCode: sellerCode || null,
    sellerSlug: sellerSlug || null,
    productTitle: toStr(input?.productTitle) || null,
    sessionId: toStr(input?.sessionId) || null,
    userId: toStr(input?.userId) || null,
    source: toStr(input?.source) || null,
    pageType: toStr(input?.pageType) || null,
    href: toStr(input?.href) || null,
    dateKey: getDateKey(),
    createdAt: isoNow(),
  };

  await db.collection("analytics_product_engagement_v1").add(payload).catch(() => null);
  return payload;
}

async function queryMatchingEvents({ sellerCode = "", sellerSlug = "", vendorName = "", sinceIso = "", all = false } = {}) {
  const db = getAdminDb();
  if (!db) return [];

  let snap = null;
  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  const vendor = toStr(vendorName);

  if (all) {
    snap = await db.collection("analytics_product_engagement_v1").get().catch(() => null);
  } else if (code) {
    snap = await db.collection("analytics_product_engagement_v1").where("sellerCode", "==", code).get().catch(() => null);
  } else if (slug) {
    snap = await db.collection("analytics_product_engagement_v1").where("sellerSlug", "==", slug).get().catch(() => null);
  } else if (vendor) {
    snap = await db.collection("analytics_product_engagement_v1").where("vendorName", "==", vendor).get().catch(() => null);
  }

  const sinceMs = sinceIso ? Date.parse(sinceIso) : 0;
  return (snap?.docs || [])
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((entry) => {
      if (!sinceMs) return true;
      const createdAtMs = Date.parse(toStr(entry?.createdAt));
      return Number.isFinite(createdAtMs) && createdAtMs >= sinceMs;
    });
}

export async function summarizeSellerProductEngagement({
  sellerCode = "",
  sellerSlug = "",
  vendorName = "",
  days = 30,
  offsetDays = 0,
} = {}) {
  const safeDays = Math.max(1, Math.min(365, toNum(days) || 30));
  const safeOffset = Math.max(0, toNum(offsetDays) || 0);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - safeOffset - (safeDays - 1));
  const until = new Date();
  until.setHours(23, 59, 59, 999);
  until.setDate(until.getDate() - safeOffset);
  const sinceIso = since.toISOString();
  const untilMs = until.getTime();

  const events = await queryMatchingEvents({ sellerCode, sellerSlug, vendorName, sinceIso });
  const totals = {
    impressions: 0,
    clicks: 0,
    hovers: 0,
    productViews: 0,
  };
  const products = new Map();
  const daily = new Map();

  for (const event of events) {
    const action = toStr(event?.action).toLowerCase();
    const createdAt = toStr(event?.createdAt);
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs > untilMs) continue;
    const dayKey = createdAt.slice(0, 10);
    if (!daily.has(dayKey)) {
      daily.set(dayKey, { dayKey, impressions: 0, clicks: 0, hovers: 0, productViews: 0 });
    }
    const dailyEntry = daily.get(dayKey);

    if (action === "impression") {
      totals.impressions += 1;
      dailyEntry.impressions += 1;
    } else if (action === "click") {
      totals.clicks += 1;
      dailyEntry.clicks += 1;
    } else if (action === "hover") {
      totals.hovers += 1;
      dailyEntry.hovers += 1;
    } else if (action === "product_view") {
      totals.productViews += 1;
      dailyEntry.productViews += 1;
    } else {
      continue;
    }

    const productId = toStr(event?.productId);
    const title = toStr(event?.productTitle || "Product");
    if (!productId) continue;
    const current = products.get(productId) || {
      productId,
      title,
      impressions: 0,
      clicks: 0,
      hovers: 0,
      productViews: 0,
    };
    if (action === "impression") current.impressions += 1;
    if (action === "click") current.clicks += 1;
    if (action === "hover") current.hovers += 1;
    if (action === "product_view") current.productViews += 1;
    products.set(productId, current);
  }

  const topProducts = Array.from(products.values())
    .map((entry) => ({
      ...entry,
      score: computeEngagementScore(entry),
      ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  return {
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    },
    topProducts,
    daily: Array.from(daily.values()).sort((left, right) => left.dayKey.localeCompare(right.dayKey)),
  };
}

export async function summarizeMarketplaceProductEngagement({
  days = 30,
  offsetDays = 0,
} = {}) {
  const safeDays = Math.max(1, Math.min(365, toNum(days) || 30));
  const safeOffset = Math.max(0, toNum(offsetDays) || 0);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - safeOffset - (safeDays - 1));
  const until = new Date();
  until.setHours(23, 59, 59, 999);
  until.setDate(until.getDate() - safeOffset);
  const sinceIso = since.toISOString();
  const untilMs = until.getTime();

  const events = await queryMatchingEvents({ sinceIso, all: true });
  const totals = {
    impressions: 0,
    clicks: 0,
    hovers: 0,
    productViews: 0,
  };
  const products = new Map();
  const daily = new Map();

  for (const event of events) {
    const action = toStr(event?.action).toLowerCase();
    const createdAt = toStr(event?.createdAt);
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs > untilMs) continue;
    const dayKey = createdAt.slice(0, 10);
    if (!daily.has(dayKey)) {
      daily.set(dayKey, { dayKey, impressions: 0, clicks: 0, hovers: 0, productViews: 0 });
    }
    const dailyEntry = daily.get(dayKey);

    if (action === "impression") {
      totals.impressions += 1;
      dailyEntry.impressions += 1;
    } else if (action === "click") {
      totals.clicks += 1;
      dailyEntry.clicks += 1;
    } else if (action === "hover") {
      totals.hovers += 1;
      dailyEntry.hovers += 1;
    } else if (action === "product_view") {
      totals.productViews += 1;
      dailyEntry.productViews += 1;
    } else {
      continue;
    }

    const productId = toStr(event?.productId);
    const title = toStr(event?.productTitle || "Product");
    if (!productId) continue;
    const current = products.get(productId) || {
      productId,
      title,
      impressions: 0,
      clicks: 0,
      hovers: 0,
      productViews: 0,
    };
    if (action === "impression") current.impressions += 1;
    if (action === "click") current.clicks += 1;
    if (action === "hover") current.hovers += 1;
    if (action === "product_view") current.productViews += 1;
    products.set(productId, current);
  }

  const topProducts = Array.from(products.values())
    .map((entry) => ({
      ...entry,
      score: computeEngagementScore(entry),
      ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  return {
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    },
    topProducts,
    daily: Array.from(daily.values()).sort((left, right) => left.dayKey.localeCompare(right.dayKey)),
  };
}

export async function getMarketplaceProductEngagementBadgeMap({
  days,
  popularClicksThreshold,
  risingStarScoreThreshold,
  risingStarClickThreshold,
} = {}) {
  const cacheKey = JSON.stringify({
    days: toNum(days) || null,
    popularClicksThreshold: toNum(popularClicksThreshold) || null,
    risingStarScoreThreshold: toNum(risingStarScoreThreshold) || null,
    risingStarClickThreshold: toNum(risingStarClickThreshold) || null,
  });
  const cached = badgeMapCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < BADGE_MAP_CACHE_TTL_MS) {
    return new Map(cached.value);
  }

  const loadedSettings = await loadProductEngagementBadgeSettings().catch(() => PRODUCT_ENGAGEMENT_BADGE_CONFIG);
  const safeDays = Math.max(1, Math.min(365, toNum(days) || toNum(loadedSettings?.windowDays) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays));
  const bestSellerEnabled = loadedSettings?.bestSellerEnabled !== false;
  const bestSellerUnitsThreshold = Math.max(1, toNum(loadedSettings?.bestSellerUnitsThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerUnitsThreshold);
  const popularEnabled = loadedSettings?.popularEnabled !== false;
  const safePopularClicks = Math.max(1, toNum(popularClicksThreshold) || toNum(loadedSettings?.popularClicksThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularClicksThreshold);
  const trendingNowEnabled = loadedSettings?.trendingNowEnabled !== false;
  const trendingNowUnitsThreshold = Math.max(1, toNum(loadedSettings?.trendingNowUnitsThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowUnitsThreshold);
  const trendingNowGrowthMultiplier = Math.max(1.1, toNum(loadedSettings?.trendingNowGrowthMultiplier) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowGrowthMultiplier);
  const risingStarEnabled = loadedSettings?.risingStarEnabled !== false;
  const safeRisingScore = Math.max(1, toNum(risingStarScoreThreshold) || toNum(loadedSettings?.risingStarScoreThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarScoreThreshold);
  const safeRisingClicks = Math.max(1, toNum(risingStarClickThreshold) || toNum(loadedSettings?.risingStarClickThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarClickThreshold);

  const summary = await summarizeMarketplaceProductEngagement({ days: safeDays });
  const db = getAdminDb();
  const ordersSnap = db ? await db.collection("orders_v2").get().catch(() => null) : null;
  const orders = (ordersSnap?.docs || []).map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
  const currentSalesMap = buildProductSalesMap(orders, { days: safeDays, offsetDays: 0 });
  const previousSalesMap = buildProductSalesMap(orders, { days: safeDays, offsetDays: safeDays });
  const badgeMap = new Map();

  for (const [productId, salesEntry] of currentSalesMap.entries()) {
    const previousEntry = previousSalesMap.get(productId) || { units: 0 };
    const units = toNum(salesEntry?.units);
    const previousUnits = toNum(previousEntry?.units);
    const growthMultiplier = previousUnits > 0 ? units / previousUnits : units > 0 ? units : 0;
    const hasBestSellerBadge = bestSellerEnabled && units >= bestSellerUnitsThreshold;
    const hasTrendingNowBadge =
      trendingNowEnabled &&
      !hasBestSellerBadge &&
      units >= trendingNowUnitsThreshold &&
      growthMultiplier >= trendingNowGrowthMultiplier;

    badgeMap.set(productId, {
      clicks: 0,
      productViews: 0,
      hovers: 0,
      score: 0,
      recentSalesUnits: units,
      previousSalesUnits: previousUnits,
      salesGrowthMultiplier: growthMultiplier,
      hasHighClicks: false,
      badge: hasBestSellerBadge ? "best_seller" : hasTrendingNowBadge ? "trending_now" : null,
      badgeLabel: hasBestSellerBadge ? "Best seller" : hasTrendingNowBadge ? "Trending now" : null,
    });
  }

  for (const entry of Array.isArray(summary?.topProducts) ? summary.topProducts : []) {
    const productId = toStr(entry?.productId);
    if (!productId) continue;

    const clicks = toNum(entry?.clicks);
    const productViews = toNum(entry?.productViews);
    const hovers = toNum(entry?.hovers);
    const score = toNum(entry?.score || computeEngagementScore(entry));
    const existing = badgeMap.get(productId) || {};
    const hasPopularBadge = popularEnabled && clicks >= safePopularClicks;
    const hasRisingStarBadge =
      risingStarEnabled &&
      !existing?.badge &&
      !hasPopularBadge &&
      clicks >= safeRisingClicks &&
      score >= safeRisingScore;

    badgeMap.set(productId, {
      ...existing,
      clicks,
      productViews,
      hovers,
      score,
      hasHighClicks: hasPopularBadge,
      badge: existing?.badge || (hasPopularBadge ? "popular" : hasRisingStarBadge ? "rising_star" : null),
      badgeLabel: existing?.badgeLabel || (hasPopularBadge ? "Popular" : hasRisingStarBadge ? "Rising star" : null),
    });
  }

  badgeMapCache.set(cacheKey, {
    createdAt: Date.now(),
    value: Array.from(badgeMap.entries()),
  });

  return badgeMap;
}
