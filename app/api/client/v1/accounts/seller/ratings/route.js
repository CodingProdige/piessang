export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  buildSellerRatingDocId,
  getUserSellerRatingsForOrder,
  listSellerRatings,
  normalizeSellerRatings,
  sanitizeSellerRatingComment,
} from "@/lib/social/seller-ratings";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getOrderCustomerId(order) {
  return toStr(order?.order?.customerId || order?.customer_snapshot?.customerId || order?.meta?.orderedFor);
}

function getCustomerName(user, order) {
  return (
    toStr(user?.account?.accountName) ||
    toStr(user?.personal?.fullName) ||
    toStr(order?.customer_snapshot?.personal?.fullName) ||
    toStr(order?.customer_snapshot?.account?.accountName) ||
    "Verified buyer"
  );
}

function getSellerGroupsFromOrder(order) {
  const groups = new Map();
  const sellerSlices = Array.isArray(order?.seller_slices) ? order.seller_slices : [];
  for (const slice of sellerSlices) {
    const sellerCode = toStr(slice?.sellerCode);
    const sellerSlug = toStr(slice?.sellerSlug);
    const key = sellerCode || sellerSlug;
    if (!key) continue;
    groups.set(key, {
      sellerCode,
      sellerSlug,
      vendorName: toStr(slice?.vendorName || "Seller"),
      delivered: false,
    });
  }

  for (const item of Array.isArray(order?.items) ? order.items : []) {
    const productSnapshot = item?.product_snapshot || {};
    const sellerSnapshot = item?.seller_snapshot || productSnapshot?.seller || productSnapshot?.product?.seller || {};
    const sellerCode = toStr(sellerSnapshot?.sellerCode || productSnapshot?.product?.sellerCode);
    const sellerSlug = toStr(sellerSnapshot?.sellerSlug || productSnapshot?.product?.sellerSlug);
    const key = sellerCode || sellerSlug;
    if (!key) continue;
    const current = groups.get(key) || {
      sellerCode,
      sellerSlug,
      vendorName: toStr(sellerSnapshot?.vendorName || productSnapshot?.product?.vendorName || "Seller"),
      delivered: false,
    };
    const status = toStr(item?.fulfillment_tracking?.status).toLowerCase();
    if (status === "delivered") current.delivered = true;
    groups.set(key, current);
  }

  return Array.from(groups.values());
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { searchParams } = new URL(req.url);
    const sellerCode = toStr(searchParams.get("sellerCode"));
    const sellerSlug = toStr(searchParams.get("sellerSlug"));
    const orderId = toStr(searchParams.get("orderId"));

    if (orderId) {
      const sessionUser = await requireSessionUser();
      if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to view your seller ratings.");
      const reviews = await getUserSellerRatingsForOrder({ orderId, userId: sessionUser.uid });
      return ok({ data: { reviews } });
    }

    if (!sellerCode && !sellerSlug) {
      return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");
    }

    const { reviews, summary } = await listSellerRatings({ sellerCode, sellerSlug });
    return ok({ data: { reviews, summary } });
  } catch (error) {
    return err(500, "Unexpected Error", "Unable to load seller ratings.", {
      details: String(error?.message || "").slice(0, 300),
    });
  }
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to rate this seller.");

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const vendorName = toStr(body?.vendorName || "Seller");
    const stars = Math.max(1, Math.min(5, Number(body?.stars || 0)));
    const comment = sanitizeSellerRatingComment(body?.comment || "");
    const images = (Array.isArray(body?.images) ? body.images : [])
      .map((entry) => toStr(entry))
      .filter((entry) => /^(https?:\/\/|data:)/i.test(entry))
      .slice(0, 6);

    if (!orderId || (!sellerCode && !sellerSlug) || !stars) {
      return err(400, "Missing Fields", "orderId, sellerCode or sellerSlug, and a star rating are required.");
    }

    const orderRef = db.collection("orders_v2").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "We could not find that order.");
    const order = orderSnap.data() || {};

    if (getOrderCustomerId(order) !== sessionUser.uid) {
      return err(403, "Access Denied", "You can only rate sellers on your own orders.");
    }

    const sellerGroups = getSellerGroupsFromOrder(order);
    const matchingSeller = sellerGroups.find((group) => {
      const codeMatch = sellerCode && toStr(group?.sellerCode).toLowerCase() === sellerCode.toLowerCase();
      const slugMatch = sellerSlug && toStr(group?.sellerSlug).toLowerCase() === sellerSlug.toLowerCase();
      return codeMatch || slugMatch;
    });

    if (!matchingSeller) {
      return err(404, "Seller Not Found", "That seller does not appear on this order.");
    }
    if (!matchingSeller.delivered) {
      return err(409, "Order Not Completed", "You can rate this seller once their part of the order has been delivered.");
    }

    const userSnap = await db.collection("users").doc(sessionUser.uid).get();
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const docId = buildSellerRatingDocId({
      orderId,
      userId: sessionUser.uid,
      sellerCode: matchingSeller.sellerCode,
      sellerSlug: matchingSeller.sellerSlug,
    });
    const ratingRef = db.collection("seller_ratings_v1").doc(docId);
    const existingSnap = await ratingRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
    const createdAt = toStr(existing?.createdAt || new Date().toISOString());

    await ratingRef.set({
      docId,
      orderId,
      orderNumber: toStr(order?.order?.orderNumber || orderId),
      userId: sessionUser.uid,
      customerName: getCustomerName(user, order),
      sellerCode: matchingSeller.sellerCode || null,
      sellerSlug: matchingSeller.sellerSlug || null,
      vendorName: matchingSeller.vendorName || vendorName,
      stars,
      comment,
      images,
      verifiedPurchase: true,
      createdAt,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    const { reviews, summary } = await listSellerRatings({
      sellerCode: matchingSeller.sellerCode,
      sellerSlug: matchingSeller.sellerSlug,
    });

    await orderRef.set({
      seller_rating_summary: {
        [matchingSeller.sellerCode || matchingSeller.sellerSlug]: {
          average: summary.average,
          count: summary.count,
          updatedAt: new Date().toISOString(),
        },
      },
      timestamps: {
        ...(order?.timestamps || {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });

    return ok({
      message: existingSnap.exists ? "Seller rating updated." : "Seller rating submitted.",
      data: {
        review: reviews.find((entry) => toStr(entry?.docId) === docId) || null,
        summary,
      },
    });
  } catch (error) {
    return err(500, "Unexpected Error", "Unable to submit your seller rating.", {
      details: String(error?.message || "").slice(0, 300),
    });
  }
}
