import type { ShipmentAddress, ShipmentParcel } from "@/lib/shipping/contracts";
import { resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";

type CurrentShippingZone = {
  id?: string;
  label?: string;
  country?: string;
  leadTimeDays?: number;
  cutoffTime?: string | null;
};

type CurrentSellerDeliveryProfile = {
  origin?: ShipmentAddress & { utcOffsetMinutes?: number | null };
  directDelivery?: {
    enabled?: boolean;
    radiusKm?: number;
    leadTimeDays?: number;
    cutoffTime?: string | null;
    pricingRules?: Array<unknown>;
  };
  shippingZones?: CurrentShippingZone[];
  pickup?: {
    enabled?: boolean;
    leadTimeDays?: number;
  };
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getShippingZoneByMatchedRule(profile: CurrentSellerDeliveryProfile | null | undefined, matchedRule: any) {
  const zoneId = toStr(matchedRule?.zoneId);
  const zones = Array.isArray(profile?.shippingZones) ? profile.shippingZones : [];
  return zones.find((zone) => toStr(zone?.id) === zoneId) || null;
}

export async function resolveDeliveryQuote({
  profile,
  sellerBaseLocation = "",
  shopperArea = null,
  subtotalIncl = 0,
  parcels = [],
}: {
  profile: CurrentSellerDeliveryProfile | null | undefined;
  sellerBaseLocation?: string;
  shopperArea?: Record<string, unknown> | null;
  subtotalIncl?: number;
  parcels?: ShipmentParcel[];
  currency?: string;
}) {
  const baseResolution = resolveSellerDeliveryOption({
    profile: profile || {},
    sellerBaseLocation,
    shopperArea,
    subtotalIncl,
    parcels,
  } as any);

  if (!baseResolution?.available || String(baseResolution?.kind || "") !== "shipping") {
    return baseResolution;
  }

  const matchedZone = getShippingZoneByMatchedRule(profile || {}, baseResolution?.matchedRule);
  if (!matchedZone) return baseResolution;

  return {
    ...baseResolution,
    matchedRule: {
      ...(baseResolution?.matchedRule || {}),
      zoneId: toStr(matchedZone?.id),
      zoneLabel: toStr(matchedZone?.label || matchedZone?.country),
      rateMode: "flat",
      courierKey: null,
      courierCarrier: null,
      courierService: null,
    },
  };
}
