import { normalizeSellerDeliveryProfile, resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";
import { normalizeSellerCourierProfile, normalizeProductCourierSettings } from "@/lib/integrations/easyship-profile";
import { COUNTRY_CATALOG } from "@/lib/marketplace/country-config";
import { buildShippingEligibilityProductInputFromRawItem, buildShippingEligibilitySellerInputFromRawItem } from "@/lib/catalogue/shipping-eligibility-adapters";
import { resolveProductShippingEligibility } from "@/lib/catalogue/shipping-eligibility";
import { normalizeShopperLocation } from "@/lib/shopper/location";

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeCountryCode(value: unknown) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  if (/^[A-Za-z]{2}$/.test(input)) return input.toUpperCase();
  const match = COUNTRY_CATALOG.find((entry) => normalizeText(entry.label) === normalizeText(input));
  return String(match?.code || "").trim().toUpperCase();
}

function normalizeCoordinate(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeShopperArea(input: any) {
  if (typeof input === "string") {
    return {
      country: String(input || "").trim(),
      province: "",
      city: "",
      suburb: "",
      postalCode: "",
      latitude: null,
      longitude: null,
    };
  }

  const source = input && typeof input === "object" ? input : {};
  return {
    country: String(source?.country || source?.shopperCountry || "").trim(),
    province: String(source?.province || source?.region || source?.stateProvinceRegion || source?.shopperProvince || "").trim(),
    city: String(source?.city || source?.shopperCity || "").trim(),
    suburb: String(source?.suburb || source?.shopperSuburb || "").trim(),
    postalCode: String(source?.postalCode || source?.shopperPostalCode || "").trim(),
    latitude: normalizeCoordinate(source?.latitude ?? source?.shopperLatitude),
    longitude: normalizeCoordinate(source?.longitude ?? source?.shopperLongitude),
  };
}

export function hasPreciseShopperArea(input: any) {
  const area = normalizeShopperArea(input);
  return Boolean(
    normalizeText(area.city) ||
      normalizeText(area.province) ||
      normalizeText(area.suburb) ||
      normalizeText(area.postalCode) ||
      typeof area.latitude === "number" ||
      typeof area.longitude === "number",
  );
}

export function appendShopperAreaSearchParams(params: URLSearchParams, shopperArea?: any) {
  const normalized = normalizeShopperArea(shopperArea);
  if (normalized.country) params.set("shopperCountry", normalized.country);
  if (normalized.province) params.set("shopperProvince", normalized.province);
  if (normalized.city) params.set("shopperCity", normalized.city);
  if (normalized.suburb) params.set("shopperSuburb", normalized.suburb);
  if (normalized.postalCode) params.set("shopperPostalCode", normalized.postalCode);
  if (typeof normalized.latitude === "number") params.set("shopperLatitude", String(normalized.latitude));
  if (typeof normalized.longitude === "number") params.set("shopperLongitude", String(normalized.longitude));
  return params;
}

export function readShopperAreaFromSearchParams(searchParams: URLSearchParams | { get: (key: string) => string | null }) {
  return normalizeShopperArea({
    shopperCountry: searchParams.get("shopperCountry") || searchParams.get("country") || "",
    shopperProvince: searchParams.get("shopperProvince") || "",
    shopperCity: searchParams.get("shopperCity") || "",
    shopperSuburb: searchParams.get("shopperSuburb") || "",
    shopperPostalCode: searchParams.get("shopperPostalCode") || "",
    shopperLatitude: searchParams.get("shopperLatitude") || "",
    shopperLongitude: searchParams.get("shopperLongitude") || "",
  });
}

function extractHandoverSupport(entry: any) {
  if (!entry || typeof entry !== "object") return { pickup: null, dropoff: null };
  const options = [
    ...(Array.isArray(entry?.available_handover_options) ? entry.available_handover_options : []),
    ...(Array.isArray(entry?.handover_options) ? entry.handover_options : []),
    ...(Array.isArray(entry?.supported_handover_options) ? entry.supported_handover_options : []),
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const pickup =
    typeof entry?.supports_pickup === "boolean"
      ? entry.supports_pickup
      : options.length
        ? options.some((item) => item.includes("pickup"))
        : null;
  const dropoff =
    typeof entry?.supports_dropoff === "boolean"
      ? entry.supports_dropoff
      : options.length
        ? options.some((item) => item.includes("dropoff"))
        : null;

  return { pickup, dropoff };
}

function routeSupportsHandover(items: any[], handoverMode: string) {
  const mode = normalizeText(handoverMode) === "dropoff" ? "dropoff" : "pickup";
  const withSignals = items.filter((entry) => {
    const support = extractHandoverSupport(entry);
    return typeof support.pickup === "boolean" || typeof support.dropoff === "boolean";
  });
  if (!withSignals.length) return items.length > 0;
  return withSignals.some((entry) => {
    const support = extractHandoverSupport(entry);
    return mode === "dropoff" ? support.dropoff !== false : support.pickup !== false;
  });
}

type RouteEligibilityEntry = {
  expiresAt: number;
  value?: boolean;
  promise?: Promise<boolean>;
};

const ROUTE_ELIGIBILITY_TTL_MS = 1000 * 60 * 30;
const routeEligibilityCache = new Map<string, RouteEligibilityEntry>();

async function fetchEasyshipRouteEligibility({
  originCountry,
  shopperCountry,
  handoverMode,
}: {
  originCountry: string;
  shopperCountry: string;
  handoverMode: string;
}) {
  const token = String(process.env.EASYSHIP_API_TOKEN || "").trim();
  if (!token) return true;

  const baseUrl = String(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09").trim();
  const candidates = [
    { path: "/couriers", params: { origin_country_alpha2: originCountry, destination_country_alpha2: shopperCountry } },
    { path: "/reference/couriers", params: { origin_country_alpha2: originCountry, destination_country_alpha2: shopperCountry } },
    { path: "/couriers", params: { origin_country_alpha2: originCountry } },
  ];

  let sawSuccessfulResponse = false;
  for (const candidate of candidates) {
    try {
      const url = new URL(`${baseUrl}${candidate.path}`);
      Object.entries(candidate.params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      sawSuccessfulResponse = true;
      const items = [
        ...(Array.isArray(payload?.couriers) ? payload.couriers : []),
        ...(Array.isArray(payload?.items) ? payload.items : []),
        ...(Array.isArray(payload?.data) ? payload.data : []),
        ...(Array.isArray(payload) ? payload : []),
      ].filter((entry) => entry && typeof entry === "object");

      if (items.length && routeSupportsHandover(items, handoverMode)) {
        return true;
      }
      if (candidate.params.destination_country_alpha2) {
        return false;
      }
    } catch {
      continue;
    }
  }

  return sawSuccessfulResponse ? false : true;
}

async function getCachedCourierRouteEligibility({
  originCountry,
  shopperCountry,
  handoverMode,
}: {
  originCountry: string;
  shopperCountry: string;
  handoverMode: string;
}) {
  const cacheKey = `${originCountry}::${shopperCountry}::${normalizeText(handoverMode) === "dropoff" ? "dropoff" : "pickup"}`;
  const now = Date.now();
  const existing = routeEligibilityCache.get(cacheKey);
  if (existing?.value != null && existing.expiresAt > now) return existing.value;
  if (existing?.promise) return existing.promise;

  const promise = fetchEasyshipRouteEligibility({ originCountry, shopperCountry, handoverMode })
    .then((value) => {
      routeEligibilityCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + ROUTE_ELIGIBILITY_TTL_MS,
      });
      return value;
    })
    .catch(() => {
      routeEligibilityCache.set(cacheKey, {
        value: true,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return true;
    });

  routeEligibilityCache.set(cacheKey, {
    expiresAt: now + ROUTE_ELIGIBILITY_TTL_MS,
    promise,
  });

  return promise;
}

export async function resolveCourierRouteEligibilityServer(input: {
  originCountry: string;
  shopperCountry: string;
  handoverMode: string;
}) {
  return getCachedCourierRouteEligibility(input);
}

function productHasCourierQuotingMetadata(item: any) {
  const variants: any[] = Array.isArray(item?.data?.variants) ? item.data.variants : [];
  return variants.some((variant: any) => {
    const logistics = variant?.logistics && typeof variant.logistics === "object" ? variant.logistics : {};
    const weightKg = Number(logistics?.weight_kg ?? logistics?.weightKg ?? 0);
    return Number.isFinite(weightKg) && weightKg > 0;
  });
}

export function getShopperSelectedCountryLabel(shopperArea?: { country?: string | null } | null) {
  return String(shopperArea?.country || "").trim();
}

export function isProductEligibleForShopperCountry(
  item: any,
  shopperAreaOrCountry?: any,
) {
  const shopperArea = normalizeShopperArea(shopperAreaOrCountry);
  const seller = buildShippingEligibilitySellerInputFromRawItem(item);
  const product = buildShippingEligibilityProductInputFromRawItem(item);
  const shopperLocation = normalizeShopperLocation({
    countryCode: shopperArea.country || null,
    province: shopperArea.province || null,
    city: shopperArea.city || null,
    suburb: shopperArea.suburb || null,
    postalCode: shopperArea.postalCode || null,
    lat: shopperArea.latitude,
    lng: shopperArea.longitude,
    source: shopperArea.country ? "manual" : "none",
    precision: hasPreciseShopperArea(shopperArea)
      ? typeof shopperArea.latitude === "number" && typeof shopperArea.longitude === "number"
        ? "coordinates"
        : "locality"
      : shopperArea.country
        ? "country"
        : "none",
  });

  const normalizedCountry = normalizeCountryCode(shopperArea.country);
  const courierProfile = normalizeSellerCourierProfile(item?.data?.seller?.courierProfile || {});
  const allowedCountries = Array.isArray(courierProfile.allowedDestinationCountries)
    ? courierProfile.allowedDestinationCountries.map((entry) => normalizeCountryCode(entry)).filter(Boolean)
    : [];
  const courierRouteSupported =
    !normalizedCountry || !allowedCountries.length ? true : allowedCountries.includes(normalizedCountry);

  return resolveProductShippingEligibility({
    product,
    seller,
    shopperLocation,
    context: { courierRouteSupported },
  }).isVisible;
}

export async function isProductEligibleForShopperCountryServer(
  item: any,
  shopperAreaOrCountry?: any,
) {
  const shopperArea = normalizeShopperArea(shopperAreaOrCountry);
  const seller = buildShippingEligibilitySellerInputFromRawItem(item);
  const product = buildShippingEligibilityProductInputFromRawItem(item);
  const shopperLocation = normalizeShopperLocation({
    countryCode: shopperArea.country || null,
    province: shopperArea.province || null,
    city: shopperArea.city || null,
    suburb: shopperArea.suburb || null,
    postalCode: shopperArea.postalCode || null,
    lat: shopperArea.latitude,
    lng: shopperArea.longitude,
    source: shopperArea.country ? "manual" : "none",
    precision: hasPreciseShopperArea(shopperArea)
      ? typeof shopperArea.latitude === "number" && typeof shopperArea.longitude === "number"
        ? "coordinates"
        : "locality"
      : shopperArea.country
        ? "country"
        : "none",
  });

  const normalizedCountry = normalizeCountryCode(shopperArea.country);
  const originCountry = normalizeCountryCode(seller.origin?.countryCode ?? seller.origin?.country);
  const courierProfile = normalizeSellerCourierProfile(item?.data?.seller?.courierProfile || {});
  const allowedCountries = Array.isArray(courierProfile.allowedDestinationCountries)
    ? courierProfile.allowedDestinationCountries.map((entry) => normalizeCountryCode(entry)).filter(Boolean)
    : [];

  let courierRouteSupported: boolean | null =
    !normalizedCountry || !allowedCountries.length ? true : allowedCountries.includes(normalizedCountry);

  if (originCountry && normalizedCountry && courierRouteSupported) {
    courierRouteSupported = await getCachedCourierRouteEligibility({
      originCountry,
      shopperCountry: normalizedCountry,
      handoverMode: courierProfile.handoverMode || "pickup",
    });
  }

  return resolveProductShippingEligibility({
    product,
    seller,
    shopperLocation,
    context: { courierRouteSupported },
  }).isVisible;
}
