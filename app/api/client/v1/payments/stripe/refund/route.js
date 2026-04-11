export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { normalizeMoneyAmount } from "@/lib/money";
import { processStripeOrderRefund } from "@/lib/payments/stripe-refunds";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status: s });

const now = () => new Date().toISOString();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function r2(value) {
  return normalizeMoneyAmount(Number(value) || 0);
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return r2(next);
}

async function resolveOrderRef({ db, orderId, orderNumber, merchantTransactionId }) {
  if (orderId) return db.collection("orders_v2").doc(orderId);

  const field = orderNumber ? "order.orderNumber" : "order.merchantTransactionId";
  const value = orderNumber || merchantTransactionId;
  if (!value) return null;

  const snap = await db.collection("orders_v2").where(field, "==", value).get();
  if (snap.empty) return null;
  if (snap.size > 1) {
    const error = new Error("Multiple orders match this reference.");
    error.status = 409;
    throw error;
  }
  return snap.docs[0].ref;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to process refunds.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only Piessang admins can process Stripe refunds.");
    }

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const orderNumber = toStr(body?.orderNumber);
    const merchantTransactionId = toStr(body?.merchantTransactionId);
    const refundRequestId = toStr(body?.refundRequestId);
    const note = toStr(body?.message || body?.note);
    const amount = normalizeAmount(body?.amount);

    if (!orderId && !orderNumber && !merchantTransactionId) {
      return err(400, "Missing Order Reference", "orderId, orderNumber, or merchantTransactionId is required.");
    }

    const orderRef = await resolveOrderRef({ db, orderId, orderNumber, merchantTransactionId });
    if (!orderRef) return err(404, "Order Not Found", "Order could not be located.");

    const snap = await orderRef.get();
    if (!snap.exists) return err(404, "Order Not Found", "Order could not be located.");
    const order = snap.data() || {};

    const refundResult = await processStripeOrderRefund({
      orderRef,
      orderId: snap.id,
      order,
      amount,
      refundRequestId,
      message: note,
      adminUid: sessionUser.uid,
      markOrderCancelled: true,
      cancelReason: note || "Order is locked because it was fully refunded.",
    });

    return ok({
      orderId: snap.id,
      refundId: refundResult.refundId || "",
      paymentIntentId: refundResult.paymentIntentId || "",
      status: refundResult.status,
      remainingPaid: refundResult.remainingPaid,
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Refund Failed", error?.message || "Unexpected error processing the Stripe refund.", {
      error: error?.payload || null,
    });
  }
}
