type InventoryLike = {
  in_stock_qty?: number | null;
};

type VariantLike = {
  checkout_reserved_unavailable?: boolean;
  total_in_stock_items_available?: number | null;
  placement?: {
    track_inventory?: boolean;
    continue_selling_out_of_stock?: boolean;
  } | null;
  inventory?: InventoryLike[] | null;
  sale?: {
    qty_available?: number | null;
    is_on_sale?: boolean;
    sale_price_incl?: number | null;
    sale_price_excl?: number | null;
  } | null;
};

export type CartQuantityGuardReason =
  | "ok"
  | "reserved_in_checkout"
  | "out_of_stock"
  | "max_in_cart";

export function getVariantAvailableQuantity(variant?: VariantLike | null) {
  if (!variant) return null;
  if (variant?.placement?.track_inventory !== true || variant?.placement?.continue_selling_out_of_stock) {
    return null;
  }
  if (typeof variant?.total_in_stock_items_available === "number" && Number.isFinite(variant.total_in_stock_items_available)) {
    return Math.max(0, Math.trunc(variant.total_in_stock_items_available));
  }
  const inventoryTotal = Array.isArray(variant.inventory)
    ? variant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty ?? 0) || 0), 0)
    : 0;
  if (inventoryTotal > 0) return Math.max(0, Math.trunc(inventoryTotal));
  if (typeof variant?.sale?.qty_available === "number" && Number.isFinite(variant.sale.qty_available)) {
    return Math.max(0, Math.trunc(variant.sale.qty_available));
  }
  return null;
}

export function getCartQuantityGuard({
  variant,
  currentCartQty = 0,
  unavailable = false,
}: {
  variant?: VariantLike | null;
  currentCartQty?: number;
  unavailable?: boolean;
}) {
  const availableQuantity = getVariantAvailableQuantity(variant);
  const isCheckoutReserved = variant?.checkout_reserved_unavailable === true;
  const isOutOfStock =
    unavailable || (typeof availableQuantity === "number" ? availableQuantity <= 0 : false);
  const maxAddableQty =
    typeof availableQuantity === "number" ? Math.max(0, availableQuantity - Math.max(0, currentCartQty)) : null;
  const reachedCartLimit =
    typeof availableQuantity === "number" && availableQuantity > 0 && Math.max(0, currentCartQty) >= availableQuantity;

  let reason: CartQuantityGuardReason = "ok";
  let message: string | null = null;

  if (isCheckoutReserved) {
    reason = "reserved_in_checkout";
    message = "This item is currently reserved in another shopper's checkout.";
  } else if (isOutOfStock) {
    reason = "out_of_stock";
    message = "This item is out of stock.";
  } else if (reachedCartLimit) {
    reason = "max_in_cart";
    message =
      typeof availableQuantity === "number" && availableQuantity > 0
        ? `You already have the maximum available quantity (${availableQuantity}) in your cart.`
        : "You already have the maximum available quantity in your cart.";
  }

  return {
    availableQuantity,
    isCheckoutReserved,
    isOutOfStock,
    maxAddableQty,
    reachedCartLimit,
    canAdd: reason === "ok",
    incrementBlocked: reason !== "ok",
    reason,
    message,
  };
}

export function clampRequestedCartQty(requestedQty: number, maxAllowedQty?: number | null) {
  const normalizedRequested = Math.max(1, Math.trunc(Number(requestedQty) || 1));
  if (typeof maxAllowedQty !== "number") return normalizedRequested;
  return Math.min(normalizedRequested, Math.max(1, Math.trunc(maxAllowedQty)));
}
