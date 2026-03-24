export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildSellerSettlementBuckets, syncOrderSellerSettlements } from "@/lib/seller/settlements";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

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

  const match = await db.collection("orders_v2").where("order.orderNumber", "==", orderNumber).get();

  if (match.empty) return null;
  if (match.size > 1) {
    throw {
      code: 409,
      title: "Multiple Orders Found",
      message: "Multiple orders match this orderNumber.",
    };
  }

  return match.docs[0].id;
}

function findBucket(order, sellerCode, sellerSlug) {
  const buckets = buildSellerSettlementBuckets(order);
  const codeNeedle = toStr(sellerCode).toUpperCase();
  const slugNeedle = toStr(sellerSlug);
  return buckets.find((bucket) => {
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
    const sellerCode = toStr(payload?.sellerCode || "");
    const sellerSlug = toStr(payload?.sellerSlug || "");
    const approved = payload?.approved === true || String(payload?.status || "").toLowerCase() === "approved";
    const feedback = toStr(payload?.feedback || payload?.message || "");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!orderId && !orderNumber) return err(400, "Missing Order", "orderId or orderNumber is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "System admin access required.");
    }

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

    const settlementResponse = await syncOrderSellerSettlements({
      orderId: resolvedOrderId,
      orderNumber: order?.order?.orderNumber || orderNumber || null,
      eventType: approved ? "review_approved" : "review_rejected",
      review: {
        status: approved ? "approved" : "rejected",
        feedback,
        reviewedBy: uid,
        reviewedAt: new Date().toISOString(),
      },
    });

    await orderRef.update({
      "order.fulfilment": {
        ...(order?.order?.fulfilment || {}),
        status: approved ? "completed" : "review_rejected",
        reviewStatus: approved ? "approved" : "rejected",
        reviewFeedback: feedback || null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: uid,
        sellerCode: bucket.sellerCode || sellerCode || null,
        sellerSlug: bucket.sellerSlug || sellerSlug || null,
      },
      "order.status.fulfillment": approved ? "completed" : "review_rejected",
      ...(approved ? { "order.status.order": "completed" } : {}),
      "timestamps.updatedAt": new Date().toISOString(),
    });

    return ok({
      message: approved ? "Fulfilment review approved." : "Fulfilment review rejected.",
      orderId: resolvedOrderId,
      orderNumber: order?.order?.orderNumber || orderNumber || null,
      settlementStatus: settlementResponse?.settlementStatus || null,
      settlements: settlementResponse?.settlements || [],
    });
  } catch (e) {
    return err(e?.code ?? 500, e?.title ?? "Review Failed", e?.message ?? "Unexpected error reviewing fulfilment.");
  }
}
