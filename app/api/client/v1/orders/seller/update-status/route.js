export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { buildOrderDeliveryProgress, deriveAggregateOrderStatuses, enrichOrderItemFulfillment } from "@/lib/orders/fulfillment-progress";
import { canTransitionSellerFulfillment, getSellerFulfillmentStatusLabel, normalizeSellerFulfillmentStatus, requiresCancellationReason } from "@/lib/orders/status-lifecycle";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";
import { sendTrackingUpdateNotifications } from "@/lib/orders/tracking-notifications";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
    sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
    vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || ""),
  };
}

function getCustomerEmail(order) {
  const snapshot = order?.customer_snapshot || {};
  const account = snapshot?.account || {};
  const personal = snapshot?.personal || {};
  return (
    toStr(snapshot?.email) ||
    toStr(account?.email) ||
    toStr(personal?.email) ||
    ""
  );
}

function getCustomerPhone(order) {
  const snapshot = order?.customer_snapshot || {};
  const account = snapshot?.account || {};
  const personal = snapshot?.personal || {};
  return (
    toStr(snapshot?.phoneNumber) ||
    toStr(account?.phoneNumber) ||
    toStr(account?.mobileNumber) ||
    toStr(personal?.phoneNumber) ||
    toStr(personal?.mobileNumber) ||
    ""
  );
}

function getCustomerName(order) {
  const snapshot = order?.customer_snapshot || {};
  const account = snapshot?.account || {};
  const business = snapshot?.business || {};
  const personal = snapshot?.personal || {};
  return (
    toStr(account?.accountName) ||
    toStr(business?.companyName) ||
    toStr(personal?.fullName) ||
    "Customer"
  );
}

function getSellerDeliveryBreakdownEntry(order, sellerCode, sellerSlug) {
  const pricingSnapshot = order?.pricing_snapshot && typeof order.pricing_snapshot === "object" ? order.pricing_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const breakdown = Array.isArray(pricingSnapshot?.sellerDeliveryBreakdown)
    ? pricingSnapshot.sellerDeliveryBreakdown
    : Array.isArray(delivery?.fee?.seller_breakdown)
      ? delivery.fee.seller_breakdown
      : [];
  const normalizedCode = toLower(sellerCode);
  const normalizedSlug = toLower(sellerSlug);
  return (
    breakdown.find((entry) => {
      const entryCode = toLower(entry?.sellerCode || entry?.seller_code || entry?.seller_key || "");
      const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
      return Boolean((normalizedCode && entryCode === normalizedCode) || (normalizedSlug && entrySlug === normalizedSlug));
    }) || null
  );
}

