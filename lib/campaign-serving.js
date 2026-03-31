import { FieldValue } from "firebase-admin/firestore";
import { campaignsCollection, normalizeCampaignRecord } from "@/lib/campaigns";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDayKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return date.toISOString().slice(0, 10);
}

function isWithinSchedule(schedule = {}, now = new Date()) {
  const startAt = toStr(schedule?.startAt);
  const endAt = toStr(schedule?.endAt);
  if (startAt) {
    const start = new Date(startAt);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (endAt) {
    const end = new Date(endAt);
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return true;
}

function budgetRemaining(campaign = {}) {
  const totalBudget = toNum(campaign?.budget?.totalBudget);
  const spentTotal = toNum(campaign?.budget?.spentTotal);
  return Math.max(totalBudget - spentTotal, 0);
}

function getCampaignServingConfig(campaign = {}) {
  const serving = campaign?.serving && typeof campaign.serving === "object" ? campaign.serving : {};
  return {
    frequencyCapPerSession: Math.max(1, toNum(serving?.frequencyCapPerSession, 3)),
    frequencyCapPer24Hours: Math.max(1, toNum(serving?.frequencyCapPer24Hours, 6)),
    frequencyWindowHours: Math.max(1, toNum(serving?.frequencyWindowHours, 24)),
  };
}

function getCampaignPacingScore(campaign = {}, now = new Date()) {
  const dailyBudget = Math.max(0, toNum(campaign?.budget?.dailyBudget));
  if (dailyBudget <= 0) return 1;

  const dayKey = getDayKey(now);
  const spentToday =
    toStr(campaign?.dailyMetrics?.dayKey) === dayKey
      ? Math.max(0, toNum(campaign?.dailyMetrics?.spentToday))
      : 0;

  const elapsedRatio = Math.min(1, Math.max(0.05, (now.getHours() * 60 + now.getMinutes() + 1) / 1440));
  const expectedSpendByNow = dailyBudget * elapsedRatio;
  if (expectedSpendByNow <= 0) return 1;

  const pacingRatio = spentToday / expectedSpendByNow;
  if (pacingRatio >= 1.35) return 0.35;
  if (pacingRatio >= 1.1) return 0.6;
  if (pacingRatio <= 0.5) return 1.15;
  return 1;
}

async function getSessionFrequencyMap(db, { placement, sessionId, userId }) {
  if (!db || !placement || (!sessionId && !userId)) return new Map();
  const collection = db.collection("campaign_impressions_v1");
  const query = userId
    ? collection.where("userId", "==", userId).where("placement", "==", placement)
    : collection.where("sessionId", "==", sessionId).where("placement", "==", placement);
  const snap = await query.get().catch(() => null);
  const map = new Map();
  for (const doc of snap?.docs || []) {
    const data = doc.data() || {};
    const campaignId = toStr(data?.campaignId);
    if (!campaignId) continue;
    map.set(campaignId, (map.get(campaignId) || 0) + 1);
  }
  return map;
}

async function getRecentFrequencyMap(db, { placement, sessionId, userId, sinceIso }) {
  if (!db || !placement || (!sessionId && !userId) || !sinceIso) return new Map();
  const collection = db.collection("campaign_impressions_v1");
  const query = userId
    ? collection.where("userId", "==", userId).where("placement", "==", placement)
    : collection.where("sessionId", "==", sessionId).where("placement", "==", placement);
  const snap = await query.get().catch(() => null);
  const map = new Map();
  for (const doc of snap?.docs || []) {
    const data = doc.data() || {};
    if (toStr(data?.createdAt) < sinceIso) continue;
    const campaignId = toStr(data?.campaignId);
    if (!campaignId) continue;
    map.set(campaignId, (map.get(campaignId) || 0) + 1);
  }
  return map;
}

function canServeCampaign(campaign = {}, placement = "") {
  const status = toStr(campaign?.status).toLowerCase();
  if (!["approved", "active", "scheduled"].includes(status)) return false;
  if (!isWithinSchedule(campaign?.schedule)) return false;
  if (budgetRemaining(campaign) <= 0) return false;
  const placements = Array.isArray(campaign?.targeting?.placements) ? campaign.targeting.placements : [];
  return placements.includes(placement);
}

function scoreCampaign(campaign = {}, context = {}) {
  const maxCpc = toNum(campaign?.budget?.maxCpc);
  const targeting = campaign?.targeting && typeof campaign.targeting === "object" ? campaign.targeting : {};
  let relevance = 1;
  if (context?.category && Array.isArray(targeting?.categories) && targeting.categories.length) {
    relevance += targeting.categories.includes(context.category) ? 0.35 : -0.2;
  }
  if (context?.subCategory && Array.isArray(targeting?.subCategories) && targeting.subCategories.length) {
    relevance += targeting.subCategories.includes(context.subCategory) ? 0.45 : -0.2;
  }
  if (context?.search && Array.isArray(targeting?.keywords) && targeting.keywords.length) {
    const query = String(context.search).toLowerCase();
    if (targeting.keywords.some((keyword) => query.includes(String(keyword).toLowerCase()))) {
      relevance += 0.4;
    }
  }
  const pacing = getCampaignPacingScore(campaign, context?.now instanceof Date ? context.now : new Date());
  return maxCpc * Math.max(relevance, 0.2) * pacing;
}

export async function serveSponsoredProducts({
  db,
  placement,
  organicItems = [],
  context = {},
  limit = 2,
  sessionId = "",
  userId = "",
}) {
  if (!db || !placement || !organicItems.length || limit <= 0) return [];

  const productIds = new Set(
    organicItems
      .map((item) =>
        toStr(item?.id || item?.data?.docId || item?.data?.product?.unique_id),
      )
      .filter(Boolean),
  );
  if (!productIds.size) return [];

  const now = new Date();
  const sessionFrequencyMap = await getSessionFrequencyMap(db, { placement, sessionId, userId });
  const recentWindowStart = new Date(
    now.getTime() - getCampaignServingConfig().frequencyWindowHours * 60 * 60 * 1000,
  );
  const recentFrequencyMap = await getRecentFrequencyMap(db, {
    placement,
    sessionId,
    userId,
    sinceIso: recentWindowStart.toISOString(),
  });

  const snap = await campaignsCollection(db).get();
  const campaigns = snap.docs
    .map((doc) => normalizeCampaignRecord(doc.id, doc.data()))
    .filter((campaign) => canServeCampaign(campaign, placement))
    .filter((campaign) => {
      const serving = getCampaignServingConfig(campaign);
      return (
        (sessionFrequencyMap.get(campaign.docId) || 0) < serving.frequencyCapPerSession &&
        (recentFrequencyMap.get(campaign.docId) || 0) < serving.frequencyCapPer24Hours
      );
    })
    .filter((campaign) =>
      Array.isArray(campaign?.promotedProducts) &&
      campaign.promotedProducts.some((productId) => productIds.has(toStr(productId))),
    )
    .sort((a, b) => scoreCampaign(b, { ...context, now }) - scoreCampaign(a, { ...context, now }));

  const sponsored = [];
  const usedProducts = new Set();

  for (const campaign of campaigns) {
    const match = (campaign.promotedProducts || []).find((productId) => {
      const normalized = toStr(productId);
      return normalized && productIds.has(normalized) && !usedProducts.has(normalized);
    });
    if (!match) continue;
    const organicItem = organicItems.find(
      (item) => toStr(item?.id || item?.data?.docId || item?.data?.product?.unique_id) === match,
    );
    if (!organicItem) continue;
    usedProducts.add(match);
    sponsored.push({
      ...organicItem,
      ad: {
        sponsored: true,
        campaignId: campaign.docId,
        placement,
        sellerCode: campaign.sellerCode || null,
        sellerSlug: campaign.sellerSlug || null,
        label: "Sponsored",
      },
    });
    if (sponsored.length >= limit) break;
  }

  return sponsored;
}

export function injectSponsoredIntoProducts({
  organicItems = [],
  sponsoredItems = [],
  placement = "",
}) {
  if (!Array.isArray(organicItems) || !organicItems.length || !Array.isArray(sponsoredItems) || !sponsoredItems.length) {
    return organicItems;
  }

  const sponsoredIds = new Set(
    sponsoredItems.map((item) => toStr(item?.id || item?.data?.docId || item?.data?.product?.unique_id)).filter(Boolean),
  );
  const baseItems = organicItems.filter(
    (item) => !sponsoredIds.has(toStr(item?.id || item?.data?.docId || item?.data?.product?.unique_id)),
  );

  const output = [...baseItems];
  const insertionIndexes = placement === "search_results" ? [1, 6] : [3, 10];
  sponsoredItems.forEach((item, index) => {
    const targetIndex = Math.min(insertionIndexes[index] ?? output.length, output.length);
    output.splice(targetIndex, 0, item);
  });
  return output;
}

export function buildTrackingSessionId() {
  return `ads:${Math.random().toString(36).slice(2)}:${Date.now().toString(36)}`;
}

export async function recordCampaignImpression({
  db,
  campaignId,
  productId,
  placement,
  userId,
  sessionId,
}) {
  if (!db || !campaignId || !productId || !placement || !sessionId) return;
  const impressionRef = db.collection("campaign_impressions_v1").doc();
  await impressionRef.set({
    campaignId,
    productId,
    placement,
    userId: userId || null,
    sessionId,
    createdAt: new Date().toISOString(),
    _createdAt: FieldValue.serverTimestamp(),
  });
  await campaignsCollection(db).doc(campaignId).set(
    {
      analytics: {
        impressions: FieldValue.increment(1),
      },
      dailyMetrics: {
        dayKey: getDayKey(),
        impressionsToday: FieldValue.increment(1),
      },
      timestamps: {
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );

  await db.collection("campaign_daily_stats_v1").doc(`${campaignId}:${getDayKey()}`).set(
    {
      campaignId,
      dayKey: getDayKey(),
      impressions: FieldValue.increment(1),
      clicks: FieldValue.increment(0),
      spend: FieldValue.increment(0),
      conversions: FieldValue.increment(0),
      revenue: FieldValue.increment(0),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function recordCampaignClick({
  db,
  campaignId,
  productId,
  placement,
  userId,
  sessionId,
  cost,
}) {
  if (!db || !campaignId || !productId || !placement || !sessionId) return { billed: false };
  const dedupeKey = `${campaignId}:${productId}:${sessionId}`;
  const dedupeRef = db.collection("campaign_click_dedupe_v1").doc(dedupeKey);
  const dedupeSnap = await dedupeRef.get();
  if (dedupeSnap.exists) {
    const existing = dedupeSnap.data() || {};
    return { billed: existing?.billed === true, duplicate: true };
  }

  const clickRef = db.collection("campaign_clicks_v1").doc();
  const clickPayload = {
    campaignId,
    productId,
    placement,
    userId: userId || null,
    sessionId,
    billed: true,
    cpcAmount: toNum(cost),
    createdAt: new Date().toISOString(),
    _createdAt: FieldValue.serverTimestamp(),
  };
  await clickRef.set(clickPayload);
  await db.collection("campaign_spend_ledger_v1").add({
    campaignId,
    productId,
    placement,
    userId: userId || null,
    sessionId,
    kind: "click",
    amount: toNum(cost),
    clickId: clickRef.id,
    createdAt: clickPayload.createdAt,
    _createdAt: FieldValue.serverTimestamp(),
  });
  await dedupeRef.set({
    campaignId,
    productId,
    placement,
    sessionId,
    userId: userId || null,
    billed: true,
    clickId: clickRef.id,
    createdAt: clickPayload.createdAt,
    _createdAt: FieldValue.serverTimestamp(),
  });
  await campaignsCollection(db).doc(campaignId).set(
    {
      analytics: {
        clicks: FieldValue.increment(1),
        spend: FieldValue.increment(toNum(cost)),
      },
      budget: {
        spentTotal: FieldValue.increment(toNum(cost)),
      },
      dailyMetrics: {
        dayKey: getDayKey(),
        clicksToday: FieldValue.increment(1),
        spentToday: FieldValue.increment(toNum(cost)),
      },
      timestamps: {
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
  await db.collection("campaign_daily_stats_v1").doc(`${campaignId}:${getDayKey()}`).set(
    {
      campaignId,
      dayKey: getDayKey(),
      clicks: FieldValue.increment(1),
      spend: FieldValue.increment(toNum(cost)),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { billed: true, clickId: clickRef.id };
}
