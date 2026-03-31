export function normalizeVendorName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function toSellerSlug(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

export function cleanVendorName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function titleCaseVendorName(value: unknown) {
  return cleanVendorName(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function trimVendorNameToLength(value: unknown, maxLength = 30) {
  return titleCaseVendorName(value).slice(0, maxLength);
}

export function generateVendorNameSuggestions(input: string, existing: Iterable<string> = []) {
  const base = cleanVendorName(input);
  if (!base) return [];

  const normalizedExisting = new Set(Array.from(existing).map((item) => normalizeVendorName(item)));
  const seeds = [
    base,
    `${base} SA`,
    `${base} South Africa`,
    `${base} Trading`,
    `${base} Group`,
    `${base} Supplies`,
    `${base} Piessang`,
    `${base} 2`,
  ];

  const suggestions: string[] = [];
  for (const seed of seeds) {
    const normalized = normalizeVendorName(seed);
    if (!normalized || normalizedExisting.has(normalized)) continue;
    if (suggestions.some((item) => normalizeVendorName(item) === normalized)) continue;
    suggestions.push(seed);
  }

  return suggestions.slice(0, 5);
}
