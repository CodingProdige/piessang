import type { ShipmentAddress, ShipmentParcel } from "@/lib/shipping/contracts";
import { resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";
import { normalizeSellerCourierProfile } from "@/lib/integrations/easyship-profile";
import { resolveEasyshipCategoryMapping } from "@/lib/integrations/easyship-taxonomy";
import { easyshipRateAdapter } from "@/lib/shipping/adapters/easyship";

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

type CurrentSellerCourierProfile = {
  enabled?: boolean;
  internationalEnabled?: boolean;
  handoverMode?: string;
  allowedCouriers?: string[];
  allowedDestinationCountries?: string[];
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
  courierProfile,
  productCourierEligible = false,
  quoteItems = [],
  selectedCourierQuoteId = "",
  sellerBaseLocation = "",
  shopperArea = null,
  subtotalIncl = 0,
  parcels = [],
}: {
  profile: CurrentSellerDeliveryProfile | null | undefined;
  courierProfile?: CurrentSellerCourierProfile | null | undefined;
  productCourierEligible?: boolean;
  quoteItems?: Array<Record<string, unknown>>;
  selectedCourierQuoteId?: string;
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

  if (baseResolution?.available && String(baseResolution?.kind || "") === "shipping") {
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

  const normalizedCourierProfile = normalizeSellerCourierProfile(courierProfile || {});
  const shopperCountry = toStr((shopperArea as any)?.country).toUpperCase();
  const allowedCountries = Array.isArray(normalizedCourierProfile.allowedDestinationCountries)
    ? normalizedCourierProfile.allowedDestinationCountries.map((entry) => toStr(entry).toUpperCase()).filter(Boolean)
    : [];
  const courierAllowedForCountry = !shopperCountry || !allowedCountries.length || allowedCountries.includes(shopperCountry);

  if (
    normalizedCourierProfile.enabled !== true ||
    normalizedCourierProfile.internationalEnabled === false ||
    productCourierEligible !== true ||
    !courierAllowedForCountry
  ) {
    return baseResolution;
  }

  const firstQuoteItem = Array.isArray(quoteItems) && quoteItems.length ? quoteItems[0] : null;
  const mappedCategory = resolveEasyshipCategoryMapping({
    categorySlug: toStr((firstQuoteItem as any)?.categorySlug || ""),
    subCategorySlug: toStr((firstQuoteItem as any)?.subCategorySlug || ""),
  });
  if (mappedCategory.supportLevel === "restricted") {
    return {
      ...baseResolution,
      available: false,
      kind: "unavailable",
        label: "Courier shipping unavailable for this product category",
        unavailableReasons: [
          ...(Array.isArray(baseResolution?.unavailableReasons) ? baseResolution.unavailableReasons : []),
        mappedCategory.sellerMessage || "This product category is currently restricted for Piessang-managed courier shipping.",
        ],
      };
  }

  try {
    const liveQuotes = await easyshipRateAdapter.getRates({
      sellerId: "",
      sellerShippingProfile: {} as any,
      origin: {
        country: toStr(profile?.origin?.country || ""),
        region: toStr(profile?.origin?.region || ""),
        city: toStr(profile?.origin?.city || sellerBaseLocation || ""),
        suburb: toStr(profile?.origin?.suburb || ""),
        postalCode: toStr(profile?.origin?.postalCode || ""),
      } as ShipmentAddress,
      destination: {
        country: toStr((shopperArea as any)?.country || ""),
        region: toStr((shopperArea as any)?.province || (shopperArea as any)?.stateProvinceRegion || ""),
        city: toStr((shopperArea as any)?.city || (shopperArea as any)?.suburb || ""),
        suburb: toStr((shopperArea as any)?.suburb || ""),
        postalCode: toStr((shopperArea as any)?.postalCode || ""),
      } as ShipmentAddress,
      parcels,
      subtotalIncl,
      currency: "ZAR",
      metadata: {
        courierProfile: normalizedCourierProfile,
        items: quoteItems,
      },
    } as any);

    const normalizedSelectedQuoteId = toStr(selectedCourierQuoteId);
    const availableQuotes = Array.isArray(liveQuotes) ? liveQuotes.filter((entry) => entry?.available) : [];
    const chosenQuote = normalizedSelectedQuoteId
      ? availableQuotes.find((entry) => toStr((entry?.metadata as any)?.courierId) === normalizedSelectedQuoteId)
      : [...availableQuotes].sort((a, b) => Number(a?.amountIncl || 0) - Number(b?.amountIncl || 0))[0];

    if (!chosenQuote?.available) {
      return {
        ...baseResolution,
        available: false,
        kind: "unavailable",
        label: "Courier shipping unavailable for this destination",
        unavailableReasons: [
          ...(Array.isArray(baseResolution?.unavailableReasons) ? baseResolution.unavailableReasons : []),
          "No supported courier services are currently available for this origin, destination, and product combination.",
        ],
      };
    }

    return {
      available: true,
      kind: "courier_live_rate",
      label: chosenQuote.amountIncl > 0 ? `${chosenQuote.carrier} ${chosenQuote.service}`.trim() : "Courier shipping available",
      amountIncl: Number(chosenQuote.amountIncl || 0),
      amountExcl: Number(chosenQuote.amountIncl || 0),
      leadTimeDays: chosenQuote.leadTimeDays ?? null,
      cutoffTime: chosenQuote.cutoffTime || null,
      matchedRule: {
        id: toStr((chosenQuote.metadata as any)?.courierId || "easyship-live-rate"),
        label: toStr(chosenQuote.service || chosenQuote.carrier || "Live courier rate"),
        rateMode: "live_rate",
        courierKey: "easyship",
        courierCarrier: toStr(chosenQuote.carrier),
        courierService: toStr(chosenQuote.service),
        metadata: {
          ...(chosenQuote.metadata || {}),
          availableQuotes: availableQuotes.map((entry) => ({
            id: toStr((entry?.metadata as any)?.courierId),
            carrier: toStr(entry?.carrier),
            service: toStr(entry?.service),
            amountIncl: Number(entry?.amountIncl || 0),
            currency: toStr(entry?.currency || "ZAR"),
            leadTimeDays: entry?.leadTimeDays ?? null,
            handoverOptions: Array.isArray((entry?.metadata as any)?.handoverOptions)
              ? (entry?.metadata as any).handoverOptions
              : [],
            markupAmount: Number((entry?.metadata as any)?.markupAmount || 0),
            baseAmount: Number((entry?.metadata as any)?.baseAmount || 0),
          })),
          selectedQuoteId: toStr((chosenQuote.metadata as any)?.courierId),
        },
      },
      unavailableReasons: [],
      distanceKm: null,
      shipmentSummary: baseResolution?.shipmentSummary || null,
      metadata: {
        ...(chosenQuote.metadata || {}),
        availableQuotes: availableQuotes.map((entry) => ({
          id: toStr((entry?.metadata as any)?.courierId),
          carrier: toStr(entry?.carrier),
          service: toStr(entry?.service),
          amountIncl: Number(entry?.amountIncl || 0),
          currency: toStr(entry?.currency || "ZAR"),
          leadTimeDays: entry?.leadTimeDays ?? null,
          handoverOptions: Array.isArray((entry?.metadata as any)?.handoverOptions)
            ? (entry?.metadata as any).handoverOptions
            : [],
          markupAmount: Number((entry?.metadata as any)?.markupAmount || 0),
          baseAmount: Number((entry?.metadata as any)?.baseAmount || 0),
        })),
        selectedQuoteId: toStr((chosenQuote.metadata as any)?.courierId),
      },
    };
  } catch (error: any) {
    const baseMetadata =
      baseResolution && "metadata" in baseResolution && baseResolution.metadata && typeof baseResolution.metadata === "object"
        ? baseResolution.metadata
        : {};
    return {
      ...baseResolution,
      unavailableReasons: [
        ...(Array.isArray(baseResolution?.unavailableReasons) ? baseResolution.unavailableReasons : []),
        toStr(error?.message || "Courier rates are temporarily unavailable."),
      ],
      metadata: {
        ...baseMetadata,
        debug: error?.debug && typeof error.debug === "object" ? error.debug : null,
      },
    };
  }
}
