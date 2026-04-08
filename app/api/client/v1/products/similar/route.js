export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getCanonicalOfferBarcode(source) {
  const stored = toStr(source?.marketplace?.canonical_offer_barcode).toUpperCase();
  if (stored) return stored;
  const variants = Array.isArray(source?.variants) ? source.variants : [];
  for (const variant of variants) {
    const barcode = toStr(variant?.barcode).toUpperCase();
    if (barcode) return barcode;
  }
  return "";
}

async function findProductDoc(db, productId) {
  const byDoc = await db.collection("products_v2").doc(productId).get();
  if (byDoc.exists) return byDoc;
  const byUniqueId = await db.collection("products_v2").where("product.unique_id", "==", productId).limit(1).get();
  return byUniqueId.empty ? null : byUniqueId.docs[0];
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { searchParams } = new URL(req.url);
    const productId = toStr(searchParams.get("productId") || searchParams.get("product_unique_id") || searchParams.get("id"));
    if (!productId) return err(400, "Missing Product", "Provide a productId to load similar products.");

    const sourceDoc = await findProductDoc(db, productId);
    if (!sourceDoc) return err(404, "Not Found", "We could not find that product.");
    const source = sourceDoc.data() || {};
    const sourceUniqueId = toStr(source?.product?.unique_id || productId);
    const sourceBarcode = getCanonicalOfferBarcode(source);
    const sourceCategory = toStr(source?.grouping?.category);
    const sourceSubCategory = toStr(source?.grouping?.subCategory);
    const sourceBrand = toStr(source?.brand?.slug || source?.grouping?.brand);

    let query = db.collection("products_v2").where("placement.isActive", "==", true);
    if (sourceSubCategory) {
      query = query.where("grouping.subCategory", "==", sourceSubCategory);
    } else if (sourceCategory) {
      query = query.where("grouping.category", "==", sourceCategory);
    }

    const snap = await query.limit(24).get();
    const ranked = snap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data() || {},
      }))
      .filter((item) => {
        const candidateUniqueId = toStr(item?.data?.product?.unique_id || item?.id);
        if (candidateUniqueId === sourceUniqueId) return false;
        const candidateBarcode = getCanonicalOfferBarcode(item?.data);
        if (sourceBarcode && candidateBarcode && candidateBarcode === sourceBarcode) return false;
        return true;
      })
      .map((item) => {
        let score = 0;
        if (sourceSubCategory && toStr(item?.data?.grouping?.subCategory) === sourceSubCategory) score += 4;
        if (sourceCategory && toStr(item?.data?.grouping?.category) === sourceCategory) score += 2;
        if (sourceBrand && toStr(item?.data?.brand?.slug || item?.data?.grouping?.brand) === sourceBrand) score += 1;
        if (item?.data?.placement?.isFeatured === true) score += 0.5;
        return { ...item, similarityScore: score };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 12);

    return ok({ count: ranked.length, items: ranked });
  } catch (e) {
    console.error("similar products failed:", e);
    return err(500, "Unexpected Error", "Unable to load similar products.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
