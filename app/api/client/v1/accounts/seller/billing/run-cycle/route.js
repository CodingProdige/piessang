export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { computeSellerBillingCycle, getMonthKey, saveSellerBillingCycle } from "@/lib/seller/billing";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function previousMonthKey() {
  const now = new Date();
  return getMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to run seller billing.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only system admins can run seller billing cycles.");
    }

    const body = await req.json().catch(() => ({}));
    const monthKey = toStr(body?.monthKey || previousMonthKey());
    const sellerSlug = toStr(body?.sellerSlug);
    const sellerCode = toStr(body?.sellerCode);

    const usersSnap = await db.collection("users").get();
    const sellers = [];
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
      const nextSellerCode = toStr(seller?.sellerCode || data?.sellerCode);
      const nextSellerSlug = toStr(seller?.sellerSlug || data?.sellerSlug);
      const vendorName = toStr(seller?.vendorName || data?.sellerVendorName || data?.accountName);
      if (!nextSellerCode && !nextSellerSlug) return;
      if (sellerCode && nextSellerCode.toLowerCase() !== sellerCode.toLowerCase()) return;
      if (sellerSlug && nextSellerSlug.toLowerCase() !== sellerSlug.toLowerCase()) return;
      sellers.push({ sellerCode: nextSellerCode, sellerSlug: nextSellerSlug, vendorName });
    });

    const saved = [];
    for (const seller of sellers) {
      const cycle = await computeSellerBillingCycle({ ...seller, monthKey });
      const persisted = await saveSellerBillingCycle(cycle);
      saved.push({
        sellerCode: persisted.sellerCode,
        sellerSlug: persisted.sellerSlug,
        monthKey: persisted.monthKey,
        amountDueIncl: persisted?.totals?.amountDueIncl || 0,
        status: persisted.status,
      });
    }

    return ok({
      monthKey,
      processed: saved.length,
      cycles: saved,
    });
  } catch (e) {
    console.error("seller billing run-cycle failed:", e);
    return err(500, "Unexpected Error", "Unable to run seller billing cycle.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}

