export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyStripeWebhookSignature } from "@/lib/payments/stripe";
import { finalizeStripeSession } from "@/lib/payments/finalize-stripe-session";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function deletePendingOrderIfPresent(orderId, orderNumber, merchantTransactionId) {
  const db = getAdminDb();
  if (!db) return;
  const orderRef = orderId ? db.collection("orders_v2").doc(orderId) : null;
  if (orderRef) {
    const snap = await orderRef.get().catch(() => null);
    if (snap?.exists && toStr(snap.data()?.payment?.status).toLowerCase() !== "paid") {
      await orderRef.delete().catch(() => null);
      return;
    }
  }

  const merchant = toStr(merchantTransactionId);
  if (merchant) {
    const merchantSnap = await db
      .collection("orders_v2")
      .where("order.merchantTransactionId", "==", merchant)
      .limit(1)
      .get()
      .catch(() => null);
    const doc = merchantSnap?.docs?.[0];
    if (doc && toStr(doc.data()?.payment?.status).toLowerCase() !== "paid") {
      await doc.ref.delete().catch(() => null);
      return;
    }
  }

  const orderNum = toStr(orderNumber);
  if (orderNum) {
    const numberSnap = await db
      .collection("orders_v2")
      .where("order.orderNumber", "==", orderNum)
      .limit(1)
      .get()
      .catch(() => null);
    const doc = numberSnap?.docs?.[0];
    if (doc && toStr(doc.data()?.payment?.status).toLowerCase() !== "paid") {
      await doc.ref.delete().catch(() => null);
    }
  }
}

export async function POST(req) {
  try {
    const rawBody = await req.text();
    await verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"));

    const event = JSON.parse(rawBody || "{}");
    const eventType = toStr(event?.type);
    const dataObject = event?.data?.object || {};
    const originBase = new URL(req.url).origin;

    if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
      const sessionId = toStr(dataObject?.id);
      if (sessionId) {
        const result = await finalizeStripeSession({
          originBase,
          sessionId,
          orderId: toStr(dataObject?.metadata?.orderId || ""),
        });
        return ok({ received: true, finalized: result.paid, eventType, sessionId });
      }
    }

    if (eventType === "checkout.session.async_payment_failed") {
      await deletePendingOrderIfPresent(
        toStr(dataObject?.metadata?.orderId || ""),
        "",
        toStr(dataObject?.metadata?.merchantTransactionId || ""),
      );
      return ok({ received: true, failed: true, eventType });
    }

    if (eventType === "payment_intent.succeeded") {
      const paymentIntentId = toStr(dataObject?.id);
      const orderId = toStr(dataObject?.metadata?.orderId || "");
      if (paymentIntentId && orderId) {
        const finalizeResponse = await fetch(`${originBase}/api/client/v1/orders/payment-success`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            payment: {
              provider: "stripe",
              method: "card",
              chargeType: "elements_card",
              merchantTransactionId: toStr(dataObject?.metadata?.merchantTransactionId || ""),
              stripePaymentIntentId: paymentIntentId,
              amount_incl: Number(dataObject?.amount_received || dataObject?.amount || 0) / 100,
              currency: toStr(dataObject?.currency || "zar").toUpperCase(),
            },
          }),
        });
        const finalizePayload = await finalizeResponse.json().catch(() => ({}));
        if (!finalizeResponse.ok || finalizePayload?.ok === false) {
          return err(finalizeResponse.status || 500, "Finalize Failed", finalizePayload?.message || "Unable to finalize Stripe payment.", {
            eventType,
            paymentIntentId,
          });
        }
      }
      return ok({ received: true, finalized: true, eventType, paymentIntentId });
    }

    if (eventType === "payment_intent.payment_failed") {
      await deletePendingOrderIfPresent(
        toStr(dataObject?.metadata?.orderId || ""),
        "",
        toStr(dataObject?.metadata?.merchantTransactionId || ""),
      );
      return ok({ received: true, failed: true, eventType });
    }

    return ok({ received: true, ignored: true, eventType });
  } catch (error) {
    return err(error?.status || 500, "Stripe Webhook Failed", error?.message || "Unable to process Stripe webhook.", {
      error: error?.payload || null,
    });
  }
}
