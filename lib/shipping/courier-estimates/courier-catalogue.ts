import type { CourierEstimateCatalogueEntry } from "@/lib/shipping/courier-estimates/types";

export const DIRECT_COURIER_CATALOGUE: CourierEstimateCatalogueEntry[] = [
  {
    courierCode: "the_courier_guy",
    courierName: "The Courier Guy",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["courier_guy", "shiplogic_fallback"],
    supportsDomestic: true,
    supportsInternational: false,
    active: true,
  },
  {
    courierCode: "ram",
    courierName: "RAM",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["shiplogic_fallback"],
    supportsDomestic: true,
    supportsInternational: false,
    active: true,
  },
  {
    courierCode: "fedex",
    courierName: "FedEx",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["mock"],
    supportsDomestic: true,
    supportsInternational: true,
    active: true,
  },
  {
    courierCode: "dhl",
    courierName: "DHL",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["mock"],
    supportsDomestic: true,
    supportsInternational: true,
    active: true,
  },
  {
    courierCode: "fastway",
    courierName: "Fastway",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["shiplogic_fallback"],
    supportsDomestic: true,
    supportsInternational: false,
    active: true,
  },
  {
    courierCode: "aramex",
    courierName: "Aramex",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["shiplogic_fallback"],
    supportsDomestic: true,
    supportsInternational: true,
    active: true,
  },
  {
    courierCode: "pudo",
    courierName: "PUDO",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["shiplogic_fallback"],
    supportsDomestic: true,
    supportsInternational: false,
    active: true,
  },
  {
    courierCode: "pargo",
    courierName: "Pargo",
    countryCodes: ["ZA"],
    estimateProviderPreference: ["shiplogic_fallback"],
    supportsDomestic: true,
    supportsInternational: false,
    active: true,
  },
];

export function getDirectCourierCatalogue() {
  return DIRECT_COURIER_CATALOGUE.filter((entry) => entry.active);
}

export function findCourierCatalogueEntry(courierCode: string) {
  const normalized = String(courierCode || "").trim().toLowerCase();
  return DIRECT_COURIER_CATALOGUE.find((entry) => entry.courierCode === normalized) || null;
}
