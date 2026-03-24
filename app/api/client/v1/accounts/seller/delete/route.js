export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { ownsSellerAccount } from "@/lib/seller/access";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function trimManagedSellerAccess(seller, sellerSlug) {
  const record = seller && typeof seller === "object" ? seller : {};
  const managed = Array.isArray(record.managedSellerAccounts) ? [...record.managedSellerAccounts] : [];
  const nextManaged = managed.filter((item) => toStr(item?.sellerSlug) !== sellerSlug);
  if (!nextManaged.length) return null;

  const nextActive = nextManaged[0] || null;
  return {
    ...record,
    sellerAccess: true,
    status: nextActive?.status || record.status || "active",
    teamRole: nextActive?.role || record.teamRole || "manager",
    activeSellerSlug: nextActive?.sellerSlug || null,
    sellerSlug: nextActive?.sellerSlug || null,
    vendorName: nextActive?.vendorName || null,
    groupVendorName: nextActive?.vendorName || null,
    groupSellerSlug: nextActive?.sellerSlug || null,
    teamOwnerUid: nextActive?.teamOwnerUid || null,
    managedSellerAccounts: nextManaged,
    branding: null,
    media: null,
    team: null,
  };
}

function closeSellerAccount(seller, sellerSlug, vendorName, requesterUid) {
  const record = seller && typeof seller === "object" ? seller : {};
  const next = {
    ...record,
    sellerAccess: false,
    status: "closed",
    sellerSlug: sellerSlug || record.sellerSlug || null,
    activeSellerSlug: null,
    groupSellerSlug: sellerSlug || record.groupSellerSlug || null,
    vendorName: vendorName || record.vendorName || null,
    groupVendorName: vendorName || record.groupVendorName || null,
    closedAt: new Date().toISOString(),
    closedBy: requesterUid || null,
    closedReasonCode: "seller_deleted",
    closedReasonMessage: "This seller account was closed by the seller owner.",
    branding: null,
    media: null,
    team: null,
  };

  return next;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    const sellerSlug = toStr(body?.sellerSlug || body?.seller?.sellerSlug);
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");

    const requester = requesterSnap.data() || {};
    const systemAccessType = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase();
    if (systemAccessType !== "admin" && !ownsSellerAccount(requester)) {
      return err(403, "Access Denied", "You do not have permission to delete this seller account.");
    }

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const vendorName = toStr(seller?.vendorName || seller?.groupVendorName || "");
    const sellerSlugKey = toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug);

    const usersSnap = await db.collection("users").get();
    let updatedMembers = 0;
    for (const userSnap of usersSnap.docs) {
      const userData = userSnap.data() || {};
      const userSeller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
      const managedAccounts = Array.isArray(userSeller.managedSellerAccounts) ? userSeller.managedSellerAccounts : [];
      const isOwnerDoc = userSnap.id === owner.id;
      const matchesCurrentSeller =
        toStr(userSeller?.sellerSlug || userSeller?.groupSellerSlug || userSeller?.activeSellerSlug) === sellerSlugKey ||
        managedAccounts.some((item) => toStr(item?.sellerSlug) === sellerSlugKey);

      if (!matchesCurrentSeller && !isOwnerDoc) {
        continue;
      }

      if (isOwnerDoc) {
          await db.collection("users").doc(userSnap.id).update({
            seller: closeSellerAccount(userSeller, sellerSlugKey, vendorName, uid),
            "timestamps.updatedAt": new Date(),
          });
      } else {
        const nextSeller = trimManagedSellerAccess(userSeller, sellerSlugKey);
        if (nextSeller) {
          await db.collection("users").doc(userSnap.id).update({
            seller: nextSeller,
            "timestamps.updatedAt": new Date(),
          });
        }
      }
      updatedMembers += 1;
    }

    return ok({
      message: "Seller account closed.",
      sellerSlug: sellerSlugKey,
      vendorName,
      updatedMembers,
    });
  } catch (e) {
    console.error("seller/delete failed:", e);
    return err(500, "Unexpected Error", "Unable to close seller account.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
