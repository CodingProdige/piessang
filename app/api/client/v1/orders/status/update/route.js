export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { upsertAutoReturnsExcessCreditNote } from "@/lib/creditNotes";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";

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
    const paymentStatus =
      order?.payment?.status || order?.order?.status?.payment || null;
    const isRefunded =
      paymentStatus === "refunded" || paymentStatus === "partial_refund";
    const updatePayload = {
      "order.status.order": status,
      "timestamps.updatedAt": now()
    };

    if (status === "completed" || status === "cancelled") {
      updatePayload["order.editable"] = false;
      updatePayload["order.editable_reason"] =
        reason || `Order locked due to being ${status}.`;
      updatePayload["timestamps.lockedAt"] = order?.timestamps?.lockedAt || now();
    } else if (isRefunded) {
      updatePayload["order.editable"] = false;
      updatePayload["order.editable_reason"] = "Order locked due to being refunded.";
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
