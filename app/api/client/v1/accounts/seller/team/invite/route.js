export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import {
  normalizeSellerTeamRole,
  sanitizeInviteEmail,
} from "@/lib/seller/team";
import { hasSellerTeamMemberships, ownsSellerAccount } from "@/lib/seller/access";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { ensureSellerCode } from "@/lib/seller/seller-code";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isSystemAdmin(data) {
  return toStr(data?.system?.accessType || data?.systemAccessType).toLowerCase() === "admin";
}

function sellerIdentifierMatches(item, sellerSlug, sellerCode) {
  const needleSlug = toStr(sellerSlug);
  const needleCode = toStr(sellerCode).toUpperCase();
  const itemSlug = toStr(item?.sellerSlug);
  const itemCode = toStr(item?.sellerCode).toUpperCase();
  return Boolean(
    (needleSlug && itemSlug === needleSlug) ||
      (needleCode && itemCode === needleCode),
  );
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
    const uid = toStr(body?.uid);
    const payload = body?.data && typeof body.data === "object" ? body.data : body;
    const email = sanitizeInviteEmail(payload?.email);
    const role = normalizeSellerTeamRole(payload?.role || "manager");
    const grantSystemAdmin = payload?.grantSystemAdmin === true || toStr(payload?.systemAccessType).toLowerCase() === "admin";

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!email) return err(400, "Missing Email", "Invitee email is required.");

    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "Seller Not Found", "Seller account not found.");

    const current = snap.data() || {};
    if (current?.seller?.sellerAccess !== true) {
      return err(403, "Seller Access Required", "Only active sellers can invite teammates.");
    }
    if (grantSystemAdmin && !isSystemAdmin(current)) {
      return err(403, "Access Denied", "Only system admins can grant system admin access.");
    }

    const currentSeller = current?.seller && typeof current.seller === "object" ? current.seller : {};
    const baseVendorName = toStr(currentSeller?.vendorName || current?.seller?.vendorName);
    const baseSellerSlug = toStr(currentSeller?.sellerSlug || current?.seller?.sellerSlug) || toSellerSlug(baseVendorName);
    const baseSellerCode = ensureSellerCode(currentSeller?.sellerCode || current?.seller?.sellerCode, uid);
    const owner =
      (await findSellerOwnerByIdentifier(baseSellerCode)) ||
      (await findSellerOwnerByIdentifier(baseSellerSlug));
    const sellerRecord = owner?.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : currentSeller;
    const vendorName = toStr(sellerRecord?.vendorName || baseVendorName);
    const sellerSlug = toStr(sellerRecord?.sellerSlug || sellerRecord?.activeSellerSlug || baseSellerSlug) || toSellerSlug(vendorName);
    const sellerCode = ensureSellerCode(sellerRecord?.sellerCode || sellerRecord?.activeSellerCode || baseSellerCode, uid);
    if (!vendorName) {
      return err(400, "Missing Vendor Name", "Seller vendor name is required before inviting teammates.");
    }

    const now = new Date().toISOString();
    const invitee = await findUserByEmail(db, email);
    if (invitee?.id) {
      const inviteeSeller = invitee.data?.seller && typeof invitee.data.seller === "object" ? invitee.data.seller : {};
      const currentManaged = Array.isArray(inviteeSeller.managedSellerAccounts) ? [...inviteeSeller.managedSellerAccounts] : [];
      const sameSellerMembership = currentManaged.some((item) => sellerIdentifierMatches(item, sellerSlug, sellerCode));
      const otherManagedAccount = currentManaged.some((item) => {
        const itemSlug = toStr(item?.sellerSlug);
        const itemCode = toStr(item?.sellerCode).toUpperCase();
        return Boolean(
          (itemSlug && itemSlug !== sellerSlug) ||
          (itemCode && itemCode !== sellerCode.toUpperCase())
        );
      });

      if (ownsSellerAccount(inviteeSeller)) {
        return err(
          409,
          "Registered Seller Found",
          "That user already has a seller account. They must delete it before joining another seller team.",
        );
      }

      if (!sameSellerMembership && (otherManagedAccount || hasSellerTeamMemberships(inviteeSeller))) {
        return err(
          409,
          "Already on Another Team",
          "That user already belongs to another seller team. They need to leave that team first.",
        );
      }

      const nextManaged = currentManaged.filter((item) => !sellerIdentifierMatches(item, sellerSlug, sellerCode));
      nextManaged.push({
        sellerSlug,
        sellerCode,
        vendorName,
        role,
        status: "active",
        teamOwnerUid: uid,
        grantedAt: now,
      });

      await db.collection("users").doc(invitee.id).update({
        seller: {
          ...inviteeSeller,
          sellerAccess: true,
          status: "active",
          sellerSlug,
          vendorName,
          groupVendorName: vendorName,
          groupSellerSlug: sellerSlug,
          groupSellerCode: sellerCode,
          teamRole: role,
          teamOwnerUid: uid,
          teamAccessGrantedAt: now,
          activeSellerSlug: sellerSlug,
          activeSellerCode: sellerCode,
          managedSellerAccounts: nextManaged,
        },
        ...(grantSystemAdmin
          ? {
              system: {
                ...(invitee.data?.system && typeof invitee.data.system === "object" ? invitee.data.system : {}),
                accessType: "admin",
              },
              systemAccessType: "admin",
            }
          : {}),
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
    } else {
      return err(
        404,
        "User Not Found",
        "We could not find a Piessang account for that email. Ask them to sign in once first, then add them again.",
      );
    }

    const sellerTeam = current?.seller?.team && typeof current.seller.team === "object" ? current.seller.team : {};
    const members = Array.isArray(sellerTeam.members) ? [...sellerTeam.members] : [];
    const memberIndex = members.findIndex((item) => sanitizeInviteEmail(item?.email || "") === email);
    const member = {
      uid: invitee.id,
      email,
      role,
      systemAccessType: grantSystemAdmin ? "admin" : null,
      status: "active",
      joinedAt: now,
      grantedAt: now,
      grantedBy: uid,
    };

    if (memberIndex >= 0) {
      members[memberIndex] = member;
    } else {
      members.push(member);
    }

    const accessGrants = Array.isArray(sellerTeam.accessGrants) ? [...sellerTeam.accessGrants] : [];
    accessGrants.push({
      uid: invitee.id,
      email,
      role,
      systemAccessType: grantSystemAdmin ? "admin" : null,
      status: "active",
      grantedAt: now,
      grantedBy: uid,
      vendorName,
      sellerSlug,
      sellerCode,
    });

    const remainingInvites = Array.isArray(sellerTeam.invites)
      ? sellerTeam.invites.filter((item) => sanitizeInviteEmail(item?.email || "") !== email)
      : [];

    await ref.update({
      "seller.team": {
        ...sellerTeam,
        members,
        accessGrants,
        invites: remainingInvites,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    const emailOrigin = new URL(req.url).origin;
    const emailPayload = {
      type: "seller-team-access-granted",
      to: email,
      data: {
        vendorName,
        role,
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
        console.error("seller team access email failed:", emailText);
      }
    }

    if (!emailResults.length || emailResults.some((item) => item?.ok !== true)) {
      console.warn("seller team access email was not confirmed for:", email);
    }

    return ok({
      message: "Access granted.",
      member,
      emailResults,
    });
  } catch (e) {
    console.error("seller/team/invite failed:", e);
    return err(500, "Unexpected Error", "Unable to grant seller team access.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
