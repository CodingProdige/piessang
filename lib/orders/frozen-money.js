import { normalizeMoneyAmount } from "@/lib/money";

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function r2(value) {
  return normalizeMoneyAmount(toNum(value));
}

export function getFrozenLineTotalIncl(item = {}) {
  const totals = item?.line_totals && typeof item.line_totals === "object" ? item.line_totals : {};
  const explicit = Number(totals?.final_incl ?? totals?.total_incl);
  if (Number.isFinite(explicit) && explicit >= 0) return r2(explicit);

  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return r2(toNum(variant?.pricing?.selling_price_incl) * Math.max(0, toNum(item?.quantity)));
}

export function getFrozenLineUnitPriceIncl(item = {}) {
  const qty = Math.max(0, toNum(item?.quantity));
  if (qty <= 0) return 0;
  return r2(getFrozenLineTotalIncl(item) / qty);
}

export function getFrozenOrderProductsIncl(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return r2(items.reduce((sum, item) => sum + getFrozenLineTotalIncl(item), 0));
}

export function getFrozenOrderPayableIncl(order = {}) {
  const explicit = Number(
    order?.totals?.final_payable_incl ??
      order?.pricing_snapshot?.finalPayableIncl ??
      order?.payment?.required_amount_incl
  );
  if (Number.isFinite(explicit) && explicit >= 0) return r2(explicit);
  return r2(order?.totals?.final_incl ?? order?.pricing_snapshot?.finalIncl ?? 0);
}

export function getFrozenOrderPaidIncl(order = {}) {
  return r2(order?.payment?.paid_amount_incl || 0);
}

export function getFrozenSellerSliceSubtotalIncl(items = []) {
  return r2((Array.isArray(items) ? items : []).reduce((sum, item) => sum + getFrozenLineTotalIncl(item), 0));
}
