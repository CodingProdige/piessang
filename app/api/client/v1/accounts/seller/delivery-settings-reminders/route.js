export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { processSellerDeliverySettingsReminders } from "@/lib/seller/delivery-settings-reminders";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to process delivery reminders.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only system admins can process delivery reminders.");
    }

    const result = await processSellerDeliverySettingsReminders();
    return ok(result);
  } catch (e) {
    console.error("seller delivery settings reminders failed:", e);
    return err(500, "Unexpected Error", "Unable to process delivery setting reminders.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
