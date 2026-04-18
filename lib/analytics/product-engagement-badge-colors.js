export const PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS = [
  { key: "green", label: "Green", backgroundColor: "#1a8553", foregroundColor: "#ffffff" },
  { key: "blue", label: "Blue", backgroundColor: "#145af2", foregroundColor: "#ffffff" },
  { key: "slate", label: "Slate", backgroundColor: "#596579", foregroundColor: "#ffffff" },
  { key: "amber", label: "Amber", backgroundColor: "#ff7a18", foregroundColor: "#ffffff" },
  { key: "rose", label: "Rose", backgroundColor: "#e11d48", foregroundColor: "#ffffff" },
  { key: "gold", label: "Gold", backgroundColor: "#c98a16", foregroundColor: "#ffffff" },
];

export const PRODUCT_ENGAGEMENT_BADGE_COLOR_KEYS = PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS.map((option) => option.key);

function normalizeHexCore(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
  if (/^[0-9a-f]{3}$/.test(normalized)) {
    return normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (/^[0-9a-f]{6}$/.test(normalized)) return normalized;
  return "";
}

export function normalizeBadgeColorKey(value, fallback = "slate") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return PRODUCT_ENGAGEMENT_BADGE_COLOR_KEYS.includes(normalized) ? normalized : fallback;
}

export function normalizeBadgeHexColor(value, fallback = "#596579") {
  const normalized = normalizeHexCore(value);
  return normalized ? `#${normalized}` : fallback;
}

export function getBadgeColorPreset(colorKey, fallback = "slate") {
  const normalized = normalizeBadgeColorKey(colorKey, fallback);
  return (
    PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS.find((option) => option.key === normalized) ||
    PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS.find((option) => option.key === fallback) ||
    PRODUCT_ENGAGEMENT_BADGE_COLOR_OPTIONS[0]
  );
}

/**
 * @param {{
 *   presetKey?: string,
 *   backgroundColor?: string,
 *   foregroundColor?: string,
 *   fallbackPreset?: string,
 * }} input
 */
export function getBadgeColorStyle({ presetKey, backgroundColor, foregroundColor, fallbackPreset = "slate" } = {}) {
  const preset = getBadgeColorPreset(presetKey, fallbackPreset);
  return {
    backgroundColor: normalizeBadgeHexColor(backgroundColor, preset.backgroundColor),
    color: normalizeBadgeHexColor(foregroundColor, preset.foregroundColor),
  };
}
