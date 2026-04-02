export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { upsertAutoReturnsExcessCreditNote } from "@/lib/creditNotes";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";
import { canTransitionOrderLifecycle } from "@/lib/orders/status-lifecycle";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";

/* ───────── HELPERS ───────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error") =>
  NextResponse.json({ ok: false, title, message }, { status });

const now = () => new Date().toISOString();
const r2 = value => Number((Number(value) || 0).toFixed(2));

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
    const updatePayload = {
      "order.status.order": status,
      "lifecycle.orderStatus": status,
      "lifecycle.updatedAt": now(),
      "timestamps.updatedAt": now()
    };
    const timelineEvent = createOrderTimelineEvent({
      type: `order_${status}`,
      title: defaultOrderReasons[status] || "Order status updated",
      message: reason || defaultReason,
      actorType: "admin",
      actorLabel: "Piessang",
      createdAt: now(),
      status,
    });
    updatePayload["timeline.events"] = appendOrderTimelineEvent(order, timelineEvent);
    updatePayload["timeline.updatedAt"] = now();

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
      }
    } else if (isRefunded) {
      updatePayload["order.editable"] = false;
      updatePayload["order.editable_reason"] = "Order locked due to being refunded.";
      updatePayload["lifecycle.editable"] = false;
      updatePayload["lifecycle.editableReason"] = "Order locked due to being refunded.";
      updatePayload["timestamps.lockedAt"] = order?.timestamps?.lockedAt || now();
    }

    await ref.update(updatePayload);

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
      credit_note: creditNote
    });
  } catch (e) {
    return err(
      e?.code ?? 500,
      e?.title ?? "Update Failed",
      e?.message ?? "Unexpected error updating order status."
    );
  }
}
