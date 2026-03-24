export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { getSellerBillingOverview } from "@/lib/seller/billing";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load seller billing.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};

    const { searchParams } = new URL(req.url);
    const sellerSlug = toStr(searchParams.get("sellerSlug"));
    const sellerCode = toStr(searchParams.get("sellerCode"));
    const months = Math.max(1, Math.min(12, Number(searchParams.get("months") || 6) || 6));

    if (!isSystemAdminUser(requester) && !canAccessSellerSettlement(requester, sellerSlug, sellerCode)) {
      return err(403, "Access Denied", "You do not have access to this seller billing data.");
    }

    const vendorName =
      toStr(searchParams.get("vendorName")) ||
      toStr(requester?.sellerVendorName || requester?.accountName || requester?.seller?.vendorName || "");

    const overview = await getSellerBillingOverview({
      sellerSlug,
      sellerCode,
      vendorName,
      months,
    });

    return ok(overview);
  } catch (e) {
    console.error("seller billing get failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller billing.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}

