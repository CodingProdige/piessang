export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { loadGoogleMerchantSettings, saveGoogleMerchantSettings } from "@/lib/platform/google-merchant-settings";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage Google Merchant rollout countries.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage Google Merchant rollout countries.") };
  }

  return { sessionUser };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const settings = await loadGoogleMerchantSettings();
    return ok({ settings });
  } catch (e) {
    console.error("admin/google-merchant-countries get failed:", e);
    return err(500, "Unexpected Error", "Unable to load Google Merchant rollout countries.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const settings = await saveGoogleMerchantSettings({
      uid: auth.sessionUser.uid,
      countryCodes: body?.countryCodes || body?.settings?.countryCodes || body?.data?.countryCodes || [],
    });
    return ok({ settings });
  } catch (e) {
    console.error("admin/google-merchant-countries update failed:", e);
    return err(500, "Unexpected Error", "Unable to save Google Merchant rollout countries.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
