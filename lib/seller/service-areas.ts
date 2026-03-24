export const SELLER_SERVICE_AREAS = [
  "Cape Town",
  "Paarl",
  "Stellenbosch",
  "Franschhoek",
  "Wellington",
  "Strand",
  "Klapmuts",
  "Somerset West",
  "Gordon's Bay",
  "Durbanville",
  "Bellville",
  "Brackenfell",
  "Kuils River",
  "Simondium",
  "Paarl East",
] as const;

export type SellerServiceArea = (typeof SELLER_SERVICE_AREAS)[number];

export function normalizeSellerServiceArea(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isAllowedSellerServiceArea(value: string): value is SellerServiceArea {
  const normalized = normalizeSellerServiceArea(value);
  return SELLER_SERVICE_AREAS.some((area) => normalizeSellerServiceArea(area) === normalized);
}
