export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { syncWiseRecipientStateForSeller } from "@/lib/seller/wise-payouts";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const { searchParams } = new URL(req.url);
    const uid = toStr(searchParams.get("uid"));
    const sellerId = toStr(searchParams.get("sellerId") || searchParams.get("sellerSlug"));
    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerId) return err(400, "Missing Seller", "sellerId is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canManageSellerTeam(requester, sellerId)) {
      const systemAccessType = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase();
      if (systemAccessType !== "admin") {
        return err(403, "Access Denied", "You do not have permission to view this seller payout setup.");
      }
    }

    const sellerOwner = await findSellerOwnerByIdentifier(sellerId);
    if (!sellerOwner) return err(404, "Seller Not Found", "Could not find that seller account.");
    const summary = await syncWiseRecipientStateForSeller({
      sellerUid: sellerOwner.id,
      payoutProfile: sellerOwner.data?.seller?.payoutProfile || {},
    });

    return ok({
      provider: "wise",
      ...summary,
    });
  } catch (e) {
    return err(e?.status || 500, "Payout Status Failed", e?.message || "Unable to load payout status.", {
      details: String(e?.payload?.error?.message || e?.message || "").slice(0, 500),
    });
  }
}
