export const PRODUCT_ENGAGEMENT_BADGE_ICON_OPTIONS = [
  { key: "spark", label: "Spark" },
  { key: "cursor", label: "Cursor click" },
  { key: "trophy", label: "Trophy" },
  { key: "trend", label: "Trending arrow" },
  { key: "star", label: "Star" },
  { key: "bolt", label: "Bolt" },
];

export const PRODUCT_ENGAGEMENT_BADGE_ICON_KEYS = PRODUCT_ENGAGEMENT_BADGE_ICON_OPTIONS.map((option) => option.key);

export function normalizeBadgeIconKey(value, fallback = "spark") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return PRODUCT_ENGAGEMENT_BADGE_ICON_KEYS.includes(normalized) ? normalized : fallback;
}

export function normalizeBadgeIconUrl(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("/")) return normalized;
  return fallback;
}
