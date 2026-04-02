import { getAdminDb } from "@/lib/firebase/admin";

export const SELLER_NOTIFICATIONS_COLLECTION = "seller_notifications_v1";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toIso(value) {
  const input = toStr(value);
  if (!input) return new Date().toISOString();
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function normalizeSellerNotification(docSnap) {
  if (!docSnap?.exists) return null;
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    sellerCode: toStr(data?.sellerCode),
    sellerSlug: toStr(data?.sellerSlug),
    type: toStr(data?.type),
    title: toStr(data?.title),
    message: toStr(data?.message),
    href: toStr(data?.href),
    read: data?.read === true,
    readAt: toStr(data?.readAt),
    createdAt: toIso(data?.createdAt),
    metadata: data?.metadata && typeof data.metadata === "object" ? data.metadata : {},
  };
}

export async function createSellerNotification({
  sellerCode = "",
  sellerSlug = "",
  type = "",
  title = "",
  message = "",
  href = "",
  metadata = {},
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  if (!code && !slug) throw new Error("A seller identifier is required.");

  const ref = db.collection(SELLER_NOTIFICATIONS_COLLECTION).doc();
  const payload = {
    sellerCode: code,
    sellerSlug: slug,
    type: toStr(type),
    title: toStr(title),
    message: toStr(message),
    href: toStr(href),
    read: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

export async function listSellerNotifications({ sellerCode = "", sellerSlug = "" } = {}) {
  const db = getAdminDb();
  if (!db) return [];

  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  let snap = null;
  if (code) {
    snap = await db.collection(SELLER_NOTIFICATIONS_COLLECTION).where("sellerCode", "==", code).get();
  } else if (slug) {
    snap = await db.collection(SELLER_NOTIFICATIONS_COLLECTION).where("sellerSlug", "==", slug).get();
  } else {
    return [];
  }

  return snap.docs
    .map((docSnap) => normalizeSellerNotification(docSnap))
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function markSellerNotificationRead({
  notificationId = "",
  sellerCode = "",
  sellerSlug = "",
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const id = toStr(notificationId);
  if (!id) throw new Error("Notification ID is required.");

  const ref = db.collection(SELLER_NOTIFICATIONS_COLLECTION).doc(id);
  const snap = await ref.get();
  const record = normalizeSellerNotification(snap);
  if (!record) throw new Error("Notification not found.");

  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  const allowed =
    (code && record.sellerCode === code) ||
    (slug && record.sellerSlug === slug);
  if (!allowed) throw new Error("You do not have access to this notification.");

  await ref.set({ read: true, readAt: new Date().toISOString() }, { merge: true });
}

export async function markAllSellerNotificationsRead({ sellerCode = "", sellerSlug = "" } = {}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const items = await listSellerNotifications({ sellerCode, sellerSlug });
  await Promise.all(
    items
      .filter((item) => !item.read)
      .map((item) =>
        db.collection(SELLER_NOTIFICATIONS_COLLECTION).doc(item.id).set(
          { read: true, readAt: new Date().toISOString() },
          { merge: true },
        ),
      ),
  );
  return items.length;
}
