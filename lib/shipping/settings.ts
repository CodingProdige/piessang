import { normalizeMoneyAmount } from "@/lib/money";
import { normalizeCountryCode as normalizeMarketplaceCountryCode } from "@/lib/marketplace/country-config";

export type ShippingFulfillmentMode = "seller_fulfilled" | "piessang_fulfilled";
export type CoverageMatchType = "postal_code" | "province" | "country";
export type ShippingCoverageType = "country" | "province" | "postal_code_group";
export type ShippingPricingMode = "flat" | "weight_based" | "order_value_based" | "tiered" | "free_over_threshold";
export type ShippingBatchingMode = "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";

export type ShippingPostalCodeRange = {
  from: string;
  to: string;
};

export type ShippingRateOverride = {
  pricingMode: ShippingPricingMode;
  flatRate: number;
  weightBased: {
    baseRate: number;
    includedKg: number;
    additionalRatePerKg: number;
    roundUpToNextKg: boolean;
  };
  orderValueBased: Array<{ minOrderValue: number; maxOrderValue: number | null; rate: number }>;
  tiered: Array<{ minWeightKg: number; maxWeightKg: number | null; rate: number }>;
  freeOverThreshold: {
    threshold: number;
    fallbackRate: number;
  };
};

export type ShippingProvinceRule = {
  province: string;
  placeId?: string | null;
  enabled: boolean;
  rateOverride: ShippingRateOverride | null;
  batching: ShippingBatching | null;
  estimatedDeliveryDays: {
    min: number | null;
    max: number | null;
  };
};

export type ShippingPostalCodeGroup = {
  name: string;
  postalCodes: string[];
  postalCodeRanges: ShippingPostalCodeRange[];
  rateOverride: ShippingRateOverride | null;
  batching: ShippingBatching | null;
  estimatedDeliveryDays: {
    min: number | null;
    max: number | null;
  };
};

export type ShippingBatching = {
  enabled: boolean;
  mode: ShippingBatchingMode;
  maxBatchLimit: number | null;
};

export type ShippingLocalDeliverySettings = {
  enabled: boolean;
  mode: "province" | "postal_code_group";
  provinces: ShippingProvinceRule[];
  postalCodeGroups: ShippingPostalCodeGroup[];
  defaultRate: ShippingRateOverride;
  batching: ShippingBatching;
  estimatedDeliveryDays: {
    min: number | null;
    max: number | null;
  };
  currency: string;
};

export type ShippingZone = {
  id: string;
  name: string;
  enabled: boolean;
  countryCode: string;
  coverageType: ShippingCoverageType;
  provinces: ShippingProvinceRule[];
  postalCodeGroups: ShippingPostalCodeGroup[];
  defaultRate: ShippingRateOverride;
  batching: ShippingBatching;
  estimatedDeliveryDays: {
    min: number | null;
    max: number | null;
  };
  currency: string;
};

export type ShippingSettings = {
  shipsFrom: {
    countryCode: string;
    province: string;
    city: string;
    postalCode: string;
    streetAddress: string;
    addressLine2: string;
    suburb: string;
    utcOffsetMinutes: number | null;
    latitude: number | null;
    longitude: number | null;
  };
  localDelivery: ShippingLocalDeliverySettings;
  zones: ShippingZone[];
};

