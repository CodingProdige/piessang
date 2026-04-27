function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function normalizeSellerCourierProfile(profile = {}) {
  void profile;
  return {
    enabled: false,
    provider: "deprecated",
    internationalEnabled: false,
    handoverMode: "pickup",
    allowedCouriers: [],
    allowedDestinationCountries: [],
    platformMarkupMode: "platform_default",
    deprecated: true,
  };
}

export function normalizeProductCourierSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    courierEnabled: false,
    allowedInternational: false,
    customsCategory: toStr(source.customsCategory || source.customs_category || "", null) || null,
    hsCode: toStr(source.hsCode || source.hs_code || "", null) || null,
    countryOfOrigin: toStr(source.countryOfOrigin || source.country_of_origin || "", null) || null,
    deprecated: true,
  };
}
