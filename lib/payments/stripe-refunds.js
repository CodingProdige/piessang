import { normalizeMoneyAmount } from "@/lib/money";
import { stripeRequest } from "@/lib/payments/stripe";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";

const now = () => new Date().toISOString();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function r2(value) {
  return normalizeMoneyAmount(Number(value) || 0);
}

export async function processStripeOrderRefund({
  orderRef,
  orderId,
  order = {},
  amount = null,
  refundRequestId = "",
  message = "",
  adminUid = "",
  markOrderCancelled = false,
  cancelReason = "",
}) {
  const paymentProvider = toStr(order?.payment?.provider).toLowerCase();
  if (paymentProvider !== "stripe") {
    const error = new Error("This order was not paid through Stripe.");
    error.status = 409;
    throw error;
  }

  const paymentIntentId = toStr(order?.payment?.stripePaymentIntentId);
  if (!paymentIntentId) {
    const error = new Error("We could not find the Stripe payment intent for this order.");
    error.status = 409;
    throw error;
  }

  const paymentStatus = toStr(order?.payment?.status || order?.order?.status?.payment).toLowerCase();
  if (paymentStatus === "refunded") {
    return {
      orderId,
      paymentIntentId,
      status: "already_refunded",
      refundId: null,
      remainingPaid: 0,
      refundedAmountIncl: r2(order?.payment?.refunded_amount_incl || 0),
    };
  }

  const paidAmount = r2(order?.payment?.paid_amount_incl || order?.payment?.required_amount_incl || 0);
  const existingRefunded = r2(order?.payment?.refunded_amount_incl || 0);
  const remainingPaid = r2(Math.max(paidAmount, 0));
  const refundAmount = amount == null ? remainingPaid : r2(amount);
  if (refundAmount <= 0) {
    const error = new Error("No paid balance remains on this order.");
    error.status = 409;
    throw error;
  }
  if (refundAmount > remainingPaid) {
    const error = new Error("Refund amount cannot exceed remaining paid amount.");
    error.status = 409;
    error.extra = { remaining_paid_amount_incl: remainingPaid };
    throw error;
  }

  const existingAttempts = Array.isArray(order?.payment?.attempts) ? order.payment.attempts : [];
  if (refundRequestId) {
    const existingByRequestId = existingAttempts.find(
      (attempt) => attempt?.type === "refund" && attempt?.refundRequestId === refundRequestId,
    );
    if (existingByRequestId) {
      return {
        orderId,
        paymentIntentId,
        status: "already_processed",
        refundId: existingByRequestId?.stripeRefundId || existingByRequestId?.transactionId || null,
        remainingPaid: r2(
          Math.max(
            remainingPaid -
              r2(existingByRequestId?.amount_incl || existingByRequestId?.refunded_amount_incl || refundAmount),
            0,
          ),
        ),
        refundedAmountIncl: existingRefunded,
      };
    }
  }

  const form = new URLSearchParams();
  form.set("payment_intent", paymentIntentId);
  form.set("amount", String(Math.round(refundAmount * 100)));
  form.set("metadata[orderId]", orderId);
  if (adminUid) form.set("metadata[adminUid]", adminUid);
  if (refundRequestId) form.set("metadata[refundRequestId]", refundRequestId);

  let refundRes = null;
  try {
    refundRes = await stripeRequest("/v1/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (error) {
    const message = toStr(error?.message).toLowerCase();
    if (
      message.includes("already been refunded") ||
      message.includes("charge already refunded") ||
      message.includes("payment intent has already been refunded")
    ) {
      return {
        orderId,
        paymentIntentId,
        status: "already_refunded",
        refundId: null,
        remainingPaid: 0,
        refundedAmountIncl: existingRefunded > 0 ? existingRefunded : paidAmount,
        refundedAt: now(),
      };
    }
    throw error;
  }

  const refundedAt = now();
  const nextRefundedTotal = r2(existingRefunded + refundAmount);
  const nextRemainingPaid = r2(Math.max(remainingPaid - refundAmount, 0));
  const isFullyRefunded = nextRemainingPaid === 0;
  const refundStatus = isFullyRefunded ? "refunded" : "partial_refund";

  const refundAttempt = {
    type: "refund",
    provider: "stripe",
    stripeRefundId: toStr(refundRes?.id),
    stripePaymentIntentId: paymentIntentId,
    amount_incl: refundAmount,
    currency: toStr(order?.payment?.currency || "ZAR"),
    status: refundStatus,
    createdAt: refundedAt,
    ...(adminUid ? { refundedBy: adminUid } : {}),
    ...(refundRequestId ? { refundRequestId } : {}),
    ...(message ? { message } : {}),
  };

  const updatePayload = {
    "payment.status": refundStatus,
    "payment.paid_amount_incl": nextRemainingPaid,
    "payment.refunded_amount_incl": nextRefundedTotal,
    "payment.refunded_currency": toStr(order?.payment?.currency || "ZAR"),
    "payment.refunded_at": refundedAt,
    "payment.refund_count": Number(order?.payment?.refund_count || 0) + 1,
    "payment.attempts": [...existingAttempts, refundAttempt],
    "order.status.payment": refundStatus,
    "timestamps.updatedAt": refundedAt,
  };

  if (message) {
    updatePayload["order.refund_message"] = message;
    updatePayload["order.refund_message_at"] = refundedAt;
  }

  if (markOrderCancelled && isFullyRefunded) {
    const reasonText = toStr(cancelReason || message);
    updatePayload["order.status.order"] = "cancelled";
    updatePayload["lifecycle.orderStatus"] = "cancelled";
    updatePayload["lifecycle.paymentStatus"] = "refunded";
    updatePayload["lifecycle.cancellationStatus"] = "cancelled";
    updatePayload["lifecycle.updatedAt"] = refundedAt;
    updatePayload["lifecycle.cancelledAt"] = toStr(order?.lifecycle?.cancelledAt) || refundedAt;
    updatePayload["lifecycle.editable"] = false;
    updatePayload["lifecycle.editableReason"] = reasonText || "Order refunded and cancelled.";
    updatePayload["order.editable"] = false;
    updatePayload["order.editable_reason"] = reasonText || "Order refunded and cancelled.";
    updatePayload["timestamps.lockedAt"] = order?.timestamps?.lockedAt || refundedAt;
  }

  await orderRef.set(updatePayload, { merge: true });
  await syncOrderSellerSettlements({
    orderId,
    eventType: isFullyRefunded ? "refund_full" : "refund_partial",
  }).catch(() => null);

  return {
    orderId,
    paymentIntentId,
    refundId: toStr(refundRes?.id),
    status: refundStatus,
    remainingPaid: nextRemainingPaid,
    refundedAmountIncl: nextRefundedTotal,
    refundedAt,
  };
}
