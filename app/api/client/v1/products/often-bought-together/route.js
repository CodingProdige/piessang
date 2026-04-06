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

function tokenize(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildSourceKeywords(source) {
  const terms = new Set([
    ...tokenize(source?.product?.title),
    ...tokenize(source?.product?.overview),
    ...tokenize(source?.product?.description),
    ...(Array.isArray(source?.product?.keywords) ? source.product.keywords.flatMap((entry) => tokenize(entry)) : []),
    ...tokenize(source?.brand?.title),
  ]);

  const stopWords = new Set([
    "and", "the", "with", "from", "for", "glass", "bottle", "bottles", "pack", "ml", "l", "original", "drink",
    "beverage", "flavour", "flavored", "product", "products", "case",
  ]);

  return Array.from(terms).filter((term) => term.length >= 3 && !stopWords.has(term));
}

function getPairingSeedTerms(source) {
  const category = toStr(source?.grouping?.category).toLowerCase();
  const subCategory = toStr(source?.grouping?.subCategory).toLowerCase();
  const title = toStr(source?.product?.title).toLowerCase();
  const overview = toStr(source?.product?.overview).toLowerCase();
  const text = `${category} ${subCategory} ${title} ${overview}`;

  const hasAny = (needles) => needles.some((needle) => text.includes(needle));

  if (hasAny(["cola", "coke", "soft drink", "soda", "fizzy", "sparkling drink"])) {
    return ["chips", "crisps", "biltong", "nuts", "snack", "popcorn", "ice", "mixers"];
  }
  if (hasAny(["beer", "lager", "ale", "cider"])) {
    return ["chips", "crisps", "biltong", "nuts", "snack", "ice"];
  }
  if (hasAny(["wine", "champagne", "sparkling wine", "prosecco"])) {
    return ["cheese", "crackers", "charcuterie", "olives", "nuts"];
  }
  if (hasAny(["whisky", "whiskey", "gin", "vodka", "rum", "tequila", "brandy", "liqueur"])) {
    return ["mixer", "mixers", "tonic", "soda", "ice", "garnish"];
  }
  if (hasAny(["water", "still water", "sparkling water"])) {
    return ["ice", "snack", "chips", "crisps", "nuts"];
  }
  return [];
}

function scoreFallbackCandidate(source, candidate, sourceKeywords, pairingTerms) {
  const candidateUniqueId = toStr(candidate?.product?.unique_id);
  const sourceUniqueId = toStr(source?.product?.unique_id);
  if (!candidateUniqueId || candidateUniqueId === sourceUniqueId) return -Infinity;
  if (candidate?.placement?.isActive !== true) return -Infinity;

  const category = toStr(candidate?.grouping?.category).toLowerCase();
  const subCategory = toStr(candidate?.grouping?.subCategory).toLowerCase();
  const brand = toStr(candidate?.brand?.slug || candidate?.grouping?.brand).toLowerCase();
  const title = toStr(candidate?.product?.title).toLowerCase();
  const overview = toStr(candidate?.product?.overview).toLowerCase();
  const description = toStr(candidate?.product?.description).toLowerCase();
  const keywords = Array.isArray(candidate?.product?.keywords) ? candidate.product.keywords.map((entry) => toStr(entry).toLowerCase()) : [];
  const haystack = [category, subCategory, brand, title, overview, description, ...keywords].join(" ");

  let score = 0;
  for (const term of pairingTerms) {
    if (haystack.includes(term)) score += 6;
  }
  for (const term of sourceKeywords) {
    if (haystack.includes(term)) score += 1;
  }

  const sameBrand = toStr(source?.brand?.slug || source?.grouping?.brand).toLowerCase() === brand;
  const sameSubCategory = toStr(source?.grouping?.subCategory).toLowerCase() === subCategory;
  if (sameBrand) score -= 3;
  if (sameSubCategory) score -= 5;
  if (candidate?.placement?.isFeatured === true) score += 0.5;

  return score;
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
    if (!productId) return err(400, "Missing Product", "Provide a productId to load recommendations.");

    const sourceDoc = await findProductDoc(db, productId);
    if (!sourceDoc) return err(404, "Not Found", "We could not find that product.");
    const source = sourceDoc.data() || {};
    const sourceUniqueId = toStr(source?.product?.unique_id || productId);

    const coCounts = new Map();
    const ordersSnap = await db.collection("orders_v2").get();
    ordersSnap.forEach((docSnap) => {
      const order = docSnap.data() || {};
      const items = Array.isArray(order?.items) ? order.items : [];
      const containsSource = items.some((item) => toStr(item?.product?.unique_id || item?.product_unique_id) === sourceUniqueId);
      if (!containsSource) return;
      for (const item of items) {
        const uniqueId = toStr(item?.product?.unique_id || item?.product_unique_id);
        if (!uniqueId || uniqueId === sourceUniqueId) continue;
        coCounts.set(uniqueId, (coCounts.get(uniqueId) || 0) + Math.max(1, Number(item?.qty || item?.quantity || 1)));
      }
    });

    const rankedIds = Array.from(coCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
    const items = [];
    for (const relatedId of rankedIds) {
      const relatedDoc = await findProductDoc(db, relatedId);
      if (!relatedDoc) continue;
      const data = relatedDoc.data() || {};
      if (data?.placement?.isActive !== true) continue;
      items.push({
        id: relatedDoc.id,
        data,
        coPurchaseCount: coCounts.get(relatedId) || 0,
      });
    }

    if (items.length > 0) {
      return ok({ count: items.length, items, source: "co_purchase" });
    }

    const sourceKeywords = buildSourceKeywords(source);
    const pairingTerms = getPairingSeedTerms(source);
    if (pairingTerms.length > 0) {
      const fallbackSnap = await db.collection("products_v2").where("placement.isActive", "==", true).limit(120).get();
      const fallbackItems = fallbackSnap.docs
        .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }))
        .map((entry) => ({
          ...entry,
          pairingScore: scoreFallbackCandidate(source, entry.data, sourceKeywords, pairingTerms),
        }))
        .filter((entry) => Number.isFinite(entry.pairingScore) && entry.pairingScore >= 6)
        .sort((a, b) => b.pairingScore - a.pairingScore)
        .slice(0, 8)
        .map((entry) => ({
          id: entry.id,
          data: entry.data,
          pairingScore: entry.pairingScore,
        }));

      if (fallbackItems.length > 0) {
        return ok({ count: fallbackItems.length, items: fallbackItems, source: "catalog_pairing" });
      }
    }

    return ok({ count: 0, items: [], source: "none", message: "No current product combinations for this item yet." });
  } catch (e) {
    console.error("often bought together failed:", e);
    return err(500, "Unexpected Error", "Unable to load often bought together products.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
