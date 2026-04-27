export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveShopperVisibleProducts } from "@/lib/catalogue/shopper-listing";
import { categoryMatches } from "@/lib/catalogue/category-normalize";
import { normalizeShopperLocation } from "@/lib/shopper/location";
import { buildShippingSettingsFromLegacySeller } from "@/lib/shipping/settings";
import { findSellerOwnerByIdentifier, findSellerOwnerBySlug } from "@/lib/seller/team-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function tsToIso(v) {
  return v && typeof v?.toDate === "function" ? v.toDate().toISOString() : v ?? null;
}

function normalizeTimestamps(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const ts = doc.timestamps;
  return {
    ...doc,
    ...(ts
      ? {
          timestamps: {
            createdAt: tsToIso(ts.createdAt),
            updatedAt: tsToIso(ts.updatedAt),
          },
        }
      : {}),
  };
}

function getPublicMarketplaceSource(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const status = toStr(doc?.moderation?.status).toLowerCase();
  const liveSnapshot =
    doc?.live_snapshot && typeof doc.live_snapshot === "object"
      ? normalizeTimestamps(doc.live_snapshot)
      : null;
  if (liveSnapshot && status === "in_review") {
    return liveSnapshot;
  }
  return doc;
}

function getSellerIdentifier(data) {
  return toStr(
    data?.seller?.sellerCode ||
      data?.seller?.activeSellerCode ||
      data?.seller?.groupSellerCode ||
      data?.seller?.sellerSlug ||
      data?.product?.sellerCode ||
      data?.product?.sellerSlug ||
      data?.product?.vendorSlug,
  );
}

function applySellerDisplayData(data, sellerOwner) {
  if (!sellerOwner || !sellerOwner.data) return data;
  const seller = sellerOwner.data?.seller && typeof sellerOwner.data.seller === "object" ? sellerOwner.data.seller : {};
  const sellerCode = toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode);
  const vendorName = toStr(seller?.vendorName || seller?.groupVendorName || "");
  const vendorDescription = toStr(seller?.vendorDescription || seller?.description || "");
  const shippingSettings = buildShippingSettingsFromLegacySeller(seller);

  return {
    ...data,
    seller: {
      ...(data?.seller && typeof data.seller === "object" ? data.seller : {}),
      sellerCode: sellerCode || null,
      vendorName: vendorName || null,
      vendorDescription: vendorDescription || null,
      baseLocation: toStr(seller?.baseLocation || data?.seller?.baseLocation) || null,
      sellerSlug: toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.seller?.sellerSlug) || null,
      activeSellerSlug: toStr(seller?.activeSellerSlug || seller?.sellerSlug || data?.seller?.activeSellerSlug) || null,
      groupSellerSlug: toStr(seller?.groupSellerSlug || seller?.sellerSlug || data?.seller?.groupSellerSlug) || null,
      shippingSettings,
    },
    product: {
      ...(data?.product && typeof data.product === "object" ? data.product : {}),
      vendorName: vendorName || data?.product?.vendorName || null,
      vendorDescription: vendorDescription || data?.product?.vendorDescription || null,
      sellerCode: sellerCode || data?.product?.sellerCode || null,
      sellerSlug: toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.product?.sellerSlug) || null,
    },
  };
}

function buildShopperLocationFromSearchParams(searchParams) {
  return normalizeShopperLocation({
    countryCode: searchParams.get("shopperCountry") || searchParams.get("country") || null,
    province: searchParams.get("shopperProvince") || null,
    city: searchParams.get("shopperCity") || null,
    suburb: searchParams.get("shopperSuburb") || null,
    postalCode: searchParams.get("shopperPostalCode") || null,
    lat: searchParams.get("shopperLatitude") || null,
    lng: searchParams.get("shopperLongitude") || null,
    source: "manual",
  });
}

async function hydrateProductSellerData(db, data) {
  const sellerIdentifier = getSellerIdentifier(data);
  const sellerOwner =
    (sellerIdentifier ? await findSellerOwnerByIdentifier(db, sellerIdentifier) : null) ||
    (toStr(data?.seller?.sellerSlug || data?.product?.sellerSlug)
      ? await findSellerOwnerBySlug(db, toStr(data?.seller?.sellerSlug || data?.product?.sellerSlug))
      : null);
  return applySellerDisplayData(data, sellerOwner);
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

function matchesCategoryLike(candidate, sourceCategory, sourceSubCategory) {
  const candidateCategory = toStr(candidate?.grouping?.category);
  const candidateSubCategory = toStr(candidate?.grouping?.subCategory);
  if (sourceSubCategory && categoryMatches(candidateSubCategory, sourceSubCategory)) return true;
  if (sourceCategory && categoryMatches(candidateCategory, sourceCategory)) return true;
  return false;
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
    const shopperLocation = buildShopperLocationFromSearchParams(searchParams);
    const productId = toStr(searchParams.get("productId") || searchParams.get("product_unique_id") || searchParams.get("id"));
    if (!productId) return err(400, "Missing Product", "Provide a productId to load similar products.");

    const sourceDoc = await findProductDoc(db, productId);
    if (!sourceDoc) return err(404, "Not Found", "We could not find that product.");
    const source = getPublicMarketplaceSource(normalizeTimestamps(sourceDoc.data() || {}));
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
    let ranked = snap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        data: getPublicMarketplaceSource(normalizeTimestamps(docSnap.data() || {})),
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

    if (ranked.length === 0 && (sourceCategory || sourceSubCategory)) {
      const fallbackSnap = await db.collection("products_v2").where("placement.isActive", "==", true).limit(96).get();
      ranked = fallbackSnap.docs
        .map((docSnap) => ({
          id: docSnap.id,
          data: getPublicMarketplaceSource(normalizeTimestamps(docSnap.data() || {})),
        }))
        .filter((item) => {
          const candidateUniqueId = toStr(item?.data?.product?.unique_id || item?.id);
          if (candidateUniqueId === sourceUniqueId) return false;
          const candidateBarcode = getCanonicalOfferBarcode(item?.data);
          if (sourceBarcode && candidateBarcode && candidateBarcode === sourceBarcode) return false;
          return matchesCategoryLike(item?.data, sourceCategory, sourceSubCategory);
        })
        .map((item) => {
          let score = 0;
          if (sourceSubCategory && categoryMatches(item?.data?.grouping?.subCategory, sourceSubCategory)) score += 4;
          if (sourceCategory && categoryMatches(item?.data?.grouping?.category, sourceCategory)) score += 2;
          if (sourceBrand && toStr(item?.data?.brand?.slug || item?.data?.grouping?.brand) === sourceBrand) score += 1;
          if (item?.data?.placement?.isFeatured === true) score += 0.5;
          return { ...item, similarityScore: score };
        })
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 12);
    }

    const hydratedRanked = await Promise.all(
      ranked.map(async (item) => ({
        ...item,
        data: await hydrateProductSellerData(db, item.data),
      })),
    );

    const finalListing = await resolveShopperVisibleProducts({
      items: hydratedRanked.map((item) => ({
        id: item.id,
        data: item.data,
      })),
      shopperLocation,
      page: 1,
      pageSize: hydratedRanked.length,
    });

    return ok({ count: finalListing.items.length, items: finalListing.items });
  } catch (e) {
    console.error("similar products failed:", e);
    return err(500, "Unexpected Error", "Unable to load similar products.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
