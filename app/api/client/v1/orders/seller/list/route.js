export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { buildOrderDeliveryProgress, enrichOrderItemFulfillment } from "@/lib/orders/fulfillment-progress";
import { getFrozenLineTotalIncl, getFrozenSellerSliceSubtotalIncl } from "@/lib/orders/frozen-money";
import { normalizeMoneyAmount } from "@/lib/money";
import { formatShippingDestinationLabel, getOrderShippingAddress, getSellerShippingEntry } from "@/lib/orders/shipping-breakdown";
import { createOrderTimelineEvent, getOrderTimelineEvents } from "@/lib/orders/timeline";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function isSystemAdminUser(data) {
  return toLower(data?.system?.accessType || data?.systemAccessType) === "admin";
}

function getRequesterSellerIdentifiers(userData) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return new Set(
    [
      seller?.sellerCode,
      seller?.activeSellerCode,
      seller?.groupSellerCode,
      seller?.sellerSlug,
      seller?.activeSellerSlug,
      seller?.groupSellerSlug,
    ]
      .map((item) => toLower(item))
      .filter(Boolean),
  );
}

function getLineSellerIdentifiers(item) {
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

function getLineQuantity(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLinePriceIncl(item) {
  return getFrozenLineTotalIncl(item);
}

function toIsoOrEmpty(value) {
  const input = toStr(value);
  if (!input) return "";
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function addLeadWindow({ createdAt = "", leadTimeDays = null, cutoffTime = "" } = {}) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "";
  const safeLeadDays = Math.max(0, Number(leadTimeDays || 0));
  created.setDate(created.getDate() + safeLeadDays);
  const [hours, minutes] = toStr(cutoffTime || "17:00")
    .split(":")
    .map((part) => Number(part || 0));
  created.setHours(Number.isFinite(hours) ? hours : 17, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return created.toISOString();
}

function buildDeliveryActionPlan({ dueAt = "", overdue = false, selfFulfilmentCount = 0, piessangCount = 0 } = {}) {
  const introSuffix = dueAt
    ? overdue
      ? "This order is now late, so action it immediately."
      : "Action it before the fulfilment deadline shown below."
    : "Action it using the steps below.";

  if (piessangCount > 0 && selfFulfilmentCount === 0) {
    return {
      title: "Piessang is handling fulfilment on this order",
      summary: "There is nothing for you to dispatch on this order. Piessang will fulfil the lines shown under Piessang fulfilment.",
      checklist: [
        "Review the customer-facing order details if needed.",
        "Do not dispatch or update tracking from your seller account.",
        "Use the Piessang fulfilment section only as visibility into customer progress.",
      ],
    };
  }

  return {
    title: "Book courier dispatch for this order",
    summary: `This order uses your shipping rules, so you need to dispatch it with shipping details. ${introSuffix}`,
    checklist: [
      "Pick and pack your seller-handled lines now.",
      "Book the shipment and capture the carrier name and tracking number.",
      "Mark the order dispatched once the shipment is handed over.",
      "Mark it delivered after confirmed delivery.",
    ],
  };
}

function getSellerDeliveryDetails(order, sellerIdentity) {
  const snapshot = order?.delivery_snapshot && typeof order.delivery_snapshot === "object" ? order.delivery_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const breakdown = Array.isArray(snapshot?.sellerDeliveryBreakdown)
    ? snapshot.sellerDeliveryBreakdown
    : Array.isArray(delivery?.fee?.seller_breakdown)
      ? delivery.fee.seller_breakdown
      : [];

  const sellerCode = toLower(sellerIdentity?.sellerCode);
  const sellerSlug = toLower(sellerIdentity?.sellerSlug);
  const entry = breakdown.find((item) => {
    const entryCode = toLower(item?.sellerCode || item?.seller_code || item?.seller_key || "");
    const entrySlug = toLower(item?.sellerSlug || item?.seller_slug || "");
    return Boolean(
      (sellerCode && entryCode === sellerCode) ||
      (sellerSlug && entrySlug === sellerSlug),
    );
  }) || null;

  const address = snapshot?.address || delivery?.address_snapshot || null;
  const destination = [toStr(address?.suburb), toStr(address?.city), toStr(address?.province || address?.stateProvinceRegion), toStr(address?.country)]
    .filter(Boolean)
    .join(", ");

  if (!entry) {
    return {
      type: "unknown",
      label: "Delivery method still needs to be confirmed",
      amountIncl: 0,
      leadTimeDays: null,
      matchedRuleLabel: "",
      destination,
      instructions: "We could not match a saved delivery method for this seller slice yet.",
      trackingMode: "hidden",
    };
  }

  const deliveryType = toLower(entry?.delivery_type || entry?.method || entry?.type || "");
  if (deliveryType === "collection") {
    return {
      type: "collection",
      label: toStr(entry?.label || "Customer collection"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "The customer chose collection, so you should prepare these items for pickup instead of dispatching them.",
      trackingMode: "hidden",
      cutoffTime: null,
    };
  }
  if (deliveryType === "direct_delivery") {
    return {
      type: "direct_delivery",
      label: toStr(entry?.label || "Direct delivery"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "This order falls within your direct delivery coverage, so you should handle the delivery yourself instead of using courier tracking.",
      trackingMode: "direct",
      cutoffTime: toStr(entry?.cutoff_time || entry?.cutoffTime || ""),
    };
  }
  if (deliveryType === "shipping") {
    return {
      type: "shipping",
      label: toStr(entry?.label || "Shipping"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "This order uses your shipping settings, so you can add courier and tracking details when you dispatch it.",
      trackingMode: "courier",
      cutoffTime: toStr(entry?.cutoff_time || entry?.cutoffTime || ""),
    };
  }
  if (deliveryType === "courier_live_rate" || deliveryType === "platform_courier_live_rate") {
    const availableQuotes = Array.isArray(entry?.available_courier_quotes) ? entry.available_courier_quotes : [];
    const selectedQuoteId = toStr(entry?.selected_courier_quote_id || "");
    const selectedQuote = availableQuotes.find((quote) => toStr(quote?.id) === selectedQuoteId) || null;
    const preferredHandoverMode = toLower(entry?.courier_handover_mode || "") === "dropoff" ? "dropoff" : "pickup";
    return {
      type: deliveryType,
      label: toStr(entry?.label || "Platform courier shipping"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "Piessang is managing this courier shipment. Pack the order and wait for the Piessang tracking and handoff instructions instead of adding your own courier details.",
      trackingMode: "platform",
      cutoffTime: toStr(entry?.cutoff_time || entry?.cutoffTime || ""),
      trackingOwner: toStr(entry?.tracking_owner || entry?.trackingOwner || "piessang"),
      courierService: toStr(entry?.courier_service || entry?.courierService || ""),
      courierCarrier: toStr(entry?.courier_carrier || entry?.courierCarrier || ""),
      courierHandoverMode: preferredHandoverMode,
      selectedCourierQuoteId: selectedQuoteId,
      availableCourierCount: availableQuotes.length,
      selectedCourierHandoverOptions: Array.isArray(selectedQuote?.handoverOptions) ? selectedQuote.handoverOptions.map((item) => toStr(item)).filter(Boolean) : [],
      trackingUrl: toStr(entry?.tracking_url || ""),
      labelUrl: toStr(entry?.label_url || ""),
      shipmentStatus: toStr(entry?.shipment_status || ""),
      shipmentCreationState: toStr(entry?.shipment_creation_state || ""),
      shipmentErrorMessage: toStr(entry?.shipment_error_message || ""),
      shipmentLastAttemptAt: toStr(entry?.shipment_last_attempt_at || ""),
      shipmentRetryable: Boolean(entry?.shipment_retryable),
    };
  }

  return {
    type: deliveryType || "unknown",
    label: toStr(entry?.label || "Delivery method"),
    amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
    leadTimeDays: entry?.lead_time_days ?? null,
    matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
    destination,
    instructions: "Use the delivery method saved on this order when you fulfil it.",
    trackingMode: "hidden",
    trackingOwner: toStr(entry?.tracking_owner || entry?.trackingOwner || ""),
    cutoffTime: toStr(entry?.cutoff_time || entry?.cutoffTime || ""),
  };
}

function getSellerCustomerContact(order) {
  const snapshot = order?.customer_snapshot || {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const address = order?.delivery_snapshot?.address || delivery?.address_snapshot || null;
  const phone =
    toStr(address?.phoneNumber) ||
    toStr(snapshot?.phoneNumber) ||
    toStr(snapshot?.account?.phoneNumber) ||
    toStr(snapshot?.personal?.phoneNumber) ||
    "";
  const recipientName =
    toStr(address?.recipientName) ||
    toStr(snapshot?.account?.accountName) ||
    toStr(snapshot?.business?.companyName) ||
    toStr(snapshot?.personal?.fullName) ||
    "Customer";
  const destination = [
    toStr(address?.streetAddress),
    toStr(address?.addressLine2),
    toStr(address?.suburb),
    toStr(address?.city),
    toStr(address?.stateProvinceRegion || address?.province),
    toStr(address?.postalCode),
    toStr(address?.country),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    recipientName,
    phone,
    destination,
    notes: toStr(address?.instructions || address?.deliveryInstructions || delivery?.notes || ""),
  };
}

function getSellerShippingDetails(order, sellerIdentity) {
  const shippingEntry = getSellerShippingEntry(order, sellerIdentity?.sellerCode, sellerIdentity?.sellerSlug);
  const address = getOrderShippingAddress(order);
  const destination =
    formatShippingDestinationLabel({
      city: address?.city,
      province: address?.province,
      postalCode: address?.postalCode,
      country: address?.country,
    }) || formatShippingDestinationLabel(shippingEntry?.destination || {});

  if (!shippingEntry) {
    return {
      type: "shipping",
      label: "Shipping still needs to be confirmed",
      amountIncl: 0,
      leadTimeDays: null,
      matchedRuleLabel: "",
      destination,
      instructions: "We could not match a saved shipping rule for this seller slice yet.",
      trackingMode: "courier",
      cutoffTime: "",
    };
  }

  return {
    type: "shipping",
    label: "Shipping",
    amountIncl: Number(shippingEntry?.baseShippingFee || shippingEntry?.finalShippingFee || 0),
    shopperAmountIncl: Number(shippingEntry?.finalShippingFee || 0),
    platformShippingMarkup: Number(shippingEntry?.platformShippingMarkup || 0),
    leadTimeDays: shippingEntry?.estimatedDeliveryDays?.max ?? null,
    matchedRuleLabel: toStr(shippingEntry?.matchedRuleName || ""),
    destination,
    instructions: "Use the matched shipping rule for this seller shipment. Add courier details when you dispatch it, then keep the shipment status updated manually.",
    trackingMode: "courier",
    trackingNumber: toStr(shippingEntry?.tracking?.trackingNumber || ""),
    trackingUrl: toStr(shippingEntry?.tracking?.trackingUrl || ""),
    courierCarrier: toStr(shippingEntry?.tracking?.courierName || ""),
    shipmentStatus: toStr(shippingEntry?.status || ""),
    cutoffTime: "",
  };
}

function buildSellerTimeline(order, sellerIdentity) {
  const sellerCode = toLower(sellerIdentity?.sellerCode);
  const sellerSlug = toLower(sellerIdentity?.sellerSlug);
  const stored = getOrderTimelineEvents(order).filter((entry) => {
    const entrySellerCode = toLower(entry?.sellerCode);
    const entrySellerSlug = toLower(entry?.sellerSlug);
    if (!entrySellerCode && !entrySellerSlug) return true;
    return Boolean((sellerCode && entrySellerCode === sellerCode) || (sellerSlug && entrySellerSlug === sellerSlug));
  });

  const fallback = [
    createOrderTimelineEvent({
      type: "order_placed",
      title: "Order placed",
      message: `${toStr(
        order?.customer_snapshot?.account?.accountName ||
          order?.customer_snapshot?.business?.companyName ||
          order?.customer_snapshot?.personal?.fullName ||
          "Customer",
      )} placed this order.`,
      actorType: "customer",
      actorLabel: toStr(
        order?.customer_snapshot?.account?.accountName ||
          order?.customer_snapshot?.business?.companyName ||
          order?.customer_snapshot?.personal?.fullName ||
          "Customer",
      ),
      createdAt: toStr(order?.timestamps?.createdAt || ""),
      status: toStr(order?.lifecycle?.orderStatus || order?.order?.status?.order || "confirmed"),
    }),
  ];

  const paymentStatus = toLower(order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment || "");
  if (paymentStatus) {
    fallback.push(
      createOrderTimelineEvent({
        type: "payment_status",
        title: "Payment status updated",
        message: `Payment is currently ${paymentStatus.replace(/_/g, " ")}.`,
        actorType: "system",
        actorLabel: "Piessang",
        createdAt: toStr(order?.payment?.paidAt || order?.timestamps?.updatedAt || order?.timestamps?.createdAt || ""),
        status: paymentStatus,
      }),
    );
  }

  const combined = [...stored];
  for (const entry of fallback) {
    if (!combined.some((item) => toLower(item?.type) === toLower(entry?.type))) {
      combined.push(entry);
    }
  }
  return combined.sort((left, right) => toStr(right?.createdAt).localeCompare(toStr(left?.createdAt)));
}

function getSellerCreditNotes(order, sellerIdentity) {
  const sellerCode = toLower(sellerIdentity?.sellerCode);
  const sellerSlug = toLower(sellerIdentity?.sellerSlug);
  const notesMap =
    order?.credit_notes?.seller_notes && typeof order.credit_notes.seller_notes === "object"
      ? order.credit_notes.seller_notes
      : {};

  return Object.values(notesMap)
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => {
      const entryCode = toLower(entry?.sellerCode);
      const entrySlug = toLower(entry?.sellerSlug);
      return Boolean((sellerCode && entryCode === sellerCode) || (sellerSlug && entrySlug === sellerSlug));
    })
    .sort((left, right) => toStr(right?.issuedAt || right?.createdAt).localeCompare(toStr(left?.issuedAt || left?.createdAt)));
}

function buildSellerSlice(orderId, order, items, sellerIdentity) {
  const enrichedItems = items.map((item) => enrichOrderItemFulfillment(item, order));
  const selfFulfilmentLines = enrichedItems.filter((item) => getLineFulfillmentMode(item) === "seller");
  const piessangFulfilmentLines = enrichedItems.filter((item) => getLineFulfillmentMode(item) === "bevgo");
  const allQty = items.reduce((sum, item) => sum + getLineQuantity(item), 0);
  const subtotalIncl = getFrozenSellerSliceSubtotalIncl(items);
  const orderStatus = toLower(order?.lifecycle?.orderStatus || order?.order?.status?.order || "");
  const paymentStatus = toLower(order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment || "");
  const fulfillmentStatus = toLower(order?.lifecycle?.fulfillmentStatus || order?.order?.status?.fulfillment || "");
  const cancellationStatus = toLower(order?.cancellation?.status || order?.lifecycle?.cancellationStatus || "");
  const cancellationReason = toStr(order?.cancellation?.reason || "");
  const deliveryProgress = buildOrderDeliveryProgress({ ...order, items: enrichedItems }).progress;
  const deliveryOption = getSellerShippingDetails(order, sellerIdentity);
  const customerContact = getSellerCustomerContact(order);
  const dueAt = addLeadWindow({
    createdAt: order?.timestamps?.createdAt || "",
    leadTimeDays: deliveryOption?.leadTimeDays,
    cutoffTime: deliveryOption?.cutoffTime || "",
  });
  const dueDate = dueAt ? new Date(dueAt) : null;
  const overdue = Boolean(
    dueDate &&
      dueDate.getTime() < Date.now() &&
      selfFulfilmentLines.length > 0 &&
      !deliveryProgress?.isComplete &&
      !["cancelled", "completed", "delivered"].includes(fulfillmentStatus || orderStatus),
  );
  const actionPlan = buildDeliveryActionPlan({
    leadTimeDays: deliveryOption?.leadTimeDays,
    dueAt,
    overdue,
    selfFulfilmentCount: selfFulfilmentLines.length,
    piessangCount: piessangFulfilmentLines.length,
  });
  const newOrder = ["payment_pending", "confirmed"].includes(orderStatus);
  const fulfilled = orderStatus === "completed" || fulfillmentStatus === "delivered";
  const unfulfilled = !fulfilled && orderStatus !== "cancelled";
  const deliveryAmountIncl = Number(deliveryOption?.amountIncl || 0);
  const totalIncl = normalizeMoneyAmount(subtotalIncl + deliveryAmountIncl);
  const fulfilmentBlocked =
    ["requested", "approved", "cancelled"].includes(cancellationStatus) ||
    ["cancelled"].includes(orderStatus) ||
    ["refunded", "partial_refund"].includes(paymentStatus);
  const fulfilmentBlockMessage =
    cancellationStatus === "requested"
      ? "The customer requested cancellation. Fulfilment is paused until this is resolved."
      : cancellationStatus === "approved"
        ? "Cancellation has been approved. Do not continue fulfilment."
        : cancellationStatus === "cancelled" || orderStatus === "cancelled"
          ? "This order has been cancelled. Do not continue fulfilment."
          : ["refunded", "partial_refund"].includes(paymentStatus)
            ? "This order has been refunded. Do not continue fulfilment."
            : "";

  return {
    sellerCode: sellerIdentity.sellerCode || "",
    sellerSlug: sellerIdentity.sellerSlug || "",
    vendorName: sellerIdentity.vendorName || "",
    orderId,
    orderNumber: toStr(order?.order?.orderNumber || ""),
    createdAt: toStr(order?.timestamps?.createdAt || ""),
    channel: toStr(order?.order?.channel || ""),
    customerName: toStr(
      order?.customer_snapshot?.account?.accountName ||
        order?.customer_snapshot?.business?.companyName ||
        order?.customer_snapshot?.personal?.fullName ||
        "",
    ),
    orderStatus,
    paymentStatus,
    fulfillmentStatus,
    cancellation: {
      status: cancellationStatus,
      reason: cancellationReason,
      requestedAt: toStr(order?.cancellation?.requestedAt || ""),
      approvedAt: toStr(order?.cancellation?.approvedAt || ""),
      blocked: fulfilmentBlocked,
      blockMessage: fulfilmentBlockMessage,
    },
    deliveryProgress,
    deliveryOption,
    destination: {
      label: customerContact?.destination || "",
      city: toStr(
        order?.delivery_snapshot?.address?.city ||
          order?.delivery?.address_snapshot?.city ||
          "",
      ),
      province: toStr(
        order?.delivery_snapshot?.address?.province ||
          order?.delivery_snapshot?.address?.stateProvinceRegion ||
          order?.delivery?.address_snapshot?.province ||
          order?.delivery?.address_snapshot?.stateProvinceRegion ||
          "",
      ),
    },
    fulfilmentDeadline: {
      dueAt,
      dueAtLabel: toIsoOrEmpty(dueAt),
      overdue,
      showDeadline: Boolean(dueAt && selfFulfilmentLines.length > 0 && !fulfilled),
    },
    actionPlan,
    customerContact,
    counts: {
      items: enrichedItems.length,
      quantity: allQty,
      selfFulfilment: selfFulfilmentLines.length,
      piessangFulfilment: piessangFulfilmentLines.length,
    },
    totals: {
      subtotalIncl,
      deliveryIncl: deliveryAmountIncl,
      totalIncl,
    },
    flags: {
      new: newOrder,
      unfulfilled,
      fulfilled,
    },
    lines: {
      selfFulfilment: selfFulfilmentLines,
      piessangFulfilment: piessangFulfilmentLines,
    },
    timeline: buildSellerTimeline(order, sellerIdentity),
    creditNotes: getSellerCreditNotes(order, sellerIdentity),
  };
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load seller orders.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const isSystemAdmin = isSystemAdminUser(requester);

    const { searchParams } = new URL(req.url);
    const sellerCodeParam = toStr(searchParams.get("sellerCode"));
    const sellerSlugParam = toStr(searchParams.get("sellerSlug"));
    const filter = toLower(searchParams.get("filter") || "all");

    const requesterIdentifiers = getRequesterSellerIdentifiers(requester);
    const scopeSellerCode = isSystemAdmin ? sellerCodeParam : "";
    const scopeSellerSlug = isSystemAdmin ? sellerSlugParam : "";

    const snap = await db.collection("orders_v2").get();
    const allSlices = [];

    for (const docSnap of snap.docs) {
      const order = docSnap.data() || {};
      const items = Array.isArray(order?.items) ? order.items : [];
      const sellerItems = items.filter((item) => {
        const lineSeller = getLineSellerIdentifiers(item);
        const code = toLower(lineSeller.sellerCode);
        const slug = toLower(lineSeller.sellerSlug);
        if (scopeSellerCode) return code === toLower(scopeSellerCode);
        if (scopeSellerSlug) return slug === toLower(scopeSellerSlug);
        return requesterIdentifiers.has(code) || requesterIdentifiers.has(slug);
      });
      if (!sellerItems.length) continue;

      const sellerIdentity = getLineSellerIdentifiers(sellerItems[0]);
      const slice = buildSellerSlice(docSnap.id, order, sellerItems, sellerIdentity);
      allSlices.push(slice);
    }

    const counts = {
      all: allSlices.length,
      new: allSlices.filter((item) => item.flags.new).length,
      unfulfilled: allSlices.filter((item) => item.flags.unfulfilled).length,
      fulfilled: allSlices.filter((item) => item.flags.fulfilled).length,
    };

    const slices = allSlices.filter((slice) => {
      if (filter === "new") return slice.flags.new;
      if (filter === "unfulfilled") return slice.flags.unfulfilled;
      if (filter === "fulfilled") return slice.flags.fulfilled;
      return true;
    });

    slices.sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));

    return ok({ items: slices, counts });
  } catch (e) {
    console.error("seller/orders/list failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller orders.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
