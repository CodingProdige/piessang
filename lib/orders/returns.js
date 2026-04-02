import { getAdminDb } from "@/lib/firebase/admin";
import { getFrozenLineTotalIncl } from "@/lib/orders/frozen-money";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function r2(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const next = toStr(value);
    if (next) return next;
  }
  return "";
}

export function getOrderCustomerId(order = {}) {
  return (
    order?.meta?.orderedFor ||
    order?.order?.customerId ||
    order?.customer?.customerId ||
    order?.customer_snapshot?.customerId ||
    order?.customer_snapshot?.uid ||
    null
  );
}

export function customerOwnsOrder(order = {}, customerId = "") {
  const needle = toStr(customerId);
  if (!needle) return false;
  return [getOrderCustomerId(order), order?.customer?.orderedFor, order?.customer?.createdBy]
    .map((value) => toStr(value))
    .includes(needle);
}

export function getLineSellerIdentity(item = {}) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
    sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
    vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || ""),
  };
}

function getLineFulfillmentMode(item = {}) {
  const product = item?.product_snapshot || item?.product || {};
  return toLower(product?.fulfillment?.mode) === "bevgo" ? "platform" : "seller";
}

function getLineKey(item = {}, index = 0) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const product = item?.product_snapshot || item?.product || {};
  return toStr(
    item?.lineId ||
      item?.line_id ||
      `${toStr(product?.product?.unique_id || product?.docId || "product")}:${toStr(variant?.variant_id || "variant")}:${index}`,
  );
}

function getLineQuantity(item = {}) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLineAmountIncl(item = {}) {
  return r2(getFrozenLineTotalIncl(item));
}

function getSellerDeliveryEntry(order = {}, sellerCode = "", sellerSlug = "") {
  const breakdown =
    (Array.isArray(order?.pricing_snapshot?.sellerDeliveryBreakdown) && order.pricing_snapshot.sellerDeliveryBreakdown) ||
    (Array.isArray(order?.delivery?.fee?.seller_breakdown) && order.delivery.fee.seller_breakdown) ||
    [];
  const codeNeedle = toLower(sellerCode);
  const slugNeedle = toLower(sellerSlug);
  return (
    breakdown.find((entry) => {
      const entryCode = toLower(entry?.sellerCode || entry?.seller_code || "");
      const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
      return Boolean((codeNeedle && entryCode === codeNeedle) || (slugNeedle && entrySlug === slugNeedle));
    }) || null
  );
}

export function normalizeReturnOwnerForLine(order = {}, item = {}) {
  const fulfillmentOwner = getLineFulfillmentMode(item);
  const seller = getLineSellerIdentity(item);
  const deliveryEntry = getSellerDeliveryEntry(order, seller.sellerCode, seller.sellerSlug);
  const deliveryType = toLower(deliveryEntry?.delivery_type || deliveryEntry?.method || "");

  if (fulfillmentOwner === "platform") {
    return {
      ownerType: "platform",
      ownerLabel: "Piessang",
      responsibility: "Piessang manages returns for this item.",
      seller,
      deliveryType: deliveryType || "platform_fulfillment",
    };
  }

  return {
    ownerType: "seller",
    ownerLabel: seller.vendorName || "Seller",
    responsibility:
      deliveryType === "collection"
        ? "The seller manages collection-related returns for this item."
        : deliveryType === "direct_delivery"
          ? "The seller manages direct-delivery returns for this item."
          : "The seller manages shipping-related returns for this item.",
    seller,
    deliveryType: deliveryType || "shipping",
  };
}

