import { normalizeMoneyAmount } from "@/lib/money";
import type { ShippingBatchingMode, ShippingRateOverride } from "@/lib/shipping/settings";

export type ShippingPricedItem = {
  productId: string;
  variantId: string;
  quantity: number;
  lineSubtotalIncl: number;
  weightKg: number | null;
};

export type ShippingPricingResult = {
  baseShippingFee: number;
  batchingMode: ShippingBatchingMode;
  pricingMode: string;
  errors: string[];
};

function toNum(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundMoney(value: number): number {
  return normalizeMoneyAmount(value);
}

function positiveWeight(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function computeCombinedWeight(items: ShippingPricedItem[]): { totalWeightKg: number; missingWeight: boolean } {
  let totalWeightKg = 0;
  let missingWeight = false;
  for (const item of items) {
    const quantity = Math.max(0, Math.trunc(toNum(item.quantity, 0)));
    const weight = positiveWeight(item.weightKg);
    if (weight == null) {
      missingWeight = true;
      continue;
    }
    totalWeightKg += weight * quantity;
  }
  return { totalWeightKg, missingWeight };
}

function countUnits(items: ShippingPricedItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, Math.trunc(toNum(item.quantity, 0))), 0);
}

function expandToUnits(items: ShippingPricedItem[]): ShippingPricedItem[] {
  const units: ShippingPricedItem[] = [];
  for (const item of items) {
    const quantity = Math.max(0, Math.trunc(toNum(item.quantity, 0)));
    if (quantity <= 0) continue;
    const perUnitSubtotal = quantity > 0 ? toNum(item.lineSubtotalIncl, 0) / quantity : 0;
    for (let index = 0; index < quantity; index += 1) {
      units.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: 1,
        lineSubtotalIncl: perUnitSubtotal,
        weightKg: item.weightKg,
      });
    }
  }
  return units;
}

function splitItemsIntoBatches({
  items,
  batchingMode,
  maxBatchLimit,
}: {
  items: ShippingPricedItem[];
  batchingMode: ShippingBatchingMode;
  maxBatchLimit?: number | null;
}): ShippingPricedItem[][] {
  const normalizedLimit = toNum(maxBatchLimit, 0);
  if (!(normalizedLimit > 0)) return [items];

  const units = expandToUnits(items);
  if (!units.length) return [items];

  const batches: ShippingPricedItem[][] = [];

  if (batchingMode === "combine_weight") {
    let currentBatch: ShippingPricedItem[] = [];
    let currentWeight = 0;

    for (const unit of units) {
      const unitWeight = positiveWeight(unit.weightKg);
      if (unitWeight == null) return [items];

      if (currentBatch.length && currentWeight + unitWeight > normalizedLimit) {
        batches.push(currentBatch);
        currentBatch = [];
        currentWeight = 0;
      }

      currentBatch.push(unit);
      currentWeight += unitWeight;
    }

    if (currentBatch.length) batches.push(currentBatch);
    return batches.length ? batches : [items];
  }

  for (let index = 0; index < units.length; index += normalizedLimit) {
    batches.push(units.slice(index, index + normalizedLimit));
  }

  return batches.length ? batches : [items];
}

export function determineBatchingMode(rate: ShippingRateOverride, configuredMode?: ShippingBatchingMode | null): ShippingBatchingMode {
  if (
    configuredMode === "single_shipping_fee" ||
    configuredMode === "highest_item_shipping" ||
    configuredMode === "combine_weight" ||
    configuredMode === "per_item"
  ) {
    return configuredMode;
  }
  if (rate.pricingMode === "weight_based" || rate.pricingMode === "tiered") return "combine_weight";
  return "single_shipping_fee";
}

function calculateSingleRate(rate: ShippingRateOverride, orderSubtotalIncl: number, combinedWeightKg: number): number | null {
  switch (rate.pricingMode) {
    case "flat":
      return roundMoney(rate.flatRate);
    case "weight_based": {
      if (!(combinedWeightKg >= 0)) return null;
      const baseRate = roundMoney(rate.weightBased.baseRate);
      const includedKg = toNum(rate.weightBased.includedKg, 0);
      const extraWeight = Math.max(0, combinedWeightKg - includedKg);
      const chargeableExtraWeight = rate.weightBased.roundUpToNextKg ? Math.ceil(extraWeight) : extraWeight;
      return roundMoney(baseRate + chargeableExtraWeight * toNum(rate.weightBased.additionalRatePerKg, 0));
    }
    case "tiered": {
      const band = rate.tiered.find((entry) => combinedWeightKg >= toNum(entry.minWeightKg, 0) && (entry.maxWeightKg == null || combinedWeightKg < toNum(entry.maxWeightKg, Infinity)));
      return band ? roundMoney(toNum(band.rate, 0)) : null;
    }
    case "order_value_based": {
      const band = rate.orderValueBased.find(
        (entry) => orderSubtotalIncl >= toNum(entry.minOrderValue, 0) && (entry.maxOrderValue == null || orderSubtotalIncl < toNum(entry.maxOrderValue, Infinity)),
      );
      return band ? roundMoney(toNum(band.rate, 0)) : null;
    }
    case "free_over_threshold":
      return orderSubtotalIncl >= toNum(rate.freeOverThreshold.threshold, 0) ? 0 : roundMoney(rate.freeOverThreshold.fallbackRate);
    default:
      return roundMoney(rate.flatRate);
  }
}

