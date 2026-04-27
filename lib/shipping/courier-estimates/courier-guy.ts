import type { CourierEstimateAdapter } from "@/lib/shipping/courier-estimates/types";

function toNum(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export const getCourierGuyEstimate: CourierEstimateAdapter = async (input) => {
  const originCountry = String(input.sellerOrigin?.countryCode || "").toUpperCase();
  const destinationCountry = String(input.destination?.countryCode || "").toUpperCase();
  if (originCountry !== "ZA" || destinationCountry !== "ZA") {
    return {
      ok: false,
      courierCode: input.courierCode,
      courierName: input.courierName,
      errorCode: "COURIER_UNAVAILABLE",
      message: "The Courier Guy estimate is only available for South African domestic routes.",
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

  const destinationProvince = String(input.destination?.province || "").trim().toLowerCase();
  const metroMultiplier = destinationProvince.includes("gauteng") || destinationProvince.includes("western cape") ? 1 : 1.12;
  const estimatedFee = (72 + weightKg * 11.5) * metroMultiplier;
  return {
    ok: true,
    courierCode: input.courierCode,
    courierName: input.courierName,
    estimatedFee: Number(estimatedFee.toFixed(2)),
    currency: "ZAR",
    minDays: 1,
    maxDays: 3,
    serviceName: "Door to Door",
    warnings: ["Advisory estimate only. Final checkout still uses your shipping settings."],
  };
};
