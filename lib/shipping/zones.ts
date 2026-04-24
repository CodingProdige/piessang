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
  return toStr(value).replace(/\s+/g, " ").trim().toLowerCase();
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
  const normalizedProvince = normalizeText(province);
  if (!normalizedProvince) return null;
  const match = zone.provinces.find((entry) => entry.enabled !== false && normalizeText(entry.province) === normalizedProvince);
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
    if (postalGroup) {
      return {
        zone,
        rate: postalGroup.rateOverride || zone.defaultRate,
        matchType: "postal_code",
        matchName: postalGroup.name,
        batchingOverride: postalGroup.batching || null,
        errors,
      };
    }

    const provinceRule = provinceMatches(zone, province);
    if (provinceRule?.rateOverride) {
      return {
        zone,
        rate: provinceRule.rateOverride,
        matchType: "province",
        matchName: province,
        batchingOverride: provinceRule.batching || null,
        errors,
      };
    }

    return {
      zone,
      rate: zone.defaultRate,
      matchType: "country",
      matchName: zone.name,
      batchingOverride: null,
      errors,
    };
  }

  return {
    zone: null,
    rate: null,
    matchType: null,
    matchName: null,
    batchingOverride: null,
    errors,
  };
}
