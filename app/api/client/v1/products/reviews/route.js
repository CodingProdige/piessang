export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeComment(comment = "") {
  const PROFANE_WORDS = [
    "fuck","shit","bitch","asshole","bastard","dick","pussy","cunt","slut","cock","faggot",
    "nigger","nigga","damn","crap","whore",
  ];
  let clean = String(comment);
  for (const word of PROFANE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    clean = clean.replace(regex, "*".repeat(word.length));
  }
  return clean.trim();
}

function normalizeRatings(entries = []) {
  const safe = Array.isArray(entries) ? entries : [];
  const count = safe.length;
  const average = count ? Number((safe.reduce((sum, item) => sum + Number(item?.stars || 0), 0) / count).toFixed(2)) : 0;
  return {
    entries: safe,
    average,
    count,
    lastUpdated: nowIso(),
  };
}

async function findProductDoc(db, productId) {
  const byDoc = await db.collection("products_v2").doc(productId).get();
  if (byDoc.exists) return byDoc;
  const byUniqueId = await db.collection("products_v2").where("product.unique_id", "==", productId).limit(1).get();
  return byUniqueId.empty ? null : byUniqueId.docs[0];
}

function hasCustomerPurchasedProduct(order, customerId, productId) {
  const orderCustomerId = toStr(order?.order?.customerId || order?.customer_snapshot?.customerId || order?.meta?.orderedFor);
  if (orderCustomerId !== customerId) return false;
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some((item) => {
    const uniqueId = toStr(item?.product?.unique_id || item?.product_unique_id || item?.product_snapshot?.product?.unique_id);
    return uniqueId === productId && ["paid", "processing", "dispatched", "delivered", "completed"].includes(toStr(order?.order?.status?.payment || order?.payment?.status || "paid").toLowerCase());
  });
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const { searchParams } = new URL(req.url);
    const productId = toStr(searchParams.get("productId") || searchParams.get("product_unique_id") || searchParams.get("id"));
    const requesterUid = toStr(searchParams.get("uid"));
    if (!productId) return err(400, "Missing Product", "Provide a productId to load reviews.");

    const productDoc = await findProductDoc(db, productId);
    if (!productDoc) return err(404, "Not Found", "We could not find that product.");
    const product = productDoc.data() || {};
    const ratings = product?.ratings && typeof product.ratings === "object" ? product.ratings : {};
    const entries = Array.isArray(ratings.entries) ? ratings.entries : [];

    let canReview = false;
    if (requesterUid) {
      const ordersSnap = await db.collection("orders_v2").get();
      canReview = ordersSnap.docs.some((docSnap) => hasCustomerPurchasedProduct(docSnap.data() || {}, requesterUid, toStr(product?.product?.unique_id || productId)));
    }

    return ok({
      data: {
        reviews: entries,
        average: Number(ratings.average || 0),
        count: Number(ratings.count || entries.length || 0),
        canReview,
      },
    });
  } catch (e) {
    console.error("product reviews get failed:", e);
    return err(500, "Unexpected Error", "Unable to load product reviews.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to submit a review.");

    const body = await req.json().catch(() => ({}));
    const productId = toStr(body?.productId || body?.product_unique_id || body?.id);
    const stars = Number(body?.stars || 0);
    const comment = sanitizeComment(body?.comment || "");
    const images = (Array.isArray(body?.images) ? body.images : [])
      .map((value) => toStr(value))
      .filter(Boolean)
      .slice(0, 6);

    if (!productId || stars < 1 || stars > 5) return err(400, "Missing Fields", "Provide a productId and a star rating from 1 to 5.");

    const productDoc = await findProductDoc(db, productId);
    if (!productDoc) return err(404, "Not Found", "We could not find that product.");
    const product = productDoc.data() || {};
    const uniqueId = toStr(product?.product?.unique_id || productId);

    const ordersSnap = await db.collection("orders_v2").get();
    const hasPurchased = ordersSnap.docs.some((docSnap) => hasCustomerPurchasedProduct(docSnap.data() || {}, sessionUser.uid, uniqueId));
    if (!hasPurchased) {
      return err(403, "Verified Purchase Required", "Only customers who have ordered this product can review it.");
    }

    const ratings = product?.ratings && typeof product.ratings === "object" ? product.ratings : {};
    const entries = Array.isArray(ratings.entries) ? [...ratings.entries] : [];
    const existingIndex = entries.findIndex((entry) => toStr(entry?.userId) === sessionUser.uid);
    const nextEntry = {
      userId: sessionUser.uid,
      name: toStr(body?.name || sessionUser?.displayName || "Verified buyer"),
      stars,
      comment,
      images,
      verifiedPurchase: true,
      createdAt: existingIndex >= 0 ? entries[existingIndex]?.createdAt || nowIso() : nowIso(),
      updatedAt: nowIso(),
    };

    if (existingIndex >= 0) {
      entries[existingIndex] = nextEntry;
    } else {
      entries.push(nextEntry);
    }

    const nextRatings = normalizeRatings(entries);
    await productDoc.ref.update({
      ratings: {
        ...ratings,
        ...nextRatings,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    return ok({ message: existingIndex >= 0 ? "Review updated." : "Review submitted.", data: { ratings: nextRatings } });
  } catch (e) {
    console.error("product reviews create failed:", e);
    return err(500, "Unexpected Error", "Unable to submit your review.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function DELETE(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage your review.");

    const body = await req.json().catch(() => ({}));
    const productId = toStr(body?.productId || body?.product_unique_id || body?.id);
    if (!productId) return err(400, "Missing Product", "Provide a productId to delete your review.");

    const productDoc = await findProductDoc(db, productId);
    if (!productDoc) return err(404, "Not Found", "We could not find that product.");
    const product = productDoc.data() || {};
    const ratings = product?.ratings && typeof product.ratings === "object" ? product.ratings : {};
    const entries = Array.isArray(ratings.entries) ? [...ratings.entries] : [];
    const nextEntries = entries.filter((entry) => toStr(entry?.userId) !== sessionUser.uid);

    if (nextEntries.length === entries.length) {
      return err(404, "Review Not Found", "We could not find your review for this product.");
    }

    const nextRatings = normalizeRatings(nextEntries);
    await productDoc.ref.update({
      ratings: {
        ...ratings,
        ...nextRatings,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    return ok({ message: "Review deleted.", data: { ratings: nextRatings } });
  } catch (e) {
    console.error("product reviews delete failed:", e);
    return err(500, "Unexpected Error", "Unable to delete your review.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
