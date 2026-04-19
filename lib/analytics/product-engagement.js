import { getAdminDb } from "@/lib/firebase/admin";
import { PRODUCT_ENGAGEMENT_BADGE_CONFIG } from "@/lib/analytics/product-engagement-badges";
import { loadProductEngagementBadgeSettings } from "@/lib/platform/product-engagement-badge-settings";
import { getFrozenLineTotalIncl } from "@/lib/orders/frozen-money";
import { FieldValue } from "firebase-admin/firestore";

const BADGE_MAP_CACHE_TTL_MS = 60 * 1000;
const badgeMapCache = new Map();
const BADGE_SNAPSHOT_COLLECTION = "analytics_product_badge_snapshots_v1";
const BADGE_SNAPSHOT_META_ID = "__meta__";
const PRODUCT_DAILY_METRICS_COLLECTION = "analytics_product_daily_metrics_v1";
const PRODUCT_BADGE_DIRTY_COLLECTION = "analytics_product_badge_dirty_v1";

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

function getDateKeysForTrailingWindow(days = 30) {
  const safeDays = Math.max(1, Math.min(365, toNum(days) || 30));
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  const keys = [];
  for (let offset = 0; offset < safeDays; offset += 1) {
    const next = new Date(cursor);
    next.setDate(cursor.getDate() - offset);
    keys.push(getDateKey(next));
  }
  return keys;
}

function buildDailyMetricDocId(productId = "", dateKey = "") {
  return `${toStr(productId)}__${toStr(dateKey)}`;
}

