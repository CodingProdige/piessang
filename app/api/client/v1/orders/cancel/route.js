export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";
import { requireSessionUser } from "@/lib/api/security";
import { customerOwnsOrder } from "@/lib/orders/returns";
import { getOrderCancellationState } from "@/lib/orders/cancellation";
import { createCustomerNotification } from "@/lib/notifications/customer-inbox";
import { createSellerNotification } from "@/lib/notifications/seller-inbox";
import { processStripeOrderRefund } from "@/lib/payments/stripe-refunds";
import { sendCancellationEmails } from "@/lib/orders/cancellation-notifications";

/* ───────── HELPERS ───────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error") =>
  NextResponse.json({ ok: false, title, message }, { status });

const now = () => new Date().toISOString();

async function resolveOrderRef({ orderId, orderNumber, merchantTransactionId }) {
  const db = getAdminDb();
  if (!db) return null;
  if (orderId) return db.collection("orders_v2").doc(orderId);

  const field = orderNumber
    ? "order.orderNumber"
    : "order.merchantTransactionId";
  const value = orderNumber || merchantTransactionId;

  const snap = await db.collection("orders_v2").where(field, "==", value).get();

  if (snap.empty) return null;
  if (snap.size > 1) {
    throw { code: 409, title: "Multiple Orders Found", message: "Multiple orders match this reference." };
  }

  return snap.docs[0].ref;
}

/* ───────── ENDPOINT ───────── */

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) {
      return err(401, "Unauthorized", "Sign in again to manage this order.");
    }

    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const {
      orderId,
      orderNumber,
      merchantTransactionId,
      reason
    } = await req.json();
    const cancelMessage = String(reason || "").trim();

    if (!orderId && !orderNumber && !merchantTransactionId) {
      return err(
        400,
        "Missing Order Reference",
        "orderId, orderNumber, or merchantTransactionId is required."
      );
    }

    if (!cancelMessage) {
      return err(400, "Missing Input", "reason is required.");
    }

    const ref = await resolveOrderRef({
      orderId,
      orderNumber,
      merchantTransactionId
    });

    if (!ref) {
      return err(404, "Order Not Found", "Order could not be located.");
    }

    const snap = await ref.get();
    if (!snap.exists) {
      return err(404, "Order Not Found", "Order could not be located.");
    }

    const order = snap.data();
    if (!customerOwnsOrder(order, sessionUser.uid)) {
      return err(403, "Access Denied", "You can only manage cancellation for your own orders.");
    }

    const currentStatus = String(order?.lifecycle?.orderStatus || order?.order?.status?.order || "").trim().toLowerCase();
    const cancellation = getOrderCancellationState(order);

    if (currentStatus === "cancelled") {
      return ok({
        orderId: snap.id,
        orderNumber: order?.order?.orderNumber || null,
        merchantTransactionId: order?.order?.merchantTransactionId || null,
        status: "cancelled",
        alreadyCancelled: true
      });
    }
    if (!cancellation.canSubmit || !cancellation.mode) {
      return err(409, cancellation.title || "Cancellation unavailable", cancellation.message || "This order can no longer be cancelled.");
    }

    const sellerTargets = Array.from(
      new Map(
        (Array.isArray(order?.seller_slices) ? order.seller_slices : [])
          .map((slice) => {
            const sellerCode = String(slice?.sellerCode || "").trim();
            const sellerSlug = String(slice?.sellerSlug || "").trim();
            const vendorName = String(slice?.vendorName || "Seller").trim();
            const key = sellerCode || sellerSlug || vendorName;
            return [
              key,
              { sellerCode, sellerSlug, vendorName },
            ];
          }),
      ).values(),
    );

    const requestedAt = now();
    const isDirectCancel = cancellation.mode === "cancel";
    const paymentStatus = String(order?.payment?.status || order?.order?.status?.payment || "")
      .trim()
      .toLowerCase();
    const paymentProvider = String(order?.payment?.provider || "")
      .trim()
      .toLowerCase();
    const shouldRefundImmediately =
      isDirectCancel && paymentStatus === "paid" && paymentProvider === "stripe";
    let refundResult = null;

    if (shouldRefundImmediately) {
      refundResult = await processStripeOrderRefund({
        orderRef: ref,
        orderId: snap.id,
        order,
        refundRequestId: `order-cancel:${snap.id}`,
        message: cancelMessage,
        adminUid: sessionUser.uid,
        markOrderCancelled: true,
        cancelReason: cancelMessage,
      });
    }

    const updatePayload = isDirectCancel
      ? {
          "order.status.order": "cancelled",
          "lifecycle.orderStatus": "cancelled",
          "lifecycle.cancellationStatus": "cancelled",
          "lifecycle.updatedAt": requestedAt,
          "lifecycle.cancelledAt": requestedAt,
          "lifecycle.editable": false,
          "lifecycle.editableReason": cancelMessage,
          "order.editable": false,
          "order.editable_reason": cancelMessage,
          "order.cancel_message": cancelMessage,
          "order.cancel_message_at": requestedAt,
          "cancellation.status": "cancelled",
          "cancellation.mode": "cancel",
          "cancellation.reason": cancelMessage,
          "cancellation.requestedAt": requestedAt,
          "cancellation.requestedByUid": sessionUser.uid,
          "timestamps.updatedAt": requestedAt,
          "timestamps.lockedAt": order?.timestamps?.lockedAt || requestedAt,
        }
      : {
          "lifecycle.cancellationStatus": "requested",
          "lifecycle.updatedAt": requestedAt,
          "cancellation.status": "requested",
          "cancellation.mode": "request",
          "cancellation.reason": cancelMessage,
          "cancellation.requestedAt": requestedAt,
          "cancellation.requestedByUid": sessionUser.uid,
          "timestamps.updatedAt": requestedAt,
        };
    updatePayload["timeline.events"] = appendOrderTimelineEvent(
      order,
      createOrderTimelineEvent({
        type: isDirectCancel ? (shouldRefundImmediately ? "order_cancelled_refunded" : "order_cancelled") : "order_cancellation_requested",
        title: isDirectCancel ? (shouldRefundImmediately ? "Order cancelled and refunded" : "Order cancelled") : "Cancellation requested",
        message: cancelMessage,
        actorType: "customer",
        actorLabel: "Customer",
        createdAt: requestedAt,
        status: isDirectCancel ? (shouldRefundImmediately ? "refunded" : "cancelled") : currentStatus || "confirmed",
      }),
    );
    updatePayload["timeline.updatedAt"] = requestedAt;

    const finalUpdatePayload = !shouldRefundImmediately
      ? updatePayload
      : {
          ...updatePayload,
          "payment.status": refundResult?.status === "partial_refund" ? "partial_refund" : "refunded",
          "order.status.payment": refundResult?.status === "partial_refund" ? "partial_refund" : "refunded",
          "payment.refunded_at": refundResult?.refundedAt || requestedAt,
          "payment.refunded_amount_incl": refundResult?.refundedAmountIncl ?? order?.payment?.refunded_amount_incl ?? null,
          "payment.paid_amount_incl": refundResult?.remainingPaid ?? 0,
          "lifecycle.paymentStatus": refundResult?.status === "partial_refund" ? "partial_refund" : "refunded",
        };

    await ref.update(finalUpdatePayload);

    const nextOrder = {
      ...order,
      lifecycle: {
        ...(order?.lifecycle || {}),
        orderStatus: isDirectCancel ? "cancelled" : order?.lifecycle?.orderStatus,
        cancellationStatus: isDirectCancel ? "cancelled" : "requested",
        updatedAt: requestedAt,
        cancelledAt: isDirectCancel ? requestedAt : order?.lifecycle?.cancelledAt,
        editable: isDirectCancel ? false : order?.lifecycle?.editable,
        editableReason: isDirectCancel ? cancelMessage : order?.lifecycle?.editableReason,
        paymentStatus: shouldRefundImmediately
          ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
          : order?.lifecycle?.paymentStatus,
      },
      order: {
        ...(order?.order || {}),
        editable: isDirectCancel ? false : order?.order?.editable,
        editable_reason: isDirectCancel ? cancelMessage : order?.order?.editable_reason,
        cancel_message: isDirectCancel ? cancelMessage : order?.order?.cancel_message,
        cancel_message_at: isDirectCancel ? requestedAt : order?.order?.cancel_message_at,
        status: {
          ...(order?.order?.status || {}),
          order: isDirectCancel ? "cancelled" : order?.order?.status?.order,
          payment: shouldRefundImmediately
            ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
            : order?.order?.status?.payment,
        },
      },
      payment: {
        ...(order?.payment || {}),
        status: shouldRefundImmediately
          ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
          : order?.payment?.status,
        refunded_at: shouldRefundImmediately ? (refundResult?.refundedAt || requestedAt) : order?.payment?.refunded_at,
        refunded_amount_incl: shouldRefundImmediately
          ? (refundResult?.refundedAmountIncl ?? order?.payment?.refunded_amount_incl ?? null)
          : order?.payment?.refunded_amount_incl,
        paid_amount_incl: shouldRefundImmediately ? (refundResult?.remainingPaid ?? 0) : order?.payment?.paid_amount_incl,
      },
      cancellation: {
        ...(order?.cancellation || {}),
        status: isDirectCancel ? "cancelled" : "requested",
        mode: cancellation.mode,
        reason: cancelMessage,
        requestedAt,
        requestedByUid: sessionUser.uid,
      },
      timestamps: {
        ...(order?.timestamps || {}),
        updatedAt: requestedAt,
        lockedAt: isDirectCancel ? (order?.timestamps?.lockedAt || requestedAt) : order?.timestamps?.lockedAt,
      },
    };
    const nextCancellation = getOrderCancellationState(nextOrder);

    await createCustomerNotification({
      userId: sessionUser.uid,
      type: isDirectCancel ? "customer-order-cancelled" : "customer-order-cancellation-requested",
      title: isDirectCancel ? (shouldRefundImmediately ? "Order cancelled and refund started" : "Order cancelled") : "Cancellation request received",
      message: isDirectCancel
        ? shouldRefundImmediately
          ? `Your order ${order?.order?.orderNumber || snap.id} was cancelled and your Stripe refund has started.`
          : `Your order ${order?.order?.orderNumber || snap.id} was cancelled successfully.`
        : `We’ve received your cancellation request for order ${order?.order?.orderNumber || snap.id}.`,
      href: `/account/orders/${snap.id}`,
      metadata: {
        orderId: snap.id,
        orderNumber: order?.order?.orderNumber || null,
      },
      dedupeKey: `${isDirectCancel ? "cancelled" : "cancellation-requested"}:${snap.id}:${sessionUser.uid}`,
    }).catch(() => null);

    await Promise.all(
      sellerTargets.map((target) =>
        createSellerNotification({
          sellerCode: target.sellerCode,
          sellerSlug: target.sellerSlug,
          type: isDirectCancel ? "seller-order-cancelled" : "seller-order-cancellation-requested",
          title: isDirectCancel ? (shouldRefundImmediately ? "Order cancelled and refunded" : "Order cancelled") : "Cancellation requested",
          message: isDirectCancel
            ? shouldRefundImmediately
              ? `Order ${order?.order?.orderNumber || snap.id} was cancelled by the customer and a Stripe refund has started.`
              : `Order ${order?.order?.orderNumber || snap.id} was cancelled by the customer.`
            : `A customer requested cancellation for order ${order?.order?.orderNumber || snap.id}.`,
          href: "/seller/dashboard?section=orders",
          metadata: {
            orderId: snap.id,
            orderNumber: order?.order?.orderNumber || null,
            reason: cancelMessage,
            vendorName: target.vendorName,
          },
        }).catch(() => null),
      ),
    );

    await sendCancellationEmails({
      origin: new URL(req.url).origin,
      order: nextOrder,
      orderId: snap.id,
      sellerTargets,
      customerReason: cancelMessage,
      refundStarted:
        shouldRefundImmediately &&
        ["refunded", "partial_refund", "already_refunded"].includes(
          String(refundResult?.status || "").trim().toLowerCase(),
        ),
      requestOnly: !isDirectCancel,
    }).catch(() => null);

    return ok({
      orderId: snap.id,
      orderNumber: order?.order?.orderNumber || null,
      merchantTransactionId: order?.order?.merchantTransactionId || null,
      status: isDirectCancel ? "cancelled" : "requested",
      mode: cancellation.mode,
      cancellation: nextCancellation,
      refundStatus: refundResult?.status || null,
      refundId: refundResult?.refundId || null,
    });
  } catch (e) {
    return err(
      e?.code ?? 500,
      e?.title ?? "Cancel Failed",
      e?.message ?? "Unexpected error cancelling order."
    );
  }
}
