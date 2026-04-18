export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import {
  loadProductEngagementBadgeSettings,
  saveProductEngagementBadgeSettings,
} from "@/lib/platform/product-engagement-badge-settings";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage product engagement badges.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage product engagement badges.") };
  }

  return { sessionUser };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const settings = await loadProductEngagementBadgeSettings();
    return ok({ settings });
  } catch (e) {
    return err(500, "Unexpected Error", "Unable to load product engagement badge settings.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const settings = await saveProductEngagementBadgeSettings({
      uid: auth.sessionUser.uid,
      settings: body?.settings || body?.data || body,
    });
    return ok({ settings });
  } catch (e) {
    return err(500, "Unexpected Error", "Unable to save product engagement badge settings.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
