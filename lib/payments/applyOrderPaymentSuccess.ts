// @ts-nocheck
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import crypto from "crypto";
import { buildPaidStatePatch } from "@/lib/orders/platform-order";

const now = () => new Date().toISOString();
const r2 = value => Number((Number(value) || 0).toFixed(2));

function derivePaymentStatus(amountIncl, requiredAmountIncl) {
  const required = r2(requiredAmountIncl);
  const paid = r2(amountIncl);
  if (required <= 0) return "paid";
  if (paid <= 0) return "pending";
  if (paid + 0.0001 >= required) return "paid";
  return "partial";
}

export async function applyOrderPaymentSuccess({
  orderId,
  provider = "peach",
  method = "card",
  chargeType = "card",
  merchantTransactionId = null,
  peachTransactionId = null,
  stripeSessionId = null,
  stripePaymentIntentId = null,
  threeDSecureId = null,
  amount_incl,
  currency,
  token = null
}) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Admin database is not configured");
  }
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const ref = db.collection("orders_v2").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Order not found");
  }

  const order = snap.data() || {};
  const requiredAmountIncl = r2(order?.payment?.required_amount_incl || amount_incl || 0);
  const paidAmountIncl = r2(amount_incl || requiredAmountIncl);
  const paymentStatus = derivePaymentStatus(paidAmountIncl, requiredAmountIncl);
  const timestamp = now();

  const attempts = Array.isArray(order?.payment?.attempts) ? [...order.payment.attempts] : [];
  const alreadyRecorded = attempts.some(
    attempt =>
      attempt?.peachTransactionId === peachTransactionId ||
      attempt?.stripeSessionId === stripeSessionId ||
      attempt?.stripePaymentIntentId === stripePaymentIntentId ||
      attempt?.merchantTransactionId === merchantTransactionId
  );

  if (!alreadyRecorded) {
    attempts.push({
      provider,
      method,
      chargeType,
      merchantTransactionId,
      peachTransactionId,
      stripeSessionId,
      stripePaymentIntentId,
      threeDSecureId,
      amount_incl: paidAmountIncl,
      currency,
      status: "charged",
      createdAt: timestamp
    });
  }

  const updatePayload = {
    ...buildPaidStatePatch(order, {
      provider,
      method,
      chargeType,
      merchantTransactionId,
      peachTransactionId,
      stripeSessionId,
      stripePaymentIntentId,
      threeDSecureId,
      amount_incl: paidAmountIncl,
      currency,
      token,
      timestamp,
    }),
    "payment.attempts": attempts,
  };

  await ref.update(updatePayload);

  const paymentId = `pay_${orderId}_${peachTransactionId || crypto.randomUUID().replace(/-/g, "")}`;
  await db.collection("payments_v2").doc(paymentId).set(
    {
      paymentId,
      orderId,
      provider,
      method,
      chargeType,
      merchantTransactionId,
      peachTransactionId,
      stripeSessionId,
      stripePaymentIntentId,
      threeDSecureId,
      amount_incl: paidAmountIncl,
      currency,
      status: paymentStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
      _updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    orderId,
    paymentId,
    paymentStatus,
    orderStatus: paymentStatus === "paid" ? "confirmed" : order?.order?.status?.order || "confirmed"
  };
}

export default { applyOrderPaymentSuccess };
