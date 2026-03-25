export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

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
    const currentStatus = order?.lifecycle?.orderStatus || order?.order?.status?.order || null;

    if (currentStatus === "cancelled") {
      return ok({
        orderId: snap.id,
        orderNumber: order?.order?.orderNumber || null,
        merchantTransactionId: order?.order?.merchantTransactionId || null,
        status: "cancelled",
        alreadyCancelled: true
      });
    }

    const updatePayload = {
      "order.status.order": "cancelled",
      "lifecycle.orderStatus": "cancelled",
      "lifecycle.updatedAt": now(),
      "lifecycle.cancelledAt": now(),
      "lifecycle.editable": false,
      "lifecycle.editableReason": cancelMessage,
      "order.editable": false,
      "order.editable_reason": cancelMessage,
      "order.cancel_message": cancelMessage,
      "order.cancel_message_at": now(),
      "timestamps.updatedAt": now(),
      "timestamps.lockedAt": order?.timestamps?.lockedAt || now()
    };

    await ref.update(updatePayload);

    return ok({
      orderId: snap.id,
      orderNumber: order?.order?.orderNumber || null,
      merchantTransactionId: order?.order?.merchantTransactionId || null,
      status: "cancelled"
    });
  } catch (e) {
    return err(
      e?.code ?? 500,
      e?.title ?? "Cancel Failed",
      e?.message ?? "Unexpected error cancelling order."
    );
  }
}
