import { FieldValue } from "firebase-admin/firestore";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export const CAMPAIGN_TYPES = ["sponsored_products", "sponsored_seller", "premium_banner"];
export const CAMPAIGN_STATUSES = ["draft", "submitted", "in_review", "approved", "scheduled", "active", "paused", "rejected", "ended"];
export const CAMPAIGN_PLACEMENTS = ["search_results", "category_grid", "homepage_feature"];

const LIVE_EDITABLE_STATUSES = new Set(["approved", "scheduled", "active", "paused"]);

export function campaignsCollection(db) {
  return db.collection("campaigns_v1");
}

export function normalizeCampaignInput(input = {}) {
  const placements = Array.from(
    new Set(
      toArray(input?.targeting?.placements)
        .map((item) => toStr(item).toLowerCase())
        .filter((item) => CAMPAIGN_PLACEMENTS.includes(item)),
    ),
  );
  const promotedProducts = Array.from(
    new Set(
      toArray(input?.promotedProducts)
        .map((item) => toStr(item))
        .filter(Boolean),
    ),
  );

  return {
    name: toStr(input?.name),
    type: CAMPAIGN_TYPES.includes(toStr(input?.type).toLowerCase()) ? toStr(input?.type).toLowerCase() : "sponsored_products",
    status: CAMPAIGN_STATUSES.includes(toStr(input?.status).toLowerCase()) ? toStr(input?.status).toLowerCase() : "draft",
    budget: {
      model: "cpc",
      dailyBudget: Math.max(0, toNum(input?.budget?.dailyBudget)),
      totalBudget: Math.max(0, toNum(input?.budget?.totalBudget)),
      maxCpc: Math.max(0, toNum(input?.budget?.maxCpc)),
      spentToday: Math.max(0, toNum(input?.budget?.spentToday)),
      spentTotal: Math.max(0, toNum(input?.budget?.spentTotal)),
    },
    schedule: {
      startAt: toStr(input?.schedule?.startAt) || null,
      endAt: toStr(input?.schedule?.endAt) || null,
      timezone: toStr(input?.schedule?.timezone) || "Africa/Johannesburg",
    },
    targeting: {
      placements,
      categories: toArray(input?.targeting?.categories).map((item) => toStr(item)).filter(Boolean),
      subCategories: toArray(input?.targeting?.subCategories).map((item) => toStr(item)).filter(Boolean),
      keywords: toArray(input?.targeting?.keywords).map((item) => toStr(item)).filter(Boolean),
    },
    promotedProducts,
    creative: {
      headline: toStr(input?.creative?.headline),
      supportingText: toStr(input?.creative?.supportingText),
    },
  };
}