async function resolveOrderId(db, orderId, orderNumber) {
  if (orderId) return orderId;
  if (!orderNumber) return null;
  const snap = await db.collection("orders_v2").where("order.orderNumber", "==", orderNumber).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to update seller order status.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const orderIdInput = toStr(body?.orderId);
    const orderNumberInput = toStr(body?.orderNumber);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const status = normalizeSellerFulfillmentStatus(body?.status);
    const trackingNumber = toStr(body?.trackingNumber);
    const courierName = toStr(body?.courierName);
    const notes = toStr(body?.notes);
    const cancellationReason = toStr(body?.cancellationReason || body?.reason);

    if (!orderIdInput && !orderNumberInput) {
      return err(400, "Missing Order", "orderId or orderNumber is required.");
    }
    if (!sellerCode && !sellerSlug) {
      return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");
    }
    if (!["processing", "dispatched", "delivered", "cancelled"].includes(status)) {
      return err(400, "Invalid Status", "status must be processing, dispatched, delivered, or cancelled.");
    }
    if (requiresCancellationReason(status) && !cancellationReason) {
      return err(400, "Missing Cancellation Reason", "A cancellation reason is required before cancelling an order.");
    }

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canAccessSellerSettlement(requester, sellerSlug, sellerCode) && !isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "You do not have permission to update this seller order.");
    }

    const resolvedOrderId = await resolveOrderId(db, orderIdInput, orderNumberInput);
    if (!resolvedOrderId) return err(404, "Order Not Found", "Could not find that order.");

    const orderRef = db.collection("orders_v2").doc(resolvedOrderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "Could not find that order.");

    const order = orderSnap.data() || {};
    const now = new Date().toISOString();
    const sourceItems = Array.isArray(order?.items) ? order.items : [];
    const touchedItems = [];
    const sellerDeliveryEntry = getSellerDeliveryBreakdownEntry(order, sellerCode, sellerSlug);
    const trackingOwner = toLower(sellerDeliveryEntry?.tracking_owner || sellerDeliveryEntry?.trackingOwner || "");
    const previousOrderStatus = toLower(order?.lifecycle?.orderStatus || order?.order?.status?.order || "");
    const cancellationStatus = toLower(order?.cancellation?.status || order?.lifecycle?.cancellationStatus || "");
    const paymentStatus = toLower(order?.payment?.status || order?.lifecycle?.paymentStatus || order?.order?.status?.payment || "");

    if (["requested", "approved", "cancelled"].includes(cancellationStatus)) {
      return err(
        409,
        "Cancellation In Progress",
        cancellationStatus === "cancelled"
          ? "This order has already been cancelled. Seller fulfilment updates are locked."
          : "This order has a customer cancellation request in progress. Seller fulfilment updates are locked until the cancellation is resolved.",
        { cancellationStatus },
      );
    }

    if (["refunded", "partial_refund"].includes(paymentStatus) || previousOrderStatus === "cancelled") {
      return err(409, "Order Locked", "This order can no longer be fulfilled because it has been cancelled or refunded.", {
        cancellationStatus,
        paymentStatus,
      });
    }

    const sellerSourceItems = sourceItems
      .filter((item) => {
        const lineSeller = getLineSellerIdentity(item);
        return (
          (sellerCode && toLower(lineSeller.sellerCode) === toLower(sellerCode)) ||
          (sellerSlug && toLower(lineSeller.sellerSlug) === toLower(sellerSlug))
        );
      })
      .map((item) => enrichOrderItemFulfillment(item, order));
    const currentSellerStatus = deriveAggregateOrderStatuses(sellerSourceItems, order)?.fulfillmentStatus || "confirmed";

    if (
      !canTransitionSellerFulfillment({
        currentStatus: currentSellerStatus,
        nextStatus: status,
        deliveryType: sellerDeliveryEntry?.delivery_type || sellerDeliveryEntry?.method || "",
        isComplete: sellerSourceItems.every((item) => toLower(item?.fulfillment_tracking?.status) === "delivered"),
      })
    ) {
      return err(409, "Invalid Status Change", `You cannot move this order from ${getSellerFulfillmentStatusLabel(currentSellerStatus)} to ${getSellerFulfillmentStatusLabel(status)}.`);
    }
    if (trackingOwner === "piessang" && (trackingNumber || courierName)) {
      return err(409, "Tracking Managed By Piessang", "This shipping method is tracked by Piessang, so sellers cannot add courier details manually.");
    }

    const nextItems = sourceItems.map((item) => {
      const lineSeller = getLineSellerIdentity(item);
      const matchesSeller =
        (sellerCode && toLower(lineSeller.sellerCode) === toLower(sellerCode)) ||
        (sellerSlug && toLower(lineSeller.sellerSlug) === toLower(sellerSlug));
      if (!matchesSeller) return enrichOrderItemFulfillment(item, order);

      const nextItem = enrichOrderItemFulfillment(
        {
          ...item,
          fulfillment_tracking: {
            ...(item?.fulfillment_tracking || {}),
            status,
            updatedAt: now,
            updatedBy: sessionUser.uid,
            trackingNumber: trackingNumber || item?.fulfillment_tracking?.trackingNumber || null,
            courierName: courierName || item?.fulfillment_tracking?.courierName || null,
            notes: notes || item?.fulfillment_tracking?.notes || null,
            cancellationReason: cancellationReason || item?.fulfillment_tracking?.cancellationReason || null,
            cancelledAt: status === "cancelled" ? now : item?.fulfillment_tracking?.cancelledAt || null,
          },
        },
        order,
      );
      touchedItems.push(nextItem);
      return nextItem;
    });

    if (!touchedItems.length) {
      return err(404, "Seller Items Not Found", "This seller does not have any items on that order.");
    }

    const aggregate = deriveAggregateOrderStatuses(nextItems, order);
    const { items: enrichedItems, progress } = buildOrderDeliveryProgress({ ...order, items: nextItems });

    const wholeOrderCancelled = aggregate.orderStatus === "cancelled";
    const sellerVendorName = touchedItems[0]?.product_snapshot?.product?.vendorName || touchedItems[0]?.product_snapshot?.seller?.vendorName || "";
    const timelineEvent = createOrderTimelineEvent({
      type: `seller_${status}`,
      title:
        status === "cancelled"
          ? "Seller cancelled this order"
          : status === "dispatched"
            ? (trackingNumber || courierName ? "Order handed to courier" : "Order out for delivery")
            : status === "delivered"
              ? "Seller marked this order delivered"
              : "Seller started processing this order",
      message:
        status === "cancelled"
          ? `The seller cancelled this order.${cancellationReason ? ` Reason: ${cancellationReason}` : ""}`
          : status === "dispatched"
            ? [
                "The seller marked this order as on the way.",
                courierName ? `Courier: ${courierName}.` : "",
                trackingNumber ? `Tracking number: ${trackingNumber}.` : "",
                notes ? `Note: ${notes}` : "",
              ].filter(Boolean).join(" ")
            : status === "delivered"
              ? "The seller confirmed that this order has been delivered."
              : "The seller started preparing this order.",
      actorType: isSystemAdminUser(requester) ? "admin" : "seller",
      actorId: sessionUser.uid,
      actorLabel: toStr(
        requester?.seller?.vendorName ||
          requester?.account?.accountName ||
          requester?.personal?.fullName ||
          requester?.email ||
          sellerVendorName ||
          "Seller",
      ),
      createdAt: now,
      status,
      sellerCode: sellerCode || touchedItems[0]?.product_snapshot?.product?.sellerCode || "",
      sellerSlug: sellerSlug || touchedItems[0]?.product_snapshot?.product?.sellerSlug || "",
      metadata: {
        courierName: courierName || null,
        trackingNumber: trackingNumber || null,
        note: notes || null,
        itemCount: touchedItems.length,
        cancellationReason: cancellationReason || null,
      },
    });
    let nextTimelineEvents = appendOrderTimelineEvent(order, timelineEvent);
    const orderJustCompleted = aggregate.orderStatus === "completed" && previousOrderStatus !== "completed";
    if (orderJustCompleted) {
      nextTimelineEvents = appendOrderTimelineEvent(
        { timeline: { events: nextTimelineEvents } },
        createOrderTimelineEvent({
          type: "order_completed",
          title: "Order completed",
          message: "All sellers on this order have completed fulfilment. You can now leave a seller or product review.",
          actorType: "system",
          actorId: "piessang",
          actorLabel: "Piessang",
          createdAt: now,
          status: "completed",
        }),
      );
    }

    await orderRef.set(
      {
        items: enrichedItems,
        order: {
          ...(order?.order || {}),
          status: {
            ...(order?.order?.status || {}),
            order: aggregate.orderStatus,
            fulfillment: aggregate.fulfillmentStatus,
          },
          ...(wholeOrderCancelled
            ? {
                editable: false,
                editable_reason: cancellationReason,
                cancel_message: cancellationReason,
                cancel_message_at: now,
              }
            : {}),
        },
        lifecycle: {
          ...(order?.lifecycle || {}),
          orderStatus: aggregate.orderStatus,
          fulfillmentStatus: aggregate.fulfillmentStatus,
          updatedAt: now,
          ...(wholeOrderCancelled
            ? {
                cancelledAt: now,
                editable: false,
                editableReason: cancellationReason,
              }
            : {}),
        },
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt: now,
          ...(wholeOrderCancelled ? { lockedAt: order?.timestamps?.lockedAt || now } : {}),
        },
        timeline: {
          ...(order?.timeline || {}),
          events: nextTimelineEvents,
          updatedAt: now,
        },
      },
      { merge: true },
    );

    const customerEmail = getCustomerEmail(order);
    const customerPhone = getCustomerPhone(order);
    const customerName = getCustomerName(order);
    const origin = new URL(req.url).origin;
    await sendTrackingUpdateNotifications({
      origin,
      customerEmail,
      customerPhone,
      customerName,
      orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
      deliveryType: sellerDeliveryEntry?.delivery_type || sellerDeliveryEntry?.method || "",
      status,
      courierName: courierName || touchedItems[0]?.fulfillment_tracking?.courierName || "",
      trackingNumber: trackingNumber || touchedItems[0]?.fulfillment_tracking?.trackingNumber || "",
      sellerVendorName,
      cancellationReason,
      itemCount: touchedItems.length,
      items: touchedItems.map((item) => ({
        title: toStr(item?.product_snapshot?.product?.title || item?.product_snapshot?.title || "Product"),
        variant: toStr(item?.selected_variant_snapshot?.label || item?.selected_variant_snapshot?.variant_id || ""),
        quantity: Number(item?.quantity || 0),
        statusLabel: getSellerFulfillmentStatusLabel(status),
      })),
    });

    if (status === "delivered" && currentSellerStatus !== "delivered" && customerEmail) {
      const reviewSellerSlug =
        sellerSlug ||
        toStr(touchedItems[0]?.product_snapshot?.product?.sellerSlug || touchedItems[0]?.product_snapshot?.seller?.sellerSlug || "");
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "seller-rating-request",
          to: customerEmail,
          data: {
            customerName,
            vendorName: sellerVendorName || "your seller",
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
            reviewUrl: `${origin}/account/orders/${encodeURIComponent(resolvedOrderId)}${reviewSellerSlug ? `?rateSeller=${encodeURIComponent(reviewSellerSlug)}` : ""}`,
          },
        }),
      }).catch(() => null);
    }

    if (orderJustCompleted && customerEmail) {
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-review-request",
          to: customerEmail,
          data: {
            customerName,
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
            orderUrl: `${origin}/account/orders/${encodeURIComponent(resolvedOrderId)}`,
            reviewsUrl: `${origin}/account/reviews`,
          },
        }),
      }).catch(() => null);
    }

    return ok({
      message: "Seller order items updated.",
      orderId: resolvedOrderId,
      orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || ""),
      updatedCount: touchedItems.length,
      status,
      deliveryProgress: progress,
    });
  } catch (e) {
    return err(500, "Update Failed", e?.message || "Unexpected error updating seller order items.");
  }
}
