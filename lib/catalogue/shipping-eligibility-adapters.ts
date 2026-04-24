import type {
  ProductShippingEligibilityResult,
  ShippingEligibilityContext,
  ShippingEligibilityProductInput,
  ShippingEligibilitySellerInput,
} from "@/lib/catalogue/shipping-eligibility";
import { resolveProductShippingEligibility } from "@/lib/catalogue/shipping-eligibility";
import { normalizeShopperLocation, type ShopperLocation } from "@/lib/shopper/location";
import { normalizeSellerCourierProfile } from "@/lib/integrations/easyship-profile";

function toText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildShippingEligibilitySellerInputFromRawItem(item: any): ShippingEligibilitySellerInput {
  const data = item?.data && typeof item.data === "object" ? item.data : {};
  const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
  const deliveryProfile =
    seller?.deliveryProfile && typeof seller.deliveryProfile === "object"
      ? (seller.deliveryProfile as ShippingEligibilitySellerInput["deliveryProfile"])
      : null;
  const deliveryProfileRecord =
    seller?.deliveryProfile && typeof seller.deliveryProfile === "object"
      ? (seller.deliveryProfile as Record<string, unknown>)
      : null;
  const courierProfile =
    seller?.courierProfile && typeof seller.courierProfile === "object"
      ? (seller.courierProfile as Record<string, unknown>)
      : null;
  const origin =
    deliveryProfileRecord?.origin && typeof deliveryProfileRecord.origin === "object"
      ? (deliveryProfileRecord.origin as Record<string, unknown>)
      : null;

  return {
    fulfillmentMode: toText((data as any)?.fulfillment?.mode),
    origin: {
      countryCode: toText((origin as any)?.country || ""),
      country: toText((origin as any)?.country || ""),
      lat: toNumber((origin as any)?.latitude),
      lng: toNumber((origin as any)?.longitude),
      latitude: toNumber((origin as any)?.latitude),
      longitude: toNumber((origin as any)?.longitude),
    },
    deliveryProfile: deliveryProfile || null,
    courierProfile,
  };
}

export function buildShippingEligibilityProductInputFromRawItem(item: any): ShippingEligibilityProductInput {
  const data = item?.data && typeof item.data === "object" ? item.data : {};
  const product = data?.product && typeof data.product === "object" ? data.product : {};

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
      product?.shipping && typeof product.shipping === "object"
        ? (product.shipping as Record<string, unknown>)
        : null,
    localDeliveryEnabled: (product as any)?.localDeliveryEnabled ?? true,
    collectionEnabled: (product as any)?.collectionEnabled ?? true,
    listable: (data as any)?.is_eligible_by_variant_availability !== false,
    variants: Array.isArray((data as any)?.variants)
      ? ((data as any).variants as Array<Record<string, unknown>>)
      : [],
  };
}

function normalizeCountry(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function buildShopperLocationFromDeliveryArea(shopperArea: any): ShopperLocation {
  return normalizeShopperLocation({
    countryCode: shopperArea?.country || null,
    province: shopperArea?.province || shopperArea?.stateProvinceRegion || null,
    city: shopperArea?.city || null,
    suburb: shopperArea?.suburb || null,
    postalCode: shopperArea?.postalCode || null,
    addressLine1: shopperArea?.addressLine1 || null,
    lat: shopperArea?.latitude ?? null,
    lng: shopperArea?.longitude ?? null,
    source: shopperArea?.country ? "manual" : "none",
    precision:
      Number.isFinite(Number(shopperArea?.latitude)) && Number.isFinite(Number(shopperArea?.longitude))
        ? "coordinates"
        : shopperArea?.country
          ? "country"
          : "none",
  });
}

export function buildShippingEligibilityContextFromRawItem(item: any, shopperArea: any): ShippingEligibilityContext {
  const courierProfile = normalizeSellerCourierProfile(item?.data?.seller?.courierProfile || {});
  const allowedCountries = Array.isArray(courierProfile.allowedDestinationCountries)
    ? courierProfile.allowedDestinationCountries.map((entry) => normalizeCountry(entry)).filter(Boolean)
    : [];
  const shopperCountry = normalizeCountry(shopperArea?.country);
  if (!shopperCountry || !allowedCountries.length) {
    return { courierRouteSupported: true };
  }
  return { courierRouteSupported: allowedCountries.includes(shopperCountry) };
}

export function resolveRawItemShippingEligibility(item: any, shopperArea: any): ProductShippingEligibilityResult {
  return resolveProductShippingEligibility({
    product: buildShippingEligibilityProductInputFromRawItem(item),
    seller: buildShippingEligibilitySellerInputFromRawItem(item),
    shopperLocation: buildShopperLocationFromDeliveryArea(shopperArea),
    context: buildShippingEligibilityContextFromRawItem(item, shopperArea),
  });
}
