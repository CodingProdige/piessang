import { buildShipmentParcelFromVariant } from "@/lib/shipping/contracts";
import { applyShippingMargin, calculateShippingPrice, type ShippingPricedItem } from "@/lib/shipping/pricing";
import {
  buildShippingSettingsFromLegacySeller,
  defaultPiessangFulfillmentShipping,
  normalizeShippingDestination,
  normalizeShippingSettings,
  type ShippingDestination,
  type ShippingFulfillmentMode,
  type ShippingLocalDeliverySettings,
  type ShippingZone,
} from "@/lib/shipping/settings";
import { matchShippingZone } from "@/lib/shipping/zones";

export type ShippingResolutionErrorCode =
  | "SELLER_DOES_NOT_SHIP_TO_LOCATION"
  | "WEIGHT_REQUIRED_FOR_SHIPPING_MODE"
  | "INVALID_SHIPPING_SETTINGS";

export type ShippingResolutionSuccess = {
  ok: true;
  sellerId: string;
  fulfillmentMode: ShippingFulfillmentMode;
  matchedSource: "local_delivery" | "shipping_zone";
  matchedRuleId: string;
  matchedRuleName: string;
  matchType: "postal_exact" | "postal_range" | "province" | "country";
  pricingMode: string;
  batchingMode: string;
  baseShippingFee: number;
  platformShippingMarkup: number;
  finalShippingFee: number;
  platformShippingMargin: number;
  estimatedDeliveryDays: {
    min: number | null;
    max: number | null;
  } | null;
  destination: ShippingDestination;
  items: ShippingPricedItem[];
  debug: {
    matchedZoneId: string | null;
    matchedCoverageType: string | null;
    matchedRuleId: string | null;
    matchedRuleName: string | null;
    matchedSource: "local_delivery" | "shipping_zone" | null;
    fallbackUsed: boolean;
    reason: string;
    destination?: ShippingDestination;
    localDeliveryEnabled?: boolean;
    localDeliveryMode?: string | null;
    localProvinceRules?: string[];
    localPostalGroupNames?: string[];
    shippingZonesCount?: number;
  };
};

export type ShippingResolutionFailure = {
  ok: false;
  sellerId: string;
  fulfillmentMode: ShippingFulfillmentMode;
  code: ShippingResolutionErrorCode;
  message: string;
  debug: {
    matchedZoneId: string | null;
    matchedCoverageType: string | null;
    matchedRuleId: string | null;
    matchedRuleName: string | null;
    matchedSource: "local_delivery" | "shipping_zone" | null;
    fallbackUsed: boolean;
    reason: string;
    destination?: ShippingDestination;
    localDeliveryEnabled?: boolean;
    localDeliveryMode?: string | null;
    localProvinceRules?: string[];
    localPostalGroupNames?: string[];
    shippingZonesCount?: number;
  };
  errors: string[];
};