export function resolveReturnSelection(order = {}, requestedLineKeys = []) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const normalizedRequested = Array.isArray(requestedLineKeys)
    ? requestedLineKeys.map((value) => toStr(value)).filter(Boolean)
    : [];

  const selected = items
    .map((item, index) => {
      const lineKey = getLineKey(item, index);
      return {
        lineKey,
        index,
        item,
        owner: normalizeReturnOwnerForLine(order, item),
      };
    })
    .filter((entry) => normalizedRequested.length === 0 || normalizedRequested.includes(entry.lineKey));

  if (!selected.length) {
    return {
      ok: false,
      reason: "no_lines",
      message: "No eligible order lines were selected for this return request.",
    };
  }

  const ownerTypes = new Set(selected.map((entry) => entry.owner.ownerType));
  const sellerKeys = new Set(
    selected
      .map((entry) => `${entry.owner.seller?.sellerCode || ""}::${entry.owner.seller?.sellerSlug || ""}`)
      .filter((value) => value !== "::"),
  );

  if (ownerTypes.size > 1 || sellerKeys.size > 1) {
    return {
      ok: false,
      reason: "mixed_owners",
      message:
        "Please submit separate return requests for items handled by Piessang and items handled by different sellers.",
    };
  }

  const first = selected[0];
  const amountIncl = r2(selected.reduce((sum, entry) => sum + getLineAmountIncl(entry.item), 0));

  return {
    ok: true,
    selected,
    owner: first.owner,
    amountIncl,
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getReturnWindowStatus(order = {}, selected = [], windowDays = 7) {
  const cutoffDays = Math.max(1, Math.trunc(Number(windowDays) || 7));
  const selectedItems = Array.isArray(selected) ? selected : [];
  if (!selectedItems.length) {
    return {
      allowed: false,
      title: "No Eligible Items",
      message: "No eligible delivered items were selected for this return request.",
      deliveredAt: null,
      expiresAt: null,
    };
  }

  const deliveredDates = selectedItems
    .map((entry) => {
      const item = entry?.item || {};
      const tracking = item?.fulfillment_tracking || {};
      const status = toLower(tracking?.status);
      if (status !== "delivered") return null;
      return (
        parseDate(tracking?.updatedAt) ||
        parseDate(tracking?.deliveredAt) ||
        parseDate(order?.timestamps?.updatedAt) ||
        null
      );
    })
    .filter(Boolean);

  if (!deliveredDates.length) {
    return {
      allowed: false,
      title: "Delivery Required",
      message: "A return can only be requested after the selected item has been delivered.",
      deliveredAt: null,
      expiresAt: null,
    };
  }

  const latestDeliveredAt = deliveredDates.sort((left, right) => right.getTime() - left.getTime())[0];
  const expiresAt = new Date(latestDeliveredAt.getTime());
  expiresAt.setDate(expiresAt.getDate() + cutoffDays);
  const now = new Date();

  if (now.getTime() > expiresAt.getTime()) {
    return {
      allowed: false,
      title: "Return Window Closed",
      message: `Return requests must be submitted within ${cutoffDays} days of delivery.`,
      deliveredAt: latestDeliveredAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  return {
    allowed: true,
    deliveredAt: latestDeliveredAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export function buildReturnCaseDocument({
  returnId,
  order = {},
  selected = [],
  owner = {},
  customerId = "",
  reason = "",
  message = "",
  evidence = [],
  createdAt,
}) {
  const orderId = toStr(order?.docId || order?.order?.orderId);
  const orderNumber = toStr(order?.order?.orderNumber);
  const merchantTransactionId = toStr(order?.order?.merchantTransactionId);
  const amountIncl = r2(selected.reduce((sum, entry) => sum + getLineAmountIncl(entry.item), 0));

  return {
    docId: returnId,
    schema_version: 1,
    return: {
      returnId,
      orderId,
      orderNumber,
      merchantTransactionId,
      customerId: toStr(customerId),
      status: "requested",
      reason: toStr(reason),
      message: toStr(message),
      ownerType: owner?.ownerType || "platform",
      ownerLabel: owner?.ownerLabel || "Piessang",
      deliveryType: owner?.deliveryType || null,
      amountIncl,
      currency: "ZAR",
      evidence: Array.isArray(evidence) ? evidence : [],
    },
    ownership: {
      type: owner?.ownerType || "platform",
      label: owner?.ownerLabel || "Piessang",
      responsibility: owner?.responsibility || "",
      sellerCode: owner?.seller?.sellerCode || null,
      sellerSlug: owner?.seller?.sellerSlug || null,
      vendorName: owner?.seller?.vendorName || null,
      deliveryType: owner?.deliveryType || null,
    },
    lines: selected.map((entry) => {
      const item = entry.item || {};
      const product = item?.product_snapshot || item?.product || {};
      const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
      return {
        lineKey: entry.lineKey,
        lineIndex: entry.index,
        quantity: getLineQuantity(item),
        amountIncl: getLineAmountIncl(item),
        productId: toStr(product?.product?.unique_id || product?.docId || ""),
        productTitle: firstNonEmptyString(product?.product?.title, product?.title, "Product"),
        variantId: toStr(variant?.variant_id || ""),
        variantLabel: firstNonEmptyString(variant?.label, variant?.variant_id),
        sellerCode: entry.owner?.seller?.sellerCode || null,
        sellerSlug: entry.owner?.seller?.sellerSlug || null,
        vendorName: entry.owner?.seller?.vendorName || null,
        fulfillmentOwner: entry.owner?.ownerType || "platform",
      };
    }),
    order_snapshot: {
      docId: orderId,
      order: order?.order || {},
      customer: order?.customer || {},
      seller_slices: Array.isArray(order?.seller_slices) ? order.seller_slices : [],
      pricing_snapshot: order?.pricing_snapshot || {},
      delivery_snapshot: order?.delivery_snapshot || order?.delivery || {},
      payment: order?.payment || {},
      timestamps: order?.timestamps || {},
    },
    audit: {
      requestedAt: createdAt,
      updatedAt: createdAt,
      events: [
        {
          type: "requested",
          at: createdAt,
          actorType: "customer",
          actorId: toStr(customerId),
          message: toStr(message),
        },
      ],
    },
    timestamps: {
      createdAt,
      updatedAt: createdAt,
    },
  };
}

export async function findOrderByReference({
  orderId = "",
  orderNumber = "",
  merchantTransactionId = "",
}) {
  const db = getAdminDb();
  if (!db) return null;

  if (orderId) {
    const snap = await db.collection("orders_v2").doc(toStr(orderId)).get();
    if (!snap.exists) return null;
    return { id: snap.id, data: snap.data() || {} };
  }

  const value = toStr(orderNumber || merchantTransactionId);
  const field = orderNumber ? "order.orderNumber" : "order.merchantTransactionId";
  if (!value) return null;
  const snap = await db.collection("orders_v2").where(field, "==", value).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() || {} };
}
