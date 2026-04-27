import type {
  CoverageMatchType,
  ShippingDestination,
  ShippingProvinceRule,
  ShippingPostalCodeGroup,
  ShippingRateOverride,
  ShippingZone,
} from "@/lib/shipping/settings";

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

function normalizeText(value: unknown): string {
  return toStr(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeProvinceLabel(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const compact = normalized.replace(/\s+/g, " ");
  switch (compact) {
    case "western cape":
      return "western cape";
    case "eastern cape":
      return "eastern cape";
    case "northern cape":
      return "northern cape";
    case "free state":
      return "free state";
    case "kwazulu natal":
      return "kwazulu natal";
    case "north west":
      return "north west";
    case "gauteng":
      return "gauteng";
    case "mpumalanga":
      return "mpumalanga";
    case "limpopo":
      return "limpopo";
    default:
      return compact;
  }
}

function normalizePostalCode(value: unknown): string {
  return toStr(value).replace(/\s+/g, "").toUpperCase();
}

function postalCodeInRange(postalCode: string, from: string, to: string): boolean {
  if (!postalCode || !from || !to) return false;
  return postalCode >= from && postalCode <= to;
}

function groupMatchesPostalCode(group: ShippingPostalCodeGroup, postalCode: string): boolean {
  if (!postalCode) return false;
  if (group.postalCodes.includes(postalCode)) return true;
  return group.postalCodeRanges.some((range) => postalCodeInRange(postalCode, range.from, range.to));
}

function provinceMatches(zone: ShippingZone, province: string): ShippingProvinceRule | null {
  const normalizedProvince = normalizeProvinceLabel(province);
  if (!normalizedProvince) return null;
  const match = zone.provinces.find(
    (entry) => entry.enabled !== false && normalizeProvinceLabel(entry.province) === normalizedProvince,
  );
  return match || null;
}

export function matchShippingZone({
  zones,
  destination,
}: {
  zones: ShippingZone[];
  destination: ShippingDestination;
}): {
  zone: ShippingZone | null;
  rate: ShippingRateOverride | null;
  matchType: CoverageMatchType | null;
  matchName: string | null;
  batchingOverride?: ShippingZone["batching"] | null;
  estimatedDeliveryDays?: ShippingZone["estimatedDeliveryDays"] | null;
  errors: string[];
} {
  const activeZones = (Array.isArray(zones) ? zones : []).filter((zone) => zone?.enabled !== false);
  const countryCode = toStr(destination.countryCode).toUpperCase();
  const province = toStr(destination.province);
  const postalCode = normalizePostalCode(destination.postalCode);
  const errors: string[] = [];

  for (const zone of activeZones) {
    if (toStr(zone.countryCode).toUpperCase() !== countryCode) continue;

    const postalGroup = zone.postalCodeGroups.find((group) => groupMatchesPostalCode(group, postalCode));
    if (zone.coverageType === "postal_code_group" && postalGroup) {
      return {
        zone,
        rate: postalGroup.rateOverride || zone.defaultRate,
        matchType: "postal_code",
        matchName: postalGroup.name,
        batchingOverride: postalGroup.batching || null,
        estimatedDeliveryDays: postalGroup.estimatedDeliveryDays || null,
        errors,
      };
    }

    const provinceRule = provinceMatches(zone, province);
    if (zone.coverageType === "province" && provinceRule?.rateOverride) {
      return {
        zone,
        rate: provinceRule.rateOverride,
        matchType: "province",
        matchName: province,
        batchingOverride: provinceRule.batching || null,
        estimatedDeliveryDays: provinceRule.estimatedDeliveryDays || null,
        errors,
      };
    }

    if (zone.coverageType === "country") {
      return {
        zone,
        rate: zone.defaultRate,
        matchType: "country",
        matchName: zone.name,
        batchingOverride: zone.batching || null,
        estimatedDeliveryDays: zone.estimatedDeliveryDays || null,
        errors,
      };
    }
  }

  return {
    zone: null,
    rate: null,
    matchType: null,
    matchName: null,
    batchingOverride: null,
    estimatedDeliveryDays: null,
    errors,
  };
}
