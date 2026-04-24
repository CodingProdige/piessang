import { buildShipmentParcelFromVariant } from "@/lib/shipping/contracts";
import { normalizeProductCourierSettings, normalizeSellerCourierProfile } from "@/lib/integrations/easyship-profile";
import { normalizeShopperLocation, type ShopperLocation } from "@/lib/shopper/location";

export type FulfillmentMethod =
  | "local_delivery"
  | "courier"
  | "none";

export type ShopperFacingDeliveryTone = "success" | "danger" | "warning" | "neutral";

export type EligibilityReason =
  | "visible_local"
  | "visible_courier"
  | "missing_shopper_location"
  | "outside_local_radius"
  | "seller_local_disabled"
  | "seller_courier_disabled"
  | "product_courier_disabled"
  | "missing_origin_coordinates"
  | "missing_origin_country"
  | "missing_parcel_metadata"
  | "easyship_route_unsupported"
  | "easyship_precheck_incomplete"
  | "inactive_product"
  | "blocked_product"
  | "not_listable"
  | "unknown";

export type ProductShippingEligibilityResult = {
  isVisible: boolean;
  isPurchasable: boolean;
  localDeliveryEligible: boolean;
  courierEligible: boolean;
  collectionEligible: boolean;
  availableMethods: FulfillmentMethod[];
  fulfillmentType: FulfillmentMethod;
  deliveryMessage: string;
  deliveryTone: ShopperFacingDeliveryTone;
  deliveryPromiseLabel: string | null;
  deliveryCutoffText: string | null;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
  eligibilityReason: EligibilityReason;
};

export type ShippingEligibilityContext = {
  courierRouteSupported?: boolean | null;
};

