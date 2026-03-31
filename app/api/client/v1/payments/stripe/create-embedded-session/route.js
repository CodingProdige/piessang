export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripePublishableKey, stripeRequest } from "@/lib/payments/stripe";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function r2(value) {
  return Number((Number(value) || 0).toFixed(2));
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
    const shopperResultUrl = toStr(body?.shopperResultUrl);

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
    if (amountIncl <= 0) {
      return err(400, "Invalid Amount", "The order has no payable amount.");
    }

    const merchantTransactionId = toStr(order?.order?.merchantTransactionId || "");
    const orderNumber = toStr(order?.order?.orderNumber || orderId);
    const origin = new URL(req.url).origin;
    const returnBase =
      shopperResultUrl ||
      `${origin}/cart?step=success&orderId=${encodeURIComponent(orderId)}&orderNumber=${encodeURIComponent(orderNumber)}&merchantTransactionId=${encodeURIComponent(merchantTransactionId)}`;

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("ui_mode", "embedded");
    form.set("redirect_on_completion", "if_required");
    form.set("return_url", `${returnBase}${returnBase.includes("?") ? "&" : "?"}checkoutSessionId={CHECKOUT_SESSION_ID}`);
    form.set("client_reference_id", orderId);
    form.set("billing_address_collection", "auto");
    form.set("payment_method_collection", "always");
    form.set("submit_type", "pay");
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", currency);
    form.set("line_items[0][price_data][unit_amount]", String(Math.round(amountIncl * 100)));
    form.set("line_items[0][price_data][product_data][name]", `Piessang order ${orderNumber}`);
    form.set("line_items[0][price_data][product_data][description]", `Marketplace checkout for order ${orderNumber}`);
    form.set("metadata[orderId]", orderId);
    form.set("metadata[userId]", userId);
    form.set("metadata[merchantTransactionId]", merchantTransactionId);
    form.set("payment_intent_data[metadata][orderId]", orderId);
    form.set("payment_intent_data[metadata][userId]", userId);
    form.set("payment_intent_data[metadata][merchantTransactionId]", merchantTransactionId);

    const customerEmail = toStr(
      order?.customer?.email ||
        order?.customer_snapshot?.email ||
        order?.customer_snapshot?.account?.email ||
        order?.customer_snapshot?.personal?.email ||
        "",
    );
    if (customerEmail) form.set("customer_email", customerEmail);

    const session = await stripeRequest("/v1/checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    await orderSnap.ref.set(
      {
        payment: {
          stripeSessionId: toStr(session?.id || null) || null,
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
      sessionId: toStr(session?.id || ""),
      clientSecret: toStr(session?.client_secret || ""),
      publishableKey,
      orderNumber,
      merchantTransactionId,
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Session Failed", error?.message || "Unable to start Stripe checkout.", {
      error: error?.payload || null,
    });
  }
}
