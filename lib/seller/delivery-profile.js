function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeOriginLocation(origin = {}, fallbackLocation = "") {
  return {
    streetAddress: toStr(origin.streetAddress || origin.addressLine1 || origin.line1 || ""),
    addressLine2: toStr(origin.addressLine2 || origin.line2 || ""),
    country: toStr(origin.country || ""),
    region: toStr(origin.region || origin.province || origin.state || ""),
    city: toStr(origin.city || fallbackLocation || ""),
    suburb: toStr(origin.suburb || ""),
    postalCode: toStr(origin.postalCode || ""),
    utcOffsetMinutes:
      origin.utcOffsetMinutes == null ? null : Math.trunc(Number(origin.utcOffsetMinutes) || 0),
    latitude:
      origin.latitude == null && origin.lat == null ? null : Number(origin.latitude ?? origin.lat) || null,
    longitude:
      origin.longitude == null && origin.lng == null ? null : Number(origin.longitude ?? origin.lng) || null,
  };
}

function normalizeShippingZone(zone = {}, index = 0) {
  return {
    id: toStr(zone.id || `zone-${index + 1}`),
    label: toStr(zone.label || zone.name || zone.country || `Shipping zone ${index + 1}`),
    scopeType: "country",
    country: toStr(zone.country || ""),
    region: "",
    city: "",
    postalCodes: [],
    leadTimeDays: toNum(zone.leadTimeDays ?? zone.leadTime ?? 2, 2),
    cutoffTime: null,
    rateMode: "flat",
    pricingBasis: "per_order",
    courierKey: "",
    courierServiceLabel: "",
    pricingRules: [],
    isFallback: false,
    isActive: zone.isActive !== false,
  };
}

export function normalizeSellerDeliveryProfile(profile = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  return {
    origin: normalizeOriginLocation(source.origin || {}, source.baseLocation || ""),
    baseLocation: toStr(source.baseLocation || source.origin?.city || ""),
    directDelivery: {
      enabled: false,
      title: "Deprecated direct delivery",
      radiusKm: 0,
      leadTimeDays: 0,
      cutoffTime: null,
      pricingRules: [],
    },
    shippingZones: Array.isArray(source.shippingZones)
      ? source.shippingZones.map((zone, index) => normalizeShippingZone(zone, index))
      : [],
    pickup: {
      enabled: false,
      leadTimeDays: 0,
    },
    notes: toStr(source.notes || "").slice(0, 500),
    deprecated: true,
  };
}

export function sellerDeliverySettingsReady(profile = {}) {
  const normalized = normalizeSellerDeliveryProfile(profile);
  return Boolean(normalized?.origin?.city || normalized?.origin?.postalCode || normalized?.shippingZones?.length);
}

export function resolveSellerDeliveryOption() {
  return {
    available: false,
    kind: "deprecated",
    label: "Legacy seller delivery deprecated",
    amountIncl: 0,
    amountExcl: 0,
    leadTimeDays: null,
    cutoffTime: null,
    matchedRule: null,
    unavailableReasons: ["Legacy seller delivery resolution has been deprecated."],
    distanceKm: null,
    shipmentSummary: null,
    metadata: {
      deprecated: true,
      replacement: "lib/shipping/resolve.ts",
    },
  };
}

export function formatCurrency(value = 0, currency = "ZAR") {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}