async function enqueueProductBadgeSnapshotRefresh(productIds = [], reason = "unknown") {
  const db = getAdminDb();
  if (!db) return;
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((value) => toStr(value)).filter(Boolean)));
  if (!ids.length) return;

  let batch = db.batch();
  let opCount = 0;
  const nowIso = isoNow();

  const commitBatch = async () => {
    if (!opCount) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  };

  for (const productId of ids) {
    batch.set(
      db.collection(PRODUCT_BADGE_DIRTY_COLLECTION).doc(productId),
      {
        productId,
        reason: toStr(reason) || "unknown",
        updatedAt: nowIso,
      },
      { merge: true },
    );
    opCount += 1;
    if (opCount >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();
}

async function incrementProductDailyMetrics(entries = []) {
  const db = getAdminDb();
  if (!db) return;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const productId = toStr(entry?.productId);
    const dateKey = toStr(entry?.dateKey || getDateKey());
    if (!productId || !dateKey) continue;
    const docRef = db.collection(PRODUCT_DAILY_METRICS_COLLECTION).doc(buildDailyMetricDocId(productId, dateKey));
    await docRef.set(
      {
        productId,
        dateKey,
        impressions: FieldValue.increment(toNum(entry?.impressions)),
        clicks: FieldValue.increment(toNum(entry?.clicks)),
        hovers: FieldValue.increment(toNum(entry?.hovers)),
        productViews: FieldValue.increment(toNum(entry?.productViews)),
        salesUnits: FieldValue.increment(toNum(entry?.salesUnits)),
        salesOrders: FieldValue.increment(toNum(entry?.salesOrders)),
        salesRevenue: FieldValue.increment(toNum(entry?.salesRevenue)),
        updatedAt: isoNow(),
      },
      { merge: true },
    );
  }
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
  const metricField =
    action === "impression"
      ? { impressions: 1 }
      : action === "click"
        ? { clicks: 1 }
        : action === "hover"
          ? { hovers: 1 }
          : action === "product_view"
            ? { productViews: 1 }
            : null;
  if (metricField) {
    await incrementProductDailyMetrics([{ productId, dateKey: payload.dateKey, ...metricField }]).catch(() => null);
    await enqueueProductBadgeSnapshotRefresh([productId], `engagement:${action}`).catch(() => null);
  }
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

function buildBadgeSnapshotConfig({
  loadedSettings,
  days,
  popularClicksThreshold,
  risingStarScoreThreshold,
  risingStarClickThreshold,
} = {}) {
  const safeDays = Math.max(
    1,
    Math.min(365, toNum(days) || toNum(loadedSettings?.windowDays) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays),
  );
  return {
    safeDays,
    bestSellerEnabled: loadedSettings?.bestSellerEnabled !== false,
    bestSellerUnitsThreshold: Math.max(
      1,
      toNum(loadedSettings?.bestSellerUnitsThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerUnitsThreshold,
    ),
    popularEnabled: loadedSettings?.popularEnabled !== false,
    safePopularClicks: Math.max(
      1,
      toNum(popularClicksThreshold) ||
        toNum(loadedSettings?.popularClicksThreshold) ||
        PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularClicksThreshold,
    ),
    trendingNowEnabled: loadedSettings?.trendingNowEnabled !== false,
    trendingNowUnitsThreshold: Math.max(
      1,
      toNum(loadedSettings?.trendingNowUnitsThreshold) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowUnitsThreshold,
    ),
    trendingNowGrowthMultiplier: Math.max(
      1.1,
      toNum(loadedSettings?.trendingNowGrowthMultiplier) || PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowGrowthMultiplier,
    ),
    risingStarEnabled: loadedSettings?.risingStarEnabled !== false,
    safeRisingScore: Math.max(
      1,
      toNum(risingStarScoreThreshold) ||
        toNum(loadedSettings?.risingStarScoreThreshold) ||
        PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarScoreThreshold,
    ),
    safeRisingClicks: Math.max(
      1,
      toNum(risingStarClickThreshold) ||
        toNum(loadedSettings?.risingStarClickThreshold) ||
        PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarClickThreshold,
    ),
  };
}

function buildSnapshotPayloadForProduct(metrics = {}, config = {}) {
  const clicks = toNum(metrics?.clicks);
  const productViews = toNum(metrics?.productViews);
  const hovers = toNum(metrics?.hovers);
  const score = computeEngagementScore({ clicks, productViews, hovers });
  const recentSalesUnits = toNum(metrics?.recentSalesUnits);
  const previousSalesUnits = toNum(metrics?.previousSalesUnits);
  const salesGrowthMultiplier =
    previousSalesUnits > 0 ? recentSalesUnits / previousSalesUnits : recentSalesUnits > 0 ? recentSalesUnits : 0;
  const hasBestSellerBadge = config.bestSellerEnabled && recentSalesUnits >= config.bestSellerUnitsThreshold;
  const hasTrendingNowBadge =
    config.trendingNowEnabled &&
    !hasBestSellerBadge &&
    recentSalesUnits >= config.trendingNowUnitsThreshold &&
    salesGrowthMultiplier >= config.trendingNowGrowthMultiplier;
  const hasPopularBadge = config.popularEnabled && clicks >= config.safePopularClicks;
  const hasRisingStarBadge =
    config.risingStarEnabled &&
    !hasBestSellerBadge &&
    !hasTrendingNowBadge &&
    !hasPopularBadge &&
    clicks >= config.safeRisingClicks &&
    score >= config.safeRisingScore;
  const badge = hasBestSellerBadge
    ? "best_seller"
    : hasTrendingNowBadge
      ? "trending_now"
      : hasPopularBadge
        ? "popular"
        : hasRisingStarBadge
          ? "rising_star"
          : null;

  return {
    clicks,
    productViews,
    hovers,
    score,
    recentSalesUnits,
    previousSalesUnits,
    salesGrowthMultiplier,
    hasHighClicks: hasPopularBadge,
    badge,
    badgeLabel:
      badge === "best_seller"
        ? "Best seller"
        : badge === "trending_now"
          ? "Trending now"
          : badge === "popular"
            ? "Popular"
            : badge === "rising_star"
              ? "Rising star"
              : null,
  };
}

async function computeBadgeSnapshotsForProductIds(productIds = [], options = {}) {
  const loadedSettings = await loadProductEngagementBadgeSettings().catch(() => PRODUCT_ENGAGEMENT_BADGE_CONFIG);
  const config = buildBadgeSnapshotConfig({
    loadedSettings,
    days: options?.days,
    popularClicksThreshold: options?.popularClicksThreshold,
    risingStarScoreThreshold: options?.risingStarScoreThreshold,
    risingStarClickThreshold: options?.risingStarClickThreshold,
  });

  const db = getAdminDb();
  if (!db) return { badgeMap: new Map(), config };

  const normalizedIds = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map((value) => toStr(value)).filter(Boolean)));
  if (!normalizedIds.length) return { badgeMap: new Map(), config };

  const currentDateKeys = getDateKeysForTrailingWindow(config.safeDays);
  const previousDateKeys = getDateKeysForTrailingWindow(config.safeDays * 2).slice(config.safeDays);
  const refs = [];
  for (const productId of normalizedIds) {
    for (const dateKey of [...currentDateKeys, ...previousDateKeys]) {
      refs.push(db.collection(PRODUCT_DAILY_METRICS_COLLECTION).doc(buildDailyMetricDocId(productId, dateKey)));
    }
  }

  const docs = [];
  for (let index = 0; index < refs.length; index += 300) {
    const chunk = refs.slice(index, index + 300);
    const snapChunk = await db.getAll(...chunk).catch(() => []);
    docs.push(...snapChunk);
  }

  const currentKeySet = new Set(currentDateKeys);
  const previousKeySet = new Set(previousDateKeys);
  const metricMap = new Map();

  for (const docSnap of docs) {
    if (!docSnap?.exists) continue;
    const data = docSnap.data() || {};
    const productId = toStr(data?.productId);
    const dateKey = toStr(data?.dateKey);
    if (!productId || !dateKey) continue;
    const current = metricMap.get(productId) || {
      clicks: 0,
      productViews: 0,
      hovers: 0,
      recentSalesUnits: 0,
      previousSalesUnits: 0,
    };
    if (currentKeySet.has(dateKey)) {
      current.clicks += toNum(data?.clicks);
      current.productViews += toNum(data?.productViews);
      current.hovers += toNum(data?.hovers);
      current.recentSalesUnits += toNum(data?.salesUnits);
    } else if (previousKeySet.has(dateKey)) {
      current.previousSalesUnits += toNum(data?.salesUnits);
    }
    metricMap.set(productId, current);
  }

  const badgeMap = new Map();
  for (const productId of normalizedIds) {
    badgeMap.set(productId, buildSnapshotPayloadForProduct(metricMap.get(productId) || {}, config));
  }
  return { badgeMap, config };
}

