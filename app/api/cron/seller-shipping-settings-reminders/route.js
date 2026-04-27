export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { processSellerShippingSettingsReminders } from "@/lib/seller/shipping-settings-reminders";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Invalid cron authorization.");
    }

    const result = await processSellerShippingSettingsReminders();
    return ok(result);
  } catch (e) {
    console.error("cron seller shipping settings reminders failed:", e);
    return err(500, "Unexpected Error", "Unable to process seller shipping reminders.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}

