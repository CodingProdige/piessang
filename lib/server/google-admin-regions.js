function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getAddressComponent(components = [], type) {
  const match = components.find((component) => Array.isArray(component.types) && component.types.includes(type));
  return match || null;
}

function mapAdminRegion(result = {}, fallbackPlaceId = "") {
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const region = getAddressComponent(components, "administrative_area_level_1");
  const country = getAddressComponent(components, "country");
  if (!region || !country) return null;

  return {
    placeId: toStr(result.place_id || fallbackPlaceId),
    label: toStr(region.long_name),
    code: toStr(region.short_name),
    countryCode: toStr(country.short_name).toUpperCase(),
  };
}

async function fetchGoogleGeocode(params = {}) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return null;

  const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  Object.entries(params).forEach(([key, value]) => {
    const normalized = toStr(value);
    if (normalized) endpoint.searchParams.set(key, normalized);
  });
  endpoint.searchParams.set("key", apiKey);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.status !== "OK" || !Array.isArray(payload?.results)) return null;
    return payload.results;
  } catch {
    return null;
  }
}

export async function resolveGoogleAdminRegion({ countryCode = "", placeId = "", query = "" } = {}) {
  const normalizedCountryCode = toStr(countryCode).toUpperCase();
  const normalizedPlaceId = toStr(placeId);
  const normalizedQuery = toStr(query);

  const results = normalizedPlaceId
    ? await fetchGoogleGeocode({ place_id: normalizedPlaceId, components: normalizedCountryCode ? `country:${normalizedCountryCode}` : "" })
    : normalizedQuery
      ? await fetchGoogleGeocode({ address: normalizedQuery, components: normalizedCountryCode ? `country:${normalizedCountryCode}` : "" })
      : null;

  if (!Array.isArray(results) || !results.length) return null;

  for (const result of results) {
    const mapped = mapAdminRegion(result, normalizedPlaceId);
    if (!mapped?.label || !mapped.countryCode) continue;
    if (normalizedCountryCode && mapped.countryCode !== normalizedCountryCode) continue;
    if (!Array.isArray(result.types) || !result.types.includes("administrative_area_level_1")) {
      const hasAdminRegionComponent = Array.isArray(result.address_components)
        && result.address_components.some((component) => Array.isArray(component.types) && component.types.includes("administrative_area_level_1"));
      if (!hasAdminRegionComponent) continue;
    }
    return mapped;
  }

  return null;
}

export async function validateShippingSettingsGoogleRegions(settings = {}) {
  const issues = [];

  if (settings?.localDelivery?.enabled && settings?.localDelivery?.mode === "province") {
    for (const rule of settings.localDelivery.provinces || []) {
      if (!toStr(rule?.province)) continue;
      const resolved = await resolveGoogleAdminRegion({
        countryCode: settings?.shipsFrom?.countryCode,
        placeId: rule?.placeId,
        query: `${toStr(rule?.province)}, ${toStr(settings?.shipsFrom?.countryCode)}`,
      });
      if (!resolved || resolved.label.toLowerCase() !== toStr(rule?.province).toLowerCase()) {
        issues.push(`Local delivery: province must be selected from Google for ${toStr(settings?.shipsFrom?.countryCode)}`);
      }
    }
  }

  for (const zone of settings?.zones || []) {
    if (zone?.coverageType !== "province") continue;
    for (const rule of zone.provinces || []) {
      if (!toStr(rule?.province)) continue;
      const resolved = await resolveGoogleAdminRegion({
        countryCode: zone?.countryCode,
        placeId: rule?.placeId,
        query: `${toStr(rule?.province)}, ${toStr(zone?.countryCode)}`,
      });
      if (!resolved || resolved.label.toLowerCase() !== toStr(rule?.province).toLowerCase()) {
        issues.push(`Zone ${toStr(zone?.id)}: province must be selected from Google for ${toStr(zone?.countryCode)}`);
      }
    }
  }

  return issues;
}