async function writeBadgeSnapshotDocuments(entries = [], config = {}) {
  const db = getAdminDb();
  if (!db) return;

  const collection = db.collection(BADGE_SNAPSHOT_COLLECTION);
  const nowIso = isoNow();
  let batch = db.batch();
  let opCount = 0;

  const commitBatch = async () => {
    if (!opCount) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  };

  batch.set(collection.doc(BADGE_SNAPSHOT_META_ID), {
    refreshedAt: nowIso,
    windowDays: config.safeDays || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays,
  });
  opCount += 1;

  for (const [productId, value] of entries) {
    batch.set(collection.doc(String(productId)), {
      productId: String(productId),
      ...value,
      updatedAt: nowIso,
    });
    opCount += 1;
    if (opCount >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();
}

export async function getMarketplaceProductEngagementBadgeSnapshotMap({
  productIds = [],
} = {}) {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map((value) => toStr(value))
        .filter(Boolean),
    ),
  );
  if (!normalizedIds.length) return new Map();

  const cacheKey = JSON.stringify({
    type: "snapshot",
    ids: normalizedIds,
    days: toNum(days) || null,
    popularClicksThreshold: toNum(popularClicksThreshold) || null,
    risingStarScoreThreshold: toNum(risingStarScoreThreshold) || null,
    risingStarClickThreshold: toNum(risingStarClickThreshold) || null,
  });
  const cached = badgeMapCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < BADGE_MAP_CACHE_TTL_MS) {
    return new Map(cached.value);
  }

  const db = getAdminDb();
  if (!db) return new Map();

  const collection = db.collection(BADGE_SNAPSHOT_COLLECTION);
  const snapshots = await Promise.all(normalizedIds.map((productId) => collection.doc(productId).get().catch(() => null)));
  const map = new Map();

  for (const snapshot of snapshots) {
    if (!snapshot?.exists) continue;
    const data = snapshot.data() || {};
    const productId = toStr(data?.productId || snapshot.id);
    if (!productId || productId === BADGE_SNAPSHOT_META_ID) continue;
    map.set(productId, {
      clicks: toNum(data?.clicks),
      productViews: toNum(data?.productViews),
      hovers: toNum(data?.hovers),
      score: toNum(data?.score),
      recentSalesUnits: toNum(data?.recentSalesUnits),
      previousSalesUnits: toNum(data?.previousSalesUnits),
      salesGrowthMultiplier: toNum(data?.salesGrowthMultiplier),
      hasHighClicks: data?.hasHighClicks === true,
      badge: toStr(data?.badge) || null,
      badgeLabel: toStr(data?.badgeLabel) || null,
    });
  }

  badgeMapCache.set(cacheKey, {
    createdAt: Date.now(),
    value: Array.from(map.entries()),
  });

  return map;
}

