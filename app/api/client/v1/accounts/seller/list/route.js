export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSellerAccountBlocked, isSellerReviewPending } from "@/lib/seller/account-status";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeRole(role) {
  const value = toStr(role).toLowerCase();
  if (value === "owner") return "owner";
  if (value === "admin") return "admin";
  if (value === "manager") return "manager";
  if (value === "catalogue") return "catalogue";
  if (value === "orders") return "orders";
  if (value === "analytics") return "analytics";
  return "";
}

function sellerSummary(docSnap) {
  const data = docSnap.data() || {};
  const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
  const blocked = seller?.blocked && typeof seller.blocked === "object" ? seller.blocked : {};
  const reviewRequest = seller?.reviewRequest && typeof seller.reviewRequest === "object" ? seller.reviewRequest : {};
  const managedSellerAccounts = Array.isArray(seller?.managedSellerAccounts)
    ? seller.managedSellerAccounts
    : Array.isArray(data?.sellerManagedAccounts)
      ? data.sellerManagedAccounts
      : [];
  const sellerSlug = toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug);
  if (!sellerSlug) return null;
  if (managedSellerAccounts.length > 0) return null;

  const team = seller?.team && typeof seller.team === "object" ? seller.team : {};
  const members = Array.isArray(team.members) ? team.members.length : 0;
  const accessGrants = Array.isArray(team.accessGrants) ? team.accessGrants.length : 0;
  const invites = Array.isArray(team.invites) ? team.invites.length : 0;
  const status = toStr(seller.status || (isSellerAccountBlocked(data) ? "blocked" : "")).toLowerCase();
  const reviewStatus = toStr(reviewRequest.status || (isSellerReviewPending(data) ? "pending" : "")).toLowerCase();

    return {
      uid: docSnap.id,
      email: toStr(data.email || seller?.contactEmail || ""),
      vendorName: toStr(seller?.vendorName || seller?.groupVendorName || data?.account?.accountName || sellerSlug),
      vendorDescription: toStr(seller?.vendorDescription || seller?.description || ""),
      sellerSlug,
      sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || ""),
      role: normalizeRole(seller?.teamRole || seller?.role || (seller?.sellerAccess ? "owner" : "")),
      status: status || "active",
    blockedReasonCode: toStr(blocked.reasonCode || ""),
    blockedReasonMessage: toStr(blocked.reasonMessage || ""),
    blockedAt: toStr(blocked.blockedAt || ""),
    blockedBy: toStr(blocked.blockedBy || ""),
    reviewStatus: reviewStatus || null,
    reviewRequestedAt: toStr(reviewRequest.requestedAt || ""),
    reviewRequestedBy: toStr(reviewRequest.requestedBy || ""),
    reviewRequestMessage: toStr(reviewRequest.message || ""),
    reviewResponseStatus: toStr(reviewRequest.responseStatus || ""),
    reviewResponseAt: toStr(reviewRequest.respondedAt || ""),
    reviewResponseBy: toStr(reviewRequest.respondedBy || ""),
    reviewResponseMessage: toStr(reviewRequest.responseMessage || ""),
    teamMembers: members,
    accessGrants: accessGrants,
    isOwner: seller?.sellerAccess === true && !seller?.teamOwnerUid,
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = toStr(searchParams.get("uid"));
    const filter = toStr(searchParams.get("filter"), "all").toLowerCase();
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    if (!uid) return err(400, "Missing UID", "uid is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");

    const requester = requesterSnap.data() || {};
    if (toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase() !== "admin") {
      return err(403, "Access Denied", "System admin access required.");
    }

    const snap = await db.collection("users").get();
    const sellers = [];

    snap.forEach((docSnap) => {
      const summary = sellerSummary(docSnap);
      if (!summary) return;
      sellers.push(summary);
    });

    const filtered = sellers.filter((seller) => {
      if (filter === "blocked" || filter === "suspended") return seller.status === "blocked";
      if (filter === "review" || filter === "review-requests" || filter === "review-request") {
        return seller.reviewStatus === "pending" || seller.reviewStatus === "requested";
      }
      if (filter === "active") return seller.status !== "blocked";
      return true;
    });

    filtered.sort((left, right) => {
      const leftPriority = left.status === "blocked" ? 0 : left.reviewStatus === "pending" ? 1 : 2;
      const rightPriority = right.status === "blocked" ? 0 : right.reviewStatus === "pending" ? 1 : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.vendorName.localeCompare(right.vendorName);
    });

    return ok({
      filter,
      count: filtered.length,
      sellers: filtered,
    });
  } catch (e) {
    console.error("seller/list failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller accounts.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
