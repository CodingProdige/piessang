export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getSellerBlockReasonLabel, isSellerAccountBlocked, normalizeSellerBlockReasonCode } from "@/lib/seller/account-status";
import { sendSellerNotificationEmails } from "@/lib/seller/notifications";

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
    const message = toStr(payload?.message || payload?.notes || "");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");

    const requester = requesterSnap.data() || {};
    const requesterSeller = requester?.seller && typeof requester.seller === "object" ? requester.seller : {};
    const activeSellerSlug = toStr(requesterSeller?.activeSellerSlug || requesterSeller?.sellerSlug || requester?.sellerActiveSellerSlug || requester?.sellerSlug);
    const canRequest = Boolean(
      activeSellerSlug &&
        activeSellerSlug === sellerSlug &&
        (requesterSeller?.sellerAccess === true || requesterSeller?.teamRole === "owner" || requesterSeller?.teamRole === "admin"),
    );

    if (!canRequest) {
      return err(403, "Access Denied", "You can only request review for the seller account you currently manage.");
    }

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");
    const ownerSeller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};

    if (!isSellerAccountBlocked(owner.data)) {
      return err(400, "Seller Not Blocked", "This seller account is not currently blocked.");
    }

    const request = {
      status: "pending",
      reasonCode,
      message,
      requestedAt: new Date().toISOString(),
      requestedBy: uid,
      responseStatus: null,
      responseMessage: null,
      respondedAt: null,
      respondedBy: null,
    };

    await db.collection("users").doc(owner.id).update({
      "seller.reviewRequest": request,
      "seller.status": "blocked",
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
          reviewRequestStatus: "pending",
          reviewRequestedAt: request.requestedAt,
          reviewRequestedBy: uid,
          reviewRequestMessage: message,
          reviewResponseStatus: null,
          reviewResponseAt: null,
          reviewResponseBy: null,
          reviewResponseMessage: null,
          blockedReasonCode: normalizeSellerBlockReasonCode(payload?.reasonCode),
          blockedReasonMessage: message,
        });

        const currentMatches = sellerSlugMatches(userSeller, sellerSlug);
        if (!changed && !currentMatches) return;

        const nextSeller = {
          ...userSeller,
          managedSellerAccounts: nextManaged,
        };

        if (currentMatches) {
          nextSeller.status = "blocked";
          nextSeller.reviewRequest = request;
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
      await sendSellerNotificationEmails({
        origin: new URL(req.url).origin,
        type: "seller-review-request-internal",
        to: ["support@piessang.com"],
        data: {
          vendorName: ownerSeller?.vendorName || "Piessang seller",
          sellerSlug,
          requestedBy: uid,
          requestedByEmail: requester?.email || requester?.seller?.contactEmail || "",
          reasonLabel: getSellerBlockReasonLabel(request.reasonCode),
          message: message,
        },
      });
    }

    return ok({
      message: "Review requested.",
      reviewRequest: request,
    });
  } catch (e) {
    console.error("seller/review/request failed:", e);
    return err(500, "Unexpected Error", "Unable to request seller review.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
