import { stripeRequest } from "@/lib/payments/stripe";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function r2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export async function finalizeStripeSession({ originBase, sessionId, orderId = "" }) {
  const session = await stripeRequest(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`,
  );

  const paymentStatus = toStr(session?.payment_status).toLowerCase();
  const sessionStatus = toStr(session?.status).toLowerCase();
  const paymentIntentId = toStr(session?.payment_intent?.id || session?.payment_intent || "");
  const amountTotal = r2((Number(session?.amount_total || 0) || 0) / 100);
  const currency = toStr(session?.currency || "zar").toUpperCase();
  const sessionOrderId = toStr(session?.metadata?.orderId || orderId);

  if (paymentStatus === "paid" && sessionOrderId) {
    const finalizeResponse = await fetch(`${originBase}/api/client/v1/orders/payment-success`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: sessionOrderId,
        payment: {
          provider: "stripe",
          method: "card",
          chargeType: "embedded_checkout",
          merchantTransactionId: toStr(session?.metadata?.merchantTransactionId || ""),
          stripeSessionId: sessionId,
          stripePaymentIntentId: paymentIntentId,
          amount_incl: amountTotal,
          currency,
        },
      }),
    });
    const finalizePayload = await finalizeResponse.json().catch(() => ({}));
    if (!finalizeResponse.ok || finalizePayload?.ok === false) {
      const error = new Error(finalizePayload?.message || "Unable to finalize the paid order.");
      error.status = finalizeResponse.status || 500;
      error.payload = finalizePayload;
      throw error;
    }
  }

  return {
    session,
    sessionId,
    orderId: sessionOrderId || null,
    paymentStatus,
    sessionStatus,
    paymentIntentId: paymentIntentId || null,
    paid: paymentStatus === "paid",
  };
}

export default {
  finalizeStripeSession,
};
