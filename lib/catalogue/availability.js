function toNum(value) {
  return Number.isFinite(+value) ? +value : 0;
}

export function variantInventoryQtyTotal(variant) {
  const rows = Array.isArray(variant?.inventory) ? variant.inventory : [];
  if (!rows.length) return 0;

  return rows.reduce((sum, row) => {
    if (!row || typeof row !== "object") return sum;
    if (row?.in_stock === false) return sum;
    if (row?.supplier_out_of_stock === true) return sum;

    const qty = Number(
      row?.in_stock_qty ??
        row?.unit_stock_qty ??
        row?.qty_available ??
        row?.quantity ??
        row?.qty ??
        0,
    );
    return Number.isFinite(qty) && qty > 0 ? sum + qty : sum;
  }, 0);
}

export function variantSaleQtyAvailable(variant) {
  const isSaleLive =
    variant?.sale?.is_on_sale === true &&
    variant?.sale?.disabled_by_admin !== true;
  if (!isSaleLive) return 0;
  return Math.max(0, toNum(variant?.sale?.qty_available));
}

export function variantTotalInStockItemsAvailable(variant) {
  return variantInventoryQtyTotal(variant) + variantSaleQtyAvailable(variant);
}

export function variantCanContinueSellingOutOfStock(variant) {
  if (variant?.placement?.isActive === false) return false;
  if (variant?.placement?.track_inventory !== true) return true;
  return variant?.placement?.continue_selling_out_of_stock === true;
}

export function variantIsListable(variant) {
  if (!variant || typeof variant !== "object") return false;
  if (variant?.placement?.isActive === false) return false;
  return (
    variantTotalInStockItemsAvailable(variant) > 0 ||
    variantCanContinueSellingOutOfStock(variant)
  );
}

export function productHasListableAvailability(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return false;
  return variants.some((variant) => variantIsListable(variant));
}

export function googleAvailabilityForVariant(variant) {
  return variantIsListable(variant) ? "in stock" : "out of stock";
}

export function googleFeedAvailabilityForVariant(variant) {
  return variantIsListable(variant) ? "in_stock" : "out_of_stock";
}
