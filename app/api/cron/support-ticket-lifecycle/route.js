export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { processSupportTicketLifecycle } from "@/lib/support/ticket-lifecycle";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) return err(401, "Unauthorized", "Invalid cron authorization.");
    const result = await processSupportTicketLifecycle();
    return ok(result);
  } catch (e) {
    return err(500, "Unexpected Error", "Unable to process support ticket lifecycle.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
