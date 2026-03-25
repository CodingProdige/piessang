import { getAdminDb } from "@/lib/firebase/admin";

const DEFAULT_TTL_MINUTES = 60;

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIso(value) {
  const raw = toStr(value);
  if (!raw) return null;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function cleanupAbandonedPaymentPendingOrders({
  ttlMinutes = DEFAULT_TTL_MINUTES,
  limit = 200,
} = {}) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Admin database is not configured.");
  }

  const effectiveTtlMinutes = Math.max(5, toNum(ttlMinutes, DEFAULT_TTL_MINUTES));
  const cutoffMs = Date.now() - effectiveTtlMinutes * 60 * 1000;

  const snap = await db
    .collection("orders_v2")
    .where("order.status.order", "==", "payment_pending")
    .limit(Math.max(1, toNum(limit, 200)))
    .get();

  const deleted = [];
  const skipped = [];

  for (const docSnap of snap.docs) {
    const order = docSnap.data() || {};
    const createdAtMs =
      parseIso(order?.lifecycle?.createdAt) ??
      parseIso(order?.timestamps?.createdAt) ??
      parseIso(order?.meta?.createdAt);
    const paymentStatus = toStr(
      order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment || "",
    ).toLowerCase();

    if (!createdAtMs || createdAtMs > cutoffMs) {
      skipped.push({ orderId: docSnap.id, reason: "not_expired" });
      continue;
    }

    if (!["pending", "payment_pending", ""].includes(paymentStatus)) {
      skipped.push({ orderId: docSnap.id, reason: `payment_status_${paymentStatus || "unknown"}` });
      continue;
    }

    const createIntentKey = toStr(order?.meta?.createIntentKey);
    const merchantTransactionId = toStr(order?.order?.merchantTransactionId);

    const batch = db.batch();
    batch.delete(docSnap.ref);
    if (createIntentKey) {
      batch.delete(db.collection("idempotency_order_create_v2").doc(createIntentKey));
    }
    if (merchantTransactionId) {
      batch.delete(db.collection("peach_redirects").doc(merchantTransactionId));
    }

    await batch.commit();

    deleted.push({
      orderId: docSnap.id,
      orderNumber: toStr(order?.order?.orderNumber),
      merchantTransactionId,
      ageMinutes: Math.round((Date.now() - createdAtMs) / 60000),
    });
  }

  return {
    ttlMinutes: effectiveTtlMinutes,
    scanned: snap.size,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    deleted,
    skipped,
  };
}
