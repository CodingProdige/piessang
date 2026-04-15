import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_MARKETPLACE_FEE_CONFIG } from "@/lib/marketplace/fees";

export const CATEGORY_SUCCESS_FEES_COLLECTION = "category_success_fees_v1";
export const FULFILMENT_FEES_COLLECTION = "fulfilment_fees_v1";
export const LEGACY_HANDLING_FEES_COLLECTION = "handling_fees_v1";
export const STORAGE_FEES_COLLECTION = "storage_fees_v1";
export const LEGACY_FEE_SETTINGS_COLLECTION = "fee_settings_v1";
export const FULFILMENT_FEES_ID = "active";
export const STORAGE_SETTINGS_ID = "active";

function compactObject<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function serializeFeeRule(rule: any) {
  if (!rule || typeof rule !== "object") return null;

  if (rule.kind === "fixed") {
    return compactObject({
      kind: "fixed",
      percent: Number(rule.percent || 0),
      label: rule.label == null ? undefined : String(rule.label),
      note: rule.note == null ? undefined : String(rule.note),
    });
  }

  if (rule.kind === "range") {
    return compactObject({
      kind: "fixed",
      percent: Number(rule.estimatePercent ?? rule.minPercent ?? rule.maxPercent ?? 0),
      label: rule.label == null ? undefined : String(rule.label),
      note: rule.note == null ? undefined : String(rule.note),
    });
  }

  if (rule.kind === "tiers" && Array.isArray(rule.tiers)) {
    const firstTier = rule.tiers.find((tier: any) => Number(tier?.percent || 0) > 0) || null;
    return compactObject({
      kind: "fixed",
      percent: Number(firstTier?.percent || 0),
      label: rule.label == null ? undefined : String(rule.label),
      note: rule.note == null ? undefined : String(rule.note),
    });
  }

  return null;
}

function normalizeTimestamps(value: any) {
  if (!value || typeof value !== "object") return value;
  const out = { ...value };
  const ts = out.timestamps;
  if (ts && typeof ts === "object") {
    const toIso = (v: any) => (v && typeof v?.toDate === "function" ? v.toDate().toISOString() : v ?? null);
    out.timestamps = {
      createdAt: toIso(ts.createdAt),
      updatedAt: toIso(ts.updatedAt),
    };
  }
  return out;
}

function defaultFulfilmentRows() {
  return (DEFAULT_MARKETPLACE_FEE_CONFIG.fulfilment.rows || []).map((row) => ({
    id: String(row.id || row.label).trim().toLowerCase().replace(/\s+/g, "-"),
    label: row.label,
    minVolumeCm3: row.minVolumeCm3 ?? null,
    maxVolumeCm3: row.maxVolumeCm3 ?? null,
    prices: {
      light: Number(row.prices?.light || 0),
      heavy: Number(row.prices?.heavy || 0),
      heavyPlus: Number(row.prices?.heavyPlus || 0),
      veryHeavy: Number(row.prices?.veryHeavy || 0),
    },
    isActive: true,
  }));
}

