import type { CourierEstimateAdapter } from "@/lib/shipping/courier-estimates/types";

function toNum(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const COURIER_BASE: Record<string, { base: number; perKg: number; minDays: number; maxDays: number; serviceName: string }> = {
  ram: { base: 88, perKg: 13, minDays: 2, maxDays: 4, serviceName: "Regional Express" },
  fastway: { base: 82, perKg: 12, minDays: 2, maxDays: 5, serviceName: "Fastway Saver" },
  aramex: { base: 89, perKg: 14, minDays: 2, maxDays: 4, serviceName: "Aramex Road" },
  pudo: { base: 70, perKg: 10, minDays: 2, maxDays: 5, serviceName: "Locker Delivery Estimate" },
  pargo: { base: 68, perKg: 9, minDays: 2, maxDays: 5, serviceName: "Pargo Delivery Estimate" },
};

export const getShiplogicFallbackEstimate: CourierEstimateAdapter = async (input) => {
  const originCountry = String(input.sellerOrigin?.countryCode || "").toUpperCase();
  const destinationCountry = String(input.destination?.countryCode || "").toUpperCase();
  if (originCountry !== "ZA" || destinationCountry !== "ZA") {
    return {
      ok: false,
      courierCode: input.courierCode,
      courierName: input.courierName,
      errorCode: "COURIER_UNAVAILABLE",
      message: "This courier estimate is only available for South African domestic routes right now.",
    };
  }

  const config = COURIER_BASE[input.courierCode];
  if (!config) {
    return {
      ok: false,
      courierCode: input.courierCode,
      courierName: input.courierName,
      errorCode: "NOT_CONFIGURED",
      message: "No estimate adapter is configured for this courier yet.",
    };
  }

  const weightKg = Math.max(0, toNum(input.parcel?.weightKg, 0));
  if (!weightKg) {
    return {
      ok: false,
      courierCode: input.courierCode,
      courierName: input.courierName,
      errorCode: "INVALID_INPUT",
      message: "Weight is required for a courier estimate.",
    };
  }

  const estimatedFee = config.base + weightKg * config.perKg;
  return {
    ok: true,
    courierCode: input.courierCode,
    courierName: input.courierName,
    estimatedFee: Number(estimatedFee.toFixed(2)),
    currency: "ZAR",
    minDays: config.minDays,
    maxDays: config.maxDays,
    serviceName: config.serviceName,
    warnings: ["Estimated with an internal fallback provider. Advisory only."],
  };
};
