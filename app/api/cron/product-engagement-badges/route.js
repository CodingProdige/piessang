export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { refreshDirtyProductBadgeSnapshots } from "@/lib/analytics/product-engagement";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Invalid cron authorization.");
    }

    const limit = Math.max(1, Math.min(Number(process.env.PRODUCT_BADGE_CRON_LIMIT || 250), 500));
    const result = await refreshDirtyProductBadgeSnapshots({ limit });
    return ok(result);
  } catch (error) {
    console.error("cron product engagement badges failed:", error);
    return err(500, "Unexpected Error", "Unable to refresh product engagement badges.", {
      details: String(error?.message || "").slice(0, 500),
    });
  }
}
