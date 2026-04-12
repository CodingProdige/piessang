function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function toNum(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getShippingZonePricingBasis(zone = {}) {
  const basis = toLower(zone?.pricingBasis || zone?.pricing_basis || zone?.pricingRules?.[0]?.pricingBasis || "per_order");
  if (["per_item", "per_kg"].includes(basis)) return basis;
  return "per_order";
}

export function sellerHasWeightBasedShipping(profile = {}) {
  const zones = Array.isArray(profile?.shippingZones) ? profile.shippingZones : [];
  return zones.some((zone) => getShippingZonePricingBasis(zone) === "per_kg");
}

export function variantHasShippingWeight(variant = {}) {
  const logistics = variant?.logistics && typeof variant.logistics === "object" ? variant.logistics : {};
  return (
    toNum(logistics.weightKg ?? logistics.weight_kg) > 0 ||
    toNum(logistics.actualWeightKg ?? logistics.actual_weight_kg) > 0 ||
    toNum(logistics.billableWeightKg ?? logistics.billable_weight_kg) > 0
  );
}

export function collectProductWeightRequirementIssues(product = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const issues = [];
  if (!variants.length) {
    issues.push("At least one variant");
    return issues;
  }
  const missingWeight = variants.some((variant) => !variantHasShippingWeight(variant));
  if (missingWeight) issues.push("Variant weight");
  return issues;
}
