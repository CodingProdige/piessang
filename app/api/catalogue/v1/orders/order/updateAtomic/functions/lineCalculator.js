import { normalizeMoneyAmount } from "@/lib/money";

const VAT_RATE = 0.15;
const r2 = (v) => normalizeMoneyAmount(Number(v) || 0);

/* Resolve the unit price using sale > standard selling price */
export function resolveUnitPrice(variant) {
  if (variant?.sale?.is_on_sale) {
    return r2(variant?.sale?.sale_price_excl || 0);
  }
  return r2(variant?.pricing?.selling_price_excl || 0);
}

export function computeLineTotals(variant, qty) {
  const quantity = Math.max(0, Number(qty) || 0);
  const unit = resolveUnitPrice(variant);
  const line_subtotal_excl = r2(unit * quantity);
  const item_vat = r2(line_subtotal_excl * VAT_RATE);
  const total_vat = item_vat;
  const final_excl = line_subtotal_excl;
  const final_incl = r2(final_excl + total_vat);

  return {
    unit_price_excl: unit,
    line_subtotal_excl,
    returnable_excl: 0,
    returnable_vat: 0,
    item_vat,
    total_vat,
    final_excl,
    final_incl
  };
}

export function computeCartTotals(items) {
  let subtotal = 0;
  let vat_total = 0;
  let sale_savings_excl = 0;

  for (const it of Array.isArray(items) ? items : []) {
    const qty = Number(it?.quantity) || 0;
    const variant = it?.selected_variant_snapshot || null;
    const lt = it?.line_totals || computeLineTotals(variant, qty);

    subtotal += lt?.line_subtotal_excl || 0;
    vat_total += lt?.total_vat || 0;

    const normal = Number(variant?.pricing?.selling_price_excl) || 0;
    const sale = Number(variant?.sale?.sale_price_excl) || 0;
    if (variant?.sale?.is_on_sale && normal > sale) {
      sale_savings_excl += (normal - sale) * qty;
    }
  }

  const final_excl = r2(subtotal);

  return {
    subtotal_excl: r2(subtotal),
    sale_savings_excl: r2(sale_savings_excl),
    deposit_total_excl: 0,
    vat_total: r2(vat_total),
    final_excl,
    final_incl: r2(final_excl + vat_total)
  };
}

export { VAT_RATE };
