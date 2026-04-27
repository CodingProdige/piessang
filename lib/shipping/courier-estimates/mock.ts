import type { CourierEstimateAdapter } from "@/lib/shipping/courier-estimates/types";

function toNum(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export const getMockCourierEstimate: CourierEstimateAdapter = async (input) => {
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

  const domestic = String(input.sellerOrigin?.countryCode || "").toUpperCase() === String(input.destination?.countryCode || "").toUpperCase();
  const estimatedFee = domestic ? 95 + weightKg * 14 : 320 + weightKg * 38;
  return {
    ok: true,
    courierCode: input.courierCode,
    courierName: input.courierName,
    estimatedFee: Number(estimatedFee.toFixed(2)),
    currency: "ZAR",
    minDays: domestic ? 2 : 5,
    maxDays: domestic ? 4 : 8,
    serviceName: domestic ? "Economy Road" : "International Express",
    warnings: ["Advisory estimate only. Checkout still uses your saved shipping rules."],
  };
};