export async function recordProductSalesMetrics(items = [], { reason = "order" } = {}) {
  const dateKey = getDateKey();
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const productId = toStr(
      item?.product_unique_id ||
        item?.product_snapshot?.product?.unique_id ||
        item?.product_snapshot?.unique_id ||
        item?.product_snapshot?.docId,
    );
    if (!productId) continue;
    const quantity = Math.max(1, toNum(item?.quantity) || 1);
    const revenue = getFrozenLineTotalIncl(item);
    const current = grouped.get(productId) || {
      productId,
      dateKey,
      salesUnits: 0,
      salesOrders: 0,
      salesRevenue: 0,
    };
    current.salesUnits += quantity;
    current.salesOrders += 1;
    current.salesRevenue += revenue;
    grouped.set(productId, current);
  }

  const entries = Array.from(grouped.values());
  if (!entries.length) return { updatedProductIds: [] };
  await incrementProductDailyMetrics(entries);
  const updatedProductIds = entries.map((entry) => entry.productId);
  await enqueueProductBadgeSnapshotRefresh(updatedProductIds, `sales:${reason}`);
  return { updatedProductIds };
}

export async function refreshDirtyProductBadgeSnapshots({ limit = 250 } = {}) {
  const db = getAdminDb();
  if (!db) return { updatedCount: 0, dirtyCount: 0, processedProductIds: [] };

  const dirtySnap = await db
    .collection(PRODUCT_BADGE_DIRTY_COLLECTION)
    .orderBy("updatedAt", "asc")
    .limit(Math.max(1, Math.min(toNum(limit) || 250, 500)))
    .get()
    .catch(() => null);
  const dirtyDocs = dirtySnap?.docs || [];
  const productIds = dirtyDocs.map((docSnap) => toStr(docSnap.id)).filter(Boolean);
  if (!productIds.length) {
    return { updatedCount: 0, dirtyCount: 0, processedProductIds: [] };
  }

  const { badgeMap, config } = await computeBadgeSnapshotsForProductIds(productIds);
  await writeBadgeSnapshotDocuments(Array.from(badgeMap.entries()), config);

  let batch = db.batch();
  let opCount = 0;
  const commitBatch = async () => {
    if (!opCount) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  };

  for (const docSnap of dirtyDocs) {
    batch.delete(docSnap.ref);
    opCount += 1;
    if (opCount >= 400) {
      await commitBatch();
    }
  }
  await commitBatch();

  return {
    updatedCount: badgeMap.size,
    dirtyCount: dirtyDocs.length,
    processedProductIds: productIds,
  };
}
