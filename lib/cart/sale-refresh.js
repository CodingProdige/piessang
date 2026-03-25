import { getAdminDb } from "@/lib/firebase/admin";

const VAT = 0.15;
const nowIso = () => new Date().toISOString();
const r2 = (value) => Number((Number(value) || 0).toFixed(2));

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isCheckoutCart(cart) {
  return String(cart?.cart?.status || "").trim().toLowerCase() === "checkout";
}

function isSaleActive(variant) {
  return Boolean(variant?.sale?.is_on_sale && !variant?.sale?.disabled_by_admin);
}

function getUnitPriceIncl(variant) {
  if (!variant) return 0;
  if (isSaleActive(variant) && Number.isFinite(Number(variant?.sale?.sale_price_incl))) {
    return r2(variant.sale.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.sale_price_incl))) {
    return r2(variant.pricing.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_incl))) {
    return r2(variant.pricing.selling_price_incl);
  }
  if (isSaleActive(variant) && Number.isFinite(Number(variant?.sale?.sale_price_excl))) {
    return r2(Number(variant.sale.sale_price_excl) * (1 + VAT));
  }
  if (Number.isFinite(Number(variant?.pricing?.sale_price_excl))) {
    return r2(Number(variant.pricing.sale_price_excl) * (1 + VAT));
  }
  return r2(Number(variant?.pricing?.selling_price_excl || 0) * (1 + VAT));
}

function computeLineTotals(variant, quantity) {
  const qty = Math.max(0, Number(quantity || 0));
  const unitPriceIncl = getUnitPriceIncl(variant);
  const lineSubtotalIncl = r2(unitPriceIncl * qty);
  const lineSubtotalExcl = r2(lineSubtotalIncl / (1 + VAT));
  const totalVat = r2(lineSubtotalIncl - lineSubtotalExcl);
  return {
    unit_price_excl: r2(unitPriceIncl / (1 + VAT)),
    unit_price_incl: unitPriceIncl,
    line_subtotal_excl: lineSubtotalExcl,
    line_subtotal_incl: lineSubtotalIncl,
    returnable_excl: 0,
    total_vat: totalVat,
    final_excl: lineSubtotalExcl,
    final_incl: lineSubtotalIncl,
    sale_savings_excl: 0,
  };
}

function computeCartTotals(items, existingTotals = {}) {
  const deliveryFeeExcl = r2(existingTotals?.delivery_fee_excl || 0);
  const sellerDeliveryFeeExcl = r2(existingTotals?.seller_delivery_fee_excl || 0);
  const sellerDeliveryFeeIncl = r2(existingTotals?.seller_delivery_fee_incl || sellerDeliveryFeeExcl);
  const sellerDeliveryBreakdown = Array.isArray(existingTotals?.seller_delivery_breakdown)
    ? existingTotals.seller_delivery_breakdown
    : [];

  let subtotalExcl = 0;
  let saleSavingsExcl = 0;
  let vatTotal = 0;

  for (const item of Array.isArray(items) ? items : []) {
    subtotalExcl += r2(item?.line_totals?.line_subtotal_excl || item?.line_totals?.final_excl || 0);
    vatTotal += r2(item?.line_totals?.total_vat || 0);
    const comparePriceIncl = r2(item?.selected_variant_snapshot?.pricing?.selling_price_incl || 0);
    const salePriceIncl = r2(getUnitPriceIncl(item?.selected_variant_snapshot));
    if (isSaleActive(item?.selected_variant_snapshot) && comparePriceIncl > salePriceIncl) {
      saleSavingsExcl += r2(((comparePriceIncl - salePriceIncl) * Math.max(0, Number(item?.quantity || 0))) / (1 + VAT));
    }
  }

  const finalExcl = r2(subtotalExcl + deliveryFeeExcl + sellerDeliveryFeeExcl);
  const finalIncl = r2(finalExcl + vatTotal);

  return {
    subtotal_excl: r2(subtotalExcl),
    deposit_total_excl: 0,
    delivery_fee_excl: deliveryFeeExcl,
    delivery_fee_incl: deliveryFeeExcl,
    seller_delivery_fee_excl: sellerDeliveryFeeExcl,
    seller_delivery_fee_incl: sellerDeliveryFeeIncl,
    seller_delivery_breakdown: sellerDeliveryBreakdown,
    sale_savings_excl: r2(saleSavingsExcl),
    vat_total: r2(vatTotal),
    final_excl: finalExcl,
    final_incl: finalIncl,
    base_final_excl: finalExcl,
    base_final_incl: finalIncl,
    final_payable_incl: r2(existingTotals?.final_payable_incl || finalIncl),
  };
}

function getCustomerEmail(user = {}) {
  return (
    String(user?.email || "").trim() ||
    String(user?.account?.email || "").trim() ||
    String(user?.personal?.email || "").trim()
  );
}

