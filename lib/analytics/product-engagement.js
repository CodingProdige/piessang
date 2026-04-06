import { getAdminDb } from "@/lib/firebase/admin";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
      ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0,
    }))
    .sort((left, right) => {
      const leftScore = left.productViews * 4 + left.clicks * 2 + left.hovers;
      const rightScore = right.productViews * 4 + right.clicks * 2 + right.hovers;
      return rightScore - leftScore;
    })
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
      ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0,
    }))
    .sort((left, right) => {
      const leftScore = left.productViews * 4 + left.clicks * 2 + left.hovers;
      const rightScore = right.productViews * 4 + right.clicks * 2 + right.hovers;
      return rightScore - leftScore;
    })
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
