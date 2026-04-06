export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeMoneyAmount } from "@/lib/money";
import { ensureStripeCustomer, getStripePublishableKey, stripeRequest } from "@/lib/payments/stripe";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function r2(value) {
  return normalizeMoneyAmount(Number(value) || 0);
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Database Unavailable", "Admin database is not configured.");

    const publishableKey = getStripePublishableKey();
    if (!publishableKey) {
      return err(500, "Stripe Not Configured", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required.");
    }

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const userId = toStr(body?.userId);
    const savePaymentMethod = body?.savePaymentMethod === true;
    const selectedPaymentMethodId = toStr(body?.selectedPaymentMethodId);

    if (!orderId || !userId) {
      return err(400, "Missing Parameters", "orderId and userId are required.");
    }

    const orderSnap = await db.collection("orders_v2").doc(orderId).get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "The order could not be located.");

    const order = orderSnap.data() || {};
    const orderCustomerId = toStr(order?.order?.customerId || order?.customer?.customerId || "");
    if (orderCustomerId && orderCustomerId !== userId) {
      return err(403, "Forbidden", "This order does not belong to the signed-in user.");
    }
    if (toStr(order?.payment?.status).toLowerCase() === "paid") {
      return err(409, "Already Paid", "This order has already been paid.");
    }

    const amountIncl = r2(order?.payment?.required_amount_incl || 0);
    const currency = toStr(order?.payment?.currency || "ZAR").toLowerCase();
    if (amountIncl <= 0) return err(400, "Invalid Amount", "The order has no payable amount.");

    const customerEmail = toStr(
      order?.customer?.email ||
        order?.customer_snapshot?.email ||
        order?.customer_snapshot?.account?.email ||
        order?.customer_snapshot?.personal?.email ||
        "",
    );
    const customerName = toStr(
      order?.customer?.accountName ||
        order?.customer_snapshot?.account?.accountName ||
        order?.customer_snapshot?.personal?.fullName ||
        "",
    );
    const customerPhone = toStr(
      order?.customer?.phone ||
        order?.customer_snapshot?.phoneNumber ||
        order?.customer_snapshot?.account?.phoneNumber ||
        order?.customer_snapshot?.personal?.phoneNumber ||
        "",
    );

    const customerId = await ensureStripeCustomer({
      db,
      userId,
      email: customerEmail,
      name: customerName,
      phone: customerPhone,
    });

    const form = new URLSearchParams();
    form.set("amount", String(Math.round(amountIncl * 100)));
    form.set("currency", currency);
    form.set("customer", customerId);
    form.set("confirmation_method", "automatic");
    form.set("capture_method", "automatic");
    form.set("metadata[orderId]", orderId);
    form.set("metadata[userId]", userId);
    form.set("metadata[merchantTransactionId]", toStr(order?.order?.merchantTransactionId || ""));
    if (savePaymentMethod) {
      form.set("setup_future_usage", "off_session");
    }
    if (selectedPaymentMethodId) {
      form.set("payment_method", selectedPaymentMethodId);
    }

    const intent = await stripeRequest("/v1/payment_intents", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    await orderSnap.ref.set(
      {
        payment: {
          stripeCustomerId: customerId,
          stripePaymentIntentId: toStr(intent?.id || "") || null,
        },
        payment_summary: {
          lastAttemptAt: new Date().toISOString(),
        },
        lifecycle: {
          updatedAt: new Date().toISOString(),
        },
        timestamps: {
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );

    return ok({
      orderId,
      publishableKey,
      customerId,
      paymentIntentId: toStr(intent?.id || ""),
      clientSecret: toStr(intent?.client_secret || ""),
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Intent Failed", error?.message || "Unable to prepare payment.", {
      error: error?.payload || null,
    });
  }
}
