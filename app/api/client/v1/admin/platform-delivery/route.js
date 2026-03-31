export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { loadPlatformDeliverySettings, savePlatformDeliverySettings } from "@/lib/platform/delivery-settings";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage Piessang delivery settings.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage Piessang delivery settings.") };
  }

  return { sessionUser, db };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const deliveryProfile = await loadPlatformDeliverySettings();
    return ok({ deliveryProfile });
  } catch (e) {
    console.error("admin/platform-delivery get failed:", e);
    return err(500, "Unexpected Error", "Unable to load Piessang delivery settings.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const deliveryProfile = await savePlatformDeliverySettings({
      uid: auth.sessionUser.uid,
      deliveryProfile: body?.deliveryProfile || body?.data || body || {},
    });
    return ok({ deliveryProfile });
  } catch (e) {
    console.error("admin/platform-delivery update failed:", e);
    return err(500, "Unexpected Error", "Unable to save Piessang delivery settings.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
