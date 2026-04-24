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

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveItemWeightKg(item: any): number | null {
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
    batching: localDelivery.batching,
    estimatedDeliveryDays: localDelivery.estimatedDeliveryDays,
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

export async function resolveShippingForSellerGroup({
  seller,
  items,
  buyerDestination,
  piessangFulfillmentShipping = null,
}: {
  seller: any;
  items: any[];
  buyerDestination: ShippingDestination | any;
  piessangFulfillmentShipping?: any;
}) {
  const normalizedDestination = normalizeShippingDestination(buyerDestination);
  const sellerSettings = buildShippingSettingsFromLegacySeller(seller);
  const effectiveFulfillmentMode = resolveProductFulfillmentMode(items);
  const platformDefaults = defaultPiessangFulfillmentShipping();
  const platformSettings = normalizeShippingSettings({
    shipsFrom: {
      countryCode: piessangFulfillmentShipping?.countryCode || platformDefaults.countryCode,
      province: piessangFulfillmentShipping?.warehouseOrigin?.province || "",
      city: piessangFulfillmentShipping?.warehouseOrigin?.city || "",
      postalCode: piessangFulfillmentShipping?.warehouseOrigin?.postalCode || "",
    },
    zones: Array.isArray(piessangFulfillmentShipping?.zones) ? piessangFulfillmentShipping.zones : [],
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
    return {
      ok: false,
      fulfillmentMode: effectiveFulfillmentMode,
      error: "SELLER_DOES_NOT_SHIP_TO_LOCATION",
      errors: matched.errors,
      debug: {
        matchedZoneId: null,
        matchedCoverageType: null,
        fallbackUsed: false,
        reason: "No local delivery rule or shipping zone matched the destination.",
      },
    };
  }

  const pricedItems = normalizePricedItems(items);
  const pricing = calculateShippingPrice({
    rate: matched.rate,
    items: pricedItems,
    batchingMode:
      matched.batchingOverride?.enabled === false
        ? "single_shipping_fee"
        : matched.batchingOverride?.mode || (matched.zone.batching?.enabled === false ? "single_shipping_fee" : matched.zone.batching?.mode),
    maxBatchLimit:
      matched.batchingOverride?.enabled === false
        ? null
        : matched.batchingOverride?.maxBatchLimit ?? (matched.zone.batching?.enabled === false ? null : matched.zone.batching?.maxBatchLimit),
  });

  if (pricing.errors.length) {
    return {
      ok: false,
      fulfillmentMode: effectiveFulfillmentMode,
      error: pricing.errors[0] === "Weight-based shipping requires item weights." ? "WEIGHT_REQUIRED_FOR_SHIPPING_MODE" : pricing.errors[0],
      errors: [...matched.errors, ...pricing.errors],
      zone: matched.zone,
      debug: {
        matchedZoneId: matched.zone?.id || null,
        matchedCoverageType: matched.matchType,
        fallbackUsed: matched.matchType === "country",
        reason: pricing.errors[0],
      },
    };
  }

  const platformMargin = effectiveFulfillmentMode === "seller_fulfilled" ? piessangFulfillmentShipping?.shippingMargin || null : null;
  const marginResult = applyShippingMargin({
    baseShippingFee: pricing.baseShippingFee,
    margin: platformMargin,
  });

  return {
    ok: true,
    fulfillmentMode: effectiveFulfillmentMode,
    zone: matched.zone,
    matchType: matched.matchType,
    matchName: matched.matchName,
    pricingMode: matched.rate.pricingMode,
    batchingMode: pricing.batchingMode,
    destination: normalizedDestination,
    baseShippingFee: pricing.baseShippingFee,
    platformShippingMargin: marginResult.platformShippingMargin,
    finalShippingFee: marginResult.finalShippingFee,
    estimatedDeliveryDays: matched.zone.estimatedDeliveryDays,
    items: pricedItems,
    errors: matched.errors,
    debug: {
      matchedZoneId: matched.zone?.id || null,
      matchedCoverageType: matched.matchType,
      fallbackUsed: matched.matchType === "country",
      reason: localMatch ? "Local delivery matched before broader shipping zones." : "Shipping zone matched successfully.",
    },
  };
}
