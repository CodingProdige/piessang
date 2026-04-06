export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildSellerSettlementBuckets, syncOrderSellerSettlements } from "@/lib/seller/settlements";
import { canAccessSellerSettlement } from "@/lib/seller/settlement-access";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function resolveOrderId(orderId, orderNumber) {
  const db = getAdminDb();
  if (!db) return null;
  if (orderId) return orderId;
  if (!orderNumber) return null;

  const match = await db.collection("orders_v2").where("order.orderNumber", "==", String(orderNumber).trim()).get();
  if (match.empty) return null;
  if (match.size > 1) {
    throw { code: 409, title: "Multiple Orders Found", message: "Multiple orders match this orderNumber." };
  }
  return match.docs[0].id;
}

function findBucket(order, sellerCode, sellerSlug) {
  const buckets = buildSellerSettlementBuckets(order);
  const codeNeedle = toStr(sellerCode).toUpperCase();
  const slugNeedle = toStr(sellerSlug);
  return buckets.find(bucket => {
    const bucketCode = toStr(bucket?.sellerCode).toUpperCase();
    const bucketSlug = toStr(bucket?.sellerSlug);
    const bucketVendor = toStr(bucket?.vendorName);
    return (
      (codeNeedle && bucketCode === codeNeedle) ||
      (slugNeedle && bucketSlug === slugNeedle) ||
      (slugNeedle && bucketVendor === slugNeedle)
    );
  }) || null;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === "object" ? body.data : body;
    const uid = toStr(body?.uid || payload?.uid);
    const orderId = toStr(payload?.orderId || body?.orderId);
    const orderNumber = toStr(payload?.orderNumber || body?.orderNumber);
    const sellerCode = toStr(payload?.sellerCode || payload?.seller?.sellerCode || "");
    const sellerSlug = toStr(payload?.sellerSlug || payload?.seller?.sellerSlug || "");
    const trackingNumber = toStr(payload?.trackingNumber || "");
    const courierName = toStr(payload?.courierName || "");
    const proofUrl = toStr(payload?.proofUrl || payload?.proof || "");
    const notes = toStr(payload?.notes || "");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!orderId && !orderNumber) return err(400, "Missing Order", "orderId or orderNumber is required.");
    if (!sellerCode && !sellerSlug) return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");

    const resolvedOrderId = await resolveOrderId(orderId, orderNumber);
    if (!resolvedOrderId) return err(404, "Order Not Found", "Could not find that order.");

    const orderRef = db.collection("orders_v2").doc(resolvedOrderId);
    const snap = await orderRef.get();
    if (!snap.exists) return err(404, "Order Not Found", "Could not find that order.");
    const order = snap.data() || {};

    const bucket = findBucket(order, sellerCode, sellerSlug);
    if (!bucket) {
      return err(404, "Seller Not Found", "That seller does not appear on this order.");
    }

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting user.");
    const requester = requesterSnap.data() || {};
    if (!canAccessSellerSettlement(requester, bucket.sellerSlug || sellerSlug, bucket.sellerCode || sellerCode)) {
      return err(403, "Access Denied", "You do not have permission to submit fulfilment claims for this seller.");
    }

    if (isSellerAccountUnavailable(requester)) {
      return err(403, "Seller Account Unavailable", "This seller account is currently unavailable.");
    }

    const expectedBy = bucket.expectedFulfilmentBy ? new Date(bucket.expectedFulfilmentBy) : null;
    const claimAt = new Date();
    const late = Boolean(expectedBy && !Number.isNaN(expectedBy.getTime()) && claimAt.getTime() > expectedBy.getTime());

    await orderRef.update({
      "order.fulfilment": {
        ...(order?.order?.fulfilment || {}),
        status: "pending_review",
        submittedAt: claimAt.toISOString(),
        submittedBy: uid,
        sellerCode: bucket.sellerCode || sellerCode || null,
        sellerSlug: bucket.sellerSlug || sellerSlug || null,
        trackingNumber: trackingNumber || null,
        courierName: courierName || null,
        proofUrl: proofUrl || null,
        notes: notes || null,
        expectedFulfilmentBy: bucket.expectedFulfilmentBy || null,
        late,
      },
      "order.status.fulfillment": "pending_review",
      "settlements.updatedAt": claimAt.toISOString(),
      "timestamps.updatedAt": claimAt.toISOString(),
    });

    const settlementResult = await syncOrderSellerSettlements({
      orderId: resolvedOrderId,
      orderNumber: order?.order?.orderNumber || orderNumber || null,
      eventType: "claim_submitted",
      claim: {
        status: "pending_review",
        submittedAt: claimAt.toISOString(),
        submittedBy: uid,
        trackingNumber: trackingNumber || null,
        courierName: courierName || null,
        proofUrl: proofUrl || null,
        late,
      },
    });

    return ok({
      message: late
        ? "Fulfilment claim submitted. The claim was submitted after the expected fulfilment window."
        : "Fulfilment claim submitted.",
      orderId: resolvedOrderId,
      orderNumber: order?.order?.orderNumber || orderNumber || null,
      late,
      settlements: settlementResult?.settlements || [],
    });
  } catch (e) {
    return err(e?.code ?? 500, e?.title ?? "Claim Failed", e?.message ?? "Unexpected error submitting fulfilment claim.");
  }
}
