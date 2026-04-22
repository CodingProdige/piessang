export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { syncEasyshipShipmentById } from "@/lib/orders/easyship-sync";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Missing or invalid cron secret.");
    }

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firestore admin is not configured.");

    const limit = Math.max(1, Math.min(Number(process.env.EASYSHIP_TRACKING_SYNC_LIMIT || 50), 200));
    const snap = await db
      .collection("order_courier_shipments")
      .where("active", "==", true)
      .limit(limit)
      .get();

    const results = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const shipmentId = String(data?.shipmentId || doc.id || "").trim();
      if (!shipmentId) continue;
      results.push(await syncEasyshipShipmentById({
        shipmentId,
        originBase: new URL(req.url).origin,
        eventName: "cron.easyship_tracking_sync",
      }));
    }

    return ok({
      summary: {
        scanned: snap.size,
        synced: results.filter((entry) => entry?.ok).length,
        skipped: results.filter((entry) => entry?.skipped).length,
      },
      results,
    });
  } catch (error) {
    return err(500, "Tracking Sync Failed", error instanceof Error ? error.message : "Unknown tracking sync error.");
  }
}
