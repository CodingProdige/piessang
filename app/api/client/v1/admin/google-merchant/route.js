export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { runSync, runQueuedSync } from "@/app/api/catalogue/v1/integrations/google/merchant-sync/route";
import { runCleanup } from "@/app/api/catalogue/v1/integrations/google/cleanup-legacy-offers/route";
import {
  appendGoogleMerchantLog,
  deleteGoogleMerchantOffers,
  getGoogleMerchantQueueSnapshot,
  listGoogleMerchantLogs,
} from "@/lib/integrations/google-merchant-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage Google Merchant tools.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage Google Merchant tools.") };
  }

  return { sessionUser };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const [queue, logs] = await Promise.all([
      getGoogleMerchantQueueSnapshot(50),
      listGoogleMerchantLogs(25),
    ]);
    return ok({ queue, logs });
  } catch (e) {
    console.error("admin/google-merchant get failed:", e);
    return err(500, "Unexpected Error", "Unable to load Google Merchant tools.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const action = toStr(body?.action).toLowerCase();
    const secret = String(process.env.GOOGLE_MERCHANT_SYNC_SECRET || "").trim();

    if (action === "sync_queue") {
      const limit = Math.max(1, Math.min(Number(body?.limit) || Number(process.env.GOOGLE_MERCHANT_CRON_LIMIT || 100), 500));
      const response = await runQueuedSync({ secret, dryRun: false, limit });
      const payload = await response.json();
      await appendGoogleMerchantLog({
        source: "admin",
        action,
        ok: response.ok,
        actorUid: auth.sessionUser.uid,
        summary: payload,
        error: payload?.message || "",
      }).catch(() => null);
      return NextResponse.json(payload, { status: response.status });
    }

    if (action === "full_reconcile") {
      const response = await runSync({ secret, dryRun: false, limit: null });
      const payload = await response.json();
      await appendGoogleMerchantLog({
        source: "admin",
        action,
        ok: response.ok,
        actorUid: auth.sessionUser.uid,
        summary: payload,
        error: payload?.message || "",
      }).catch(() => null);
      return NextResponse.json(payload, { status: response.status });
    }

    if (action === "cleanup_legacy") {
      const response = await runCleanup({ secret, dryRun: false, limit: null });
      const payload = await response.json();
      await appendGoogleMerchantLog({
        source: "admin",
        action,
        ok: response.ok,
        actorUid: auth.sessionUser.uid,
        summary: payload,
        error: payload?.message || "",
      }).catch(() => null);
      return NextResponse.json(payload, { status: response.status });
    }

    if (action === "delete_offers") {
      const offerIds = Array.from(
        new Set(
          toArray(body?.offerIds)
            .flatMap((value) => String(value || "").split(/[\s,]+/g))
            .map((value) => toStr(value))
            .filter(Boolean),
        ),
      );
      if (!offerIds.length) {
        return err(400, "Missing Offer IDs", "Provide at least one Google offer ID to delete.");
      }
      const result = await deleteGoogleMerchantOffers(offerIds);
      await appendGoogleMerchantLog({
        source: "admin",
        action,
        ok: true,
        actorUid: auth.sessionUser.uid,
        summary: result,
      }).catch(() => null);
      return ok(result);
    }

    return err(400, "Invalid Action", "Supported actions are sync_queue, full_reconcile, cleanup_legacy, and delete_offers.");
  } catch (e) {
    console.error("admin/google-merchant update failed:", e);
    return err(500, "Unexpected Error", "Unable to run the Google Merchant action.", {
      details: String(e?.message || "").slice(0, 600),
    });
  }
}
