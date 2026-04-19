export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { markStaleCheckoutAndCartLifecycles } from "@/lib/checkout/sessions";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Invalid cron authorization.");
    }

    const result = await markStaleCheckoutAndCartLifecycles({
      checkoutAbandonedAfterMinutes: Number(process.env.CHECKOUT_ABANDONED_AFTER_MINUTES || 30),
      cartAbandonedAfterHours: Number(process.env.CART_ABANDONED_AFTER_HOURS || 24),
      limit: Math.max(50, Math.min(Number(process.env.CHECKOUT_LIFECYCLE_CRON_LIMIT || 500), 1000)),
    });
    return ok(result);
  } catch (error) {
    console.error("cron checkout lifecycle failed:", error);
    return err(500, "Unexpected Error", "Unable to update checkout lifecycle.", {
      details: String(error?.message || "").slice(0, 500),
    });
  }
}
