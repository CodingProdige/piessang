export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  canManageSellerTeam,
  findSellerOwnerByIdentifier,
  teamMemberMatches,
} from "@/lib/seller/team-admin";
import { sanitizeInviteEmail } from "@/lib/seller/team";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function findUserByEmail(db, email) {
  const snap = await db.collection("users").get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const currentEmail = sanitizeInviteEmail(data?.email || "");
    if (currentEmail && currentEmail === email) {
      return { id: docSnap.id, data };
    }
  }
  return null;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }
    const body = await req.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === "object" ? body.data : body;
    const uid = toStr(body?.uid || payload?.uid);
    const sellerSlug = toStr(payload?.sellerSlug || payload?.seller?.sellerSlug || body?.sellerSlug);
    const memberUid = toStr(payload?.memberUid || payload?.uidToRemove || payload?.uid);
    const memberEmail = sanitizeInviteEmail(payload?.email || payload?.memberEmail);

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");
    if (!memberUid && !memberEmail) return err(400, "Missing Member", "memberUid or memberEmail is required.");

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    const requesterEmail = sanitizeInviteEmail(requester?.email || "");
    const isSelfRemoval =
      memberUid === uid ||
      (memberEmail && requesterEmail && requesterEmail === memberEmail);

    if (!canManageSellerTeam(requester, sellerSlug) && !isSelfRemoval) {
      return err(403, "Access Denied", "You do not have permission to manage this seller team.");
    }

    if (owner.id === memberUid) {
      return err(400, "Invalid Member", "You cannot remove the primary seller account owner.");
    }

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const sellerTeam = seller?.team && typeof seller.team === "object" ? seller.team : {};
    const members = Array.isArray(sellerTeam.members) ? [...sellerTeam.members] : [];
    const accessGrants = Array.isArray(sellerTeam.accessGrants) ? [...sellerTeam.accessGrants] : [];
    const now = new Date().toISOString();

    const nextMembers = members.filter((item) => !teamMemberMatches(item, { uid: memberUid, email: memberEmail }));
    if (nextMembers.length === members.length) {
      return err(404, "Member Not Found", "Could not find that team member on this seller account.");
    }

    const nextGrants = accessGrants.filter((item) => !teamMemberMatches(item, { uid: memberUid, email: memberEmail }));

    const targetUser = memberUid ? await db.collection("users").doc(memberUid).get() : null;
    const targetUserData = targetUser?.exists ? targetUser.data() || {} : null;
    let targetUserId = targetUser?.exists ? targetUser.id : null;

    if (!targetUserId) {
      const byEmail = memberEmail ? await findUserByEmail(db, memberEmail) : null;
      if (byEmail) {
        targetUserId = byEmail.id;
      }
    }

    if (targetUserId) {
      const userDoc = targetUser?.exists ? targetUserData : (await findUserByEmail(db, memberEmail))?.data || {};
      const userSeller = userDoc?.seller && typeof userDoc.seller === "object" ? userDoc.seller : {};
      const currentManaged = Array.isArray(userSeller.managedSellerAccounts) ? [...userSeller.managedSellerAccounts] : [];
      const nextManaged = currentManaged.filter((item) => toStr(item?.sellerSlug) !== sellerSlug);
      const nextActiveManaged = nextManaged[0] || null;
      const nextSellerAccess = nextManaged.length > 0;

      await db.collection("users").doc(targetUserId).update({
        seller: {
          ...userSeller,
          sellerAccess: nextSellerAccess,
          status: nextSellerAccess ? nextActiveManaged?.status || userSeller.status || "active" : "inactive",
          teamRole: nextSellerAccess ? nextActiveManaged?.role || userSeller.teamRole || "manager" : null,
          activeSellerSlug: nextSellerAccess ? nextActiveManaged?.sellerSlug || null : null,
          sellerSlug: nextSellerAccess ? nextActiveManaged?.sellerSlug || null : null,
          vendorName: nextSellerAccess ? nextActiveManaged?.vendorName || null : null,
          groupVendorName: nextSellerAccess ? nextActiveManaged?.vendorName || null : null,
          groupSellerSlug: nextSellerAccess ? nextActiveManaged?.sellerSlug || null : null,
          teamOwnerUid: nextSellerAccess ? nextActiveManaged?.teamOwnerUid || null : null,
          managedSellerAccounts: nextManaged,
        },
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
    }

    await db.collection("users").doc(owner.id).update({
      "seller.team": {
        ...sellerTeam,
        members: nextMembers,
        accessGrants: nextGrants,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    return ok({
      message: "Team member removed.",
      removed: {
        uid: memberUid || null,
        email: memberEmail || null,
        sellerSlug,
        removedAt: now,
      },
    });
  } catch (e) {
    console.error("seller/team/remove failed:", e);
    return err(500, "Unexpected Error", "Unable to remove seller team access.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