export type ShippingResolutionResult = ShippingResolutionSuccess | ShippingResolutionFailure;

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDebugText(value: unknown): string {
  return toStr(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDebugProvince(value: unknown): string {
  const normalized = normalizeDebugText(value);
  if (!normalized) return "";
  switch (normalized) {
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
      return normalized;
  }
}

function normalizePlatformShippingMarkupInput(input: any = {}) {
  const source = input && typeof input === "object" ? input : {};
  const mode = toStr(source.mode || "percentage").toLowerCase();
  const appliesTo = toStr(source.appliesTo || "seller_fulfilled").toLowerCase();
  const normalizedMode: "fixed" | "percentage" = mode === "fixed" ? "fixed" : "percentage";
  const normalizedAppliesTo: "all" | "seller_fulfilled" | "piessang_fulfilled" =
    appliesTo === "all" || appliesTo === "piessang_fulfilled" || appliesTo === "seller_fulfilled"
      ? appliesTo
      : "seller_fulfilled";
  return {
    enabled: source.enabled === true,
    mode: normalizedMode,
    value: Math.max(0, toNum(source.value, 0)),
    appliesTo: normalizedAppliesTo,
    countryCode: toStr(source.countryCode || "ZA").toUpperCase() || "ZA",
  };
}

function normalizePlatformShippingInput(input: { piessangFulfillmentShipping?: any; platformShippingMarkup?: any } = {}) {
  const platformDefaults = defaultPiessangFulfillmentShipping();
  return {
    piessangFulfillmentShipping: {
      countryCode: toStr(input?.piessangFulfillmentShipping?.countryCode || platformDefaults.countryCode).toUpperCase() || platformDefaults.countryCode,
      warehouseOrigin: {
        province: toStr(input?.piessangFulfillmentShipping?.warehouseOrigin?.province || platformDefaults.warehouseOrigin.province),
        city: toStr(input?.piessangFulfillmentShipping?.warehouseOrigin?.city || platformDefaults.warehouseOrigin.city),
        postalCode: toStr(input?.piessangFulfillmentShipping?.warehouseOrigin?.postalCode || platformDefaults.warehouseOrigin.postalCode),
      },
      zones: Array.isArray(input?.piessangFulfillmentShipping?.zones) ? input.piessangFulfillmentShipping.zones : platformDefaults.zones,
    },
    platformShippingMarkup: normalizePlatformShippingMarkupInput(input?.platformShippingMarkup || {}),
  };
}

function resolveItemWeightKg(item: any): number | null {
  const explicitWeight = Number(item?.weightKg);
  if (Number.isFinite(explicitWeight) && explicitWeight >= 0) return explicitWeight;
  const parcel = buildShipmentParcelFromVariant(item?.selected_variant_snapshot || item?.selected_variant || item?.variant || null);
  if (!parcel) return null;
  const weight = Number(parcel.billableWeightKg ?? parcel.actualWeightKg ?? 0);
  return Number.isFinite(weight) && weight >= 0 ? weight : null;
}

function normalizePricedItems(items: any[]): ShippingPricedItem[] {
  return (Array.isArray(items) ? items : []).map((item) => ({
    productId: toStr(item?.product_unique_id || item?.productId || item?.product_snapshot?.product?.unique_id || item?.product?.product?.unique_id || ""),
    variantId: toStr(
      item?.variant_id ||
        item?.variantId ||
        item?.selected_variant_snapshot?.variant_id ||
        item?.selected_variant?.variant_id ||
        item?.variant?.variant_id ||
        "",
    ),
    quantity: Math.max(0, Math.trunc(toNum(item?.qty ?? item?.quantity, 0))),
    lineSubtotalIncl: toNum(item?.line_totals?.final_incl ?? item?.lineSubtotalIncl, 0),
    weightKg: resolveItemWeightKg(item),
  }));
}

function normalizeItemFulfillmentMode(item: any): ShippingFulfillmentMode {
  const mode = toStr(item?.product_snapshot?.fulfillment?.mode || item?.product?.fulfillment?.mode || "inherit").toLowerCase();
  if (mode === "piessang_fulfilled" || mode === "bevgo") return "piessang_fulfilled";
  return "seller_fulfilled";
}

function resolveProductFulfillmentMode(items: any[]): ShippingFulfillmentMode {
  const modes = new Set((Array.isArray(items) ? items : []).map((item) => normalizeItemFulfillmentMode(item)));
  if (modes.has("piessang_fulfilled")) return "piessang_fulfilled";
  return "seller_fulfilled";
}

function buildLocalDeliveryZone(localDelivery: ShippingLocalDeliverySettings): ShippingZone {
  return {
    id: "local_delivery",
    name: "Local delivery",
    enabled: localDelivery.enabled === true,
    countryCode: "ZA",
    coverageType: localDelivery.mode,
    provinces: localDelivery.mode === "province" ? localDelivery.provinces : [],
    postalCodeGroups: localDelivery.mode === "postal_code_group" ? localDelivery.postalCodeGroups : [],
    defaultRate: localDelivery.defaultRate,
    batching: { enabled: false, mode: "single_shipping_fee", maxBatchLimit: null },
    estimatedDeliveryDays: { min: null, max: null },
    currency: localDelivery.currency || "ZAR",
  };
}

function resolveLocalDeliveryMatch({
  sellerSettings,
  destination,
}: {
  sellerSettings: ReturnType<typeof normalizeShippingSettings>;
  destination: ShippingDestination;
}) {
  if (!sellerSettings.localDelivery?.enabled) return null;
  const localZone = {
    ...buildLocalDeliveryZone(sellerSettings.localDelivery),
    countryCode: sellerSettings.shipsFrom.countryCode,
  };
  const matched = matchShippingZone({
    zones: [localZone],
    destination,
  });
  if (!matched.zone || !matched.rate || !matched.matchType) return null;
  return matched;
}

function resolveSellerId(seller: any): string {
  return toStr(
    seller?.sellerId ||
      seller?.id ||
      seller?.uid ||
      seller?.sellerCode ||
      seller?.seller_code ||
      seller?.code ||
      "",
  );
}

function toCanonicalMatchType(matchType: string | null, matched: any): ShippingResolutionSuccess["matchType"] | null {
  if (matchType === "province") return "province";
  if (matchType === "country") return "country";
  if (matchType === "postal_code") {
    const postalCodes = Array.isArray(matched?.postalCodes) ? matched.postalCodes : [];
    return postalCodes.length > 0 ? "postal_exact" : "postal_range";
  }
  return null;
}

function resolveMatchedRuleMetadata({
  matched,
  localMatch,
}: {
  matched: any;
  localMatch: any;
}): {
  matchedSource: "local_delivery" | "shipping_zone";
  matchedRuleId: string;
  matchedRuleName: string;
  matchType: ShippingResolutionSuccess["matchType"] | null;
} {
  if (matched?.matchType === "province") {
    const province = matched?.zone?.provinces?.find((entry: any) => toStr(entry?.province) === toStr(matched?.matchName));
    return {
      matchedSource: localMatch ? "local_delivery" : "shipping_zone",
      matchedRuleId: toStr(province?.placeId || province?.province || `${matched?.zone?.id || "zone"}:province:${matched?.matchName || "rule"}`),
      matchedRuleName: toStr(province?.province || matched?.matchName || "Province rule"),
      matchType: "province",
    };
  }

  if (matched?.matchType === "postal_code") {
    const postalGroup = matched?.zone?.postalCodeGroups?.find((entry: any) => toStr(entry?.name) === toStr(matched?.matchName));
    return {
      matchedSource: localMatch ? "local_delivery" : "shipping_zone",
      matchedRuleId: toStr(postalGroup?.name || `${matched?.zone?.id || "zone"}:postal:${matched?.matchName || "rule"}`),
      matchedRuleName: toStr(postalGroup?.name || matched?.matchName || "Postal code group"),
      matchType: toCanonicalMatchType("postal_code", postalGroup),
    };
  }

  return {
    matchedSource: localMatch ? "local_delivery" : "shipping_zone",
    matchedRuleId: toStr(matched?.zone?.id || "country_rule"),
    matchedRuleName: toStr(matched?.zone?.name || matched?.matchName || "Country rule"),
    matchType: matched?.matchType === "country" ? "country" : null,
  };
}

function buildNoMatchReason({
  sellerSettings,
  destination,
  effectiveFulfillmentMode,
}: {
  sellerSettings: ReturnType<typeof normalizeShippingSettings>;
  destination: ShippingDestination;
  effectiveFulfillmentMode: ShippingFulfillmentMode;
}) {
  if (!destination.countryCode) {
    return "Destination is missing a normalized country code.";
  }
  if (effectiveFulfillmentMode !== "seller_fulfilled") {
    return "No Piessang fulfillment shipping zone matched the destination.";
  }
  if (!sellerSettings.localDelivery?.enabled && (!Array.isArray(sellerSettings.zones) || sellerSettings.zones.length === 0)) {
    return "Seller has no active local delivery rules or shipping zones.";
  }
  if (sellerSettings.localDelivery?.enabled && sellerSettings.localDelivery.mode === "province") {
    const destinationProvince = normalizeDebugProvince(destination.province);
    const provinceRules = Array.isArray(sellerSettings.localDelivery.provinces) ? sellerSettings.localDelivery.provinces : [];
    if (!destinationProvince) {
      return "Destination is missing a province, so province-based local delivery cannot match.";
    }
    if (!provinceRules.length) {
      return "Local delivery is set to province mode but no province rules are configured.";
    }
    const matchedProvince = provinceRules.find(
      (rule) => rule?.enabled !== false && normalizeDebugProvince(rule?.province) === destinationProvince,
    );
    if (!matchedProvince) {
      return `No local province rule matched destination province '${destination.province || ""}'.`;
    }
    if (!matchedProvince.rateOverride) {
      return `Local province rule '${matchedProvince.province || destination.province || ""}' has no rate override.`;
    }
  }
  if (sellerSettings.localDelivery?.enabled && sellerSettings.localDelivery.mode === "postal_code_group") {
    if (!destination.postalCode) {
      return "Destination is missing a postal code, so postal-code local delivery cannot match.";
    }
  }
  return "No local delivery rule or shipping zone matched the destination.";
}

export function resolveShippingForSellerGroup({
  seller,
  items,
  buyerDestination,
  piessangFulfillmentShipping = null,
  platformShippingMarkup = null,
}: {
  seller: any;
  items: any[];
  buyerDestination: ShippingDestination | any;
  piessangFulfillmentShipping?: any;
  platformShippingMarkup?: any;
}): ShippingResolutionResult {
  const normalizedDestination = normalizeShippingDestination(buyerDestination);
  const sellerId = resolveSellerId(seller);
  const sellerSettings = buildShippingSettingsFromLegacySeller(seller);
  const effectiveFulfillmentMode = resolveProductFulfillmentMode(items);
  const normalizedPlatformSettings = normalizePlatformShippingInput({
    piessangFulfillmentShipping: piessangFulfillmentShipping || undefined,
    platformShippingMarkup: platformShippingMarkup || undefined,
  });
  const platformDefaults = defaultPiessangFulfillmentShipping();
  const platformSettings = normalizeShippingSettings({
    shipsFrom: {
      countryCode: normalizedPlatformSettings?.piessangFulfillmentShipping?.countryCode || platformDefaults.countryCode,
      province: normalizedPlatformSettings?.piessangFulfillmentShipping?.warehouseOrigin?.province || "",
      city: normalizedPlatformSettings?.piessangFulfillmentShipping?.warehouseOrigin?.city || "",
      postalCode: normalizedPlatformSettings?.piessangFulfillmentShipping?.warehouseOrigin?.postalCode || "",
    },
    zones: Array.isArray(normalizedPlatformSettings?.piessangFulfillmentShipping?.zones)
      ? normalizedPlatformSettings.piessangFulfillmentShipping.zones
      : [],
  });

  const activeSettings = effectiveFulfillmentMode === "piessang_fulfilled" ? platformSettings : sellerSettings;
  const localMatch = effectiveFulfillmentMode === "seller_fulfilled" ? resolveLocalDeliveryMatch({ sellerSettings, destination: normalizedDestination }) : null;
  const matched =
    localMatch ||
    matchShippingZone({
      zones: activeSettings.zones,
      destination: normalizedDestination,
    });

  if (!matched.zone || !matched.rate || !matched.matchType) {
    const debug = {
      matchedZoneId: null,
      matchedCoverageType: null,
      matchedRuleId: null,
      matchedRuleName: null,
      matchedSource: null,
      fallbackUsed: false,
      reason: buildNoMatchReason({
        sellerSettings,
        destination: normalizedDestination,
        effectiveFulfillmentMode,
      }),
      destination: normalizedDestination,
      localDeliveryEnabled: sellerSettings.localDelivery?.enabled === true,
      localDeliveryMode: sellerSettings.localDelivery?.mode || null,
      localProvinceRules: (Array.isArray(sellerSettings.localDelivery?.provinces) ? sellerSettings.localDelivery.provinces : []).map(
        (rule) => `${rule?.enabled === false ? "disabled" : "enabled"}:${toStr(rule?.province)}`,
      ),
      localPostalGroupNames: (Array.isArray(sellerSettings.localDelivery?.postalCodeGroups) ? sellerSettings.localDelivery.postalCodeGroups : []).map(
        (group) => toStr(group?.name),
      ),
      shippingZonesCount: Array.isArray(activeSettings.zones) ? activeSettings.zones.length : 0,
    } as const;
    if (process.env.NODE_ENV !== "production") {
      console.log("[shipping/resolve][no-match]", {
        sellerId,
        failureCode: "SELLER_DOES_NOT_SHIP_TO_LOCATION",
        ...debug,
      });
    }
    return {
      ok: false,
      sellerId,
      fulfillmentMode: effectiveFulfillmentMode,
      code: "SELLER_DOES_NOT_SHIP_TO_LOCATION",
      message: "Seller does not ship to this location.",
      errors: matched.errors,
      debug,
    };
  }

  const matchedRule = resolveMatchedRuleMetadata({ matched, localMatch });

  const pricedItems = normalizePricedItems(items);
  const pricing = calculateShippingPrice({
    rate: matched.rate,
    items: pricedItems,
    batchingMode:
      matched.batchingOverride?.enabled === false
        ? "single_shipping_fee"
        : matched.batchingOverride?.mode || "single_shipping_fee",
    maxBatchLimit:
      matched.batchingOverride?.enabled === false
        ? null
        : matched.batchingOverride?.maxBatchLimit ?? null,
  });

  if (pricing.errors.length) {
    const code =
      pricing.errors[0] === "Weight-based shipping requires item weights."
        ? "WEIGHT_REQUIRED_FOR_SHIPPING_MODE"
        : "INVALID_SHIPPING_SETTINGS";
    return {
      ok: false,
      sellerId,
      fulfillmentMode: effectiveFulfillmentMode,
      code,
      message: pricing.errors[0] === "Weight-based shipping requires item weights." ? "Weight is required for this shipping mode." : "Invalid shipping settings.",
      errors: [...matched.errors, ...pricing.errors],
      debug: {
        matchedZoneId: matched.zone?.id || null,
        matchedCoverageType: matched.matchType,
        matchedRuleId: matchedRule.matchedRuleId || null,
        matchedRuleName: matchedRule.matchedRuleName || null,
        matchedSource: matchedRule.matchedSource,
        fallbackUsed: matched.matchType === "country",
        reason: pricing.errors[0],
      },
    };
  }

  const markup = normalizedPlatformSettings?.platformShippingMarkup || null;
  const shouldApplyMarkup =
    markup?.enabled === true &&
    (markup.appliesTo === "all" || markup.appliesTo === effectiveFulfillmentMode) &&
    (!markup.countryCode || markup.countryCode === normalizedDestination.countryCode);
  const marginResult = applyShippingMargin({
    baseShippingFee: pricing.baseShippingFee,
    margin: shouldApplyMarkup
      ? {
          enabled: true,
          mode: markup.mode,
          value: markup.value,
        }
      : null,
  });

  return {
    ok: true,
    sellerId,
    fulfillmentMode: effectiveFulfillmentMode,
    matchedSource: matchedRule.matchedSource,
    matchedRuleId: matchedRule.matchedRuleId,
    matchedRuleName: matchedRule.matchedRuleName,
    matchType: matchedRule.matchType || "country",
    pricingMode: matched.rate.pricingMode,
    batchingMode: pricing.batchingMode,
    baseShippingFee: pricing.baseShippingFee,
    platformShippingMarkup: marginResult.platformShippingMarkup,
    finalShippingFee: marginResult.finalShippingFee,
    platformShippingMargin: marginResult.platformShippingMargin,
    estimatedDeliveryDays: matched.estimatedDeliveryDays || matched.zone.estimatedDeliveryDays,
    destination: normalizedDestination,
    items: pricedItems,
    debug: {
      matchedZoneId: matched.zone?.id || null,
      matchedCoverageType: matched.matchType,
      matchedRuleId: matchedRule.matchedRuleId || null,
      matchedRuleName: matchedRule.matchedRuleName || null,
      matchedSource: matchedRule.matchedSource,
      fallbackUsed: matched.matchType === "country",
      reason: localMatch ? "Local delivery matched before broader shipping zones." : "Shipping zone matched successfully.",
    },
  };
}
