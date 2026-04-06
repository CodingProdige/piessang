export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { listSellerNotifications, markAllSellerNotificationsRead, markSellerNotificationRead } from "@/lib/notifications/seller-inbox";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function userCanAccessSeller(requester, sellerCode, sellerSlug) {
  const seller = requester?.seller && typeof requester.seller === "object" ? requester.seller : {};
  const managed = Array.isArray(seller?.managedSellerAccounts) ? seller.managedSellerAccounts : [];
  const code = toStr(sellerCode).toLowerCase();
  const slug = toStr(sellerSlug).toLowerCase();
  const ownMatch =
    toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode).toLowerCase() === code ||
    toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug).toLowerCase() === slug;
  const managedMatch = managed.some((item) => {
    const itemCode = toStr(item?.sellerCode).toLowerCase();
    const itemSlug = toStr(item?.sellerSlug).toLowerCase();
    return (code && itemCode === code) || (slug && itemSlug === slug);
  });
  const admin = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase() === "admin";
  return admin || ownMatch || managedMatch;
}

async function resolveSeller(bodyOrParams) {
  const sellerIdentifier =
    toStr(bodyOrParams?.sellerCode) ||
    toStr(bodyOrParams?.sellerSlug) ||
    toStr(bodyOrParams?.seller);
  if (!sellerIdentifier) return null;
  const owner = await findSellerOwnerByIdentifier(sellerIdentifier);
  if (!owner) return null;
  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  return {
    sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || sellerIdentifier),
    sellerSlug: toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || sellerIdentifier),
  };
}

export async function GET(request) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load seller notifications.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const seller = await resolveSeller({
      sellerCode: request.nextUrl.searchParams.get("sellerCode"),
      sellerSlug: request.nextUrl.searchParams.get("sellerSlug"),
      seller: request.nextUrl.searchParams.get("seller"),
    });
    if (!seller) return err(400, "Missing Seller", "Select a seller to load notifications.");
    if (!userCanAccessSeller(requester, seller.sellerCode, seller.sellerSlug)) {
      return err(403, "Forbidden", "You do not have access to these seller notifications.");
    }

    const items = await listSellerNotifications(seller);
    const unreadCount = items.filter((item) => !item.read).length;
    return ok({ items, unreadCount, count: items.length });
  } catch (error) {
    return err(500, "Notifications Fetch Failed", error?.message || "Unexpected error loading seller notifications.");
  }
}

export async function POST(request) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage seller notifications.");

    const body = await request.json().catch(() => ({}));
    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const seller = await resolveSeller(body);
    if (!seller) return err(400, "Missing Seller", "Select a seller to manage notifications.");
    if (!userCanAccessSeller(requester, seller.sellerCode, seller.sellerSlug)) {
      return err(403, "Forbidden", "You do not have access to these seller notifications.");
    }

    const action = toStr(body?.action).toLowerCase();
    if (action === "mark-all-read") {
      await markAllSellerNotificationsRead(seller);
      return ok({});
    }
    if (action === "mark-read") {
      await markSellerNotificationRead({
        notificationId: body?.notificationId,
        sellerCode: seller.sellerCode,
        sellerSlug: seller.sellerSlug,
      });
      return ok({});
    }

    return err(400, "Invalid Action", "Unknown notification action.");
  } catch (error) {
    return err(500, "Notification Update Failed", error?.message || "Unexpected error updating seller notifications.");
  }
}
