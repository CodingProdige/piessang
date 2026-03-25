const VAT_RATE = 0.15;
const r2 = (v) => Number((Number(v) || 0).toFixed(2));

function toIncl(value) {
  return r2(Number(value) || 0);
}

function toExclFromIncl(valueIncl) {
  const amountIncl = Number(valueIncl) || 0;
  return r2(amountIncl / (1 + VAT_RATE));
}

function resolveUnitPriceIncl(variant) {
  if (variant?.sale?.is_on_sale && Number.isFinite(Number(variant?.sale?.sale_price_incl))) {
    return toIncl(variant.sale.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.sale_price_incl))) {
    return toIncl(variant.pricing.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_incl))) {
    return toIncl(variant.pricing.selling_price_incl);
  }
  if (variant?.sale?.is_on_sale && Number.isFinite(Number(variant?.sale?.sale_price_excl))) {
    return toIncl(Number(variant.sale.sale_price_excl) * (1 + VAT_RATE));
  }
  if (Number.isFinite(Number(variant?.pricing?.sale_price_excl))) {
    return toIncl(Number(variant.pricing.sale_price_excl) * (1 + VAT_RATE));
  }
  return toIncl(variant?.pricing?.selling_price_excl ? Number(variant.pricing.selling_price_excl) * (1 + VAT_RATE) : 0);
}

/* Resolve the unit price using sale > standard selling price */
export function resolveUnitPrice(variant) {
  return toExclFromIncl(resolveUnitPriceIncl(variant));
}

export function computeLineTotals(variant, qty) {
  const quantity = Math.max(0, Number(qty) || 0);
  const unit_price_incl = resolveUnitPriceIncl(variant);
  const line_subtotal_incl = r2(unit_price_incl * quantity);
  const line_subtotal_excl = toExclFromIncl(line_subtotal_incl);
  const item_vat = r2(line_subtotal_incl - line_subtotal_excl);
  const total_vat = item_vat;
  const final_excl = line_subtotal_excl;
  const final_incl = line_subtotal_incl;

  return {
    unit_price_excl: toExclFromIncl(unit_price_incl),
    unit_price_incl,
    line_subtotal_excl,
    line_subtotal_incl,
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

    const normalIncl = Number(variant?.pricing?.selling_price_incl) || (Number(variant?.pricing?.selling_price_excl) || 0) * (1 + VAT_RATE);
    const saleIncl = Number(variant?.sale?.sale_price_incl) || (Number(variant?.sale?.sale_price_excl) || 0) * (1 + VAT_RATE);
    if (variant?.sale?.is_on_sale && normalIncl > saleIncl) {
      sale_savings_excl += toExclFromIncl((normalIncl - saleIncl) * qty);
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
