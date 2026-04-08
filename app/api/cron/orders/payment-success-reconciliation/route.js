export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { reconcilePeachRedirectPayments } from "@/lib/orders/payment-success-reconciliation";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, ...data }, { status });

const err = (status, title, message) =>
  NextResponse.json({ ok: false, title, message }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Missing or invalid cron secret.");
    }

    const summary = await reconcilePeachRedirectPayments({
      originBase: new URL(req.url).origin,
      limit: Math.max(1, Math.min(Number(process.env.ORDER_PAYMENT_RECONCILE_LIMIT || 50), 200)),
      minAgeMinutes: Math.max(0, Number(process.env.ORDER_PAYMENT_RECONCILE_MIN_AGE_MINUTES || 2)),
    });

    return ok({ summary });
  } catch (error) {
    return err(500, "Reconciliation Failed", error?.message || "Unknown reconciliation error.");
  }
}
