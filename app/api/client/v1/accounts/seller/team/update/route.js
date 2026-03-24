export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  canManageSellerTeam,
  findSellerOwnerByIdentifier,
  normalizeSellerTeamMember,
  teamMemberMatches,
} from "@/lib/seller/team-admin";
import { normalizeSellerTeamRole, sanitizeInviteEmail } from "@/lib/seller/team";
import { hasSellerTeamMemberships, ownsSellerAccount } from "@/lib/seller/access";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { ensureSellerCode } from "@/lib/seller/seller-code";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isSystemAdmin(data) {
  return toStr(data?.system?.accessType || data?.systemAccessType).toLowerCase() === "admin";
}

function hasOwn(target, key) {
  return Boolean(target && typeof target === "object" && Object.prototype.hasOwnProperty.call(target, key));
}

function upsertManagedSellerAccount(accounts, nextAccount) {
  const nextSellerSlug = toStr(nextAccount?.sellerSlug);
  const filtered = Array.isArray(accounts)
    ? accounts.filter((item) => toStr(item?.sellerSlug) !== nextSellerSlug)
    : [];
  if (nextSellerSlug) filtered.push(nextAccount);
  return filtered;
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
    const memberUid = toStr(payload?.memberUid || payload?.uidToUpdate || payload?.uid);
    const memberEmail = sanitizeInviteEmail(payload?.email || payload?.memberEmail);
    const nextRole = normalizeSellerTeamRole(payload?.role || "manager");
    const wantsSystemAdmin =
      payload?.grantSystemAdmin === true || toStr(payload?.systemAccessType).toLowerCase() === "admin";
    const canEditSystemAdmin =
      hasOwn(payload, "grantSystemAdmin") || hasOwn(payload, "systemAccessType");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");
    if (!memberUid && !memberEmail) return err(400, "Missing Member", "memberUid or memberEmail is required.");

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canManageSellerTeam(requester, sellerSlug)) {
      return err(403, "Access Denied", "You do not have permission to manage this seller team.");
    }
    if (canEditSystemAdmin && !isSystemAdmin(requester)) {
      return err(403, "Access Denied", "Only system admins can change system admin access.");
    }

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const sellerTeam = seller?.team && typeof seller.team === "object" ? seller.team : {};
    const members = Array.isArray(sellerTeam.members) ? [...sellerTeam.members] : [];
    const accessGrants = Array.isArray(sellerTeam.accessGrants) ? [...sellerTeam.accessGrants] : [];
    const now = new Date().toISOString();
    const sellerCode = ensureSellerCode(seller?.sellerCode, owner.id);

    const memberIndex = members.findIndex((item) => teamMemberMatches(item, { uid: memberUid, email: memberEmail }));
    if (memberIndex === -1) {
      return err(404, "Member Not Found", "Could not find that team member on this seller account.");
    }

    const member = normalizeSellerTeamMember(members[memberIndex]);
    const currentRole = normalizeSellerTeamRole(member.role || "manager");
    const existingSystemAccessType = toStr(
      member.systemAccessType ||
        members[memberIndex]?.systemAccessType ||
        members[memberIndex]?.system?.accessType,
    ).toLowerCase();
    const nextSystemAccessType = canEditSystemAdmin
      ? (wantsSystemAdmin ? "admin" : null)
      : (existingSystemAccessType === "admin" ? "admin" : null);
    const nextMember = {
      ...members[memberIndex],
      role: nextRole,
      systemAccessType: nextSystemAccessType,
      status: "active",
      updatedAt: now,
    };
    members[memberIndex] = nextMember;

    const grantIndex = accessGrants.findIndex((item) => teamMemberMatches(item, { uid: memberUid, email: memberEmail }));
    if (grantIndex >= 0) {
      accessGrants[grantIndex] = {
        ...accessGrants[grantIndex],
        role: nextRole,
        systemAccessType: nextSystemAccessType,
        status: "active",
        updatedAt: now,
      };
    }

    const targetUser = memberUid ? await db.collection("users").doc(member.uid || memberUid).get() : null;
    const sellerSlugKey = toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug);
    if (!targetUser?.exists) {
      const byEmail = memberEmail ? await findUserByEmail(db, memberEmail) : null;
      if (!byEmail) {
        return err(404, "User Not Found", "Could not find the team member account.");
      }
      const userRef = db.collection("users").doc(byEmail.id);
      const userData = byEmail.data || {};
      const userSeller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
      const currentManaged = Array.isArray(userSeller.managedSellerAccounts) ? [...userSeller.managedSellerAccounts] : [];
      const sameSellerMembership = currentManaged.some((item) => toStr(item?.sellerSlug) === sellerSlugKey);
      const otherManagedAccount = currentManaged.some((item) => {
        const itemSlug = toStr(item?.sellerSlug);
        return Boolean(itemSlug && itemSlug !== sellerSlugKey);
      });

      if (ownsSellerAccount(userSeller)) {
        return err(
          409,
          "Registered Seller Found",
          "That user already has a seller account. They must delete it before joining another seller team.",
        );
      }

      if (!sameSellerMembership && (otherManagedAccount || hasSellerTeamMemberships(userSeller))) {
        return err(
          409,
          "Already on Another Team",
          "That user already belongs to another seller team. They need to leave that team first.",
        );
      }

      const nextManaged = upsertManagedSellerAccount(currentManaged, {
        sellerSlug: sellerSlugKey,
        sellerCode,
        vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
        role: nextRole,
        status: "active",
        teamOwnerUid: owner.id,
        grantedAt: userSeller?.teamAccessGrantedAt || now,
      });

      await userRef.update({
        seller: {
          ...userSeller,
          sellerAccess: true,
          status: "active",
          sellerSlug: sellerSlugKey,
          sellerCode,
          vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
          groupVendorName: toStr(seller?.groupVendorName || seller?.vendorName || ""),
          groupSellerSlug: sellerSlugKey,
          groupSellerCode: sellerCode,
          teamRole: nextRole,
          teamOwnerUid: owner.id,
          activeSellerSlug: sellerSlugKey,
          activeSellerCode: sellerCode,
          managedSellerAccounts: nextManaged,
        },
        system: {
          ...(userData?.system && typeof userData.system === "object" ? userData.system : {}),
          accessType: nextSystemAccessType,
        },
        systemAccessType: nextSystemAccessType,
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
    } else {
      const userData = targetUser.data() || {};
      const userSeller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
      const currentManaged = Array.isArray(userSeller.managedSellerAccounts) ? [...userSeller.managedSellerAccounts] : [];
      const sameSellerMembership = currentManaged.some((item) => toStr(item?.sellerSlug) === sellerSlugKey);
      const otherManagedAccount = currentManaged.some((item) => {
        const itemSlug = toStr(item?.sellerSlug);
        return Boolean(itemSlug && itemSlug !== sellerSlugKey);
      });

      if (ownsSellerAccount(userSeller)) {
        return err(
          409,
          "Registered Seller Found",
          "That user already has a seller account. They must delete it before joining another seller team.",
        );
      }

      if (!sameSellerMembership && (otherManagedAccount || hasSellerTeamMemberships(userSeller))) {
        return err(
          409,
          "Already on Another Team",
          "That user already belongs to another seller team. They need to leave that team first.",
        );
      }

      const nextManaged = upsertManagedSellerAccount(currentManaged, {
        sellerSlug: sellerSlugKey,
        sellerCode,
        vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
        role: nextRole,
        status: "active",
        teamOwnerUid: owner.id,
        grantedAt: userSeller?.teamAccessGrantedAt || now,
      });

      await db.collection("users").doc(targetUser.id).update({
        seller: {
          ...userSeller,
          sellerAccess: true,
          status: "active",
          sellerSlug: sellerSlugKey,
          sellerCode,
          vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
          groupVendorName: toStr(seller?.groupVendorName || seller?.vendorName || ""),
          groupSellerSlug: sellerSlugKey,
          groupSellerCode: sellerCode,
          teamRole: nextRole,
          teamOwnerUid: owner.id,
          activeSellerSlug: sellerSlugKey,
          activeSellerCode: sellerCode,
          managedSellerAccounts: nextManaged,
        },
        system: {
          ...(userData?.system && typeof userData.system === "object" ? userData.system : {}),
          accessType: nextSystemAccessType,
        },
        systemAccessType: nextSystemAccessType,
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
    }

    await db.collection("users").doc(owner.id).update({
      "seller.team": {
        ...sellerTeam,
        members,
        accessGrants,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    const teamMember = members[memberIndex];

    const emailOrigin = new URL(req.url).origin;
    const recipient = member.email || memberEmail;
    const emailPayload = {
      type: "seller-team-access-granted",
      to: recipient,
      data: {
        vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
        role: nextRole,
        sellerSlug,
        sellerCode,
        dashboardUrl: `${emailOrigin}/seller/dashboard?seller=${encodeURIComponent(sellerCode || sellerSlug)}`,
      },
    };

    let emailResults = [];
    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const emailRequest = fetch(`${emailOrigin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailPayload),
      });
      const [emailResponse] = await Promise.all([emailRequest]);
      const emailText = await emailResponse.text().catch(() => "");
      emailResults = [{ ok: emailResponse.ok, status: emailResponse.status, body: emailText }];

      if (!emailResponse.ok) {
        console.error("seller team update email failed:", emailText);
      }
    }

    if (!emailResults.length || emailResults.some((item) => item?.ok !== true)) {
      console.warn("seller team update email was not confirmed for:", recipient || memberUid || memberEmail);
    }

    return ok({
      message: "Team member updated.",
      member: {
        ...teamMember,
        role: nextRole,
        status: "active",
        updatedAt: now,
      },
      previousRole: currentRole,
    });
  } catch (e) {
    console.error("seller/team/update failed:", e);
    return err(500, "Unexpected Error", "Unable to update seller team access.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
