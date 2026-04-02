const toNum = (v) => (Number.isFinite(+v) ? +v : 0);

/* Cap requested quantity based on available stock signals */
export function capQuantity(variant, desiredQty, { ignoreSale = false, supplierOOS = false } = {}) {
  const requested = Math.max(0, Number(desiredQty) || 0);

  let available = null;
  let reason = null;

  // Hard block if supplier is out of stock for any increase
  if (supplierOOS && requested > 0) {
    return { quantity: 0, capped: true, available: 0, reason: "supplier_out_of_stock" };
  }

  if (Array.isArray(variant?.inventory) && variant.inventory.length) {
    available = variant.inventory.reduce((sum, row) => sum + (Number(row?.in_stock_qty) || 0), 0);
    reason = "inventory";
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
