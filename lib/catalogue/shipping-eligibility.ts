import {
  resolveShippingForSellerGroup,
  type ShippingResolutionFailure,
  type ShippingResolutionResult,
  type ShippingResolutionSuccess,
} from "@/lib/shipping/resolve";
import { normalizeShopperLocation, type ShopperLocation } from "@/lib/shopper/location";

export type FulfillmentMethod = "shipping" | "none";
export type ShopperFacingDeliveryTone = "success" | "danger" | "warning" | "neutral";

export type EligibilityReason =
  | "shipping_available"
  | "shipping_calculated_at_checkout"
  | "seller_does_not_ship_to_location"
  | "weight_required_for_shipping_mode"
  | "invalid_shipping_settings"
  | "inactive_product"
  | "blocked_product"
  | "not_listable"
  | "unknown";

export type ProductShippingEligibilityResult = {
  isVisible: boolean;
  isPurchasable: boolean;
  availableMethods: FulfillmentMethod[];
  fulfillmentType: FulfillmentMethod;
  deliveryMessage: string;
  deliveryTone: ShopperFacingDeliveryTone;
  deliveryPromiseLabel: string | null;
  deliveryCutoffText: string | null;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
  eligibilityReason: EligibilityReason;
  matchedSource: ShippingResolutionSuccess["matchedSource"] | null;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  matchType: ShippingResolutionSuccess["matchType"] | null;
  pricingMode: string | null;
  batchingMode: string | null;
  baseShippingFee: number | null;
  finalShippingFee: number | null;
  debug: ShippingResolutionResult["debug"] | null;
};

export type ShippingEligibilityContext = {
  destinationKnown?: boolean;
  courierRouteSupported?: boolean | null;
  context?: Record<string, unknown> | null;
};

