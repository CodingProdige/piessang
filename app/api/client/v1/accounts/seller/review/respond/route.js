export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { collectSellerNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isAdmin(record) {
  const system = record?.system && typeof record.system === "object" ? record.system : {};
  return toStr(system.accessType || record?.systemAccessType).toLowerCase() === "admin";
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

async function findFirstUserRecord(predicate) {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("users").get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (predicate(docSnap.id, data)) {
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
    const approved = payload?.approved === true || String(payload?.status || "").toLowerCase() === "approved";
    const feedback = toStr(payload?.feedback || payload?.message || "");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!isAdmin(requester)) {
      return err(403, "Access Denied", "System admin access required.");
    }

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const request = seller?.reviewRequest && typeof seller.reviewRequest === "object" ? seller.reviewRequest : {};
    const responseStatus = approved ? "approved" : "rejected";
    const nextStatus = approved ? "active" : "blocked";
    const nextReviewRequest = {
      ...request,
      status: responseStatus,
      responseStatus,
      responseMessage: feedback,
      respondedAt: new Date().toISOString(),
      respondedBy: uid,
    };
    const sellerBlocked = seller?.blocked && typeof seller.blocked === "object" ? seller.blocked : null;
    const nextBlocked = approved ? null : sellerBlocked || {
      reasonCode: "other",
      reasonMessage: feedback || "Seller review was rejected.",
      blockedAt: request?.requestedAt || new Date().toISOString(),
      blockedBy: uid,
    };

    await db.collection("users").doc(owner.id).update({
      "seller.status": nextStatus,
      "seller.reviewRequest": nextReviewRequest,
      "seller.blocked": nextBlocked,
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    const usersSnap = await db.collection("users").get();
    await Promise.all(
      usersSnap.docs.map(async (userSnap) => {
        const userData = userSnap.data() || {};
        const userSeller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
        const managed = Array.isArray(userSeller.managedSellerAccounts) ? userSeller.managedSellerAccounts : [];
        const { next: nextManaged, changed } = patchManagedSellerAccount(managed, sellerSlug, {
          status: nextStatus,
          blockedReasonCode: approved ? null : toStr(nextBlocked?.reasonCode || "other"),
          blockedReasonMessage: approved ? null : toStr(nextBlocked?.reasonMessage || feedback),
          blockedAt: approved ? null : toStr(nextBlocked?.blockedAt || nextReviewRequest.respondedAt),
          blockedBy: approved ? null : toStr(nextBlocked?.blockedBy || uid),
          reviewRequestStatus: responseStatus,
          reviewRequestedAt: toStr(request?.requestedAt || null),
          reviewRequestedBy: toStr(request?.requestedBy || null),
          reviewRequestMessage: toStr(request?.message || null),
          reviewResponseStatus: responseStatus,
          reviewResponseAt: nextReviewRequest.respondedAt,
          reviewResponseBy: uid,
          reviewResponseMessage: feedback,
        });

        const currentMatches = sellerSlugMatches(userSeller, sellerSlug);
        if (!changed && !currentMatches) return;

        const nextSeller = {
          ...userSeller,
          managedSellerAccounts: nextManaged,
        };

        if (currentMatches) {
          nextSeller.status = nextStatus;
          nextSeller.reviewRequest = nextReviewRequest;
          nextSeller.blocked = nextBlocked;
          nextSeller.sellerAccess = true;
          nextSeller.activeSellerSlug = sellerSlug;
          nextSeller.sellerSlug = toStr(userSeller?.sellerSlug || sellerSlug);
          nextSeller.groupSellerSlug = toStr(userSeller?.groupSellerSlug || sellerSlug);
          nextSeller.vendorName = toStr(userSeller?.vendorName || owner.data?.seller?.vendorName || "");
          nextSeller.groupVendorName = toStr(owner.data?.seller?.vendorName || "");
        }

        await db.collection("users").doc(userSnap.id).update({
          seller: nextSeller,
          "timestamps.updatedAt": FieldValue.serverTimestamp(),
        });
      }),
    );

    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const recipients = await collectSellerNotificationEmails({
        sellerSlug,
        fallbackEmails: [owner.data?.seller?.contactEmail, owner.data?.email].filter(Boolean),
      });

      if (recipients.length) {
        await sendSellerNotificationEmails({
          origin: new URL(req.url).origin,
          type: "seller-review-response",
          to: recipients,
          data: {
            vendorName: seller?.vendorName || owner.data?.seller?.vendorName || "Bevgo seller",
            statusLabel: approved ? "approved" : "rejected",
            feedback,
            nextStep: approved
              ? "Your seller account is active again. You can continue managing products and orders from Bevgo."
              : "Please fix the issues listed in the feedback, then request another review from your seller dashboard.",
          },
        });
      }
    }

    return ok({
      message: approved ? "Seller review approved." : "Seller review rejected.",
      sellerSlug,
      status: nextStatus,
      reviewRequest: nextReviewRequest,
    });
  } catch (e) {
    console.error("seller/review/respond failed:", e);
    return err(500, "Unexpected Error", "Unable to respond to seller review.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
