export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { submitPendingPeachPayoutBatches } from "@/lib/seller/payout-provider";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    if (!uid) return err(400, "Missing UID", "uid is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "System admin access required.");
    }

    const result = await submitPendingPeachPayoutBatches();
    return ok(result);
  } catch (e) {
    console.error("manual seller payout submit failed:", e);
    return err(500, "Unexpected Error", "Unable to submit seller payout batches.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}

