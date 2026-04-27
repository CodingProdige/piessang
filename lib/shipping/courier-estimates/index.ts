import { findCourierCatalogueEntry } from "@/lib/shipping/courier-estimates/courier-catalogue";
import { getCourierGuyEstimate } from "@/lib/shipping/courier-estimates/courier-guy";
import { getMockCourierEstimate } from "@/lib/shipping/courier-estimates/mock";
import { getShiplogicFallbackEstimate } from "@/lib/shipping/courier-estimates/shiplogic-fallback";
import type { CourierEstimateAdapter, CourierEstimateInput, CourierEstimateResult } from "@/lib/shipping/courier-estimates/types";

const ADAPTERS: Record<string, CourierEstimateAdapter> = {
  courier_guy: getCourierGuyEstimate,
  shiplogic_fallback: getShiplogicFallbackEstimate,
  mock: getMockCourierEstimate,
};

export async function getCourierEstimate(input: CourierEstimateInput): Promise<CourierEstimateResult> {
  const catalogue = findCourierCatalogueEntry(input.courierCode);
  const courierName = catalogue?.courierName || String(input.courierCode || "").trim();
  if (!catalogue || !catalogue.active) {
    return {
      ok: false,
      courierCode: input.courierCode,
      courierName,
      errorCode: "NOT_CONFIGURED",
      message: "That courier is not available for seller estimates.",
    };
  }

  const sellerCountry = String(input.sellerOrigin?.countryCode || "").toUpperCase();
  const destinationCountry = String(input.destination?.countryCode || "").toUpperCase();
  const domestic = sellerCountry && destinationCountry && sellerCountry === destinationCountry;
  const international = sellerCountry && destinationCountry && sellerCountry !== destinationCountry;

  if ((domestic && !catalogue.supportsDomestic) || (international && !catalogue.supportsInternational)) {
    return {
      ok: false,
      courierCode: input.courierCode,
      courierName,
      errorCode: "COURIER_UNAVAILABLE",
      message: "That courier does not support this route for estimates.",
    };
  }

  for (const providerKey of catalogue.estimateProviderPreference) {
    const adapter = ADAPTERS[providerKey];
    if (!adapter) continue;
    const result = await adapter({ ...input, courierName });
    if (result.ok || result.errorCode !== "NOT_CONFIGURED") return result;
  }

  return {
    ok: false,
    courierCode: input.courierCode,
    courierName,
    errorCode: "NOT_CONFIGURED",
    message: "No estimate adapter is configured for this courier yet.",
  };
}