export function calculateShippingPrice({
  rate,
  items,
  batchingMode,
  maxBatchLimit,
}: {
  rate: ShippingRateOverride;
  items: ShippingPricedItem[];
  batchingMode?: ShippingBatchingMode | null;
  maxBatchLimit?: number | null;
}): ShippingPricingResult {
  const errors: string[] = [];
  const resolvedBatchingMode = determineBatchingMode(rate, batchingMode);
  const orderSubtotalIncl = roundMoney(items.reduce((sum, item) => sum + toNum(item.lineSubtotalIncl, 0), 0));
  const { totalWeightKg, missingWeight } = computeCombinedWeight(items);

  if ((rate.pricingMode === "weight_based" || rate.pricingMode === "tiered") && missingWeight) {
    errors.push("Weight-based shipping requires item weights.");
    return {
      baseShippingFee: 0,
      batchingMode: resolvedBatchingMode,
      pricingMode: rate.pricingMode,
      errors,
    };
  }

  const singleRate = calculateSingleRate(rate, orderSubtotalIncl, totalWeightKg);
  if (singleRate == null) {
    errors.push("No valid shipping rate matched this basket.");
    return {
      baseShippingFee: 0,
      batchingMode: resolvedBatchingMode,
      pricingMode: rate.pricingMode,
      errors,
    };
  }

  const batches = splitItemsIntoBatches({
    items,
    batchingMode: resolvedBatchingMode,
    maxBatchLimit,
  });

  if (batches.length > 1 || (maxBatchLimit && maxBatchLimit > 0)) {
    let totalFee = 0;

    for (const batch of batches) {
      const batchSubtotalIncl = roundMoney(batch.reduce((sum, item) => sum + toNum(item.lineSubtotalIncl, 0), 0));
      const { totalWeightKg: batchWeightKg, missingWeight: batchMissingWeight } = computeCombinedWeight(batch);

      if ((rate.pricingMode === "weight_based" || rate.pricingMode === "tiered") && batchMissingWeight) {
        errors.push("Weight-based shipping requires item weights.");
        return {
          baseShippingFee: 0,
          batchingMode: resolvedBatchingMode,
          pricingMode: rate.pricingMode,
          errors,
        };
      }

      const batchRate = calculateSingleRate(rate, batchSubtotalIncl, batchWeightKg);
      if (batchRate == null) {
        errors.push("No valid shipping rate matched this basket.");
        return {
          baseShippingFee: 0,
          batchingMode: resolvedBatchingMode,
          pricingMode: rate.pricingMode,
          errors,
        };
      }

      if (resolvedBatchingMode === "per_item") {
        totalFee += batchRate * countUnits(batch);
      } else {
        totalFee += batchRate;
      }
    }

    return {
      baseShippingFee: roundMoney(totalFee),
      batchingMode: resolvedBatchingMode,
      pricingMode: rate.pricingMode,
      errors,
    };
  }

  if (resolvedBatchingMode === "per_item") {
    return {
      baseShippingFee: roundMoney(singleRate * countUnits(items)),
      batchingMode: resolvedBatchingMode,
      pricingMode: rate.pricingMode,
      errors,
    };
  }

  return {
    baseShippingFee: singleRate,
    batchingMode: resolvedBatchingMode,
    pricingMode: rate.pricingMode,
    errors,
  };
}

export function applyShippingMargin({
  baseShippingFee,
  margin,
}: {
  baseShippingFee: number;
  margin?: { enabled?: boolean; mode?: "fixed" | "percentage"; value?: number } | null;
}): {
  platformShippingMargin: number;
  finalShippingFee: number;
} {
  const base = roundMoney(baseShippingFee);
  if (!margin?.enabled) {
    return {
      platformShippingMargin: 0,
      finalShippingFee: base,
    };
  }
  const value = toNum(margin.value, 0);
  const platformShippingMargin = roundMoney(margin.mode === "percentage" ? (base * value) / 100 : value);
  return {
    platformShippingMargin,
    finalShippingFee: roundMoney(base + platformShippingMargin),
  };
}