export async function refreshCartsForSaleChange({
  origin,
  productId,
  productSnapshot,
  variantBefore,
  variantAfter,
}) {
  const db = getAdminDb();
  if (!db || !productId || !variantAfter) return { refreshed: 0, emailed: 0, matched: 0 };

  const variantId = String(variantAfter?.variant_id || "").trim();
  if (!variantId) return { refreshed: 0, emailed: 0, matched: 0 };

  const wasOnSale = isSaleActive(variantBefore);
  const isNowOnSale = isSaleActive(variantAfter);
  const previousPriceIncl = getUnitPriceIncl(variantBefore);
  const currentPriceIncl = getUnitPriceIncl(variantAfter);
  const isSaleImprovement = isNowOnSale && (!wasOnSale || currentPriceIncl < previousPriceIncl);
  if (!isSaleImprovement) return { refreshed: 0, emailed: 0, matched: 0 };

  const cartsSnap = await db.collection("carts").get();
  const emailGroups = new Map();
  let refreshed = 0;
  let matched = 0;

  for (const cartDoc of cartsSnap.docs) {
    const cart = cartDoc.data() || {};
    if (isCheckoutCart(cart)) continue;
    const items = Array.isArray(cart?.items) ? [...cart.items] : [];
    let cartChanged = false;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const itemProductId =
        String(item?.product_snapshot?.product?.unique_id || item?.product_unique_id || "").trim();
      const itemVariantId =
        String(item?.selected_variant_snapshot?.variant_id || item?.selected_variant_id || "").trim();
      if (itemProductId !== String(productId).trim() || itemVariantId !== variantId) continue;
      matched += 1;

      const priorVariant = item?.selected_variant_snapshot || {};
      const priorPriceIncl = getUnitPriceIncl(priorVariant);
      const nextVariant = clone(variantAfter);
      const nextProductSnapshot = {
        ...(item?.product_snapshot || {}),
        ...(productSnapshot ? clone(productSnapshot) : {}),
      };

      items[index] = {
        ...item,
        product_snapshot: nextProductSnapshot,
        selected_variant_snapshot: nextVariant,
        line_totals: computeLineTotals(nextVariant, item?.quantity || 0),
      };
      cartChanged = true;

      const customerId = String(cart?.cart?.customerId || cart?.cart?.user_id || cartDoc.id || "").trim();
      const saleKey = `${customerId}::${productId}::${variantId}::${String(currentPriceIncl)}`;
      emailGroups.set(saleKey, {
        customerId,
        productTitle:
          String(nextProductSnapshot?.product?.title || nextProductSnapshot?.title || "Item").trim(),
        variantLabel: String(nextVariant?.label || "").trim(),
        salePriceIncl: currentPriceIncl,
        previousPriceIncl: priorPriceIncl,
        productUrl: origin
          ? `${origin}/products/${encodeURIComponent(String(nextProductSnapshot?.product?.titleSlug || "").trim() || String(productId).trim())}?unique_id=${encodeURIComponent(String(productId).trim())}`
          : null,
      });
    }

    if (!cartChanged) continue;

    const nextTotals = computeCartTotals(items, cart?.totals || {});
    await cartDoc.ref.set(
      {
        items,
        totals: nextTotals,
        cart_corrected: true,
        meta: {
          ...(cart?.meta || {}),
          lastAction: "sale_refresh",
          lastSaleRefreshAt: nowIso(),
        },
        timestamps: {
          ...(cart?.timestamps || {}),
          updatedAt: nowIso(),
        },
      },
      { merge: true },
    );
    refreshed += 1;
  }

  let emailed = 0;
  for (const group of emailGroups.values()) {
    const customerSnap = await db.collection("users").doc(group.customerId).get().catch(() => null);
    const customer = customerSnap?.exists ? customerSnap.data() || {} : {};
    const email = getCustomerEmail(customer);
    if (!email || !origin) continue;

    const markerId = `${group.customerId}__${String(productId).trim()}__${variantId}__${String(group.salePriceIncl).replace(/\W+/g, "_")}`;
    const markerRef = db.collection("cart_sale_notifications").doc(markerId);
    const markerSnap = await markerRef.get().catch(() => null);
    if (markerSnap?.exists) continue;

    await fetch(`${origin}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "cart-item-sale",
        to: email,
        data: {
          customerName:
            String(customer?.account?.accountName || customer?.personal?.fullName || customer?.business?.companyName || "").trim() || "there",
          items: [
            {
              productTitle: group.productTitle,
              variantLabel: group.variantLabel,
              salePrice: `R ${group.salePriceIncl.toFixed(2)}`,
              previousPrice: `R ${group.previousPriceIncl.toFixed(2)}`,
              productUrl: group.productUrl,
            },
          ],
        },
      }),
    }).catch(() => null);

    await markerRef.set(
      {
        customerId: group.customerId,
        productId: String(productId).trim(),
        variantId,
        salePriceIncl: group.salePriceIncl,
        createdAt: nowIso(),
      },
      { merge: false },
    ).catch(() => null);

    emailed += 1;
  }

  return { refreshed, emailed, matched };
}
