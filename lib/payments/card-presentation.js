function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export const CARD_THEME_PRESETS = {
  obsidian: {
    frameClass: "border-[rgba(227,197,47,0.18)] bg-[linear-gradient(180deg,rgba(246,243,235,0.9),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(20,24,27,0.08)]",
    cardBackground:
      "radial-gradient(circle at top left, rgba(227,197,47,0.38), transparent 34%), radial-gradient(circle at bottom right, rgba(255,255,255,0.12), transparent 30%), linear-gradient(135deg, #171717 0%, #23211b 42%, #2d2a20 100%)",
    stripeColor: "rgba(227,197,47,0.26)",
  },
  sapphire: {
    frameClass: "border-[rgba(72,118,255,0.16)] bg-[linear-gradient(180deg,rgba(241,246,255,0.96),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(42,63,120,0.10)]",
    cardBackground:
      "radial-gradient(circle at top left, rgba(119,154,255,0.34), transparent 34%), radial-gradient(circle at bottom right, rgba(255,255,255,0.12), transparent 28%), linear-gradient(135deg, #15203f 0%, #1c3d88 46%, #335ec9 100%)",
    stripeColor: "rgba(143,174,255,0.24)",
  },
  emerald: {
    frameClass: "border-[rgba(28,139,107,0.16)] bg-[linear-gradient(180deg,rgba(240,251,247,0.96),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(22,85,65,0.10)]",
    cardBackground:
      "radial-gradient(circle at top left, rgba(93,214,171,0.32), transparent 34%), radial-gradient(circle at bottom right, rgba(255,255,255,0.12), transparent 28%), linear-gradient(135deg, #0f2a23 0%, #116c58 45%, #1b9c7e 100%)",
    stripeColor: "rgba(125,236,196,0.22)",
  },
  plum: {
    frameClass: "border-[rgba(134,95,194,0.16)] bg-[linear-gradient(180deg,rgba(248,244,255,0.96),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(76,51,118,0.10)]",
    cardBackground:
      "radial-gradient(circle at top left, rgba(193,158,255,0.32), transparent 34%), radial-gradient(circle at bottom right, rgba(255,255,255,0.12), transparent 28%), linear-gradient(135deg, #24132f 0%, #4f2d7f 44%, #8450c6 100%)",
    stripeColor: "rgba(214,187,255,0.22)",
  },
  sunset: {
    frameClass: "border-[rgba(218,111,62,0.18)] bg-[linear-gradient(180deg,rgba(255,245,241,0.96),rgba(255,255,255,0.98))] shadow-[0_18px_40px_rgba(124,63,34,0.10)]",
    cardBackground:
      "radial-gradient(circle at top left, rgba(255,177,128,0.34), transparent 34%), radial-gradient(circle at bottom right, rgba(255,255,255,0.12), transparent 28%), linear-gradient(135deg, #301811 0%, #8a3f24 44%, #da6f3e 100%)",
    stripeColor: "rgba(255,201,165,0.24)",
  },
};

const CARD_THEME_KEYS = Object.keys(CARD_THEME_PRESETS);

export function pickCardThemeKey(seed = "") {
  const normalized = toStr(seed, "piessang-card");
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return CARD_THEME_KEYS[hash % CARD_THEME_KEYS.length] || "obsidian";
}

export function resolveCardTheme(themeKey) {
  return CARD_THEME_PRESETS[toStr(themeKey).toLowerCase()] || CARD_THEME_PRESETS.obsidian;
}

export function buildCardPresentationMetadata({ cardId = "", brand = "", last4 = "", themeKey = "" } = {}) {
  const nextThemeKey = toStr(themeKey) || pickCardThemeKey(`${cardId}:${brand}:${last4}`);
  return {
    themeKey: nextThemeKey,
    updatedAt: new Date().toISOString(),
  };
}

export function getCardBrandFamily(brand = "") {
  const normalized = toStr(brand).toLowerCase();
  if (normalized.includes("master")) return "mastercard";
  if (normalized.includes("visa")) return "visa";
  if (normalized.includes("amex") || normalized.includes("american express")) return "amex";
  if (normalized.includes("discover")) return "discover";
  if (normalized.includes("maestro")) return "maestro";
  return "generic";
}

