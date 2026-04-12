import type { CourierAdapter, ShippingRateQuote } from "@/lib/shipping/contracts";
import { summarizeShipmentParcels } from "@/lib/shipping/contracts";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sameCountry(requestCountry?: string | null, destinationCountry?: string | null) {
  return String(requestCountry || "").trim().toLowerCase() === String(destinationCountry || "").trim().toLowerCase();
}

export const mockLiveRateAdapter: CourierAdapter = {
  key: "mock_live_rate",
  label: "Mock Live Rate",
  async getRates(request) {
    const shipment = summarizeShipmentParcels(request.parcels || []);
    const billableWeightKg = Math.max(0, Number(shipment.billableWeightKg || 0));
    const parcelCount = Math.max(1, Number(shipment.parcelCount || 1));
    const domestic = sameCountry(request.origin?.country, request.destination?.country);
    const base = domestic ? 65 : 220;
    const parcelComponent = parcelCount > 1 ? (parcelCount - 1) * (domestic ? 18 : 45) : 0;
    const weightComponent = billableWeightKg > 0 ? billableWeightKg * (domestic ? 14 : 36) : 0;

    const economyAmount = roundMoney(base + parcelComponent + weightComponent);
    const expressAmount = roundMoney(economyAmount * (domestic ? 1.28 : 1.42));

    const quotes: ShippingRateQuote[] = [
      {
        method: "courier_live_rate",
        carrier: domestic ? "Piessang Courier Network" : "Piessang Intl Courier",
        service: domestic ? "Economy" : "International Economy",
        amountIncl: economyAmount,
        currency: request.currency || "ZAR",
        leadTimeDays: domestic ? 2 : 6,
        cutoffTime: "15:00",
        available: true,
        reasonCode: null,
        reasons: [],
        metadata: {
          adapterKey: "mock_live_rate",
          parcelCount,
          billableWeightKg,
        },
      },
      {
        method: "courier_live_rate",
        carrier: domestic ? "Piessang Courier Network" : "Piessang Intl Courier",
        service: domestic ? "Express" : "International Express",
        amountIncl: expressAmount,
        currency: request.currency || "ZAR",
        leadTimeDays: domestic ? 1 : 3,
        cutoffTime: "13:00",
        available: true,
        reasonCode: null,
        reasons: [],
        metadata: {
          adapterKey: "mock_live_rate",
          parcelCount,
          billableWeightKg,
        },
      },
    ];

    return quotes;
  },
  async createShipment() {
    throw new Error("Mock live-rate adapter does not create shipments.");
  },
  async trackShipment() {
    return [];
  },
  async cancelShipment() {
    return { ok: false, message: "Mock live-rate adapter does not cancel shipments." };
  },
};