export type ShippingEligibilitySellerInput = {
  id?: string | null;
  sellerCode?: string | null;
  sellerSlug?: string | null;
  fulfillmentMode?: string | null;
  origin?: {
    countryCode?: string | null;
    country?: string | null;
    lat?: number | null;
    lng?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  shippingSettings?: Record<string, unknown> | null;
  deliveryProfile?: Record<string, unknown> | null;
  courierProfile?: Record<string, unknown> | null;
};

export type ShippingEligibilityProductInput = {
  placement?: {
    isActive?: boolean | null;
    blocked?: boolean | null;
  } | null;
  fulfillment?: {
    mode?: string | null;
  } | null;
  shipping?: Record<string, unknown> | null;
  localDeliveryEnabled?: boolean | null;
  collectionEnabled?: boolean | null;
  listable?: boolean | null;
  variants?: Array<Record<string, unknown>> | null;
  data?: Record<string, unknown> | null;
};

function toText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isProductActive(product: ShippingEligibilityProductInput): boolean {
  return product.placement?.isActive !== false;
}

function isProductBlocked(product: ShippingEligibilityProductInput): boolean {
  return product.placement?.blocked === true;
}

function isProductListable(product: ShippingEligibilityProductInput): boolean {
  return product.listable !== false;
}

function buildShippingPromise(minDays: number | null, maxDays: number | null): string | null {
  if (minDays == null || maxDays == null) return null;
  if (minDays === maxDays) return `${maxDays} day${maxDays === 1 ? "" : "s"} delivery`;
  return `${minDays}-${maxDays} day delivery`;
}

function buildUnknownDestinationMessage(seller: ShippingEligibilitySellerInput): string {
  const shipsFrom = seller?.shippingSettings?.shipsFrom && typeof seller.shippingSettings.shipsFrom === "object"
    ? (seller.shippingSettings.shipsFrom as Record<string, unknown>)
    : null;
  const city = toText(shipsFrom?.city);
  const province = toText(shipsFrom?.province);
  const originLabel = [city, province].filter(Boolean).join(", ");
  return originLabel ? `Seller ships from ${originLabel}` : "Shipping calculated at checkout";
}

function buildFailureResult(
  failure: ShippingResolutionFailure,
  fallbackReason: EligibilityReason,
): ProductShippingEligibilityResult {
  return {
    isVisible: false,
    isPurchasable: false,
    availableMethods: [],
    fulfillmentType: "none",
    deliveryMessage:
      failure.code === "WEIGHT_REQUIRED_FOR_SHIPPING_MODE"
        ? "Shipping unavailable until seller updates product shipping settings"
        : failure.code === "INVALID_SHIPPING_SETTINGS"
          ? "Shipping unavailable for this product"
          : "Seller does not ship to this location",
    deliveryTone: "danger",
    deliveryPromiseLabel: null,
    deliveryCutoffText: null,
    estimatedMinDays: null,
    estimatedMaxDays: null,
    eligibilityReason: fallbackReason,
    matchedSource: null,
    matchedRuleId: null,
    matchedRuleName: null,
    matchType: null,
    pricingMode: null,
    batchingMode: null,
    baseShippingFee: null,
    finalShippingFee: null,
    debug: failure.debug,
  };
}

function buildSuccessResult(success: ShippingResolutionSuccess): ProductShippingEligibilityResult {
  const promiseLabel = buildShippingPromise(success.estimatedDeliveryDays?.min ?? null, success.estimatedDeliveryDays?.max ?? null);
  return {
    isVisible: true,
    isPurchasable: true,
    availableMethods: ["shipping"],
    fulfillmentType: "shipping",
    deliveryMessage:
      success.finalShippingFee > 0 ? `Shipping from R${success.finalShippingFee.toFixed(2)}` : "Shipping available",
    deliveryTone: "success",
    deliveryPromiseLabel: promiseLabel,
    deliveryCutoffText: null,
    estimatedMinDays: success.estimatedDeliveryDays?.min ?? null,
    estimatedMaxDays: success.estimatedDeliveryDays?.max ?? null,
    eligibilityReason: "shipping_available",
    matchedSource: success.matchedSource,
    matchedRuleId: success.matchedRuleId,
    matchedRuleName: success.matchedRuleName,
    matchType: success.matchType,
    pricingMode: success.pricingMode,
    batchingMode: success.batchingMode,
    baseShippingFee: success.baseShippingFee,
    finalShippingFee: success.finalShippingFee,
    debug: success.debug,
  };
}

export function resolveProductShippingEligibility({
  product,
  seller,
  shopperLocation,
  context,
}: {
  product: ShippingEligibilityProductInput;
  seller: ShippingEligibilitySellerInput;
  shopperLocation: ShopperLocation | null | undefined;
  context?: ShippingEligibilityContext;
}): ProductShippingEligibilityResult {
  if (!isProductActive(product)) {
    return {
      isVisible: false,
      isPurchasable: false,
      availableMethods: [],
      fulfillmentType: "none",
      deliveryMessage: "This product is unavailable",
      deliveryTone: "danger",
      deliveryPromiseLabel: null,
      deliveryCutoffText: null,
      estimatedMinDays: null,
      estimatedMaxDays: null,
      eligibilityReason: "inactive_product",
      matchedSource: null,
      matchedRuleId: null,
      matchedRuleName: null,
      matchType: null,
      pricingMode: null,
      batchingMode: null,
      baseShippingFee: null,
      finalShippingFee: null,
      debug: null,
    };
  }

  if (isProductBlocked(product)) {
    return {
      isVisible: false,
      isPurchasable: false,
      availableMethods: [],
      fulfillmentType: "none",
      deliveryMessage: "This product is unavailable",
      deliveryTone: "danger",
      deliveryPromiseLabel: null,
      deliveryCutoffText: null,
      estimatedMinDays: null,
      estimatedMaxDays: null,
      eligibilityReason: "blocked_product",
      matchedSource: null,
      matchedRuleId: null,
      matchedRuleName: null,
      matchType: null,
      pricingMode: null,
      batchingMode: null,
      baseShippingFee: null,
      finalShippingFee: null,
      debug: null,
    };
  }

  if (!isProductListable(product)) {
    return {
      isVisible: false,
      isPurchasable: false,
      availableMethods: [],
      fulfillmentType: "none",
      deliveryMessage: "This product is unavailable",
      deliveryTone: "danger",
      deliveryPromiseLabel: null,
      deliveryCutoffText: null,
      estimatedMinDays: null,
      estimatedMaxDays: null,
      eligibilityReason: "not_listable",
      matchedSource: null,
      matchedRuleId: null,
      matchedRuleName: null,
      matchType: null,
      pricingMode: null,
      batchingMode: null,
      baseShippingFee: null,
      finalShippingFee: null,
      debug: null,
    };
  }

  const normalizedShopperLocation = normalizeShopperLocation(shopperLocation);
  const destinationKnown = context?.destinationKnown === true;

  if (!destinationKnown || !normalizedShopperLocation.countryCode) {
    return {
      isVisible: true,
      isPurchasable: true,
      availableMethods: ["shipping"],
      fulfillmentType: "shipping",
      deliveryMessage: buildUnknownDestinationMessage(seller),
      deliveryTone: "neutral",
      deliveryPromiseLabel: null,
      deliveryCutoffText: null,
      estimatedMinDays: null,
      estimatedMaxDays: null,
      eligibilityReason: "shipping_calculated_at_checkout",
      matchedSource: null,
      matchedRuleId: null,
      matchedRuleName: null,
      matchType: null,
      pricingMode: null,
      batchingMode: null,
      baseShippingFee: null,
      finalShippingFee: null,
      debug: null,
    };
  }

  const resolution = resolveShippingForSellerGroup({
    seller,
    items: [
      {
        quantity: 1,
        lineSubtotalIncl: 0,
        product: product.data || {},
        product_snapshot: product.data || {},
        selected_variant: Array.isArray(product.variants) ? product.variants[0] || null : null,
        selected_variant_snapshot: Array.isArray(product.variants) ? product.variants[0] || null : null,
      },
    ],
    buyerDestination: normalizedShopperLocation,
    context: context?.context || {},
  } as any);

  if (!resolution.ok) {
    return buildFailureResult(
      resolution,
      resolution.code === "WEIGHT_REQUIRED_FOR_SHIPPING_MODE"
        ? "weight_required_for_shipping_mode"
        : resolution.code === "INVALID_SHIPPING_SETTINGS"
          ? "invalid_shipping_settings"
          : "seller_does_not_ship_to_location",
    );
  }

  return buildSuccessResult(resolution);
}
