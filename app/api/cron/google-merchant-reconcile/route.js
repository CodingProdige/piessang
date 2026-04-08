export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { runSync } from "@/app/api/catalogue/v1/integrations/google/merchant-sync/route";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { appendGoogleMerchantLog } from "@/lib/integrations/google-merchant-admin";

const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Invalid cron authorization.");
    }

    const response = await runSync({
      secret: String(process.env.GOOGLE_MERCHANT_SYNC_SECRET || "").trim(),
      dryRun: false,
      limit: null,
    });
    const payload = await response.clone().json().catch(() => ({}));
    await appendGoogleMerchantLog({
      source: "cron",
      action: "full_reconcile",
      ok: response.ok,
      summary: payload,
      error: payload?.message || "",
    }).catch(() => null);
    return response;
  } catch (e) {
    console.error("cron google merchant reconcile failed:", e);
    return err(500, "Unexpected Error", "Unable to run Google Merchant reconciliation.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
