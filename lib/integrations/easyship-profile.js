function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return source
    .map((entry) => toStr(entry))
    .filter(Boolean)
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

function normalizeCountryList(value) {
  return normalizeList(value).map((entry) => entry.toUpperCase());
}

export function normalizeSellerCourierProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const handoverMode = (() => {
    const candidate = toStr(source.handoverMode || source.handover_mode || "pickup").toLowerCase();
    return candidate === "dropoff" ? "dropoff" : "pickup";
  })();

  return {
    enabled: source.enabled === true,
    provider: "easyship",
    internationalEnabled: source.internationalEnabled !== false,
    handoverMode,
    allowedCouriers: normalizeList(source.allowedCouriers || source.allowed_couriers),
    allowedDestinationCountries: normalizeCountryList(
      source.allowedDestinationCountries || source.allowed_destination_countries,
    ),
    platformMarkupMode: "platform_default",
  };
}

export function normalizeProductCourierSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    courierEnabled: source.courierEnabled === true,
    allowedInternational: source.allowedInternational !== false,
    customsCategory: toStr(source.customsCategory || source.customs_category || "", null) || null,
    hsCode: toStr(source.hsCode || source.hs_code || "", null) || null,
    countryOfOrigin: toStr(source.countryOfOrigin || source.country_of_origin || "", null) || null,
  };
}
