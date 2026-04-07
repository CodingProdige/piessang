export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { createOrRefreshWiseRecipientSetup } from "@/lib/seller/wise-payouts";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function resolveAppOrigin(req) {
  const configured = toStr(process.env.BASE_URL) || toStr(process.env.NEXT_PUBLIC_BASE_URL) || "";
  return configured || new URL(req.url).origin;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    const sellerId = toStr(body?.sellerId || body?.sellerSlug);
    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerId) return err(400, "Missing Seller", "sellerId is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canManageSellerTeam(requester, sellerId)) {
      const systemAccessType = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase();
      if (systemAccessType !== "admin") {
        return err(403, "Access Denied", "You do not have permission to manage this seller payout setup.");
      }
    }

    const sellerOwner = await findSellerOwnerByIdentifier(sellerId);
    if (!sellerOwner) return err(404, "Seller Not Found", "Could not find that seller account.");
    const result = await createOrRefreshWiseRecipientSetup({
      sellerUid: sellerOwner.id,
      sellerSlug: sellerId,
    });

    return ok({
      ...result,
      provider: "wise",
      message: result?.message || "We’ve prepared the seller payout profile with Wise.",
    });
  } catch (e) {
    return err(e?.status || 500, "Payout Setup Failed", e?.message || "Unable to start seller payout setup.", {
      details: String(e?.payload?.error?.message || e?.message || "").slice(0, 500),
    });
  }
}
