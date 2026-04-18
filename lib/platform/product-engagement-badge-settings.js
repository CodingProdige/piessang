import { getAdminDb } from "@/lib/firebase/admin";
import { PRODUCT_ENGAGEMENT_BADGE_CONFIG } from "@/lib/analytics/product-engagement-badges";
import { normalizeBadgeIconKey, normalizeBadgeIconUrl } from "@/lib/analytics/product-engagement-badge-icons";
import { normalizeBadgeColorKey, normalizeBadgeHexColor } from "@/lib/analytics/product-engagement-badge-colors";

const SETTINGS_COLLECTION = "system_settings";
const SETTINGS_DOC_ID = "product_engagement_badges";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ["true", "1", "yes", "on"].includes(normalized);
}

export function normalizeProductEngagementBadgeSettings(input = {}) {
  return {
    windowDays: Math.max(1, Math.min(90, toNum(input?.windowDays, PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays))),
    bestSellerEnabled: toBool(input?.bestSellerEnabled, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerEnabled),
    bestSellerUnitsThreshold: Math.max(1, toNum(input?.bestSellerUnitsThreshold, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerUnitsThreshold)),
    bestSellerIcon: normalizeBadgeIconKey(input?.bestSellerIcon, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerIcon),
    bestSellerIconUrl: normalizeBadgeIconUrl(input?.bestSellerIconUrl, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerIconUrl),
    bestSellerColor: normalizeBadgeColorKey(input?.bestSellerColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerColor),
    bestSellerBackgroundColor: normalizeBadgeHexColor(input?.bestSellerBackgroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerBackgroundColor),
    bestSellerForegroundColor: normalizeBadgeHexColor(input?.bestSellerForegroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.bestSellerForegroundColor),
    popularEnabled: toBool(input?.popularEnabled, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularEnabled),
    popularClicksThreshold: Math.max(1, toNum(input?.popularClicksThreshold, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularClicksThreshold)),
    popularIcon: normalizeBadgeIconKey(input?.popularIcon, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularIcon),
    popularIconUrl: normalizeBadgeIconUrl(input?.popularIconUrl, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularIconUrl),
    popularColor: normalizeBadgeColorKey(input?.popularColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularColor),
    popularBackgroundColor: normalizeBadgeHexColor(input?.popularBackgroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularBackgroundColor),
    popularForegroundColor: normalizeBadgeHexColor(input?.popularForegroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularForegroundColor),
    trendingNowEnabled: toBool(input?.trendingNowEnabled, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowEnabled),
    trendingNowUnitsThreshold: Math.max(1, toNum(input?.trendingNowUnitsThreshold, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowUnitsThreshold)),
    trendingNowGrowthMultiplier: Math.max(1.1, Math.min(10, toNum(input?.trendingNowGrowthMultiplier, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowGrowthMultiplier))),
    trendingNowIcon: normalizeBadgeIconKey(input?.trendingNowIcon, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowIcon),
    trendingNowIconUrl: normalizeBadgeIconUrl(input?.trendingNowIconUrl, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowIconUrl),
    trendingNowColor: normalizeBadgeColorKey(input?.trendingNowColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowColor),
    trendingNowBackgroundColor: normalizeBadgeHexColor(input?.trendingNowBackgroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowBackgroundColor),
    trendingNowForegroundColor: normalizeBadgeHexColor(input?.trendingNowForegroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.trendingNowForegroundColor),
    risingStarEnabled: toBool(input?.risingStarEnabled, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarEnabled),
    risingStarScoreThreshold: Math.max(1, toNum(input?.risingStarScoreThreshold, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarScoreThreshold)),
    risingStarClickThreshold: Math.max(1, toNum(input?.risingStarClickThreshold, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarClickThreshold)),
    risingStarIcon: normalizeBadgeIconKey(input?.risingStarIcon, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarIcon),
    risingStarIconUrl: normalizeBadgeIconUrl(input?.risingStarIconUrl, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarIconUrl),
    risingStarColor: normalizeBadgeColorKey(input?.risingStarColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarColor),
    risingStarBackgroundColor: normalizeBadgeHexColor(input?.risingStarBackgroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarBackgroundColor),
    risingStarForegroundColor: normalizeBadgeHexColor(input?.risingStarForegroundColor, PRODUCT_ENGAGEMENT_BADGE_CONFIG.risingStarForegroundColor),
  };
}

export async function loadProductEngagementBadgeSettings() {
  const db = getAdminDb();
  const fallback = normalizeProductEngagementBadgeSettings(PRODUCT_ENGAGEMENT_BADGE_CONFIG);
  if (!db) return { ...fallback, updatedAt: "", updatedBy: "" };

  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    ...normalizeProductEngagementBadgeSettings(data),
    updatedAt: toStr(data?.timestamps?.updatedAt),
    updatedBy: toStr(data?.timestamps?.updatedBy),
  };
}

export async function saveProductEngagementBadgeSettings({ uid = "", settings = {} } = {}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const normalized = normalizeProductEngagementBadgeSettings(settings);
  const updatedAt = new Date().toISOString();

  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(
    {
      ...normalized,
      timestamps: {
        updatedAt,
        updatedBy: toStr(uid),
      },
    },
    { merge: true },
  );

  return {
    ...normalized,
    updatedAt,
    updatedBy: toStr(uid),
  };
}
