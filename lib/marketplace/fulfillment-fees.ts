export type FulfillmentWeightTier = {
  code: string;
  title: string;
  minKg: number;
  maxKg: number;
};

export type FulfillmentSizeTier = {
  code: string;
  title: string;
  minVolumeCm3?: number;
  maxVolumeCm3?: number;
  prices: Record<string, number>;
};

export type FulfillmentFeeTable = {
  weightTiers: FulfillmentWeightTier[];
  sizeTiers: FulfillmentSizeTier[];
};

export type GetFulfillmentFeeInput = {
  weightKg: number;
  volumeCm3: number;
  table: FulfillmentFeeTable;
};

export type GetFulfillmentFeeResult =
  | {
      ok: true;
      data: {
        weightTier: string;
        sizeTier: string;
        fee: number;
      };
    }
  | {
      ok: false;
      error: string;
    };

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMin(value: number | undefined) {
  return value == null ? Number.NEGATIVE_INFINITY : value;
}

function normalizeMax(value: number | undefined) {
  return value == null ? Number.POSITIVE_INFINITY : value;
}

function matchesExclusiveInclusive(value: number, min: number | undefined, max: number | undefined) {
  const minValue = normalizeMin(min);
  const maxValue = normalizeMax(max);
  return value > minValue && value <= maxValue;
}

function validateWeightTier(tier: FulfillmentWeightTier, index: number) {
  if (!tier || typeof tier !== "object") return `weightTiers[${index}] must be an object.`;
  if (typeof tier.code !== "string" || !tier.code.trim()) return `weightTiers[${index}].code is required.`;
  if (typeof tier.title !== "string" || !tier.title.trim()) return `weightTiers[${index}].title is required.`;
  if (!isFiniteNumber(tier.minKg)) return `weightTiers[${index}].minKg must be a finite number.`;
  if (!isFiniteNumber(tier.maxKg)) return `weightTiers[${index}].maxKg must be a finite number.`;
  if (!(tier.maxKg > tier.minKg)) return `weightTiers[${index}] must have maxKg greater than minKg.`;
  return null;
}

function validateSizeTier(tier: FulfillmentSizeTier, index: number) {
  if (!tier || typeof tier !== "object") return `sizeTiers[${index}] must be an object.`;
  if (typeof tier.code !== "string" || !tier.code.trim()) return `sizeTiers[${index}].code is required.`;
  if (typeof tier.title !== "string" || !tier.title.trim()) return `sizeTiers[${index}].title is required.`;
  if (tier.minVolumeCm3 != null && !isFiniteNumber(tier.minVolumeCm3)) {
    return `sizeTiers[${index}].minVolumeCm3 must be a finite number when provided.`;
  }
  if (tier.maxVolumeCm3 != null && !isFiniteNumber(tier.maxVolumeCm3)) {
    return `sizeTiers[${index}].maxVolumeCm3 must be a finite number when provided.`;
  }
  if (tier.minVolumeCm3 != null && tier.maxVolumeCm3 != null && !(tier.maxVolumeCm3 > tier.minVolumeCm3)) {
    return `sizeTiers[${index}] must have maxVolumeCm3 greater than minVolumeCm3.`;
  }
  if (!tier.prices || typeof tier.prices !== "object" || Array.isArray(tier.prices)) {
    return `sizeTiers[${index}].prices must be an object.`;
  }
  for (const [key, value] of Object.entries(tier.prices)) {
    if (!key.trim()) return `sizeTiers[${index}].prices contains an empty weight tier key.`;
    if (!isFiniteNumber(value)) return `sizeTiers[${index}].prices.${key} must be a finite number.`;
  }
  return null;
}

function hasOverlap<T>(
  tiers: T[],
  getMin: (tier: T) => number | undefined,
  getMax: (tier: T) => number | undefined,
) {
  for (let index = 0; index < tiers.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < tiers.length; compareIndex += 1) {
      const leftMin = normalizeMin(getMin(tiers[index]));
      const leftMax = normalizeMax(getMax(tiers[index]));
      const rightMin = normalizeMin(getMin(tiers[compareIndex]));
      const rightMax = normalizeMax(getMax(tiers[compareIndex]));

      const overlaps = leftMin < rightMax && rightMin < leftMax;
      if (overlaps) return true;
    }
  }
  return false;
}

export function getFulfillmentFee({
  weightKg,
  volumeCm3,
  table,
}: GetFulfillmentFeeInput): GetFulfillmentFeeResult {
  if (!isFiniteNumber(weightKg) || weightKg <= 0) {
    return { ok: false, error: "weightKg must be a finite number greater than 0." };
  }

  if (!isFiniteNumber(volumeCm3) || volumeCm3 <= 0) {
    return { ok: false, error: "volumeCm3 must be a finite number greater than 0." };
  }

  if (!table || typeof table !== "object") {
    return { ok: false, error: "table must be a valid fulfillment fee table object." };
  }

  const weightTiers = Array.isArray(table.weightTiers) ? [...table.weightTiers] : null;
  const sizeTiers = Array.isArray(table.sizeTiers) ? [...table.sizeTiers] : null;

  if (!weightTiers || !weightTiers.length) {
    return { ok: false, error: "table.weightTiers must contain at least one tier." };
  }

  if (!sizeTiers || !sizeTiers.length) {
    return { ok: false, error: "table.sizeTiers must contain at least one tier." };
  }

  for (let index = 0; index < weightTiers.length; index += 1) {
    const error = validateWeightTier(weightTiers[index], index);
    if (error) return { ok: false, error };
  }

  for (let index = 0; index < sizeTiers.length; index += 1) {
    const error = validateSizeTier(sizeTiers[index], index);
    if (error) return { ok: false, error };
  }

  if (hasOverlap(weightTiers, (tier) => tier.minKg, (tier) => tier.maxKg)) {
    return { ok: false, error: "weightTiers contain overlapping ranges." };
  }

  if (hasOverlap(sizeTiers, (tier) => tier.minVolumeCm3, (tier) => tier.maxVolumeCm3)) {
    return { ok: false, error: "sizeTiers contain overlapping ranges." };
  }

  const matchingWeightTiers = weightTiers.filter((tier) => matchesExclusiveInclusive(weightKg, tier.minKg, tier.maxKg));
  if (matchingWeightTiers.length !== 1) {
    return {
      ok: false,
      error:
        matchingWeightTiers.length === 0
          ? "No matching weight tier found."
          : "Multiple matching weight tiers found.",
    };
  }

  const matchingSizeTiers = sizeTiers.filter((tier) =>
    matchesExclusiveInclusive(volumeCm3, tier.minVolumeCm3, tier.maxVolumeCm3),
  );
  if (matchingSizeTiers.length !== 1) {
    return {
      ok: false,
      error:
        matchingSizeTiers.length === 0
          ? "No matching size tier found."
          : "Multiple matching size tiers found.",
    };
  }

  const weightTier = matchingWeightTiers[0];
  const sizeTier = matchingSizeTiers[0];
  const fee = sizeTier.prices[weightTier.code];

  if (!isFiniteNumber(fee)) {
    return {
      ok: false,
      error: `No fulfillment fee exists for size tier "${sizeTier.code}" and weight tier "${weightTier.code}".`,
    };
  }

  return {
    ok: true,
    data: {
      weightTier: weightTier.code,
      sizeTier: sizeTier.code,
      fee,
    },
  };
}

