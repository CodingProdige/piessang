export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { processSellerWarehouseEventReminders } from "@/lib/seller/warehouse-event-reminders";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function isAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const authorization = String(req.headers.get("authorization") || "").trim();
  return authorization === `Bearer ${secret}`;
}

export async function GET(req) {
  try {
    if (!isAuthorized(req)) {
      return err(401, "Unauthorized", "Invalid cron authorization.");
    }

    const result = await processSellerWarehouseEventReminders(new URL(req.url).origin);
    return ok(result);
  } catch (e) {
    console.error("cron seller warehouse event reminders failed:", e);
    return err(500, "Unexpected Error", "Unable to process warehouse event reminders.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
