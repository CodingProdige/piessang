function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeText(value) {
  return toStr(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Number(numeric.toFixed(2));
}

function sanitizePositiveInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.trunc(numeric);
}

function sanitizeBoolean(value) {
  return value === true;
}

function sanitizePostalCodes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => toStr(entry)).filter(Boolean);
  }
  return toStr(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(6));
}

function sanitizeOffsetMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function sanitizeTime(value) {
  const input = toStr(value);
  if (!input) return null;
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resolveCutoffTime(value, fallback = "10:00") {
  return sanitizeTime(value) || fallback;
}

function normalizeOriginLocation(origin = {}, fallbackLocation = "") {
  return {
    country: toStr(origin.country || ""),
    region: toStr(origin.region || origin.province || origin.state || ""),
    city: toStr(origin.city || fallbackLocation || ""),
    suburb: toStr(origin.suburb || ""),
    postalCode: toStr(origin.postalCode || ""),
    utcOffsetMinutes: sanitizeOffsetMinutes(origin.utcOffsetMinutes ?? origin.utc_offset_minutes),
    latitude: sanitizeCoordinate(origin.latitude ?? origin.lat),
    longitude: sanitizeCoordinate(origin.longitude ?? origin.lng),
  };
}

function normalizePricingRule(rule = {}, index = 0) {
  return {
    id: toStr(rule.id || `pricing-${index + 1}`),
    label: toStr(rule.label || `Pricing rule ${index + 1}`),
    minDistanceKm: rule.minDistanceKm == null || rule.minDistanceKm === "" ? null : sanitizePositiveInt(rule.minDistanceKm, 0),
    maxDistanceKm: rule.maxDistanceKm == null || rule.maxDistanceKm === "" ? null : sanitizePositiveInt(rule.maxDistanceKm, 0),
    minOrderValue: rule.minOrderValue == null || rule.minOrderValue === "" ? null : sanitizeMoney(rule.minOrderValue),
    maxOrderValue: rule.maxOrderValue == null || rule.maxOrderValue === "" ? null : sanitizeMoney(rule.maxOrderValue),
    fee: sanitizeMoney(rule.fee),
    freeAboveOrderValue:
      rule.freeAboveOrderValue == null || rule.freeAboveOrderValue === ""
        ? null
        : sanitizeMoney(rule.freeAboveOrderValue),
    isActive: rule.isActive !== false,
  };
}

function normalizeDirectDelivery(directDelivery = {}, source = {}) {
  const explicitRules = Array.isArray(directDelivery.pricingRules)
    ? directDelivery.pricingRules.map((rule, index) => normalizePricingRule(rule, index)).filter((rule) => rule.isActive)
    : [];

  if (explicitRules.length) {
    return {
      enabled: sanitizeBoolean(directDelivery.enabled) || explicitRules.length > 0,
      title: "Direct delivery",
      radiusKm: sanitizePositiveInt(directDelivery.radiusKm, 0),
      leadTimeDays: sanitizePositiveInt(directDelivery.leadTimeDays, 1),
      cutoffTime: resolveCutoffTime(directDelivery.cutoffTime),
      pricingRules: explicitRules,
    };
  }

  const legacyRules = Array.isArray(source.localDeliveryRules)
    ? source.localDeliveryRules
        .map((rule, index) =>
          normalizePricingRule(
            {
              id: rule.id || `local-${index + 1}`,
              label: rule.label || `Direct delivery ${index + 1}`,
              maxDistanceKm: rule.radiusKm ?? rule.radius ?? null,
              fee: rule.fee ?? rule.amount ?? 0,
              freeAboveOrderValue: null,
            },
            index,
          ),
        )
        .filter((rule) => rule.isActive)
    : [];

  return {
    enabled: sanitizeBoolean(source.localDeliveryEnabled) || legacyRules.length > 0,
    title: "Direct delivery",
    radiusKm: sanitizePositiveInt(source.localDeliveryRadiusKm, 0),
    leadTimeDays: sanitizePositiveInt(
      directDelivery.leadTimeDays ??
        source.localDeliveryLeadTimeDays ??
        source.localDeliveryRules?.[0]?.leadTimeDays ??
        1,
      1,
    ),
    cutoffTime: resolveCutoffTime(directDelivery.cutoffTime ?? source.localDeliveryCutoffTime ?? source.cutoffTime),
    pricingRules: legacyRules,
  };
}

function normalizeShippingZone(zone = {}, index = 0) {
  const pricingRules = Array.isArray(zone.pricingRules)
    ? zone.pricingRules.map((rule, ruleIndex) => normalizePricingRule(rule, ruleIndex)).filter((rule) => rule.isActive)
    : [];
  return {
    id: toStr(zone.id || `zone-${index + 1}`),
    label: toStr(zone.label || zone.name || `Shipping zone ${index + 1}`),
    scopeType: toStr(zone.scopeType || "country"),
    country: toStr(zone.country || ""),
    region: toStr(zone.region || zone.province || zone.state || ""),
    city: toStr(zone.city || ""),
    postalCodes: sanitizePostalCodes(zone.postalCodes || zone.postalCode || ""),
    leadTimeDays: sanitizePositiveInt(zone.leadTimeDays ?? zone.leadTime ?? 2, 2),
    cutoffTime: resolveCutoffTime(zone.cutoffTime),
    pricingRules,
    isFallback: sanitizeBoolean(zone.isFallback),
    isActive: zone.isActive !== false,
  };
}

function normalizeShippingZones(source = {}) {
  const explicitZones = Array.isArray(source.shippingZones)
    ? source.shippingZones.map((zone, index) => normalizeShippingZone(zone, index)).filter((zone) => zone.isActive)
    : [];
  if (explicitZones.length) return explicitZones;

  return Array.isArray(source.courierZones)
    ? source.courierZones
        .map((zone, index) =>
          normalizeShippingZone(
            {
              id: zone.id || `zone-${index + 1}`,
              label: zone.label || zone.name || `Shipping zone ${index + 1}`,
              scopeType: Array.isArray(zone.postalCodes) && zone.postalCodes.length
                ? "postal"
                : zone.city
                  ? "city"
                  : zone.province || zone.region || zone.state
                    ? "region"
                    : "country",
              country: zone.country || "",
              region: zone.region || zone.province || zone.state || "",
              city: zone.city || "",
              postalCodes: zone.postalCodes || zone.postalCode || [],
              leadTimeDays: zone.leadTimeDays ?? zone.leadTime ?? 2,
              cutoffTime: resolveCutoffTime(zone.cutoffTime),
              pricingRules: [
                {
                  id: `${zone.id || `zone-${index + 1}`}-default`,
                  label: "Standard shipping",
                  fee: zone.fee ?? zone.amount ?? 0,
                },
              ],
              isFallback: zone.isFallback === true,
            },
            index,
          ),
        )
        .filter((zone) => zone.isActive)
    : [];
}

function normalizePickup(pickup = {}, source = {}) {
  return {
    enabled: sanitizeBoolean(pickup.enabled) || sanitizeBoolean(source.allowsCollection),
    leadTimeDays: sanitizePositiveInt(pickup.leadTimeDays ?? 0, 0),
  };
}

export function normalizeSellerDeliveryProfile(profile = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  const origin = normalizeOriginLocation(source.origin || source.baseLocation || {}, toStr(source.baseLocation || ""));
  const directDelivery = normalizeDirectDelivery(source.directDelivery || {}, source);
  const shippingZones = normalizeShippingZones(source);
  const pickup = normalizePickup(source.pickup || {}, source);

  return {
    origin,
    directDelivery,
    shippingZones,
    pickup,
    notes: toStr(source.notes || "").slice(0, 500),
  };
}

export function sellerDeliverySettingsReady(profile = {}) {
  const normalized = normalizeSellerDeliveryProfile(profile);
  const hasOrigin = Boolean(normalized.origin.city || normalized.origin.country || normalized.origin.postalCode);
  const hasDirect = normalized.directDelivery.enabled && normalized.directDelivery.pricingRules.length > 0 && hasOrigin;
  const hasShippingZones = normalized.shippingZones.length > 0;
  const hasPickup = normalized.pickup.enabled === true;
  return hasDirect || hasShippingZones || hasPickup;
}

function matchesLocationByScope(zone, shopperArea) {
  if (!shopperArea) return false;
  const shopperCountry = normalizeText(shopperArea.country);
  const shopperRegion = normalizeText(shopperArea.province || shopperArea.stateProvinceRegion || shopperArea.region);
  const shopperCity = normalizeText(shopperArea.city || shopperArea.suburb);
  const shopperPostal = normalizeText(shopperArea.postalCode);
  const zoneCountry = normalizeText(zone.country);
  const zoneRegion = normalizeText(zone.region);
  const zoneCity = normalizeText(zone.city);
  const zonePostalCodes = Array.isArray(zone.postalCodes) ? zone.postalCodes.map(normalizeText) : [];

  if (zone.scopeType === "postal" && zonePostalCodes.length) return shopperPostal ? zonePostalCodes.includes(shopperPostal) : false;
  if (zone.scopeType === "city") return zoneCity ? shopperCity === zoneCity : false;
  if (zone.scopeType === "region") return zoneRegion ? shopperRegion === zoneRegion : false;
  if (zone.scopeType === "country") return zoneCountry ? shopperCountry === zoneCountry : false;
  if (zonePostalCodes.length) return shopperPostal ? zonePostalCodes.includes(shopperPostal) : false;
  if (zoneCity) return shopperCity ? shopperCity === zoneCity : false;
  if (zoneRegion) return shopperRegion ? shopperRegion === zoneRegion : false;
  if (zoneCountry) return shopperCountry ? shopperCountry === zoneCountry : false;
  return zone.isFallback === true;
}

function haversineDistanceKm(origin, destination) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const originLat = sanitizeCoordinate(origin?.latitude ?? origin?.lat);
  const originLng = sanitizeCoordinate(origin?.longitude ?? origin?.lng);
  const destinationLat = sanitizeCoordinate(destination?.latitude ?? destination?.lat);
  const destinationLng = sanitizeCoordinate(destination?.longitude ?? destination?.lng);
  if (
    typeof originLat !== "number" ||
    typeof originLng !== "number" ||
    typeof destinationLat !== "number" ||
    typeof destinationLng !== "number"
  ) {
    return null;
  }
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(destinationLat - originLat);
  const deltaLng = toRadians(destinationLng - originLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(destinationLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
}

function ruleMatchesPricing(rule, subtotalIncl, shopperDistanceKm = null, maxRadiusKm = null) {
  const minDistance = typeof rule.minDistanceKm === "number" ? rule.minDistanceKm : null;
  const maxDistance = typeof rule.maxDistanceKm === "number" ? rule.maxDistanceKm : null;
  const minOrderValue = typeof rule.minOrderValue === "number" ? rule.minOrderValue : null;
  const maxOrderValue = typeof rule.maxOrderValue === "number" ? rule.maxOrderValue : null;

  if (typeof shopperDistanceKm === "number") {
    if (typeof minDistance === "number" && shopperDistanceKm < minDistance) return false;
    if (typeof maxDistance === "number" && shopperDistanceKm > maxDistance) return false;
  } else if (typeof maxRadiusKm === "number" && maxRadiusKm > 0 && typeof maxDistance === "number" && maxDistance > maxRadiusKm) {
    return false;
  }

  if (typeof minOrderValue === "number" && subtotalIncl < minOrderValue) return false;
  if (typeof maxOrderValue === "number" && subtotalIncl > maxOrderValue) return false;
  return true;
}

function pickPricingRule(pricingRules = [], subtotalIncl = 0, shopperDistanceKm = null, maxRadiusKm = null) {
  return pricingRules.find((rule) => ruleMatchesPricing(rule, subtotalIncl, shopperDistanceKm, maxRadiusKm)) || null;
}

export function resolveSellerDeliveryOption({
  profile,
  sellerBaseLocation = "",
  shopperArea = null,
  subtotalIncl = 0,
}) {
  const normalized = normalizeSellerDeliveryProfile({
    ...profile,
    origin: normalizeOriginLocation(profile?.origin || {}, sellerBaseLocation),
  });
  const shopperCountry = normalizeText(shopperArea?.country);
  const shopperRegion = normalizeText(shopperArea?.province || shopperArea?.stateProvinceRegion || shopperArea?.region);
  const shopperCity = normalizeText(shopperArea?.city || shopperArea?.suburb);
  const shopperSuburb = normalizeText(shopperArea?.suburb);
  const originCountry = normalizeText(normalized.origin.country);
  const originRegion = normalizeText(normalized.origin.region);
  const originCity = normalizeText(normalized.origin.city);
  const originSuburb = normalizeText(normalized.origin.suburb);
  const shopperDistanceKm = Number.isFinite(Number(shopperArea?.distanceKm))
    ? Number(shopperArea.distanceKm)
    : haversineDistanceKm(normalized.origin, shopperArea);

  if (normalized.directDelivery.enabled) {
    const sameCountry = originCountry ? shopperCountry === originCountry : true;
    const sameRegion = originRegion ? shopperRegion === originRegion : true;
    const sameCity = originCity ? shopperCity === originCity : false;
    const sameSuburb = originSuburb ? shopperSuburb === originSuburb : false;
    const radiusAllows =
      typeof shopperDistanceKm === "number"
        ? normalized.directDelivery.radiusKm <= 0 || shopperDistanceKm <= normalized.directDelivery.radiusKm
        : sameCity;
    const sameArea =
      sameSuburb ||
      sameCity ||
      (sameRegion && (sameCity || typeof shopperDistanceKm === "number")) ||
      radiusAllows;

    if (sameCountry && sameArea && radiusAllows) {
      const matchedRule = pickPricingRule(
        normalized.directDelivery.pricingRules,
        subtotalIncl,
        shopperDistanceKm,
        normalized.directDelivery.radiusKm,
      );
      if (matchedRule) {
        const freeThreshold = typeof matchedRule.freeAboveOrderValue === "number" ? matchedRule.freeAboveOrderValue : null;
        const amountIncl = freeThreshold != null && subtotalIncl >= freeThreshold ? 0 : sanitizeMoney(matchedRule.fee);
        return {
          available: true,
          kind: "direct",
        label: amountIncl > 0 ? `Direct delivery ${formatCurrency(amountIncl)}` : "Direct delivery available",
        amountIncl,
        amountExcl: amountIncl,
        leadTimeDays: normalized.directDelivery.leadTimeDays,
        cutoffTime: normalized.directDelivery.cutoffTime,
        utcOffsetMinutes: normalized.origin.utcOffsetMinutes,
        matchedRule,
        distanceKm: shopperDistanceKm,
      };
      }
    }
  }

  for (const zone of normalized.shippingZones) {
    if (!matchesLocationByScope(zone, shopperArea)) continue;
    const matchedRule = pickPricingRule(zone.pricingRules, subtotalIncl, shopperDistanceKm, null);
    if (!matchedRule) continue;
    const freeThreshold = typeof matchedRule.freeAboveOrderValue === "number" ? matchedRule.freeAboveOrderValue : null;
    const amountIncl = freeThreshold != null && subtotalIncl >= freeThreshold ? 0 : sanitizeMoney(matchedRule.fee);
    return {
      available: true,
      kind: "shipping",
      label: amountIncl > 0 ? `Shipping ${formatCurrency(amountIncl)}` : "Shipping available",
      amountIncl,
      amountExcl: amountIncl,
      leadTimeDays: zone.leadTimeDays,
      cutoffTime: zone.cutoffTime,
      utcOffsetMinutes: normalized.origin.utcOffsetMinutes,
      matchedRule: {
        ...matchedRule,
        zoneId: zone.id,
        zoneLabel: zone.label,
      },
      distanceKm: shopperDistanceKm,
    };
  }

  if (normalized.pickup.enabled === true) {
    return {
      available: true,
      kind: "collection",
      label: "Pickup available from seller",
      amountIncl: 0,
      amountExcl: 0,
      leadTimeDays: normalized.pickup.leadTimeDays || null,
      cutoffTime: null,
      utcOffsetMinutes: normalized.origin.utcOffsetMinutes,
      matchedRule: null,
    };
  }

  return {
    available: false,
    kind: "unavailable",
    label: shopperArea ? "Delivery unavailable in your area" : "Set your delivery area to check delivery",
    amountIncl: 0,
    amountExcl: 0,
    leadTimeDays: null,
    cutoffTime: null,
    utcOffsetMinutes: normalized.origin.utcOffsetMinutes,
    matchedRule: null,
  };
}

export function formatCurrency(value) {
  return `R ${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(sanitizeMoney(value))}`;
}
