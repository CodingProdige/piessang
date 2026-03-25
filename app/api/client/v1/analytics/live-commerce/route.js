export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { refreshLiveCommerceSnapshot } from "@/lib/analytics/live-commerce";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Database Unavailable", "Admin database is not configured.");

    const docRef = db.collection("analytics_live").doc("commerce");
    const snap = await docRef.get();
    const existing = snap.exists ? snap.data() || null : null;
    const stale = !existing?.updatedAt || Date.now() - Date.parse(String(existing.updatedAt)) > 60_000;

    const snapshot = stale ? await refreshLiveCommerceSnapshot() : existing;
    return ok({ snapshot: snapshot || null });
  } catch (error) {
    return err(500, "Live Analytics Failed", error?.message || "Unable to load live commerce analytics.");
  }
}