export function normalizeCampaignRecord(docId, data = {}) {
  const createdAt = data?.timestamps?.createdAt?.toDate?.()?.toISOString?.() || data?.timestamps?.createdAt || null;
  const updatedAt = data?.timestamps?.updatedAt?.toDate?.()?.toISOString?.() || data?.timestamps?.updatedAt || null;
  const reviewedAt = data?.moderation?.reviewedAt?.toDate?.()?.toISOString?.() || data?.moderation?.reviewedAt || null;
  const submittedAt = data?.moderation?.submittedAt?.toDate?.()?.toISOString?.() || data?.moderation?.submittedAt || null;
  const pendingUpdate = data?.pendingUpdate && typeof data.pendingUpdate === "object" ? data.pendingUpdate : null;
  const pendingSubmittedAt = pendingUpdate?.moderation?.submittedAt?.toDate?.()?.toISOString?.() || pendingUpdate?.moderation?.submittedAt || null;
  const pendingReviewedAt = pendingUpdate?.moderation?.reviewedAt?.toDate?.()?.toISOString?.() || pendingUpdate?.moderation?.reviewedAt || null;

  return {
    docId,
    sellerCode: toStr(data?.sellerCode),
    sellerSlug: toStr(data?.sellerSlug),
    vendorName: toStr(data?.vendorName),
    name: toStr(data?.name),
    type: toStr(data?.type),
    status: toStr(data?.status),
    budget: {
      model: toStr(data?.budget?.model || "cpc"),
      dailyBudget: toNum(data?.budget?.dailyBudget),
      totalBudget: toNum(data?.budget?.totalBudget),
      maxCpc: toNum(data?.budget?.maxCpc),
      spentToday: toNum(data?.budget?.spentToday),
      spentTotal: toNum(data?.budget?.spentTotal),
    },
    schedule: {
      startAt: toStr(data?.schedule?.startAt) || null,
      endAt: toStr(data?.schedule?.endAt) || null,
      timezone: toStr(data?.schedule?.timezone) || "Africa/Johannesburg",
    },
    targeting: {
      placements: toArray(data?.targeting?.placements).map((item) => toStr(item)).filter(Boolean),
      categories: toArray(data?.targeting?.categories).map((item) => toStr(item)).filter(Boolean),
      subCategories: toArray(data?.targeting?.subCategories).map((item) => toStr(item)).filter(Boolean),
      keywords: toArray(data?.targeting?.keywords).map((item) => toStr(item)).filter(Boolean),
    },
    promotedProducts: toArray(data?.promotedProducts).map((item) => toStr(item)).filter(Boolean),
    creative: {
      headline: toStr(data?.creative?.headline),
      supportingText: toStr(data?.creative?.supportingText),
    },
    moderation: {
      submittedAt,
      reviewedAt,
      reviewedBy: toStr(data?.moderation?.reviewedBy) || null,
      submittedBy: toStr(data?.moderation?.submittedBy) || null,
      notes: toStr(data?.moderation?.notes) || null,
      decision: toStr(data?.moderation?.decision) || null,
    },
    analytics: {
      impressions: toNum(data?.analytics?.impressions),
      clicks: toNum(data?.analytics?.clicks),
      spend: toNum(data?.analytics?.spend),
      conversions: toNum(data?.analytics?.conversions),
      revenue: toNum(data?.analytics?.revenue),
    },
    timestamps: {
      createdAt,
      updatedAt,
    },
    hasPendingUpdate: Boolean(pendingUpdate),
    pendingUpdate: pendingUpdate
      ? {
          name: toStr(pendingUpdate?.name),
          type: toStr(pendingUpdate?.type),
          budget: {
            model: toStr(pendingUpdate?.budget?.model || "cpc"),
            dailyBudget: toNum(pendingUpdate?.budget?.dailyBudget),
            totalBudget: toNum(pendingUpdate?.budget?.totalBudget),
            maxCpc: toNum(pendingUpdate?.budget?.maxCpc),
            spentToday: toNum(pendingUpdate?.budget?.spentToday),
            spentTotal: toNum(pendingUpdate?.budget?.spentTotal),
          },
          schedule: {
            startAt: toStr(pendingUpdate?.schedule?.startAt) || null,
            endAt: toStr(pendingUpdate?.schedule?.endAt) || null,
            timezone: toStr(pendingUpdate?.schedule?.timezone) || "Africa/Johannesburg",
          },
          targeting: {
            placements: toArray(pendingUpdate?.targeting?.placements).map((item) => toStr(item)).filter(Boolean),
            categories: toArray(pendingUpdate?.targeting?.categories).map((item) => toStr(item)).filter(Boolean),
            subCategories: toArray(pendingUpdate?.targeting?.subCategories).map((item) => toStr(item)).filter(Boolean),
            keywords: toArray(pendingUpdate?.targeting?.keywords).map((item) => toStr(item)).filter(Boolean),
          },
          promotedProducts: toArray(pendingUpdate?.promotedProducts).map((item) => toStr(item)).filter(Boolean),
          creative: {
            headline: toStr(pendingUpdate?.creative?.headline),
            supportingText: toStr(pendingUpdate?.creative?.supportingText),
          },
          moderation: {
            submittedAt: pendingSubmittedAt,
            reviewedAt: pendingReviewedAt,
            reviewedBy: toStr(pendingUpdate?.moderation?.reviewedBy) || null,
            submittedBy: toStr(pendingUpdate?.moderation?.submittedBy) || null,
            notes: toStr(pendingUpdate?.moderation?.notes) || null,
            decision: toStr(pendingUpdate?.moderation?.decision) || null,
          },
        }
      : null,
  };
}

export function isSystemAdminUser(userData = {}) {
  return toStr(userData?.system?.accessType || userData?.systemAccessType).toLowerCase() === "admin";
}

export function getSellerIdentifiers(userData = {}) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return new Set(
    [
      seller?.sellerCode,
      seller?.activeSellerCode,
      seller?.groupSellerCode,
      seller?.sellerSlug,
      seller?.activeSellerSlug,
      seller?.groupSellerSlug,
    ]
      .map((item) => toStr(item).toLowerCase())
      .filter(Boolean),
  );
}

export function canManageCampaign(userData = {}, campaign = {}) {
  if (isSystemAdminUser(userData)) return true;
  const identifiers = getSellerIdentifiers(userData);
  const sellerCode = toStr(campaign?.sellerCode).toLowerCase();
  const sellerSlug = toStr(campaign?.sellerSlug).toLowerCase();
  return Boolean((sellerCode && identifiers.has(sellerCode)) || (sellerSlug && identifiers.has(sellerSlug)));
}

export function buildCampaignWritePayload({
  current = null,
  input,
  sellerCode,
  sellerSlug,
  vendorName,
  actorUid,
  nextStatus,
  moderationPatch = null,
}) {
  const now = new Date().toISOString();
  const normalized = normalizeCampaignInput({ ...input, status: nextStatus || input?.status || current?.status || "draft" });
  const currentModeration = current?.moderation && typeof current.moderation === "object" ? current.moderation : {};

  return {
    sellerCode,
    sellerSlug,
    vendorName,
    name: normalized.name,
    type: normalized.type,
    status: normalized.status,
    budget: normalized.budget,
    schedule: normalized.schedule,
    targeting: normalized.targeting,
    promotedProducts: normalized.promotedProducts,
    creative: normalized.creative,
    moderation: {
      ...currentModeration,
      ...(moderationPatch || {}),
    },
    analytics: {
      impressions: Number(current?.analytics?.impressions || 0),
      clicks: Number(current?.analytics?.clicks || 0),
      spend: Number(current?.analytics?.spend || 0),
      conversions: Number(current?.analytics?.conversions || 0),
      revenue: Number(current?.analytics?.revenue || 0),
    },
    timestamps: {
      createdAt: current?.timestamps?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: current?.timestamps?.createdBy || actorUid,
      updatedBy: actorUid,
      updatedAtIso: now,
    },
  };
}

export function isLiveEditableCampaignStatus(status = "") {
  return LIVE_EDITABLE_STATUSES.has(toStr(status).toLowerCase());
}
