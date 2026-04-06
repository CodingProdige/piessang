export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load your reviews.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { searchParams } = new URL(req.url);
    const uid = toStr(searchParams.get("uid") || sessionUser.uid);
    if (uid !== sessionUser.uid) return err(403, "Access Denied", "You can only view your own reviews.");

    const snap = await db.collection("products_v2").get();
    const reviews = [];

    for (const docSnap of snap.docs) {
      const product = docSnap.data() || {};
      const ratings = product?.ratings && typeof product.ratings === "object" ? product.ratings : {};
      const entries = Array.isArray(ratings.entries) ? ratings.entries : [];
      const review = entries.find((entry) => toStr(entry?.userId) === uid);
      if (!review) continue;

      reviews.push({
        docId: `${docSnap.id}:${uid}`,
        productId: toStr(product?.product?.unique_id || docSnap.id),
        productDocId: docSnap.id,
        productTitle: toStr(product?.product?.title || "Product"),
        productSlug: toStr(product?.product?.slug || ""),
        productImage:
          toStr(product?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
          toStr(product?.product?.productImage || ""),
        average: Number(ratings.average || 0),
        count: Number(ratings.count || entries.length || 0),
        review: {
          userId: toStr(review?.userId),
          name: toStr(review?.name || sessionUser.displayName || "Verified buyer"),
          stars: Number(review?.stars || 0),
          comment: toStr(review?.comment),
          images: (Array.isArray(review?.images) ? review.images : []).map((value) => toStr(value)).filter(Boolean),
          verifiedPurchase: review?.verifiedPurchase === true,
          createdAt: toStr(review?.createdAt),
          updatedAt: toStr(review?.updatedAt),
        },
      });
    }

    reviews.sort((left, right) => toStr(right?.review?.updatedAt || right?.review?.createdAt).localeCompare(toStr(left?.review?.updatedAt || left?.review?.createdAt)));

    return ok({
      data: {
        reviews,
      },
    });
  } catch (e) {
    console.error("account reviews get failed:", e);
    return err(500, "Unexpected Error", "Unable to load your reviews.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
