// @ts-nocheck
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import crypto from "crypto";

const now = () => new Date().toISOString();
const r2 = value => Number((Number(value) || 0).toFixed(2));

function derivePaymentStatus(amountIncl, requiredAmountIncl) {
  const required = r2(requiredAmountIncl);
  const paid = r2(amountIncl);
  if (required <= 0) return "paid";
  if (paid <= 0) return "unpaid";
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
  threeDSecureId = null,
  amount_incl,
  currency,
  token = null
}) {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const ref = doc(db, "orders_v2", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
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
      attempt?.merchantTransactionId === merchantTransactionId
  );

  if (!alreadyRecorded) {
    attempts.push({
      provider,
      method,
      chargeType,
      merchantTransactionId,
      peachTransactionId,
      threeDSecureId,
      amount_incl: paidAmountIncl,
      currency,
      status: "charged",
      createdAt: timestamp
    });
  }

  const updatePayload = {
    "payment.provider": provider,
    "payment.method": method,
    "payment.chargeType": chargeType,
    "payment.status": paymentStatus,
    "payment.paid_amount_incl": paidAmountIncl,
    "payment.currency": currency || order?.payment?.currency || null,
    "payment.required_amount_incl": requiredAmountIncl,
    "payment.merchantTransactionId": merchantTransactionId || order?.payment?.merchantTransactionId || null,
    "payment.peachTransactionId": peachTransactionId || order?.payment?.peachTransactionId || null,
    "payment.threeDSecureId": threeDSecureId || order?.payment?.threeDSecureId || null,
    "payment.token": token || order?.payment?.token || null,
    "payment.attempts": attempts,
    "order.status.payment": paymentStatus,
    "order.status.order": paymentStatus === "paid" ? "confirmed" : order?.order?.status?.order || "confirmed",
    "order.editable": false,
    "order.editable_reason": "Order is locked because payment was completed.",
    "timestamps.updatedAt": timestamp,
    "timestamps.lockedAt": order?.timestamps?.lockedAt || timestamp
  };

  await updateDoc(ref, updatePayload);

  const paymentId = `pay_${orderId}_${peachTransactionId || crypto.randomUUID().replace(/-/g, "")}`;
  await setDoc(
    doc(db, "payments_v2", paymentId),
    {
      paymentId,
      orderId,
      provider,
      method,
      chargeType,
      merchantTransactionId,
      peachTransactionId,
      threeDSecureId,
      amount_incl: paidAmountIncl,
      currency,
      status: paymentStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
      _updatedAt: serverTimestamp()
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
