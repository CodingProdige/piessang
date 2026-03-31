export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/* ───────── HELPERS ───────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

async function resolveOrderRef({ orderId, orderNumber, merchantTransactionId }) {
  const db = getAdminDb();
  if (!db) return null;
  if (orderId) {
    return db.collection("orders_v2").doc(orderId);
  }

  const field = orderNumber
    ? "order.orderNumber"
    : "order.merchantTransactionId";
  const value = orderNumber || merchantTransactionId;

  const snap = await db.collection("orders_v2").where(field, "==", value).get();

  if (snap.empty) {
    return null;
  }

  if (snap.size > 1) {
    throw new Error("multiple_orders");
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

    const { orderId, orderNumber, merchantTransactionId, force = false } =
      await req.json();

    if (!orderId && !orderNumber && !merchantTransactionId) {
      return err(
        400,
        "Missing Order Reference",
        "orderId, orderNumber, or merchantTransactionId is required."
      );
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
    const paid = order?.payment?.status === "paid";
    const createIntentKey =
      typeof order?.meta?.createIntentKey === "string" ? order.meta.createIntentKey.trim() : "";

    if (paid && !force) {
      return err(
        409,
        "Order Already Paid",
        "Paid orders cannot be deleted without force=true.",
        {
          orderId: snap.id,
          orderNumber: order?.order?.orderNumber || null,
          merchantTransactionId: order?.order?.merchantTransactionId || null
        }
      );
    }

    await ref.delete();

    if (createIntentKey) {
      await db.collection("idempotency_order_create_v2").doc(createIntentKey).delete().catch(() => null);
    }

    return ok({
      orderId: snap.id,
      orderNumber: order?.order?.orderNumber || null,
      merchantTransactionId: order?.order?.merchantTransactionId || null,
      deleted: true
    });
  } catch (e) {
    if (e?.message === "multiple_orders") {
      return err(
        409,
        "Multiple Orders Found",
        "Multiple orders match this reference."
      );
    }

    return err(500, "Delete Failed", e?.message || "Unexpected server error.");
  }
}