export type ShippingDestination = {
  countryCode?: string | null;
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

function toUpper(value: unknown, fallback = ""): string {
  return toStr(value, fallback).toUpperCase();
}

function normalizeCountryCodeValue(value: unknown, fallback = ""): string {
  return normalizeMarketplaceCountryCode(value) || toUpper(value, fallback);
}

function toNum(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositive(value: unknown, fallback = 0): number {
  const numeric = toNum(value, fallback);
  if (numeric < 0) return fallback;
  return normalizeMoneyAmount(numeric);
}

function toNullablePositiveInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

function normalizePostalCode(value: unknown): string {
  return toStr(value).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function normalizePostalCodeList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return source.flatMap((entry) => toStr(entry).split(/[,;\n]+/)).map((entry) => normalizePostalCode(entry)).filter(Boolean);
}

function normalizeRateOverride(input: any): ShippingRateOverride {
  const source = input && typeof input === "object" ? input : {};
  const pricingMode = (() => {
    const candidate = toStr(source.pricingMode || source.mode || "flat").toLowerCase();
    if (candidate === "weight_based" || candidate === "order_value_based" || candidate === "tiered" || candidate === "free_over_threshold") {
      return candidate;
    }
    return "flat";
  })() as ShippingPricingMode;

  return {
    pricingMode,
    flatRate: toPositive(source.flatRate ?? source.rate ?? source.fee, 0),
    weightBased: {
      baseRate: toPositive(source.weightBased?.baseRate, 0),
      includedKg: toPositive(source.weightBased?.includedKg, 0),
      additionalRatePerKg: toPositive(source.weightBased?.additionalRatePerKg, 0),
      roundUpToNextKg: source.weightBased?.roundUpToNextKg !== false,
    },
    orderValueBased: Array.isArray(source.orderValueBased)
      ? source.orderValueBased.map((entry: any) => ({
          minOrderValue: toPositive(entry?.minOrderValue, 0),
          maxOrderValue: entry?.maxOrderValue == null || entry?.maxOrderValue === "" ? null : toPositive(entry.maxOrderValue, 0),
          rate: toPositive(entry?.rate, 0),
        }))
      : [],
    tiered: Array.isArray(source.tiered)
      ? source.tiered.map((entry: any) => ({
          minWeightKg: toPositive(entry?.minWeightKg, 0),
          maxWeightKg: entry?.maxWeightKg == null || entry?.maxWeightKg === "" ? null : toPositive(entry.maxWeightKg, 0),
          rate: toPositive(entry?.rate, 0),
        }))
      : [],
    freeOverThreshold: {
      threshold: toPositive(source.freeOverThreshold?.threshold, 0),
      fallbackRate: toPositive(source.freeOverThreshold?.fallbackRate, 0),
    },
  };
}

function normalizeBatching(input: any, defaultRate: ShippingRateOverride): ShippingBatching {
  const source = input && typeof input === "object" ? input : {};
  const configured = toStr(source.mode).toLowerCase() as ShippingBatchingMode;
  const derivedDefault: ShippingBatchingMode =
    defaultRate.pricingMode === "weight_based" || defaultRate.pricingMode === "tiered" ? "combine_weight" : "single_shipping_fee";
  const mode =
    configured === "highest_item_shipping" || configured === "combine_weight" || configured === "per_item" || configured === "single_shipping_fee"
      ? configured
      : derivedDefault;
  return {
    enabled: source.enabled !== false,
    mode,
    maxBatchLimit: toNullablePositiveInt(source.maxBatchLimit ?? source.maxItemsPerBatch),
  };
}

function normalizeProvinceRules(value: unknown): ShippingProvinceRule[] {
  return Array.isArray(value)
    ? value.map((entry: any) => ({
        province: toStr(entry?.province),
        placeId: toStr(entry?.placeId || entry?.googlePlaceId || entry?.provincePlaceId) || null,
        enabled: entry?.enabled !== false,
        rateOverride: entry?.rateOverride ? normalizeRateOverride(entry.rateOverride) : null,
        batching: entry?.batching ? normalizeBatching(entry.batching, entry?.rateOverride ? normalizeRateOverride(entry.rateOverride) : normalizeRateOverride({ pricingMode: "flat", flatRate: 0 })) : null,
        estimatedDeliveryDays: {
          min: toNullablePositiveInt(entry?.estimatedDeliveryDays?.min ?? entry?.leadTimeDays),
          max: toNullablePositiveInt(entry?.estimatedDeliveryDays?.max ?? entry?.leadTimeDays),
        },
      }))
    : [];
}

function normalizePostalCodeGroups(value: unknown): ShippingPostalCodeGroup[] {
  return Array.isArray(value)
    ? value.map((entry: any) => ({
        name: toStr(entry?.name || "Postal code group"),
        postalCodes: normalizePostalCodeList(entry?.postalCodes),
        postalCodeRanges: Array.isArray(entry?.postalCodeRanges)
          ? entry.postalCodeRanges
              .map((range: any) => ({
                from: normalizePostalCode(range?.from),
                to: normalizePostalCode(range?.to),
              }))
              .filter((range: ShippingPostalCodeRange) => range.from && range.to)
          : [],
        rateOverride: entry?.rateOverride ? normalizeRateOverride(entry.rateOverride) : null,
        batching: entry?.batching ? normalizeBatching(entry.batching, entry?.rateOverride ? normalizeRateOverride(entry.rateOverride) : normalizeRateOverride({ pricingMode: "flat", flatRate: 0 })) : null,
        estimatedDeliveryDays: {
          min: toNullablePositiveInt(entry?.estimatedDeliveryDays?.min ?? entry?.leadTimeDays),
          max: toNullablePositiveInt(entry?.estimatedDeliveryDays?.max ?? entry?.leadTimeDays),
        },
      }))
    : [];
}

function normalizeLocalDelivery(input: any, shipsFromCountryCode = "ZA"): ShippingLocalDeliverySettings {
  const source = input && typeof input === "object" ? input : {};
  const defaultRate = normalizeRateOverride(source.defaultRate || source.rate || { pricingMode: "flat", flatRate: source.flatFee ?? 0 });
  const modeCandidate = toStr(source.mode || source.coverageType || "").toLowerCase();
  const mode =
    modeCandidate === "postal_code_group" || modeCandidate === "province"
      ? (modeCandidate as ShippingLocalDeliverySettings["mode"])
      : normalizePostalCodeGroups(source.postalCodeGroups).length > 0
        ? "postal_code_group"
        : "province";
  return {
    enabled: source.enabled === true || normalizeProvinceRules(source.provinces).length > 0 || normalizePostalCodeGroups(source.postalCodeGroups).length > 0,
    mode,
    provinces: mode === "province" ? normalizeProvinceRules(source.provinces) : [],
    postalCodeGroups: mode === "postal_code_group" ? normalizePostalCodeGroups(source.postalCodeGroups) : [],
    defaultRate,
    batching: normalizeBatching(source.batching, defaultRate),
    estimatedDeliveryDays: {
      min: toNullablePositiveInt(source.estimatedDeliveryDays?.min ?? source.leadTimeDays),
      max: toNullablePositiveInt(source.estimatedDeliveryDays?.max ?? source.leadTimeDays),
    },
    currency: toUpper(source.currency || "ZAR", "ZAR"),
  };
}

function normalizeZone(input: any, index: number): ShippingZone {
  const source = input && typeof input === "object" ? input : {};
  const defaultRate = normalizeRateOverride(source.defaultRate || source.rate || {});
  return {
    id: toStr(source.id || `zone_${index + 1}`),
    name: toStr(source.name || source.label || source.countryCode || `Zone ${index + 1}`),
    enabled: source.enabled !== false,
    countryCode: normalizeCountryCodeValue(source.countryCode || source.country || "ZA", "ZA"),
    coverageType: (() => {
      const candidate = toStr(source.coverageType || "country").toLowerCase();
      if (candidate === "province" || candidate === "postal_code_group") return candidate;
      return "country";
    })(),
    provinces: normalizeProvinceRules(source.provinces),
    postalCodeGroups: normalizePostalCodeGroups(source.postalCodeGroups),
    defaultRate,
    batching: normalizeBatching(source.batching, defaultRate),
    estimatedDeliveryDays: {
      min: toNullablePositiveInt(source.estimatedDeliveryDays?.min),
      max: toNullablePositiveInt(source.estimatedDeliveryDays?.max),
    },
    currency: toUpper(source.currency || "ZAR", "ZAR"),
  };
}

function zoneLooksLikeLocalDelivery(zone: any, shipsFromCountryCode = "ZA"): boolean {
  const name = toStr(zone?.name).toLowerCase();
  const zoneCountry = normalizeCountryCodeValue(zone?.countryCode || zone?.country || "");
  return name === "local delivery" || (zoneCountry === normalizeCountryCodeValue(shipsFromCountryCode) && (zone?.coverageType === "province" || zone?.coverageType === "postal_code_group") && !toStr(zone?.name));
}

function deriveLocalDeliveryFromLegacyProfile(deliveryProfile: any): ShippingLocalDeliverySettings {
  const local = deliveryProfile?.localDelivery && typeof deliveryProfile.localDelivery === "object" ? deliveryProfile.localDelivery : {};
  const originCountry = normalizeCountryCodeValue(deliveryProfile?.origin?.country || "ZA", "ZA");
  return normalizeLocalDelivery({
    enabled: local?.enabled === true,
    countryCode: originCountry,
    defaultRate: {
      pricingMode: local?.freeAboveOrderValue ? "free_over_threshold" : "flat",
      flatRate: local?.flatFee ?? 0,
      freeOverThreshold: {
        threshold: local?.freeAboveOrderValue ?? 0,
        fallbackRate: local?.flatFee ?? 0,
      },
    },
    estimatedDeliveryDays: {
      min: local?.leadTimeDays ?? null,
      max: local?.leadTimeDays ?? null,
    },
    currency: "ZAR",
  });
}

export function defaultShippingSettings(): ShippingSettings {
  return {
    shipsFrom: {
      countryCode: "ZA",
      province: "",
      city: "",
      postalCode: "",
      streetAddress: "",
      addressLine2: "",
      suburb: "",
      utcOffsetMinutes: null,
      latitude: null,
      longitude: null,
    },
    localDelivery: {
      enabled: false,
      mode: "province",
      provinces: [],
      postalCodeGroups: [],
      defaultRate: normalizeRateOverride({ pricingMode: "flat", flatRate: 0 }),
      batching: normalizeBatching({}, normalizeRateOverride({ pricingMode: "flat", flatRate: 0 })),
      estimatedDeliveryDays: {
        min: 1,
        max: 3,
      },
      currency: "ZAR",
    },
    zones: [],
  };
}

export function normalizeShippingDestination(input: any): ShippingDestination {
  const source = input && typeof input === "object" ? input : {};
  return {
    countryCode: normalizeCountryCodeValue(source.countryCode || source.country || source.country_code || ""),
    province: toStr(source.province || source.stateProvinceRegion || source.region || ""),
    city: toStr(source.city || source.suburb || ""),
    postalCode: normalizePostalCode(source.postalCode),
    latitude: source.latitude == null ? null : toNum(source.latitude, 0),
    longitude: source.longitude == null ? null : toNum(source.longitude, 0),
  };
}

export function normalizeShippingSettings(input: any): ShippingSettings {
  const defaults = defaultShippingSettings();
  const source = input && typeof input === "object" ? input : {};
  const shipsFrom = {
    countryCode: normalizeCountryCodeValue(
      source.shipsFrom?.countryCode ||
        source.shipsFrom?.country ||
        source.origin?.countryCode ||
        source.origin?.country ||
        defaults.shipsFrom.countryCode,
    ),
    province: toStr(source.shipsFrom?.province || source.origin?.region || source.origin?.province || ""),
    city: toStr(source.shipsFrom?.city || source.origin?.city || ""),
    postalCode: normalizePostalCode(source.shipsFrom?.postalCode || source.origin?.postalCode || ""),
    streetAddress: toStr(source.shipsFrom?.streetAddress || source.origin?.streetAddress || ""),
    addressLine2: toStr(source.shipsFrom?.addressLine2 || source.origin?.addressLine2 || ""),
    suburb: toStr(source.shipsFrom?.suburb || source.origin?.suburb || ""),
    utcOffsetMinutes:
      source.shipsFrom?.utcOffsetMinutes == null && source.origin?.utcOffsetMinutes == null
        ? null
        : toNum(source.shipsFrom?.utcOffsetMinutes ?? source.origin?.utcOffsetMinutes, 0),
    latitude:
      source.shipsFrom?.latitude == null && source.origin?.latitude == null
        ? null
        : toNum(source.shipsFrom?.latitude ?? source.origin?.latitude, 0),
    longitude:
      source.shipsFrom?.longitude == null && source.origin?.longitude == null
        ? null
        : toNum(source.shipsFrom?.longitude ?? source.origin?.longitude, 0),
  };

  const allZones = Array.isArray(source.zones) ? source.zones : [];
  const localZoneCandidates = allZones.filter((zone: any) => zoneLooksLikeLocalDelivery(zone, shipsFrom.countryCode));
  const shippingZoneCandidates = allZones.filter((zone: any) => !zoneLooksLikeLocalDelivery(zone, shipsFrom.countryCode));
  const fallbackLocalZone = localZoneCandidates[0];

  return {
    shipsFrom,
    localDelivery: normalizeLocalDelivery(source.localDelivery || fallbackLocalZone || {}, shipsFrom.countryCode),
    zones: shippingZoneCandidates
      .map((zone: any, index: number) => normalizeZone(zone, index))
      .filter((zone: ShippingZone) => zone.id),
  };
}

export function buildShippingSettingsFromLegacySeller(seller: any): ShippingSettings {
  const shippingSettings = seller?.shippingSettings && typeof seller.shippingSettings === "object" ? seller.shippingSettings : null;
  if (shippingSettings) return normalizeShippingSettings(shippingSettings);

  const deliveryProfile = seller?.deliveryProfile && typeof seller.deliveryProfile === "object" ? seller.deliveryProfile : {};
  const shippingZones = Array.isArray(deliveryProfile?.shippingZones) ? deliveryProfile.shippingZones : [];
  return normalizeShippingSettings({
    shipsFrom: {
      countryCode: deliveryProfile?.origin?.country || "ZA",
      province: deliveryProfile?.origin?.region || "",
      city: deliveryProfile?.origin?.city || "",
      postalCode: deliveryProfile?.origin?.postalCode || "",
      streetAddress: deliveryProfile?.origin?.streetAddress || "",
      addressLine2: deliveryProfile?.origin?.addressLine2 || "",
      suburb: deliveryProfile?.origin?.suburb || "",
      utcOffsetMinutes: deliveryProfile?.origin?.utcOffsetMinutes ?? null,
      latitude: deliveryProfile?.origin?.latitude ?? null,
      longitude: deliveryProfile?.origin?.longitude ?? null,
    },
    localDelivery: deriveLocalDeliveryFromLegacyProfile(deliveryProfile),
    zones: shippingZones.map((zone: any, index: number) => ({
      id: zone?.id || `legacy_zone_${index + 1}`,
      name: zone?.label || zone?.country || `Legacy zone ${index + 1}`,
      enabled: zone?.isActive !== false,
      countryCode: zone?.country || "ZA",
      coverageType: "country",
      provinces: [],
      postalCodeGroups: [],
      defaultRate: {
        pricingMode: zone?.pricingBasis === "per_kg" ? "weight_based" : "flat",
        flatRate: zone?.pricingRules?.[0]?.fee ?? 0,
        weightBased: {
          baseRate: zone?.pricingRules?.[0]?.fee ?? 0,
          includedKg: 1,
          additionalRatePerKg: zone?.pricingRules?.[0]?.fee ?? 0,
          roundUpToNextKg: true,
        },
        orderValueBased: [],
        tiered: [],
        freeOverThreshold: {
          threshold: zone?.pricingRules?.[0]?.freeAboveOrderValue ?? 0,
          fallbackRate: zone?.pricingRules?.[0]?.fee ?? 0,
        },
      },
      batching: {
        enabled: true,
        mode: zone?.pricingBasis === "per_item" ? "per_item" : zone?.pricingBasis === "per_kg" ? "combine_weight" : "single_shipping_fee",
      },
      estimatedDeliveryDays: {
        min: zone?.leadTimeDays ?? 2,
        max: zone?.leadTimeDays ?? 2,
      },
      currency: "ZAR",
    })),
  });
}

function validateRateStructure(label: string, rate: ShippingRateOverride | null, issues: string[]) {
  if (!rate) return;
  if (!rate.pricingMode) issues.push(`${label}: pricingMode required`);
  if (rate.pricingMode === "free_over_threshold" && rate.freeOverThreshold.threshold <= 0) {
    issues.push(`${label}: free shipping threshold must be positive`);
  }
}

function validateGeoPricingContainer(
  label: string,
  container: {
    countryCode: string;
    coverageType?: ShippingCoverageType | "province" | "postal_code_group";
    defaultRate: ShippingRateOverride;
    provinces: ShippingProvinceRule[];
    postalCodeGroups: ShippingPostalCodeGroup[];
  },
  issues: string[],
) {
  if (!container.countryCode) issues.push(`${label}: countryCode required`);
  const requiresCountryDefault = (container.coverageType || "country") === "country";
  if (requiresCountryDefault) {
    if (!container.defaultRate) issues.push(`${label}: defaultRate required`);
    validateRateStructure(`${label}`, container.defaultRate, issues);
  }

  container.provinces.forEach((provinceRule) => {
    if (!provinceRule.province) issues.push(`${label}: province override requires province`);
    if (!provinceRule.rateOverride) issues.push(`${label}: province override ${provinceRule.province || "override"} requires its own rate rule`);
    validateRateStructure(`${label} province ${provinceRule.province || "override"}`, provinceRule.rateOverride, issues);
  });

  container.postalCodeGroups.forEach((group) => {
    if (!group.postalCodes.length && !group.postalCodeRanges.length) {
      issues.push(`${label}: postal code group ${group.name} must have postal codes or ranges`);
    }
    if (!group.rateOverride) issues.push(`${label}: postal code group ${group.name || "group"} requires its own rate rule`);
    validateRateStructure(`${label} postal group ${group.name || "group"}`, group.rateOverride, issues);
  });
}

function validateLocalDelivery(label: string, settings: ShippingLocalDeliverySettings, shipsFromCountryCode: string, issues: string[]) {
  validateGeoPricingContainer(
    label,
    {
      countryCode: shipsFromCountryCode,
      coverageType: settings.mode,
      defaultRate: settings.defaultRate,
      provinces: settings.mode === "province" ? settings.provinces : [],
      postalCodeGroups: settings.mode === "postal_code_group" ? settings.postalCodeGroups : [],
    },
    issues,
  );
}

export function validateShippingSettings(settingsInput: any): { valid: boolean; issues: string[]; settings: ShippingSettings } {
  const settings = normalizeShippingSettings(settingsInput);
  const issues: string[] = [];

  if (!settings.shipsFrom.countryCode) issues.push("countryCode required");
  validateLocalDelivery("Local delivery", settings.localDelivery, settings.shipsFrom.countryCode, issues);

  settings.zones.forEach((zone) => {
    validateGeoPricingContainer(`Zone ${zone.id}`, zone, issues);
  });

  return { valid: issues.length === 0, issues, settings };
}

export function shippingModeRequiresWeight(settings: ShippingSettings): boolean {
  const containers = [settings.localDelivery, ...settings.zones];
  return containers.some((container) => {
    const activeCoverage = "coverageType" in container ? container.coverageType : container.mode;
    if (activeCoverage === "country" && (container.defaultRate.pricingMode === "weight_based" || container.defaultRate.pricingMode === "tiered")) return true;
    const provinceWeight = container.provinces.some((rule) => {
      const mode = rule.rateOverride?.pricingMode;
      return mode === "weight_based" || mode === "tiered";
    });
    const postalWeight = container.postalCodeGroups.some((group) => {
      const mode = group.rateOverride?.pricingMode;
      return mode === "weight_based" || mode === "tiered";
    });
    return provinceWeight || postalWeight;
  });
}

export function defaultPiessangFulfillmentShipping() {
  return {
    countryCode: "ZA",
    warehouseOrigin: {
      province: "Western Cape",
      city: "Paarl",
      postalCode: "7646",
    },
    shippingMargin: {
      enabled: false,
      mode: "fixed" as const,
      value: 0,
    },
    zones: [] as ShippingZone[],
  };
}