export type ShippingEligibilitySellerInput = {
  fulfillmentMode?: string | null;
  origin?: {
    countryCode?: string | null;
    country?: string | null;
    lat?: number | null;
    lng?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  deliveryProfile?: {
    directDelivery?: {
      enabled?: boolean | null;
      radiusKm?: number | null;
      leadTimeDays?: number | null;
      minLeadTimeDays?: number | null;
      maxLeadTimeDays?: number | null;
    } | null;
    pickup?: {
      enabled?: boolean | null;
      leadTimeDays?: number | null;
    } | null;
    collection?: {
      enabled?: boolean | null;
      leadTimeDays?: number | null;
    } | null;
  } | null;
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
};

type EligibilityFlags = {
  localDeliveryEligible: boolean;
  courierEligible: boolean;
  collectionEligible: boolean;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeCountryCode(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || null;
}

function normalizeCoordinate(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isFalse(value: unknown): boolean {
  return value === false;
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function getProductFulfillmentMode(product: ShippingEligibilityProductInput, seller: ShippingEligibilitySellerInput): string {
  return normalizeText(product.fulfillment?.mode ?? seller.fulfillmentMode);
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

function productLocalDeliveryAllowed(product: ShippingEligibilityProductInput): boolean {
  return !isFalse(product.localDeliveryEnabled);
}

function haversineDistanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function getLocalEta(deliveryProfile: ShippingEligibilitySellerInput["deliveryProfile"]) {
  const direct = deliveryProfile?.directDelivery;
  const minDays = Number(
    direct?.minLeadTimeDays ??
      direct?.leadTimeDays ??
      null,
  );
  const maxDays = Number(
    direct?.maxLeadTimeDays ??
      direct?.leadTimeDays ??
      null,
  );
  return {
    min: Number.isFinite(minDays) && minDays >= 0 ? minDays : null,
    max: Number.isFinite(maxDays) && maxDays >= 0 ? maxDays : null,
  };
}

// Local delivery is only eligible when both seller and shopper coordinates exist
// and the shopper falls within the seller's configured delivery radius.
function resolveLocalDeliveryEligibility(
  product: ShippingEligibilityProductInput,
  seller: ShippingEligibilitySellerInput,
  shopperLocation: ShopperLocation,
): { eligible: boolean; reason: EligibilityReason; estimatedMinDays: number | null; estimatedMaxDays: number | null } {
  const deliveryProfile = seller.deliveryProfile;
  const localEnabled = deliveryProfile?.directDelivery?.enabled === true;
  if (!localEnabled) {
    return { eligible: false, reason: "seller_local_disabled", estimatedMinDays: null, estimatedMaxDays: null };
  }
  if (!productLocalDeliveryAllowed(product)) {
    return { eligible: false, reason: "seller_local_disabled", estimatedMinDays: null, estimatedMaxDays: null };
  }

  const originLat = normalizeCoordinate(seller.origin?.lat ?? seller.origin?.latitude);
  const originLng = normalizeCoordinate(seller.origin?.lng ?? seller.origin?.longitude);
  if (originLat == null || originLng == null) {
    return { eligible: false, reason: "missing_origin_coordinates", estimatedMinDays: null, estimatedMaxDays: null };
  }
  if (typeof shopperLocation.lat !== "number" || typeof shopperLocation.lng !== "number") {
    return { eligible: false, reason: "missing_shopper_location", estimatedMinDays: null, estimatedMaxDays: null };
  }

  const radiusKm = Number(deliveryProfile?.directDelivery?.radiusKm ?? 0);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    return { eligible: false, reason: "seller_local_disabled", estimatedMinDays: null, estimatedMaxDays: null };
  }

  const distanceKm = haversineDistanceKm(originLat, originLng, shopperLocation.lat, shopperLocation.lng);
  if (distanceKm > radiusKm) {
    return { eligible: false, reason: "outside_local_radius", estimatedMinDays: null, estimatedMaxDays: null };
  }

  const eta = getLocalEta(deliveryProfile);
  return {
    eligible: true,
    reason: "visible_local",
    estimatedMinDays: eta.min,
    estimatedMaxDays: eta.max,
  };
}

function variantHasParcelMetadata(variant: Record<string, unknown> | null | undefined): boolean {
  const parcel = buildShipmentParcelFromVariant(variant);
  if (!parcel) return false;
  const hasWeight = typeof parcel.actualWeightKg === "number" && parcel.actualWeightKg > 0;
  const hasDimensions =
    typeof parcel.lengthCm === "number" &&
    parcel.lengthCm > 0 &&
    typeof parcel.widthCm === "number" &&
    parcel.widthCm > 0 &&
    typeof parcel.heightCm === "number" &&
    parcel.heightCm > 0;
  return hasWeight && hasDimensions;
}

function productHasParcelMetadata(product: ShippingEligibilityProductInput): boolean {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return variants.some((variant) => variantHasParcelMetadata(variant));
}

// Courier pre-eligibility is strict: seller, product, origin country, shopper country,
// parcel metadata, and Easyship route support must all pass before courier can expose visibility.
function resolveCourierEligibility(
  product: ShippingEligibilityProductInput,
  seller: ShippingEligibilitySellerInput,
  shopperLocation: ShopperLocation,
  context: ShippingEligibilityContext,
): { eligible: boolean; reason: EligibilityReason } {
  const courierProfile = normalizeSellerCourierProfile(seller.courierProfile || {});
  if (!courierProfile.enabled) {
    return { eligible: false, reason: "seller_courier_disabled" };
  }

  const productShipping = normalizeProductCourierSettings(product.shipping || {});
  if (!productShipping.courierEnabled) {
    return { eligible: false, reason: "product_courier_disabled" };
  }

  const originCountry = normalizeCountryCode(seller.origin?.countryCode ?? seller.origin?.country);
  if (!originCountry) {
    return { eligible: false, reason: "missing_origin_country" };
  }
  const shopperCountry = normalizeCountryCode(shopperLocation.countryCode);
  if (!shopperCountry) {
    return { eligible: false, reason: "missing_shopper_location" };
  }

  if (!productHasParcelMetadata(product)) {
    return { eligible: false, reason: "missing_parcel_metadata" };
  }

  if (context.courierRouteSupported == null) {
    return { eligible: false, reason: "easyship_precheck_incomplete" };
  }

  if (context.courierRouteSupported !== true) {
    return { eligible: false, reason: "easyship_route_unsupported" };
  }

  return { eligible: true, reason: "visible_courier" };
}

// Collection is visible only for same-country shoppers. It does not create cross-border visibility.
function resolvePrimaryFulfillment(flags: EligibilityFlags): FulfillmentMethod {
  if (flags.localDeliveryEligible) return "local_delivery";
  if (flags.courierEligible) return "courier";
  return "none";
}

function buildAvailableMethods(flags: EligibilityFlags): FulfillmentMethod[] {
  const methods: FulfillmentMethod[] = [];
  if (flags.localDeliveryEligible) methods.push("local_delivery");
  if (flags.courierEligible) methods.push("courier");
  return methods;
}

function buildLocalDeliveryPromise(
  estimatedMinDays: number | null,
  estimatedMaxDays: number | null,
): string | null {
  if (estimatedMinDays == null || estimatedMaxDays == null) return null;
  if (estimatedMaxDays <= 0) return "Delivered today";
  if (estimatedMinDays <= 1 && estimatedMaxDays <= 1) return "Delivered tomorrow";
  if (estimatedMinDays === estimatedMaxDays) return `Get it in ${estimatedMaxDays} days`;
  return `Get it in ${estimatedMinDays}-${estimatedMaxDays} days`;
}

// Visibility answers whether a shopper-facing fulfillment path exists at all.
// Purchasability follows the same rule in Phase 1 because deep quote validation
// has not yet been integrated into this resolver.
function buildResult(args: {
  flags: EligibilityFlags;
  fulfillmentType: FulfillmentMethod;
  eligibilityReason: EligibilityReason;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
}): ProductShippingEligibilityResult {
  const availableMethods = buildAvailableMethods(args.flags);
  const isVisible = availableMethods.length > 0;
  const isPurchasable = isVisible;

  let deliveryMessage = "Unavailable for this shopper location";
  let deliveryTone: ShopperFacingDeliveryTone = isVisible ? "success" : "danger";
  let deliveryPromiseLabel: string | null = null;
  let deliveryCutoffText: string | null = null;
  if (args.fulfillmentType === "local_delivery") {
    deliveryPromiseLabel = buildLocalDeliveryPromise(args.estimatedMinDays, args.estimatedMaxDays);
    deliveryMessage =
      args.estimatedMinDays != null && args.estimatedMaxDays != null
        ? args.estimatedMinDays === args.estimatedMaxDays
          ? `Local delivery in ${args.estimatedMinDays} day${args.estimatedMinDays === 1 ? "" : "s"}`
          : `Local delivery in ${args.estimatedMinDays}-${args.estimatedMaxDays} days`
        : "Local delivery available";
  } else if (args.fulfillmentType === "courier") {
    // Courier pre-eligibility can make an item visible before a full quote exists.
    // In that state we stay truthful and avoid promising a date.
    deliveryMessage = "Shipping available";
  }
  if (!isVisible) {
    deliveryTone = "danger";
  }

  return {
    isVisible,
    isPurchasable,
    localDeliveryEligible: args.flags.localDeliveryEligible,
    courierEligible: args.flags.courierEligible,
    collectionEligible: false,
    availableMethods,
    fulfillmentType: args.fulfillmentType,
    deliveryMessage,
    deliveryTone,
    deliveryPromiseLabel,
    deliveryCutoffText,
    estimatedMinDays: args.fulfillmentType === "local_delivery" ? args.estimatedMinDays : null,
    estimatedMaxDays: args.fulfillmentType === "local_delivery" ? args.estimatedMaxDays : null,
    eligibilityReason: args.eligibilityReason,
  };
}

export function resolveProductShippingEligibility({
  product,
  seller,
  shopperLocation,
  context = {},
}: {
  product: ShippingEligibilityProductInput;
  seller: ShippingEligibilitySellerInput;
  shopperLocation: ShopperLocation | null | undefined;
  context?: ShippingEligibilityContext;
}): ProductShippingEligibilityResult {
  if (!isProductActive(product)) {
    return buildResult({
      flags: { localDeliveryEligible: false, courierEligible: false, collectionEligible: false },
      fulfillmentType: "none",
      eligibilityReason: "inactive_product",
      estimatedMinDays: null,
      estimatedMaxDays: null,
    });
  }
  if (isProductBlocked(product)) {
    return buildResult({
      flags: { localDeliveryEligible: false, courierEligible: false, collectionEligible: false },
      fulfillmentType: "none",
      eligibilityReason: "blocked_product",
      estimatedMinDays: null,
      estimatedMaxDays: null,
    });
  }
  if (!isProductListable(product)) {
    return buildResult({
      flags: { localDeliveryEligible: false, courierEligible: false, collectionEligible: false },
      fulfillmentType: "none",
      eligibilityReason: "not_listable",
      estimatedMinDays: null,
      estimatedMaxDays: null,
    });
  }

  const normalizedShopperLocation = normalizeShopperLocation(shopperLocation);
  const fulfillmentMode = getProductFulfillmentMode(product, seller);
  if (fulfillmentMode && fulfillmentMode !== "seller") {
    return buildResult({
      flags: { localDeliveryEligible: false, courierEligible: false, collectionEligible: false },
      fulfillmentType: "none",
      eligibilityReason: "unknown",
      estimatedMinDays: null,
      estimatedMaxDays: null,
    });
  }

  const local = resolveLocalDeliveryEligibility(product, seller, normalizedShopperLocation);
  const courier = resolveCourierEligibility(product, seller, normalizedShopperLocation, context);
  const flags: EligibilityFlags = {
    localDeliveryEligible: local.eligible,
    courierEligible: courier.eligible,
    collectionEligible: false,
  };
  const fulfillmentType = resolvePrimaryFulfillment(flags);

  let eligibilityReason: EligibilityReason = "unknown";
  if (fulfillmentType === "local_delivery") {
    eligibilityReason = local.reason;
  } else if (fulfillmentType === "courier") {
    eligibilityReason = courier.reason;
  } else {
    eligibilityReason =
      local.reason !== "visible_local"
        ? local.reason
        : courier.reason !== "visible_courier"
          ? courier.reason
          : "unknown";
  }

  return buildResult({
    flags,
    fulfillmentType,
    eligibilityReason,
    estimatedMinDays: local.estimatedMinDays,
    estimatedMaxDays: local.estimatedMaxDays,
  });
}
