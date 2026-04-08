import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

const QUEUE_COLLECTION = "google_sync_queue";
const PRODUCTS_COLLECTION = "products_v2";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeReason(value) {
  const reason = toStr(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, "_");
  return reason || "product_changed";
}

export async function enqueueGoogleSyncProducts({
  productIds = [],
  reason = "product_changed",
  metadata = {},
} = {}) {
  const db = getAdminDb();
  if (!db) return { queued: 0 };

  const uniqueProductIds = Array.from(
    new Set(
      toArray(productIds)
        .map((value) => toStr(value))
        .filter(Boolean),
    ),
  );
  if (!uniqueProductIds.length) return { queued: 0 };

  const batch = db.batch();
  const now = new Date().toISOString();
  const normalizedReason = normalizeReason(reason);

  for (const productId of uniqueProductIds) {
    const ref = db.collection(QUEUE_COLLECTION).doc(productId);
    batch.set(
      ref,
      {
        productId,
        status: "pending",
        reason: normalizedReason,
        reasons: FieldValue.arrayUnion(normalizedReason),
        metadata: metadata && typeof metadata === "object" ? metadata : {},
        attempts: 0,
        lock: {
          claimedAt: null,
          worker: null,
        },
        timestamps: {
          queuedAt: now,
          updatedAt: now,
          completedAt: null,
          failedAt: null,
        },
      },
      { merge: true },
    );
  }

  await batch.commit();
  return { queued: uniqueProductIds.length };
}

export async function enqueueGoogleSyncForSeller({
  sellerCode = "",
  sellerSlug = "",
  reason = "seller_settings_changed",
} = {}) {
  const db = getAdminDb();
  if (!db) return { queued: 0 };

  const codeNeedle = toStr(sellerCode).toUpperCase();
  const slugNeedle = toStr(sellerSlug);
  if (!codeNeedle && !slugNeedle) return { queued: 0 };

  const snap = await db.collection(PRODUCTS_COLLECTION).get();
  const productIds = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const productId = toStr(data?.product?.unique_id || doc.id);
    const rowSellerCode = toStr(data?.product?.sellerCode || data?.seller?.sellerCode).toUpperCase();
    const rowSellerSlug = toStr(data?.product?.sellerSlug || data?.seller?.sellerSlug);
    if ((codeNeedle && rowSellerCode === codeNeedle) || (slugNeedle && rowSellerSlug === slugNeedle)) {
      productIds.push(productId);
    }
  }

  return enqueueGoogleSyncProducts({
    productIds,
    reason,
    metadata: {
      sellerCode: codeNeedle || null,
      sellerSlug: slugNeedle || null,
    },
  });
}

export async function claimPendingGoogleSyncJobs({ limit = 100, worker = "google-merchant-cron" } = {}) {
  const db = getAdminDb();
  if (!db) return [];

  const snap = await db
    .collection(QUEUE_COLLECTION)
    .where("status", "==", "pending")
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)))
    .get();

  if (snap.empty) return [];

  const now = new Date().toISOString();
  const jobs = [];
  const batch = db.batch();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    jobs.push({
      id: doc.id,
      productId: toStr(data?.productId || doc.id),
      ...data,
    });
    batch.set(
      doc.ref,
      {
        status: "processing",
        attempts: Number(data?.attempts || 0) + 1,
        lock: {
          claimedAt: now,
          worker,
        },
        timestamps: {
          ...(data?.timestamps || {}),
          updatedAt: now,
        },
      },
      { merge: true },
    );
  }

  await batch.commit();
  return jobs;
}

export async function completeGoogleSyncJobs(productIds = []) {
  const db = getAdminDb();
  if (!db) return { completed: 0 };

  const ids = Array.from(new Set(toArray(productIds).map((value) => toStr(value)).filter(Boolean)));
  if (!ids.length) return { completed: 0 };

  const now = new Date().toISOString();
  const batch = db.batch();
  for (const id of ids) {
    batch.set(
      db.collection(QUEUE_COLLECTION).doc(id),
      {
        status: "done",
        lock: {
          claimedAt: null,
          worker: null,
        },
        timestamps: {
          updatedAt: now,
          completedAt: now,
        },
      },
      { merge: true },
    );
  }
  await batch.commit();
  return { completed: ids.length };
}

export async function failGoogleSyncJobs(productIds = [], errorMessage = "") {
  const db = getAdminDb();
  if (!db) return { failed: 0 };

  const ids = Array.from(new Set(toArray(productIds).map((value) => toStr(value)).filter(Boolean)));
  if (!ids.length) return { failed: 0 };

  const now = new Date().toISOString();
  const batch = db.batch();
  for (const id of ids) {
    batch.set(
      db.collection(QUEUE_COLLECTION).doc(id),
      {
        status: "pending",
        lastError: toStr(errorMessage).slice(0, 1000),
        lock: {
          claimedAt: null,
          worker: null,
        },
        timestamps: {
          updatedAt: now,
          failedAt: now,
        },
      },
      { merge: true },
    );
  }
  await batch.commit();
  return { failed: ids.length };
}
