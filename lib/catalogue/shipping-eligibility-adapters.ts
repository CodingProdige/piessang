import type {
  ProductShippingEligibilityResult,
  ShippingEligibilityContext,
  ShippingEligibilityProductInput,
  ShippingEligibilitySellerInput,
} from "@/lib/catalogue/shipping-eligibility";
import { resolveProductShippingEligibility } from "@/lib/catalogue/shipping-eligibility";
import { normalizeShopperLocation, type ShopperLocation } from "@/lib/shopper/location";

function toText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveSellerPayload(item: any): Record<string, unknown> {
  const data = item?.data && typeof item.data === "object" ? item.data : {};
  return data?.seller && typeof data.seller === "object" ? (data.seller as Record<string, unknown>) : {};
}

export function buildShippingEligibilitySellerInputFromRawItem(item: any): ShippingEligibilitySellerInput {
  const seller = resolveSellerPayload(item);
  const shippingSettings =
    seller?.shippingSettings && typeof seller.shippingSettings === "object"
      ? (seller.shippingSettings as Record<string, unknown>)
      : null;
  const deliveryProfile =
    seller?.deliveryProfile && typeof seller.deliveryProfile === "object"
      ? (seller.deliveryProfile as Record<string, unknown>)
      : null;

  return {
    id: toText(seller?.uid || seller?.id || seller?.sellerId || seller?.sellerCode || ""),
    sellerCode: toText(seller?.sellerCode || ""),
    sellerSlug: toText(seller?.sellerSlug || ""),
    fulfillmentMode: toText((item?.data as any)?.fulfillment?.mode || ""),
    origin: {
      countryCode: toText((shippingSettings as any)?.shipsFrom?.countryCode || (deliveryProfile as any)?.origin?.country || ""),
      country: toText((shippingSettings as any)?.shipsFrom?.countryCode || (deliveryProfile as any)?.origin?.country || ""),
      lat: toNumber((deliveryProfile as any)?.origin?.latitude),
      lng: toNumber((deliveryProfile as any)?.origin?.longitude),
      latitude: toNumber((deliveryProfile as any)?.origin?.latitude),
      longitude: toNumber((deliveryProfile as any)?.origin?.longitude),
    },
    shippingSettings,
    deliveryProfile,
  };
}

export function buildShippingEligibilityProductInputFromRawItem(item: any): ShippingEligibilityProductInput {
  const data = item?.data && typeof item.data === "object" ? item.data : {};

  return {
    placement:
      data?.placement && typeof data.placement === "object"
        ? (data.placement as ShippingEligibilityProductInput["placement"])
        : null,
    fulfillment:
      data?.fulfillment && typeof data.fulfillment === "object"
        ? (data.fulfillment as ShippingEligibilityProductInput["fulfillment"])
        : null,
    shipping:
      data?.product && typeof data.product === "object" && (data.product as any).shipping && typeof (data.product as any).shipping === "object"
        ? ((data.product as any).shipping as Record<string, unknown>)
        : null,
    listable: (data as any)?.is_eligible_by_variant_availability !== false,
    variants: Array.isArray((data as any)?.variants)
      ? ((data as any).variants as Array<Record<string, unknown>>)
      : [],
    data,
  };
}

export function buildShopperLocationFromDeliveryArea(shopperArea: any): ShopperLocation {
  return normalizeShopperLocation({
    countryCode: shopperArea?.countryCode || shopperArea?.country || null,
    province: shopperArea?.province || shopperArea?.stateProvinceRegion || shopperArea?.region || null,
    city: shopperArea?.city || null,
    suburb: shopperArea?.suburb || null,
    postalCode: shopperArea?.postalCode || null,
    addressLine1: shopperArea?.addressLine1 || null,
    lat: shopperArea?.lat ?? shopperArea?.latitude ?? null,
    lng: shopperArea?.lng ?? shopperArea?.longitude ?? null,
    source:
      shopperArea?.countryCode || shopperArea?.country || shopperArea?.postalCode || shopperArea?.city
        ? "manual"
        : "none",
  });
}

export function buildShippingEligibilityContextFromRawItem(_item: any, shopperArea: any): ShippingEligibilityContext {
  const location = buildShopperLocationFromDeliveryArea(shopperArea);
  const destinationKnown = Boolean(location.countryCode && (location.postalCode || location.province || location.city || location.suburb));
  return { destinationKnown };
}

export function resolveRawItemShippingEligibility(item: any, shopperArea: any): ProductShippingEligibilityResult {
  return resolveProductShippingEligibility({
    product: buildShippingEligibilityProductInputFromRawItem(item),
    seller: buildShippingEligibilitySellerInputFromRawItem(item),
    shopperLocation: buildShopperLocationFromDeliveryArea(shopperArea),
    context: buildShippingEligibilityContextFromRawItem(item, shopperArea),
  });
}

export function buildShippingMessageFromEligibility(eligibility: ProductShippingEligibilityResult | null | undefined): string | null {
  if (!eligibility) return "Shipping calculated at checkout";
  return eligibility.deliveryPromiseLabel ?? eligibility.deliveryMessage ?? null;
}

export function formatEligibilityEta(eligibility: ProductShippingEligibilityResult | null | undefined): string | null {
  if (!eligibility) return null;
  const minDays = toNumber(eligibility.estimatedMinDays);
  const maxDays = toNumber(eligibility.estimatedMaxDays);
  if (minDays == null || maxDays == null) return null;
  return minDays === maxDays ? `${maxDays} day${maxDays === 1 ? "" : "s"}` : `${minDays}-${maxDays} days`;
}
