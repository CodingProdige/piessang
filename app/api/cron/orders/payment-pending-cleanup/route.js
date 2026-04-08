export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cleanupAbandonedPaymentPendingOrders } from "@/lib/orders/payment-pending-cleanup";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Invalid cron authorization.");
    }

    const ttlMinutes = Number(process.env.ORDER_PAYMENT_PENDING_TTL_MINUTES || 60);
    const result = await cleanupAbandonedPaymentPendingOrders({ ttlMinutes });
    return ok(result);
  } catch (e) {
    console.error("cron payment pending cleanup failed:", e);
    return err(500, "Unexpected Error", "Unable to clean abandoned pending-payment orders.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
