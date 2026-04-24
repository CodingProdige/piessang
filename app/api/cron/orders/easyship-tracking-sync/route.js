export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

export async function GET(req) {
  if (!isAuthorizedCronRequest(req)) {
    return err(401, "Unauthorized", "Missing or invalid cron secret.");
  }
  return ok({
    summary: {
      scanned: 0,
      synced: 0,
      skipped: 0,
    },
    ignored: true,
    message: "Easyship tracking sync has been deprecated.",
  });
}
