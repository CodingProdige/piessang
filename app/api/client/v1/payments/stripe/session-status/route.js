export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { finalizeStripeSession } from "@/lib/payments/finalize-stripe-session";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = toStr(searchParams.get("sessionId"));
    const orderId = toStr(searchParams.get("orderId"));

    if (!sessionId) return err(400, "Missing Session", "sessionId is required.");

    const result = await finalizeStripeSession({
      originBase: new URL(req.url).origin,
      sessionId,
      orderId,
    });

    return ok({
      sessionId: result.sessionId,
      orderId: result.orderId,
      paymentStatus: result.paymentStatus,
      sessionStatus: result.sessionStatus,
      paymentIntentId: result.paymentIntentId,
      paid: result.paid,
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Session Failed", error?.message || "Unable to read Stripe session status.", {
      error: error?.payload || null,
    });
  }
}
