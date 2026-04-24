export type ShopperLocationSource =
  | "none"
  | "manual"
  | "google_places"
  | "browser_hint";

export type ShopperLocationPrecision =
  | "none"
  | "country"
  | "administrative_area"
  | "locality"
  | "postal_code"
  | "address"
  | "coordinates";

export type ShopperLocation = {
  countryCode?: string | null;
  province?: string | null;
  city?: string | null;
  suburb?: string | null;
  postalCode?: string | null;
  addressLine1?: string | null;
  lat?: number | null;
  lng?: number | null;
  source: ShopperLocationSource;
  precision: ShopperLocationPrecision;
};

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function normalizeCountryCode(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized.toUpperCase();
}

function normalizeCoordinate(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolvePrecision(input: {
  precision?: unknown;
  countryCode?: string | null;
  province?: string | null;
  city?: string | null;
  suburb?: string | null;
  postalCode?: string | null;
  addressLine1?: string | null;
  lat?: number | null;
  lng?: number | null;
}): ShopperLocationPrecision {
  const explicit = normalizeText(input.precision)?.toLowerCase();
  if (
    explicit === "none" ||
    explicit === "country" ||
    explicit === "administrative_area" ||
    explicit === "locality" ||
    explicit === "postal_code" ||
    explicit === "address" ||
    explicit === "coordinates"
  ) {
    return explicit;
  }

  if (typeof input.lat === "number" && typeof input.lng === "number") return "coordinates";
  if (input.addressLine1) return "address";
  if (input.postalCode) return "postal_code";
  if (input.city || input.suburb) return "locality";
  if (input.province) return "administrative_area";
  if (input.countryCode) return "country";
  return "none";
}

export function normalizeShopperLocation(input: unknown): ShopperLocation {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const countryCode = normalizeCountryCode(source.countryCode ?? source.country ?? source.shopperCountry);
  const province = normalizeText(source.province ?? source.region ?? source.stateProvinceRegion ?? source.state);
  const city = normalizeText(source.city);
  const suburb = normalizeText(source.suburb);
  const postalCode = normalizeText(source.postalCode ?? source.postal_code ?? source.zip);
  const addressLine1 = normalizeText(source.addressLine1 ?? source.address1 ?? source.streetAddress);
  const lat = normalizeCoordinate(source.lat ?? source.latitude ?? source.shoppeLatitude);
  const lng = normalizeCoordinate(source.lng ?? source.longitude ?? source.shoppeLongitude);
  const normalizedSource = normalizeText(source.source)?.toLowerCase();
  const finalSource: ShopperLocationSource =
    normalizedSource === "manual" ||
    normalizedSource === "google_places" ||
    normalizedSource === "browser_hint"
      ? normalizedSource
      : countryCode || province || city || suburb || postalCode || addressLine1 || lat != null || lng != null
        ? "manual"
        : "none";

  return {
    countryCode,
    province,
    city,
    suburb,
    postalCode,
    addressLine1,
    lat,
    lng,
    source: finalSource,
    precision: resolvePrecision({
      precision: source.precision,
      countryCode,
      province,
      city,
      suburb,
      postalCode,
      addressLine1,
      lat,
      lng,
    }),
  };
}

export function hasCountryLevelShopperLocation(location: ShopperLocation | null | undefined): boolean {
  return Boolean(normalizeShopperLocation(location).countryCode);
}

export function hasCoordinateShopperLocation(location: ShopperLocation | null | undefined): boolean {
  const normalized = normalizeShopperLocation(location);
  return typeof normalized.lat === "number" && typeof normalized.lng === "number";
}

export function serializeShopperLocation(location: ShopperLocation | null | undefined): string {
  return JSON.stringify(normalizeShopperLocation(location));
}

export function parseShopperLocation(value: string | null | undefined): ShopperLocation {
  if (!value) return normalizeShopperLocation(null);
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeShopperLocation(parsed);
  } catch {
    return normalizeShopperLocation(null);
  }
}
