import { FieldValue } from "firebase-admin/firestore";
import { normalizeSellerDeliveryProfile, sellerDeliverySettingsReady } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";
import { productHasListableAvailability } from "@/lib/catalogue/availability";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function tsToIso(value) {
  return value && typeof value?.toDate === "function" ? value.toDate().toISOString() : value ?? null;
}

function normalizeTimestamps(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const ts = doc.timestamps;
  return {
    ...doc,
    ...(ts ? { timestamps: { createdAt: tsToIso(ts.createdAt), updatedAt: tsToIso(ts.updatedAt) } } : {}),
  };
}

function getPublicMarketplaceSource(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const status = toStr(doc?.moderation?.status).toLowerCase();
  const liveSnapshot =
    doc?.live_snapshot && typeof doc.live_snapshot === "object"
      ? normalizeTimestamps(doc.live_snapshot)
      : null;
  if (liveSnapshot && ["in_review", "draft", "rejected"].includes(status)) {
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

function productMissingSellerDeliverySettings(data, sellerOwner) {
  const fulfillmentMode = String(data?.fulfillment?.mode ?? "seller").trim().toLowerCase();
  if (fulfillmentMode !== "seller") return false;
  const seller = sellerOwner?.data?.seller && typeof sellerOwner.data.seller === "object" ? sellerOwner.data.seller : {};
  return !sellerDeliverySettingsReady(
    normalizeSellerDeliveryProfile(seller?.deliveryProfile && typeof seller.deliveryProfile === "object" ? seller.deliveryProfile : {}),
  );
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function rebuildCatalogueMenuCounts(db) {
  const [categorySnap, subCategorySnap, productSnap] = await Promise.all([
    db.collection("categories").get(),
    db.collection("sub_categories").get(),
    db.collection("products_v2").get(),
  ]);

  const categoryDocs = categorySnap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    data: doc.data() || {},
    slug: toStr(doc.data()?.category?.slug),
  }));
  const subCategoryDocs = subCategorySnap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    data: doc.data() || {},
    slug: toStr(doc.data()?.subCategory?.slug),
    category: toStr(doc.data()?.grouping?.category),
  }));

  const categoryCounts = {};
  const subCategoryCounts = {};
  const sellerIdentifierSet = new Set();
  const products = productSnap.docs.map((doc) => {
    const data = getPublicMarketplaceSource(normalizeTimestamps(doc.data() || {}));
    const sellerIdentifier = getSellerIdentifier(data);
    if (sellerIdentifier) sellerIdentifierSet.add(sellerIdentifier);
    return data;
  });

  const sellerMetaMap = new Map();
  await Promise.all(
    Array.from(sellerIdentifierSet).map(async (sellerIdentifier) => {
      try {
        sellerMetaMap.set(sellerIdentifier, await findSellerOwnerByIdentifier(sellerIdentifier));
      } catch {
        sellerMetaMap.set(sellerIdentifier, null);
      }
    }),
  );

  for (const data of products) {
    const categorySlug = toStr(data?.grouping?.category);
    const subCategorySlug = toStr(data?.grouping?.subCategory);
    if (!categorySlug) continue;

    const sellerIdentifier = getSellerIdentifier(data);
    const sellerOwner = sellerIdentifier ? sellerMetaMap.get(sellerIdentifier) : null;
    if (sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) continue;
    if (productMissingSellerDeliverySettings(data, sellerOwner)) continue;
    if (!productHasListableAvailability(data)) continue;

    categoryCounts[categorySlug] = (categoryCounts[categorySlug] ?? 0) + 1;
    if (subCategorySlug) {
      const key = `${categorySlug}::${subCategorySlug}`;
      subCategoryCounts[key] = (subCategoryCounts[key] ?? 0) + 1;
    }
  }

  let updatedCategories = 0;
  for (const batchItems of chunk(categoryDocs, 450)) {
    const batch = db.batch();
    for (const item of batchItems) {
      if (!item.slug) continue;
      const productCount = categoryCounts[item.slug] ?? 0;
      batch.update(item.ref, {
        productCount,
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
      updatedCategories += 1;
    }
    await batch.commit();
  }

  let updatedSubCategories = 0;
  for (const batchItems of chunk(subCategoryDocs, 450)) {
    const batch = db.batch();
    for (const item of batchItems) {
      if (!item.slug || !item.category) continue;
      const productCount = subCategoryCounts[`${item.category}::${item.slug}`] ?? 0;
      batch.update(item.ref, {
        productCount,
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
      updatedSubCategories += 1;
    }
    await batch.commit();
  }

  return {
    updatedCategories,
    updatedSubCategories,
    categoryCounts,
    subCategoryCounts,
  };
}
