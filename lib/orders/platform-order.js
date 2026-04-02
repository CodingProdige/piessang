import { getFrozenLineTotalIncl } from "@/lib/orders/frozen-money";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function r2(value) {
  return Number(toNum(value).toFixed(2));
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
    sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
    vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || ""),
  };
}

function getLineFulfillmentMode(item) {
  const product = item?.product_snapshot || item?.product || {};
  return toLower(product?.fulfillment?.mode) === "bevgo" ? "bevgo" : "seller";
}

function getLineTitle(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(product?.product?.title || product?.title || variant?.label || "Product");
}

function getLineVariantLabel(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.label || variant?.variant_id || "");
}

function getLineQuantity(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLineSubtotalIncl(item) {
  return r2(getFrozenLineTotalIncl(item));
}

export function buildSellerSlices(items = [], sellerDeliveryBreakdown = []) {
  const grouped = new Map();
  const deliveryBySeller = new Map();

  for (const entry of Array.isArray(sellerDeliveryBreakdown) ? sellerDeliveryBreakdown : []) {
    const sellerCode = toStr(entry?.sellerCode || entry?.seller_code || "");
    const sellerSlug = toStr(entry?.sellerSlug || entry?.seller_slug || "");
    const key = sellerCode || sellerSlug;
    if (!key) continue;
    deliveryBySeller.set(key, {
      amountIncl: r2(entry?.amountIncl ?? entry?.amount_incl ?? entry?.fee ?? 0),
      label: toStr(entry?.label || entry?.summary || ""),
      method: toStr(entry?.method || entry?.type || ""),
      raw: entry,
    });
  }

  items.forEach((item, index) => {
    const seller = getLineSellerIdentity(item);
    const key = seller.sellerCode || seller.sellerSlug || `unknown-${index}`;
    if (!grouped.has(key)) {
      const delivery = deliveryBySeller.get(key) || null;
      grouped.set(key, {
        sellerCode: seller.sellerCode,
        sellerSlug: seller.sellerSlug,
        vendorName: seller.vendorName,
        fulfillmentMode: getLineFulfillmentMode(item),
        lineCount: 0,
        quantity: 0,
        subtotalIncl: 0,
        deliveryFeeIncl: delivery?.amountIncl || 0,
        deliveryLabel: delivery?.label || "",
        deliveryMethod: delivery?.method || "",
        lines: [],
      });
    }

    const group = grouped.get(key);
    const quantity = getLineQuantity(item);
    const subtotalIncl = getLineSubtotalIncl(item);
    group.lineCount += 1;
    group.quantity += quantity;
    group.subtotalIncl = r2(group.subtotalIncl + subtotalIncl);
    group.lines.push({
      index,
      title: getLineTitle(item),
      variant: getLineVariantLabel(item),
      quantity,
      subtotalIncl,
      fulfillmentMode: getLineFulfillmentMode(item),
    });
  });

  return Array.from(grouped.values()).map((slice) => ({
    ...slice,
    totalIncl: r2(slice.subtotalIncl + slice.deliveryFeeIncl),
  }));
}

export function buildPlatformOrderDocument({
  orderId,
  orderNumber,
  merchantTransactionId,
  customerId,
  customerSnapshot,
  items,
  totals,
  creditAppliedIncl,
  creditAllocations,
  deliveryAddress,
  deliverySpeed,
  isEligibleFor50,
  customerNote,
  source,
  cartId,
  createdBy,
  orderedFor,
  normalizedOrderType,
  timestamp,
  deliveryFeeData,
}) {
  const sellerSlices = buildSellerSlices(items, deliveryFeeData?.sellerBreakdown || []);
  const hasCollection = Array.isArray(deliveryFeeData?.sellerBreakdown)
    ? deliveryFeeData.sellerBreakdown.some((entry) => String(entry?.delivery_type || "").trim().toLowerCase() === "collection")
    : false;
  const finalIncl = r2(totals?.final_incl || 0);
  const finalPayableIncl = r2(totals?.final_payable_incl || finalIncl);
  const platformDeliveryIncl = r2(deliveryFeeData?.amountIncl || 0);
  const sellerDeliveryIncl = r2(deliveryFeeData?.sellerAmountIncl || 0);

  return {
    schema_version: 2,
    docId: orderId,

    order: {
      orderId,
      orderNumber,
      merchantTransactionId,
      customerId,
      type: normalizedOrderType,
      channel: source,
      editable: false,
      editable_reason: "Order is locked while payment is being completed.",
      status: {
        order: "payment_pending",
        payment: "pending",
        fulfillment: "not_started",
      },
    },

    lifecycle: {
      orderStatus: "payment_pending",
      paymentStatus: "pending",
      fulfillmentStatus: "not_started",
      editable: false,
      editableReason: "Order is locked while payment is being completed.",
      createdAt: timestamp,
      updatedAt: timestamp,
      lockedAt: timestamp,
      paidAt: null,
      failedAt: null,
      cancelledAt: null,
    },

    customer: {
      customerId,
      orderedFor: orderedFor || customerId,
      createdBy: createdBy || customerId,
      accountName:
        customerSnapshot?.account?.accountName ||
        customerSnapshot?.business?.companyName ||
        customerSnapshot?.personal?.fullName ||
        null,
      email:
        customerSnapshot?.email ||
        customerSnapshot?.account?.email ||
        customerSnapshot?.personal?.email ||
        null,
      phone:
        customerSnapshot?.phoneNumber ||
        customerSnapshot?.account?.phoneNumber ||
        customerSnapshot?.personal?.phoneNumber ||
        null,
    },

    items,
    seller_slices: sellerSlices,

    pricing_snapshot: {
      currency: "ZAR",
      subtotalIncl: r2(totals?.subtotal_incl ?? 0),
      vatTotal: r2(totals?.vat_total ?? 0),
      platformDeliveryIncl,
      sellerDeliveryIncl,
      deliveryTotalIncl: r2(platformDeliveryIncl + sellerDeliveryIncl),
      creditAppliedIncl: r2(creditAppliedIncl || 0),
      finalIncl,
      finalPayableIncl,
      sellerDeliveryBreakdown: Array.isArray(deliveryFeeData?.sellerBreakdown) ? deliveryFeeData.sellerBreakdown : [],
    },

    payment: {
      method: null,
      currency: "ZAR",
      required_amount_incl: finalPayableIncl,
      paid_amount_incl: 0,
      status: "pending",
      attempts: [],
      credit_applied_incl: r2(creditAppliedIncl || 0),
      credit_allocations: Array.isArray(creditAllocations) ? creditAllocations : [],
    },

    payment_summary: {
      status: "pending",
      currency: "ZAR",
      requiredAmountIncl: finalPayableIncl,
      paidAmountIncl: 0,
      outstandingAmountIncl: finalPayableIncl,
      lastAttemptAt: null,
      paidAt: null,
    },

    delivery: {
      method: hasCollection ? "mixed" : "delivery",
      in_store_collection: hasCollection,
      speed: {
        type: deliverySpeed,
        eligible: Boolean(isEligibleFor50),
        sla_minutes: deliverySpeed === "express_50" ? 50 : null,
      },
      address_snapshot: deliveryAddress || null,
      fee: {
        amount: platformDeliveryIncl,
        currency: "ZAR",
        band: deliveryFeeData?.band || null,
        distance_km: deliveryFeeData?.distanceKm || null,
        duration_minutes: deliveryFeeData?.durationMinutes || null,
        reason: deliveryFeeData?.reason || null,
        raw: deliveryFeeData?.raw || null,
        seller_amount: sellerDeliveryIncl,
        seller_breakdown: Array.isArray(deliveryFeeData?.sellerBreakdown) ? deliveryFeeData.sellerBreakdown : [],
      },
      scheduledDate: null,
      notes: customerNote || null,
    },

    delivery_snapshot: {
      address: deliveryAddress || null,
      inStoreCollection: hasCollection,
      speed: deliverySpeed,
      platformDeliveryIncl,
      sellerDeliveryIncl,
      sellerDeliveryBreakdown: Array.isArray(deliveryFeeData?.sellerBreakdown) ? deliveryFeeData.sellerBreakdown : [],
      notes: customerNote || null,
    },

    totals: {
      ...(totals || {}),
      final_payable_incl: finalPayableIncl,
      credit: {
        ...(totals?.credit || {}),
        applied: r2(creditAppliedIncl || 0),
        applied_allocations: Array.isArray(creditAllocations) ? creditAllocations : [],
      },
    },

    customer_snapshot: customerSnapshot,

    delivery_docs: {
      picking_slip: { url: null, generatedAt: null },
      delivery_note: { url: null, generatedAt: null },
      proof_of_delivery: { url: null, uploadedAt: null },
      invoice: { url: null, uploadedAt: null },
    },

    audit: { edits: [] },

    meta: {
      source,
      customerNote: customerNote || null,
      createdFromCartId: cartId,
      createdBy,
      orderedFor: orderedFor || customerId,
      marketplaceMode: "b2c",
    },

    timestamps: {
      createdAt: timestamp,
      updatedAt: timestamp,
      lockedAt: timestamp,
    },
  };
}

export function buildPaidStatePatch(order = {}, payment = {}) {
  const timestamp = payment?.timestamp || new Date().toISOString();
  const amountIncl = r2(payment?.amount_incl || order?.payment?.required_amount_incl || 0);
  const existingRequired = r2(order?.payment?.required_amount_incl || amountIncl);
  const nextPaymentStatus = amountIncl + 0.0001 >= existingRequired ? "paid" : "partial";
  const nextOrderStatus = nextPaymentStatus === "paid" ? "confirmed" : "payment_pending";

  return {
    "payment.provider": payment?.provider || order?.payment?.provider || null,
    "payment.method": payment?.method || order?.payment?.method || null,
    "payment.chargeType": payment?.chargeType || order?.payment?.chargeType || null,
    "payment.status": nextPaymentStatus,
    "payment.paid_amount_incl": amountIncl,
    "payment.currency": payment?.currency || order?.payment?.currency || null,
    "payment.required_amount_incl": existingRequired,
    "payment.merchantTransactionId": payment?.merchantTransactionId || order?.payment?.merchantTransactionId || null,
    "payment.peachTransactionId": payment?.peachTransactionId || order?.payment?.peachTransactionId || null,
    "payment.stripeSessionId": payment?.stripeSessionId || order?.payment?.stripeSessionId || null,
    "payment.stripePaymentIntentId": payment?.stripePaymentIntentId || order?.payment?.stripePaymentIntentId || null,
    "payment.threeDSecureId": payment?.threeDSecureId || order?.payment?.threeDSecureId || null,
    "payment.token": payment?.token || order?.payment?.token || null,
    "payment_summary.status": nextPaymentStatus,
    "payment_summary.requiredAmountIncl": existingRequired,
    "payment_summary.paidAmountIncl": amountIncl,
    "payment_summary.outstandingAmountIncl": r2(Math.max(existingRequired - amountIncl, 0)),
    "payment_summary.lastAttemptAt": timestamp,
    "payment_summary.paidAt": nextPaymentStatus === "paid" ? timestamp : null,
    "lifecycle.paymentStatus": nextPaymentStatus,
    "lifecycle.orderStatus": nextOrderStatus,
    "lifecycle.updatedAt": timestamp,
    "lifecycle.paidAt": nextPaymentStatus === "paid" ? timestamp : null,
    "order.status.payment": nextPaymentStatus,
    "order.status.order": nextOrderStatus,
    "order.editable": false,
    "order.editable_reason": "Order is locked because payment was completed.",
    "lifecycle.editable": false,
    "lifecycle.editableReason": "Order is locked because payment was completed.",
    "timestamps.updatedAt": timestamp,
    "timestamps.lockedAt": order?.timestamps?.lockedAt || timestamp,
    "lifecycle.lockedAt": order?.lifecycle?.lockedAt || order?.timestamps?.lockedAt || timestamp,
  };
}