async function loadCatalogueTaxonomy(db: any) {
  const [categorySnap, subCategorySnap] = await Promise.all([
    db.collection("categories").get(),
    db.collection("sub_categories").get(),
  ]);

  const categories = categorySnap.docs
    .map((doc: any) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((item: any) => item?.placement?.isActive !== false)
    .map((item: any) => ({
      slug: String(item?.category?.slug || "").trim().toLowerCase(),
      title: String(item?.category?.title || "").trim(),
      position: Number(item?.placement?.position ?? Number.POSITIVE_INFINITY),
    }))
    .filter((item: any) => item.slug && item.title)
    .sort((left: any, right: any) => {
      if (left.position !== right.position) return left.position - right.position;
      return left.title.localeCompare(right.title);
    });

  const subCategoriesByCategory = new Map<string, Array<{ taxonomyDocId: string; slug: string; title: string; position: number; isActive: boolean }>>();
  for (const doc of subCategorySnap.docs) {
    const item = doc.data() || {};
    const categorySlug = String(item?.grouping?.category || "").trim().toLowerCase();
    const slug = String(item?.subCategory?.slug || "").trim().toLowerCase();
    const title = String(item?.subCategory?.title || "").trim();
    if (!categorySlug || !slug || !title) continue;
    const current = subCategoriesByCategory.get(categorySlug) || [];
    current.push({
      taxonomyDocId: String(doc.id || ""),
      slug,
      title,
      position: Number(item?.placement?.position ?? Number.POSITIVE_INFINITY),
      isActive: item?.placement?.isActive !== false,
    });
    subCategoriesByCategory.set(categorySlug, current);
  }

  for (const [categorySlug, items] of subCategoriesByCategory.entries()) {
    items.sort((left, right) => {
      if (left.position !== right.position) return left.position - right.position;
      return left.title.localeCompare(right.title);
    });
    const deduped: typeof items = [];
    const seen = new Set<string>();
    for (const item of items) {
      const key = item.slug;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    subCategoriesByCategory.set(categorySlug, deduped);
  }

  return {
    categories,
    subCategoriesByCategory,
  };
}

export async function ensureCatalogueTaxonomySeed() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const [categorySnap, subCategorySnap] = await Promise.all([
    db.collection("categories").get(),
    db.collection("sub_categories").get(),
  ]);

  const existingCategoryIds = new Set(categorySnap.docs.map((doc) => doc.id));
  const existingSubCategoryIds = new Set(subCategorySnap.docs.map((doc) => doc.id));

  const categoryBatch = db.batch();
  let hasCategoryWrites = false;
  for (const [categoryIndex, category] of (DEFAULT_MARKETPLACE_FEE_CONFIG.categories || []).entries()) {
    if (existingCategoryIds.has(category.slug)) continue;
    const categoryRef = db.collection("categories").doc(category.slug);
    categoryBatch.set(categoryRef, {
      docId: category.slug,
      category: {
        slug: category.slug,
        title: category.title,
        description: null,
        keywords: [],
      },
      placement: {
        position: categoryIndex + 1,
        isActive: true,
        isFeatured: false,
      },
      media: {
        color: null,
        images: [],
        video: null,
        icon: null,
      },
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    hasCategoryWrites = true;
  }
  if (hasCategoryWrites) {
    await categoryBatch.commit();
  }

  const subCategoryBatch = db.batch();
  let hasSubCategoryWrites = false;
  for (const category of DEFAULT_MARKETPLACE_FEE_CONFIG.categories || []) {
    for (const [subCategoryIndex, subCategory] of (category.subCategories || []).entries()) {
      const subCategoryId = `${category.slug}__${subCategory.slug}`;
      if (existingSubCategoryIds.has(subCategoryId)) continue;
      const subCategoryRef = db.collection("sub_categories").doc(subCategoryId);
      subCategoryBatch.set(subCategoryRef, {
        docId: subCategoryId,
        grouping: {
          category: category.slug,
        },
        subCategory: {
          slug: subCategory.slug,
          kind: "consumable",
          title: subCategory.title,
          description: null,
          keywords: [],
        },
        placement: {
          position: subCategoryIndex + 1,
          isActive: true,
          isFeatured: false,
        },
        media: {
          color: null,
          images: [],
          video: null,
          icon: null,
        },
        timestamps: {
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      hasSubCategoryWrites = true;
    }
  }
  if (hasSubCategoryWrites) {
    await subCategoryBatch.commit();
  }
}

async function deleteCollectionDocs(collectionName: string, keepIds: string[] = []) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const snap = await db.collection(collectionName).get();
  const docs = snap.docs.filter((doc) => !keepIds.includes(doc.id));
  if (!docs.length) return;
  const batch = db.batch();
  for (const doc of docs) batch.delete(doc.ref);
  await batch.commit();
}

async function ensureSeedData() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  await ensureCatalogueTaxonomySeed();

  const [categorySnap, fulfilmentSnap, storageSnap] = await Promise.all([
    db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).get(),
    db.collection(FULFILMENT_FEES_COLLECTION).doc(FULFILMENT_FEES_ID).get(),
    db.collection(STORAGE_FEES_COLLECTION).get(),
  ]);

  const existingFeeIds = new Set(categorySnap.docs.map((doc) => doc.id));
  const feeWrites = DEFAULT_MARKETPLACE_FEE_CONFIG.categories.flatMap((category) => {
    const writes = [];
    const categoryId = `${category.slug}__root`;
    if (!existingFeeIds.has(categoryId)) {
      writes.push(
        db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).doc(categoryId).set({
          id: categoryId,
          categorySlug: category.slug,
          subCategorySlug: null,
          title: category.title,
          rule: serializeFeeRule(category.feeRule),
          isActive: true,
          timestamps: {
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        }),
      );
    }
    for (const subCategory of category.subCategories || []) {
      const subId = `${category.slug}__${subCategory.slug}`;
      if (existingFeeIds.has(subId)) continue;
      writes.push(
        db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).doc(subId).set({
          id: subId,
          categorySlug: category.slug,
          subCategorySlug: subCategory.slug,
          title: subCategory.title,
          rule: serializeFeeRule(subCategory.feeRule || category.feeRule),
          isActive: true,
          timestamps: {
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        }),
      );
    }
    return writes;
  });
  if (feeWrites.length) {
    await Promise.all(feeWrites);
  }

  if (!fulfilmentSnap.exists) {
    await db.collection(FULFILMENT_FEES_COLLECTION).doc(FULFILMENT_FEES_ID).set({
      id: FULFILMENT_FEES_ID,
      rows: defaultFulfilmentRows(),
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  await deleteCollectionDocs(FULFILMENT_FEES_COLLECTION, [FULFILMENT_FEES_ID]);
  await deleteCollectionDocs(LEGACY_HANDLING_FEES_COLLECTION);
  await deleteCollectionDocs(LEGACY_FEE_SETTINGS_COLLECTION);

  if (storageSnap.empty) {
    await Promise.all(
      DEFAULT_MARKETPLACE_FEE_CONFIG.storage.bands.map((band) =>
        db.collection(STORAGE_FEES_COLLECTION).doc(String(band.label).toLowerCase().replace(/\s+/g, "-")).set({
          id: String(band.label).toLowerCase().replace(/\s+/g, "-"),
          sizeBand: band.label,
          minVolumeCm3: band.minVolumeCm3 ?? null,
          maxVolumeCm3: band.maxVolumeCm3 ?? null,
          overstockedFeeIncl: band.overstockedFeeIncl,
          isActive: true,
          timestamps: {
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        }),
      ),
    );
  }

  const storageSettingsSnap = storageSnap.docs.find((doc) => doc.id === STORAGE_SETTINGS_ID) || null;
  if (!storageSettingsSnap) {
    await db.collection(STORAGE_FEES_COLLECTION).doc(STORAGE_SETTINGS_ID).set({
      id: STORAGE_SETTINGS_ID,
      version: DEFAULT_MARKETPLACE_FEE_CONFIG.version,
      currency: DEFAULT_MARKETPLACE_FEE_CONFIG.currency,
      stockCoverThresholdDays: DEFAULT_MARKETPLACE_FEE_CONFIG.stockCoverThresholdDays,
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }
}

export async function loadMarketplaceFeeConfig() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  await ensureSeedData();

  const [categorySnap, fulfilmentSnap, storageSnap, taxonomy] = await Promise.all([
    db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).get(),
    db.collection(FULFILMENT_FEES_COLLECTION).doc(FULFILMENT_FEES_ID).get(),
    db.collection(STORAGE_FEES_COLLECTION).get(),
    loadCatalogueTaxonomy(db),
  ]);

  const storageSettings = storageSnap.docs.find((item) => item.id === STORAGE_SETTINGS_ID)?.data() || {};
  const categoryDocs = categorySnap.docs.map((item) => normalizeTimestamps({ id: item.id, ...(item.data() || {}) }));
  const canonicalCategoryMap = new Map(
    taxonomy.categories.map((item: any) => [item.slug, item]),
  );
  const categoryRuleMap = new Map<string, any>();
  const subCategoryRuleMap = new Map<string, any>();
  const staleCategoryDocIds: string[] = [];

  for (const item of categoryDocs) {
    const categorySlug = String(item?.categorySlug || "").trim().toLowerCase();
    const subCategorySlug = String(item?.subCategorySlug || "").trim().toLowerCase();
    if (!categorySlug || item?.isActive === false) continue;

    const canonicalCategory = canonicalCategoryMap.get(categorySlug);
    if (!canonicalCategory) {
      staleCategoryDocIds.push(String(item.id || ""));
      continue;
    }

    if (!subCategorySlug) {
      categoryRuleMap.set(categorySlug, item?.rule || null);
      continue;
    }

    const allowedSubs = taxonomy.subCategoriesByCategory.get(categorySlug) || [];
    if (!allowedSubs.some((sub) => sub.slug === subCategorySlug)) {
      staleCategoryDocIds.push(String(item.id || ""));
      continue;
    }

    subCategoryRuleMap.set(`${categorySlug}::${subCategorySlug}`, item?.rule || null);
  }

  if (staleCategoryDocIds.length) {
    const batch = db.batch();
    for (const docId of staleCategoryDocIds) {
      if (!docId) continue;
      batch.delete(db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).doc(docId));
    }
    await batch.commit();
  }

  const categories = taxonomy.categories.map((category: any) => ({
    slug: category.slug,
    title: category.title,
    feeRule:
      categoryRuleMap.get(category.slug) ||
      DEFAULT_MARKETPLACE_FEE_CONFIG.categories.find((item) => item.slug === category.slug)?.feeRule ||
      null,
    subCategories: (taxonomy.subCategoriesByCategory.get(category.slug) || []).map((subCategory) => ({
      slug: subCategory.slug,
      taxonomyDocId: subCategory.taxonomyDocId,
      title: subCategory.title,
      feeRule:
        subCategoryRuleMap.get(`${category.slug}::${subCategory.slug}`) ||
        DEFAULT_MARKETPLACE_FEE_CONFIG.categories
          .find((item) => item.slug === category.slug)
          ?.subCategories?.find((item) => item.slug === subCategory.slug)?.feeRule ||
        categoryRuleMap.get(category.slug) ||
        null,
      isActive: categoryDocs.find((item: any) => item?.categorySlug === category.slug && item?.subCategorySlug === subCategory.slug)?.isActive !== false,
    })),
  }));

  const fulfilmentDoc = normalizeTimestamps({ id: fulfilmentSnap.id, ...(fulfilmentSnap.data() || {}) });
  const fulfilmentRows = Array.isArray(fulfilmentDoc?.rows)
    ? fulfilmentDoc.rows
        .filter((item: any) => item?.isActive !== false)
        .map((item: any) => ({
          id: item.id || String(item.label || "").trim().toLowerCase().replace(/\s+/g, "-"),
          label: String(item.label || ""),
          minVolumeCm3: item.minVolumeCm3 == null ? undefined : Number(item.minVolumeCm3),
          maxVolumeCm3: item.maxVolumeCm3 == null ? undefined : Number(item.maxVolumeCm3),
          prices: {
            light: Number(item?.prices?.light || 0),
            heavy: Number(item?.prices?.heavy || 0),
            heavyPlus: Number(item?.prices?.heavyPlus || 0),
            veryHeavy: Number(item?.prices?.veryHeavy || 0),
          },
          timestamps: fulfilmentDoc?.timestamps || null,
        }))
    : defaultFulfilmentRows();
  const storageBands = storageSnap.docs
    .map((item) => normalizeTimestamps({ id: item.id, ...(item.data() || {}) }))
    .filter((item) => item?.id !== STORAGE_SETTINGS_ID)
    .filter((item) => item?.isActive !== false)
    .map((item) => ({
      id: item.id,
      label: item.sizeBand,
      minVolumeCm3: item.minVolumeCm3 == null ? undefined : Number(item.minVolumeCm3),
      maxVolumeCm3: item.maxVolumeCm3 == null ? undefined : Number(item.maxVolumeCm3),
      overstockedFeeIncl: Number(item.overstockedFeeIncl || 0),
      timestamps: item.timestamps || null,
    }));

  return {
    id: STORAGE_SETTINGS_ID,
    version: String(storageSettings?.version || DEFAULT_MARKETPLACE_FEE_CONFIG.version),
    currency: String(storageSettings?.currency || DEFAULT_MARKETPLACE_FEE_CONFIG.currency),
    handlingFeeIncl: Number(DEFAULT_MARKETPLACE_FEE_CONFIG.handlingFeeIncl),
    stockCoverThresholdDays: Number(storageSettings?.stockCoverThresholdDays || DEFAULT_MARKETPLACE_FEE_CONFIG.stockCoverThresholdDays),
    categories,
    fulfilment: {
      handlingFeeIncl: DEFAULT_MARKETPLACE_FEE_CONFIG.fulfilment.handlingFeeIncl,
      rows: fulfilmentRows,
    },
    storage: {
      thresholdDays: Number(storageSettings?.stockCoverThresholdDays || DEFAULT_MARKETPLACE_FEE_CONFIG.storage.thresholdDays),
      bands: storageBands.length ? storageBands : DEFAULT_MARKETPLACE_FEE_CONFIG.storage.bands,
    },
  };
}
