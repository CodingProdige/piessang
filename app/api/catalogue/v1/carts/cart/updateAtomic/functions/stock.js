const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
const sumInventory = (variant) =>
  Array.isArray(variant?.inventory)
    ? variant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty) || 0), 0)
    : 0;

const hasFiniteStockTotal = (value) => Number.isFinite(Number(value));

/* Cap requested quantity based on available stock signals */
export function capQuantity(variant, desiredQty, { currentQty = 0, ignoreSale = false, supplierOOS = false } = {}) {
  const requested = Math.max(0, Number(desiredQty) || 0);
  const current = Math.max(0, Number(currentQty) || 0);
  const requestedIncrease = Math.max(0, requested - current);
  const continueSellingOOS = Boolean(variant?.placement?.continue_selling_out_of_stock);

  let available = null;
  let reason = null;

  // Hard block if supplier is out of stock for any increase
  if (supplierOOS && requestedIncrease > 0) {
    return { quantity: current, capped: requested !== current, available: current, reason: "supplier_out_of_stock" };
  }

  // When enabled, allow overselling even if inventory/sale availability is zero.
  if (continueSellingOOS) {
    return { quantity: requested, capped: false, available: null, reason: null };
  }

  if (hasFiniteStockTotal(variant?.total_in_stock_items_available)) {
    available = Math.max(0, Math.trunc(Number(variant.total_in_stock_items_available)));
    reason = "inventory";
  } else if (Array.isArray(variant?.inventory) && variant.inventory.length) {
    available = sumInventory(variant);
    reason = "inventory";
  } else if (!ignoreSale && hasFiniteStockTotal(variant?.sale?.qty_available)) {
    available = Math.max(0, Math.trunc(Number(variant.sale.qty_available)));
    reason = "sale";
  } else if (!continueSellingOOS) {
    available = 0;
    reason = "stock";
  }

  if (requested <= current) {
    return { quantity: requested, capped: false, available: null, reason: null };
  }

  if (available === null || available === undefined) {
    return { quantity: requested, capped: false, available: null, reason: null };
  }

  const quantity = Math.min(requested, available);
  return {
    quantity,
    capped: quantity !== requested,
    available,
    reason
  };
}
