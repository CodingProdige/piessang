export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getSellerBlockReasonFix, getSellerBlockReasonLabel, normalizeSellerBlockReasonCode } from "@/lib/seller/account-status";
import { collectSellerNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";
import { enqueueGoogleSyncForSeller } from "@/lib/integrations/google-sync-queue";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sellerSlugMatches(seller, sellerSlug) {
  const needle = toStr(sellerSlug);
  if (!needle || !seller || typeof seller !== "object") return false;
  return [seller?.sellerSlug, seller?.groupSellerSlug, seller?.activeSellerSlug].some((value) => toStr(value) === needle);
}

function patchManagedSellerAccount(accounts, sellerSlug, patch) {
  const list = Array.isArray(accounts) ? [...accounts] : [];
  let changed = false;
  const next = list.map((item) => {
    if (toStr(item?.sellerSlug) !== sellerSlug) return item;
    changed = true;
    return {
      ...item,
      ...patch,
    };
  });
  return { next, changed };
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
    const reasonCode = normalizeSellerBlockReasonCode(payload?.reasonCode);
    const reasonMessage = toStr(payload?.reasonMessage || payload?.notes || "");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase() !== "admin") {
      return err(403, "Access Denied", "System admin access required.");
    }

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const sellerTeam = seller?.team && typeof seller.team === "object" ? seller.team : {};
    const members = Array.isArray(sellerTeam.members) ? [...sellerTeam.members] : [];
    const accessGrants = Array.isArray(sellerTeam.accessGrants) ? [...sellerTeam.accessGrants] : [];
    const blockedAt = new Date().toISOString();
    const blockedBy = uid;

    const blocker = {
      reasonCode,
      reasonMessage,
      blockedAt,
      blockedBy,
    };

    await db.collection("users").doc(owner.id).update({
      "seller.status": "blocked",
      "seller.blocked": blocker,
      "seller.reviewRequest": null,
      "seller.team": {
        ...sellerTeam,
        members: members.map((member) => ({
          ...member,
          status: "blocked",
          blockedReasonCode: reasonCode,
          blockedReasonMessage: reasonMessage,
          blockedAt,
          blockedBy,
          updatedAt: blockedAt,
        })),
        accessGrants: accessGrants.map((grant) => ({
          ...grant,
          status: "blocked",
          blockedReasonCode: reasonCode,
          blockedReasonMessage: reasonMessage,
          blockedAt,
          blockedBy,
          updatedAt: blockedAt,
        })),
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    const usersSnap = await db.collection("users").get();
    await Promise.all(
      usersSnap.docs.map(async (userSnap) => {
        if (userSnap.id === owner.id) return;
        const userData = userSnap.data() || {};
        const userSeller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
        const managed = Array.isArray(userSeller.managedSellerAccounts) ? userSeller.managedSellerAccounts : [];
        const { next: nextManaged, changed } = patchManagedSellerAccount(managed, sellerSlug, {
          status: "blocked",
          blockedReasonCode: reasonCode,
          blockedReasonMessage: reasonMessage,
          blockedAt,
          blockedBy,
          reviewRequestStatus: null,
          reviewRequestedAt: null,
          reviewRequestedBy: null,
          reviewRequestMessage: null,
          reviewResponseStatus: null,
          reviewResponseAt: null,
          reviewResponseBy: null,
          reviewResponseMessage: null,
        });

        const currentActiveSeller = toStr(userSeller?.activeSellerSlug || userSeller?.groupSellerSlug || userSeller?.sellerSlug);
        const currentMatches = sellerSlugMatches(userSeller, sellerSlug) || currentActiveSeller === sellerSlug;
        if (!changed && !currentMatches) return;

        const nextSeller = {
          ...userSeller,
          managedSellerAccounts: nextManaged,
        };

        if (currentMatches) {
          nextSeller.status = "blocked";
          nextSeller.blocked = blocker;
          nextSeller.reviewRequest = null;
          nextSeller.sellerAccess = true;
          nextSeller.activeSellerSlug = sellerSlug;
          nextSeller.sellerSlug = toStr(userSeller?.sellerSlug || sellerSlug);
          nextSeller.groupSellerSlug = toStr(userSeller?.groupSellerSlug || sellerSlug);
          nextSeller.vendorName = toStr(userSeller?.vendorName || seller?.vendorName || seller?.groupVendorName || "");
          nextSeller.groupVendorName = toStr(seller?.vendorName || seller?.groupVendorName || "");
        }

        await db.collection("users").doc(userSnap.id).update({
          seller: nextSeller,
          "timestamps.updatedAt": FieldValue.serverTimestamp(),
        });
      }),
    );

    await enqueueGoogleSyncForSeller({
      sellerSlug,
      sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode),
      reason: "seller_blocked",
    }).catch(() => null);

    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const origin = new URL(req.url).origin;
      const recipients = await collectSellerNotificationEmails({
        sellerSlug,
        fallbackEmails: [owner.data?.seller?.contactEmail, owner.data?.email].filter(Boolean),
      });

      const sellerEmailsPromise = recipients.length
        ? sendSellerNotificationEmails({
            origin,
            type: "seller-account-blocked",
            to: recipients,
            data: {
              vendorName: seller?.vendorName || seller?.groupVendorName || owner.data?.seller?.vendorName || "Piessang seller",
              reasonLabel: getSellerBlockReasonLabel(reasonCode),
              reasonMessage,
              fixHint: getSellerBlockReasonFix(reasonCode),
              blockedAt,
              blockedBy,
              sellerSlug,
            },
          })
        : Promise.resolve([]);

      const internalEmailPromise = sendSellerNotificationEmails({
        origin,
        type: "seller-account-blocked-internal",
        to: ["support@piessang.com"],
        data: {
          vendorName: seller?.vendorName || owner.data?.seller?.vendorName || "Piessang seller",
          sellerSlug,
          blockedBy,
          blockedByEmail: requester?.email || requester?.seller?.contactEmail || "",
          blockedAt,
          reasonLabel: getSellerBlockReasonLabel(reasonCode),
          reasonMessage,
        },
      });

      await Promise.all([sellerEmailsPromise, internalEmailPromise]);
    }

    return ok({
      message: "Seller account blocked.",
      sellerSlug,
      blocked: blocker,
    });
  } catch (e) {
    console.error("seller/block failed:", e);
    return err(500, "Unexpected Error", "Unable to block seller account.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
