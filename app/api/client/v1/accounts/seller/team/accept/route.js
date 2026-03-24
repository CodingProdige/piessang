export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import { sanitizeInviteEmail } from "@/lib/seller/team";
import { hasSellerTeamMemberships, ownsSellerAccount } from "@/lib/seller/access";
import { toSellerSlug } from "@/lib/seller/vendor-name";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function findInviteByToken(db, token) {
  const snap = await db.collection("users").get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const invites = Array.isArray(data?.seller?.team?.invites) ? data.seller.team.invites : [];
    const invite = invites.find((item) => String(item?.token ?? "") === token);
    if (invite) {
      return { id: docSnap.id, data, invite };
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
    const uid = toStr(body?.uid);
    const token = toStr(body?.token);

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!token) return err(400, "Missing Token", "token is required.");

    const inviteRecord = await findInviteByToken(db, token);
    if (!inviteRecord) {
      return err(404, "Invite Not Found", "No seller team invite exists for that token.");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return err(404, "User Not Found", "Unable to load your account.");

    const userData = userSnap.data() || {};
    const userEmail = sanitizeInviteEmail(userData?.email || "");
    if (!userEmail || userEmail !== sanitizeInviteEmail(inviteRecord.invite.email || "")) {
      return err(403, "Email Mismatch", "This invite is not for the currently signed-in account.");
    }

    const userSeller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
    const currentManaged = Array.isArray(userSeller.managedSellerAccounts) ? [...userSeller.managedSellerAccounts] : [];

    const inviterRef = db.collection("users").doc(inviteRecord.id);
    const inviterData = inviteRecord.data || {};
    const seller = inviterData?.seller && typeof inviterData.seller === "object" ? inviterData.seller : {};
    const sellerTeam = seller?.team && typeof seller.team === "object" ? seller.team : {};
    const invites = Array.isArray(sellerTeam.invites) ? [...sellerTeam.invites] : [];
    const members = Array.isArray(sellerTeam.members) ? [...sellerTeam.members] : [];
    const role = inviteRecord.invite.role || "manager";
    const now = new Date().toISOString();

    const inviteIndex = invites.findIndex((item) => String(item?.token ?? "") === token);
    if (inviteIndex === -1) {
      return err(404, "Invite Not Found", "No matching invite was found.");
    }

    invites[inviteIndex] = {
      ...invites[inviteIndex],
      status: "accepted",
      acceptedAt: now,
      acceptedBy: uid,
    };

    const memberIndex = members.findIndex((item) => String(item?.uid ?? "") === uid);
    const nextMember = {
      uid,
      email: userEmail,
      role,
      status: "active",
      joinedAt: now,
    };
    if (memberIndex >= 0) {
      members[memberIndex] = nextMember;
    } else {
      members.push(nextMember);
    }

    const vendorName = toStr(seller?.vendorName);
    const sellerSlug = toStr(seller?.sellerSlug) || toSellerSlug(vendorName);
    const sameSellerMembership = currentManaged.some((item) => toStr(item?.sellerSlug) === sellerSlug);
    const otherManagedAccount = currentManaged.some((item) => {
      const itemSlug = toStr(item?.sellerSlug);
      return Boolean(itemSlug && itemSlug !== sellerSlug);
    });

    if (ownsSellerAccount(userSeller)) {
      return err(
        409,
        "Registered Seller Found",
        "You already have a seller account. Delete it before joining another seller team.",
      );
    }

    if (!sameSellerMembership && (otherManagedAccount || hasSellerTeamMemberships(userSeller))) {
      return err(
        409,
        "Already on Another Team",
        "You are already part of another seller team. Leave that team before accepting this invite.",
      );
    }

    const nextManaged = currentManaged.filter((item) => toStr(item?.sellerSlug) !== sellerSlug);
    nextManaged.push({
      sellerSlug,
      vendorName,
      role,
      status: "active",
      teamOwnerUid: inviteRecord.id,
      grantedAt: now,
    });

    await inviterRef.update({
      "seller.team": {
        ...sellerTeam,
        invites,
        members,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    await userRef.update({
      seller: {
        ...(userData?.seller || {}),
        sellerAccess: true,
        status: "active",
        sellerSlug,
        vendorName,
        groupVendorName: vendorName,
        groupSellerSlug: sellerSlug,
        teamRole: role,
        teamOwnerUid: inviteRecord.id,
        teamInviteToken: token,
        teamJoinedAt: now,
        managedSellerAccounts: nextManaged,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    return ok({
      message: "Invite accepted.",
      vendorName,
      sellerSlug,
      role,
    });
  } catch (e) {
    console.error("seller/team/accept failed:", e);
    return err(500, "Unexpected Error", "Unable to accept seller team invite.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
