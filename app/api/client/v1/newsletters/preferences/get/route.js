export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { normalizeNewsletterSubscriptions } from "@/lib/newsletters";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load newsletter preferences.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const snap = await db.collection("users").doc(sessionUser.uid).get();
    if (!snap.exists) return err(404, "User Not Found", "Could not find your account.");

    return ok({
      subscriptions: normalizeNewsletterSubscriptions(snap.data()?.preferences?.newsletterSubscriptions),
    });
  } catch (error) {
    return err(500, "Load Failed", error?.message || "Unable to load newsletter preferences.");
  }
}
