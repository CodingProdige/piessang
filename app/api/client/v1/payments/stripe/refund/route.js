export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { normalizeMoneyAmount } from "@/lib/money";
import { stripeRequest } from "@/lib/payments/stripe";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";

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

    const paymentProvider = toStr(order?.payment?.provider).toLowerCase();
    if (paymentProvider !== "stripe") {
      return err(409, "Invalid Provider", "This order was not paid through Stripe.");
    }

    const paymentIntentId = toStr(order?.payment?.stripePaymentIntentId || "");
    if (!paymentIntentId) {
      return err(409, "Missing Payment", "We could not find the Stripe payment intent for this order.");
    }

    const paymentStatus = toStr(order?.payment?.status || order?.order?.status?.payment).toLowerCase();
    if (["refunded"].includes(paymentStatus)) {
      return err(409, "Already Refunded", "This order has already been fully refunded.");
    }

    const paidAmount = r2(order?.payment?.paid_amount_incl || order?.payment?.required_amount_incl || 0);
    const existingRefunded = r2(order?.payment?.refunded_amount_incl || 0);
    const remainingPaid = r2(Math.max(paidAmount, 0));
    const refundAmount = amount == null ? remainingPaid : amount;
    if (refundAmount <= 0) {
      return err(409, "Nothing To Refund", "No paid balance remains on this order.");
    }
    if (refundAmount > remainingPaid) {
      return err(409, "Invalid Refund Amount", "Refund amount cannot exceed remaining paid amount.", {
        remaining_paid_amount_incl: remainingPaid,
      });
    }

    const existingAttempts = Array.isArray(order?.payment?.attempts) ? order.payment.attempts : [];
    if (refundRequestId) {
      const existingByRequestId = existingAttempts.find((attempt) => attempt?.type === "refund" && attempt?.refundRequestId === refundRequestId);
      if (existingByRequestId) {
        return ok({
          orderId: snap.id,
          status: "already_processed",
          refundId: existingByRequestId?.stripeRefundId || existingByRequestId?.transactionId || null,
        });
      }
    }

    const form = new URLSearchParams();
    form.set("payment_intent", paymentIntentId);
    form.set("amount", String(Math.round(refundAmount * 100)));
    form.set("metadata[orderId]", snap.id);
    form.set("metadata[adminUid]", sessionUser.uid);
    if (refundRequestId) form.set("metadata[refundRequestId]", refundRequestId);

    const refundRes = await stripeRequest("/v1/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const nextRefundedTotal = r2(existingRefunded + refundAmount);
    const nextRemainingPaid = r2(Math.max(remainingPaid - refundAmount, 0));
    const isFullyRefunded = nextRemainingPaid === 0;
    const refundAttempt = {
      type: "refund",
      provider: "stripe",
      stripeRefundId: toStr(refundRes?.id || ""),
      stripePaymentIntentId: paymentIntentId,
      amount_incl: refundAmount,
      currency: toStr(order?.payment?.currency || "ZAR"),
      status: isFullyRefunded ? "refunded" : "partial_refund",
      createdAt: now(),
      refundedBy: sessionUser.uid,
      ...(refundRequestId ? { refundRequestId } : {}),
      ...(note ? { message: note } : {}),
    };

    const updatePayload = {
      "payment.status": isFullyRefunded ? "refunded" : "partial_refund",
      "payment.paid_amount_incl": nextRemainingPaid,
      "payment.refunded_amount_incl": nextRefundedTotal,
      "payment.refunded_currency": toStr(order?.payment?.currency || "ZAR"),
      "payment.refunded_at": now(),
      "payment.refund_count": Number(order?.payment?.refund_count || 0) + 1,
      "payment.attempts": [...existingAttempts, refundAttempt],
      "order.status.payment": isFullyRefunded ? "refunded" : "partial_refund",
      "timestamps.updatedAt": now(),
    };

    if (note) {
      updatePayload["order.refund_message"] = note;
      updatePayload["order.refund_message_at"] = now();
    }

    if (isFullyRefunded) {
      updatePayload["order.status.order"] = "cancelled";
      updatePayload["order.editable"] = false;
      updatePayload["order.editable_reason"] = "Order is locked because it was fully refunded.";
      updatePayload["timestamps.lockedAt"] = order?.timestamps?.lockedAt || now();
    }

    await orderRef.set(updatePayload, { merge: true });
    await syncOrderSellerSettlements({
      orderId: snap.id,
      eventType: isFullyRefunded ? "refund_full" : "refund_partial",
    }).catch(() => null);

    return ok({
      orderId: snap.id,
      refundId: toStr(refundRes?.id || ""),
      paymentIntentId,
      status: isFullyRefunded ? "refunded" : "partial_refund",
      remainingPaid: nextRemainingPaid,
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Refund Failed", error?.message || "Unexpected error processing the Stripe refund.", {
      error: error?.payload || null,
    });
  }
}
