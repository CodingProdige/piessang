import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function getShopperSelectedCountryLabel(shopperArea?: { country?: string | null } | null) {
  return String(shopperArea?.country || "").trim();
}

export function isProductEligibleForShopperCountry(
  item: {
    data?: {
      fulfillment?: { mode?: string | null };
      seller?: { deliveryProfile?: Record<string, unknown> | null };
    };
  } | null | undefined,
  shopperCountry?: string | null,
) {
  const normalizedCountry = normalizeText(shopperCountry);
  if (!normalizedCountry) return true;

  const fulfillmentMode = normalizeText(item?.data?.fulfillment?.mode);
  if (fulfillmentMode !== "seller") return true;

  const profile = item?.data?.seller?.deliveryProfile;
  if (!profile || typeof profile !== "object") return true;

  const normalized = normalizeSellerDeliveryProfile(profile);
  const signals: boolean[] = [];

  const originCountry = normalizeText(normalized.origin?.country);
  const localOnlyEnabled =
    normalized.directDelivery?.enabled === true || normalized.pickup?.enabled === true;
  if (localOnlyEnabled && originCountry) {
    signals.push(originCountry === normalizedCountry);
  }

  const shippingZoneCountries = Array.isArray(normalized.shippingZones)
    ? normalized.shippingZones
        .map((zone) => normalizeText(zone?.country))
        .filter(Boolean)
    : [];
  if (shippingZoneCountries.length) {
    signals.push(shippingZoneCountries.includes(normalizedCountry));
  }

  if (!signals.length) return true;
  return signals.includes(true);
}
