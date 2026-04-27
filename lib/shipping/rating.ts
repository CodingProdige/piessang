type DeprecatedQuoteResult = {
  available: false;
  kind: "deprecated";
  label: string;
  amountIncl: 0;
  amountExcl: 0;
  leadTimeDays: null;
  cutoffTime: null;
  matchedRule: null;
  unavailableReasons: string[];
  distanceKm: null;
  shipmentSummary: null;
  metadata: {
    deprecated: true;
    replacement: string;
  };
};

export async function resolveDeliveryQuote(): Promise<DeprecatedQuoteResult> {
  return {
    available: false,
    kind: "deprecated",
    label: "Legacy delivery quote deprecated",
    amountIncl: 0,
    amountExcl: 0,
    leadTimeDays: null,
    cutoffTime: null,
    matchedRule: null,
    unavailableReasons: [
      "Legacy delivery quote resolution has been deprecated. Use the canonical shipping resolver instead.",
    ],
    distanceKm: null,
    shipmentSummary: null,
    metadata: {
      deprecated: true,
      replacement: "lib/shipping/resolve.ts",
    },
  };
}
