export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { upsertAutoReturnsExcessCreditNote } from "@/lib/creditNotes";
import { normalizeMoneyAmount } from "@/lib/money";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";
import { canTransitionOrderLifecycle } from "@/lib/orders/status-lifecycle";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";
import { processStripeOrderRefund } from "@/lib/payments/stripe-refunds";
import { sendCancellationEmails } from "@/lib/orders/cancellation-notifications";

/* ───────── HELPERS ───────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error") =>
  NextResponse.json({ ok: false, title, message }, { status });

const now = () => new Date().toISOString();
const r2 = value => normalizeMoneyAmount(Number(value) || 0);

const allowedOrderStatuses = [
  "payment_pending",
  "confirmed",
  "processing",
  "dispatched",
  "completed",
  "cancelled"
];

const defaultOrderReasons = {
  payment_pending: "Order is awaiting payment confirmation.",
  confirmed: "Order confirmed.",
  processing: "Order is being processed.",
  dispatched: "Order dispatched.",
  completed: "Order completed.",
  cancelled: "Order cancelled."
};

async function resolveOrderId(orderId, orderNumber) {
  const db = getAdminDb();
  if (!db) return null;
  if (orderId) return orderId;
  if (!orderNumber) return null;

  const matchSnap = await db.collection("orders_v2").where("order.orderNumber", "==", orderNumber).get();

  if (matchSnap.size > 1) {
    throw { code: 409, title: "Multiple Orders Found", message: "Multiple orders match this orderNumber." };
  }

  if (matchSnap.empty) return null;
  return matchSnap.docs[0].id;
}

/* ───────── ENDPOINT ───────── */

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json().catch(() => ({}));
    const orderNumber = body?.orderNumber || null;
    const status = String(body?.status || "").trim().toLowerCase();
    const reason = String(body?.reason || "").trim();
    const defaultReason = defaultOrderReasons[status] || "Order status updated.";

    if (!orderNumber) {
      return err(400, "Missing Input", "orderNumber is required.");
    }

    if (!allowedOrderStatuses.includes(status)) {
      return err(
        400,
        "Invalid Status",
        `status must be one of: ${allowedOrderStatuses.join(", ")}`
      );
    }
    if (status === "cancelled" && !reason) {
      return err(400, "Missing Input", "A cancellation reason is required.");
    }

    const resolvedOrderId = await resolveOrderId(null, orderNumber);
    if (!resolvedOrderId) {
      return err(404, "Order Not Found", "Order could not be located.");
    }

    const ref = db.collection("orders_v2").doc(resolvedOrderId);
    const snap = await ref.get();
    if (!snap.exists) {
      return err(404, "Order Not Found", "Order could not be located.");
    }

    const order = snap.data();
    const currentStatus = String(order?.lifecycle?.orderStatus || order?.order?.status?.order || "").trim().toLowerCase();
    if (!canTransitionOrderLifecycle({ currentStatus, nextStatus: status })) {
      return err(409, "Invalid Status Change", `You cannot move this order from ${currentStatus || "unknown"} to ${status}.`);
    }
    const paymentStatus =
      order?.payment?.status || order?.order?.status?.payment || null;
    const isRefunded =
      paymentStatus === "refunded" || paymentStatus === "partial_refund";
    const paymentProvider = String(order?.payment?.provider || "").trim().toLowerCase();
    const cancellationStatus = String(order?.cancellation?.status || order?.lifecycle?.cancellationStatus || "")
      .trim()
      .toLowerCase();
    const actingAdminUid = String(body?.adminUid || body?.updatedByUid || "system-admin").trim() || "system-admin";
    const shouldRefundApprovedCancellation =
      status === "cancelled" &&
      paymentProvider === "stripe" &&
      paymentStatus === "paid" &&
      (cancellationStatus === "requested" || cancellationStatus === "approved");
    const sellerTargets = Array.from(
      new Map(
        (Array.isArray(order?.seller_slices) ? order.seller_slices : [])
          .map((slice) => {
            const sellerCode = String(slice?.sellerCode || "").trim();
            const sellerSlug = String(slice?.sellerSlug || "").trim();
            const vendorName = String(slice?.vendorName || "Seller").trim();
            const key = sellerCode || sellerSlug || vendorName;
            return [key, { sellerCode, sellerSlug, vendorName }];
          }),
      ).values(),
    );
    const updatePayload = {
      "order.status.order": status,
      "lifecycle.orderStatus": status,
      "lifecycle.updatedAt": now(),
      "timestamps.updatedAt": now()
    };
    const eventTimestamp = now();

    if (status === "completed" || status === "cancelled") {
      updatePayload["order.editable"] = false;
      updatePayload["order.editable_reason"] =
        reason || `Order locked due to being ${status}.`;
      updatePayload["lifecycle.editable"] = false;
      updatePayload["lifecycle.editableReason"] =
        reason || `Order locked due to being ${status}.`;
      updatePayload["timestamps.lockedAt"] = order?.timestamps?.lockedAt || now();
      if (status === "cancelled") {
        updatePayload["lifecycle.cancelledAt"] = now();
        updatePayload["order.cancel_message"] = reason;
        updatePayload["order.cancel_message_at"] = now();
        if (cancellationStatus === "requested" || cancellationStatus === "approved") {
          updatePayload["cancellation.status"] = "approved";
          updatePayload["cancellation.approvedAt"] = now();
          updatePayload["cancellation.approvedByUid"] = actingAdminUid;
          updatePayload["cancellation.approvalReason"] = reason || "Cancellation approved.";
          updatePayload["lifecycle.cancellationStatus"] = "cancelled";
        }
      }
    } else if (isRefunded) {
      updatePayload["order.editable"] = false;
      updatePayload["order.editable_reason"] = "Order locked due to being refunded.";
      updatePayload["lifecycle.editable"] = false;
      updatePayload["lifecycle.editableReason"] = "Order locked due to being refunded.";
      updatePayload["timestamps.lockedAt"] = order?.timestamps?.lockedAt || now();
    }

    let refundResult = null;
    if (shouldRefundApprovedCancellation) {
      refundResult = await processStripeOrderRefund({
        orderRef: ref,
        orderId: resolvedOrderId,
        order,
        refundRequestId: `cancellation-approval:${resolvedOrderId}`,
        message: reason || "Cancellation approved.",
        adminUid: actingAdminUid,
        markOrderCancelled: true,
        cancelReason: reason || "Cancellation approved.",
      });
      updatePayload["payment.status"] = refundResult?.status === "partial_refund" ? "partial_refund" : "refunded";
      updatePayload["order.status.payment"] = refundResult?.status === "partial_refund" ? "partial_refund" : "refunded";
      updatePayload["lifecycle.paymentStatus"] = refundResult?.status === "partial_refund" ? "partial_refund" : "refunded";
      updatePayload["payment.refunded_at"] = refundResult?.refundedAt || now();
      updatePayload["payment.refunded_amount_incl"] = refundResult?.refundedAmountIncl ?? order?.payment?.refunded_amount_incl ?? 0;
      updatePayload["payment.paid_amount_incl"] = refundResult?.remainingPaid ?? 0;
    }

    const refundStarted =
      shouldRefundApprovedCancellation &&
      ["refunded", "partial_refund", "already_refunded"].includes(
        String(refundResult?.status || "").trim().toLowerCase(),
      );
    const timelineEvent = createOrderTimelineEvent({
      type:
        status === "cancelled"
          ? refundStarted
            ? "order_cancelled_refunded"
            : "order_cancelled"
          : `order_${status}`,
      title:
        status === "cancelled"
          ? refundStarted
            ? "Order cancelled and refund started"
            : "Order cancelled"
          : defaultOrderReasons[status] || "Order status updated",
      message: reason || defaultReason,
      actorType: "admin",
      actorLabel: "Piessang",
      createdAt: eventTimestamp,
      status:
        status === "cancelled" && refundStarted
          ? "refunded"
          : status,
    });
    updatePayload["timeline.events"] = appendOrderTimelineEvent(order, timelineEvent);
    updatePayload["timeline.updatedAt"] = eventTimestamp;

    await ref.set(updatePayload, { merge: true });

    const nextOrder = {
      ...order,
      lifecycle: {
        ...(order?.lifecycle || {}),
        orderStatus: status,
        updatedAt: updatePayload["lifecycle.updatedAt"],
        cancelledAt:
          status === "cancelled"
            ? updatePayload["lifecycle.cancelledAt"] || order?.lifecycle?.cancelledAt
            : order?.lifecycle?.cancelledAt,
        cancellationStatus:
          status === "cancelled" && (cancellationStatus === "requested" || cancellationStatus === "approved")
            ? "cancelled"
            : order?.lifecycle?.cancellationStatus,
        paymentStatus:
          refundStarted
            ? refundResult?.status === "partial_refund"
              ? "partial_refund"
              : "refunded"
            : order?.lifecycle?.paymentStatus,
      },
      order: {
        ...(order?.order || {}),
        cancel_message: status === "cancelled" ? reason : order?.order?.cancel_message,
        cancel_message_at:
          status === "cancelled"
            ? updatePayload["order.cancel_message_at"] || eventTimestamp
            : order?.order?.cancel_message_at,
        editable:
          status === "completed" || status === "cancelled"
            ? false
            : order?.order?.editable,
        editable_reason:
          status === "completed" || status === "cancelled"
            ? reason || `Order locked due to being ${status}.`
            : order?.order?.editable_reason,
        status: {
          ...(order?.order?.status || {}),
          order: status,
          payment:
            refundStarted
              ? refundResult?.status === "partial_refund"
                ? "partial_refund"
                : "refunded"
              : order?.order?.status?.payment,
        },
      },
      payment: {
        ...(order?.payment || {}),
        status:
          refundStarted
            ? refundResult?.status === "partial_refund"
              ? "partial_refund"
              : "refunded"
            : order?.payment?.status,
        refunded_at: refundStarted ? (refundResult?.refundedAt || eventTimestamp) : order?.payment?.refunded_at,
        refunded_amount_incl:
          refundStarted
            ? (refundResult?.refundedAmountIncl ?? order?.payment?.refunded_amount_incl ?? 0)
            : order?.payment?.refunded_amount_incl,
        paid_amount_incl:
          refundStarted
            ? (refundResult?.remainingPaid ?? 0)
            : order?.payment?.paid_amount_incl,
      },
      cancellation:
        status === "cancelled" && (cancellationStatus === "requested" || cancellationStatus === "approved")
          ? {
              ...(order?.cancellation || {}),
              status: "approved",
              approvedAt: updatePayload["cancellation.approvedAt"] || eventTimestamp,
              approvedByUid: actingAdminUid,
              approvalReason: reason || "Cancellation approved.",
            }
          : order?.cancellation,
      timestamps: {
        ...(order?.timestamps || {}),
        updatedAt: updatePayload["timestamps.updatedAt"],
        lockedAt:
          status === "completed" || status === "cancelled"
            ? updatePayload["timestamps.lockedAt"] || order?.timestamps?.lockedAt
            : order?.timestamps?.lockedAt,
      },
    };

    if (status === "cancelled") {
      await sendCancellationEmails({
        origin: new URL(req.url).origin,
        order: nextOrder,
        orderId: resolvedOrderId,
        sellerTargets,
        customerReason: reason || "",
        refundStarted,
        requestOnly: false,
      }).catch(() => null);
    }

    await syncOrderSellerSettlements({
      orderId: resolvedOrderId,
      orderNumber: order?.order?.orderNumber || orderNumber,
      eventType: status,
    });

    let creditNote = null;
    if (status === "completed") {
      const totals = order?.totals || {};
      const returnsModule = order?.returns || {};
      const finalIncl = r2(totals?.final_incl || 0);
      const creditAppliedIncl = r2(totals?.credit?.applied || 0);
      const dueBeforeReturnsIncl = r2(Math.max(finalIncl - creditAppliedIncl, 0));
      const collectedReturnsIncl = r2(
        returnsModule?.collected_returns_incl ??
          returnsModule?.totals?.incl ??
          totals?.collected_returns_incl ??
          0
      );
      const excessReturnsCreditIncl = r2(
        Math.max(collectedReturnsIncl - dueBeforeReturnsIncl, 0)
      );

      creditNote = await upsertAutoReturnsExcessCreditNote({
        orderId: resolvedOrderId,
        orderNumber: order?.order?.orderNumber || orderNumber,
        customerId:
          order?.meta?.orderedFor ||
          order?.order?.customerId ||
          order?.customer_snapshot?.uid ||
          null,
        excessAmountIncl: excessReturnsCreditIncl,
        issuedBy: "system"
      });
    }

    return ok({
      orderId: resolvedOrderId,
      orderNumber: order?.order?.orderNumber || null,
      status,
      credit_note: creditNote,
      refundStatus: refundResult?.status || null,
      refundId: refundResult?.refundId || null,
    });
  } catch (e) {
    return err(
      e?.code ?? 500,
      e?.title ?? "Update Failed",
      e?.message ?? "Unexpected error updating order status."
    );
  }
}
