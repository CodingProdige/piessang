import { collectProductWeightRequirementIssues, sellerHasWeightBasedShipping } from "@/lib/seller/shipping-weight-requirements";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function shouldHideProductForMissingWeight({ sellerDeliveryProfile, product }) {
  const requiresWeight = sellerHasWeightBasedShipping(sellerDeliveryProfile);
  const hasLocalFallback = sellerDeliveryProfile?.directDelivery?.enabled === true;
  if (!requiresWeight || hasLocalFallback) return false;
  return collectProductWeightRequirementIssues(product).includes("Variant weight");
}

export function buildShippingVisibilityPatch({ currentProduct, nextProduct, sellerDeliveryProfile }) {
  const shouldHide = shouldHideProductForMissingWeight({ sellerDeliveryProfile, product: nextProduct });
  const wasBlockedForWeight = toStr(currentProduct?.listing_block_reason_code) === "missing_variant_weight_for_shipping";
  const publishedLike = toStr(currentProduct?.moderation?.status).toLowerCase() === "published";

  if (shouldHide) {
    return {
      placement: {
        ...(nextProduct?.placement || {}),
        isActive: false,
      },
      listing_block_reason_code: "missing_variant_weight_for_shipping",
      listing_block_reason_message:
        "This listing is hidden until every variant has a weight required by your per-kg shipping zones.",
    };
  }

  if (wasBlockedForWeight) {
    return {
      placement: {
        ...(nextProduct?.placement || {}),
        isActive: publishedLike ? true : Boolean(nextProduct?.placement?.isActive),
      },
      listing_block_reason_code: null,
      listing_block_reason_message: null,
    };
  }

  return null;
}
