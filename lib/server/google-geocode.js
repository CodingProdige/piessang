function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(6));
}

function getAddressComponent(components = [], type, fallbackType) {
  const match = components.find((component) => Array.isArray(component.types) && component.types.includes(type));
  if (match) return match.long_name || "";
  if (fallbackType) {
    const fallback = components.find((component) => Array.isArray(component.types) && component.types.includes(fallbackType));
    if (fallback) return fallback.long_name || "";
  }
  return "";
}

function buildQueryFromLocation(location = {}) {
  return [
    location.streetAddress,
    location.addressLine2,
    location.suburb,
    location.city,
    location.region || location.stateProvinceRegion || location.province,
    location.postalCode,
    location.country,
  ]
    .map((value) => toStr(value))
    .filter(Boolean)
    .join(", ");
}

function mapGeocodeResult(result = {}) {
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const geometry = result?.geometry?.location || {};
  return {
    formattedAddress: toStr(result.formatted_address || ""),
    country: toStr(getAddressComponent(components, "country")),
    region: toStr(getAddressComponent(components, "administrative_area_level_1")),
    city: toStr(getAddressComponent(components, "locality", "administrative_area_level_2")),
    suburb: toStr(getAddressComponent(components, "sublocality", "neighborhood")),
    postalCode: toStr(getAddressComponent(components, "postal_code")),
    latitude: sanitizeCoordinate(geometry.lat),
    longitude: sanitizeCoordinate(geometry.lng),
  };
}

export async function geocodeLocation(location = {}) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return null;
  const query = buildQueryFromLocation(location);
  if (!query) return null;

  const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  endpoint.searchParams.set("address", query);
  endpoint.searchParams.set("key", apiKey);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.status !== "OK" || !Array.isArray(payload?.results) || !payload.results[0]) {
      return null;
    }
    return mapGeocodeResult(payload.results[0]);
  } catch {
    return null;
  }
}

export async function enrichLocationWithGeocode(location = {}) {
  const latitude = sanitizeCoordinate(location?.latitude);
  const longitude = sanitizeCoordinate(location?.longitude);
  if (latitude != null && longitude != null) {
    return {
      ...location,
      latitude,
      longitude,
    };
  }

  const geocoded = await geocodeLocation(location);
  if (!geocoded?.latitude || !geocoded?.longitude) {
    return {
      ...location,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    };
  }

  return {
    ...location,
    country: toStr(location?.country || geocoded.country),
    city: toStr(location?.city || geocoded.city),
    suburb: toStr(location?.suburb || geocoded.suburb),
    postalCode: toStr(location?.postalCode || geocoded.postalCode),
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
  };
}
