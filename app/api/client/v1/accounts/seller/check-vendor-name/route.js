export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import {
  cleanVendorName,
  generateVendorNameSuggestions,
  normalizeVendorName,
  trimVendorNameToLength,
} from "@/lib/seller/vendor-name";
import { jsonError, rateLimit, requireSessionUser } from "@/lib/api/security";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => jsonError(s, t, m, e);

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(
        500,
        "Firebase Not Configured",
        "Server Firestore access is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or PIESSANG_FIREBASE_SERVICE_ACCOUNT_JSON.",
      );
    }

    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) {
      return err(401, "Unauthorized", "Sign in again to validate vendor names.");
    }

    const limiter = rateLimit(`vendor-name:${sessionUser.uid}`, 30, 60_000);
    if (!limiter.allowed) {
      return err(429, "Too Many Requests", "Please wait a moment before checking another vendor name.");
    }

    const body = await req.json().catch(() => ({}));
    const vendorName = trimVendorNameToLength(body?.vendorName);
    const uid = sessionUser.uid;
    const sellerSlug = toStr(body?.sellerSlug || body?.seller?.sellerSlug);

    if (!vendorName) {
      return err(400, "Missing Vendor Name", "vendorName is required.");
    }

    if (vendorName.length > 30) {
      return err(400, "Vendor Name Too Long", "vendorName must be 30 characters or fewer.");
    }

    const snap = await db.collection("users").get();
    const existingNames = [];
    let isUnique = true;

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
      const currentSellerSlugs = [seller?.sellerSlug, seller?.groupSellerSlug, seller?.activeSellerSlug]
        .map((item) => toStr(item))
        .filter(Boolean);

      if (docSnap.id === uid) return;
      if (sellerSlug && currentSellerSlugs.includes(sellerSlug)) return;

      const currentName = cleanVendorName(data?.seller?.vendorName || data?.account?.accountName || "");
      if (!currentName) return;
      existingNames.push(currentName);
      if (normalizeVendorName(currentName) === normalizeVendorName(vendorName)) {
        isUnique = false;
      }
    });

    const suggestions = isUnique ? [] : generateVendorNameSuggestions(vendorName, existingNames);

    return ok({
      vendorName,
      unique: isUnique,
      suggestions,
    });
  } catch (e) {
    console.error("seller/check-vendor-name failed:", e);
    return err(500, "Unexpected Error", "Failed to validate vendor name.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
