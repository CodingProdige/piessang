export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { stripeRequest } from "@/lib/payments/stripe";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentIntentId = toStr(searchParams.get("paymentIntentId"));
    if (!paymentIntentId) return err(400, "Missing Payment Intent", "paymentIntentId is required.");

    const intent = await stripeRequest(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`);

    return ok({
      paymentIntentId,
      status: toStr(intent?.status || "").toLowerCase(),
      customer: toStr(intent?.customer || ""),
      paymentMethod: toStr(intent?.payment_method || ""),
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Status Failed", error?.message || "Unable to load payment intent status.", {
      error: error?.payload || null,
    });
  }
}
