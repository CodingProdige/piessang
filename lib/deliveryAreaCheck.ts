// @ts-nocheck
const DEFAULT_DELIVERY_AREAS = [
  {
    name: "Cape Winelands",
    countries: ["south africa"],
    provinces: ["western cape"],
    cities: ["paarl", "stellenbosch", "somerset west", "cape town", "durbanville"],
    postalCodes: []
  }
];

const asText = value => String(value ?? "").trim().toLowerCase();

function normalizeAddress(input) {
  if (!input) return {};
  if (typeof input === "string") {
    return { streetAddress: input };
  }
  if (typeof input !== "object") return {};
  return {
    streetAddress: input.streetAddress || input.line1 || input.addressLine1 || "",
    city: input.city || input.town || "",
    suburb: input.suburb || input.area || "",
    province: input.province || input.stateProvinceRegion || input.state || "",
    postalCode: input.postalCode || input.postal_code || input.zip || "",
    country: input.country || ""
  };
}

function matchesList(value, list = []) {
  const needle = asText(value);
  if (!needle || !Array.isArray(list) || list.length === 0) return false;
  return list.map(asText).filter(Boolean).includes(needle);
}

function evaluateArea(address, area) {
  const normalized = normalizeAddress(address);
  const city = normalized.city || normalized.suburb;

  const cityMatch = matchesList(city, area?.cities);
  const provinceMatch = matchesList(normalized.province, area?.provinces);
  const countryMatch = matchesList(normalized.country, area?.countries);
  const postalMatch = matchesList(normalized.postalCode, area?.postalCodes);

  const supported = Boolean(cityMatch || provinceMatch || countryMatch || postalMatch);

  return {
    supported,
    canPlaceOrder: supported,
    matchedArea: supported ? area?.name || null : null,
    reasonCode: supported ? "WITHIN_SERVICE_AREA" : "OUTSIDE_SERVICE_AREA",
    message: supported
      ? `Delivery is available in ${area?.name || "this area"}.`
      : "Delivery is not available for this address."
  };
}

export { DEFAULT_DELIVERY_AREAS, evaluateArea as evaluateDeliveryArea };
export default {
  DEFAULT_DELIVERY_AREAS,
  evaluateDeliveryArea: evaluateArea
};
