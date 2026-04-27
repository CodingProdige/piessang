function toText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCategorySlug(value: unknown): string {
  const normalized = toText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized === "preloved" || normalized === "pre-loved") {
    return "pre-loved";
  }

  return normalized;
}

export function categoryMatches(productCategory: unknown, requestedCategory: unknown): boolean {
  const requested = normalizeCategorySlug(requestedCategory);
  if (!requested) return true;
  return normalizeCategorySlug(productCategory) === requested;
}
