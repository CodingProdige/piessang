import { getAdminDb } from "@/lib/firebase/admin";
import { SELLER_FOLLOWERS_COLLECTION } from "@/lib/social/seller-follows";

export const CUSTOMER_NOTIFICATIONS_COLLECTION = "customer_notifications_v1";
export const CUSTOMER_NOTIFICATION_DEDUPE_COLLECTION = "customer_notification_dedupe_v1";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toIso(value) {
  const input = toStr(value);
  if (!input) return new Date().toISOString();
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function slugify(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCustomerNotification(docSnap) {
  if (!docSnap?.exists) return null;
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    userId: toStr(data?.userId),
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

export function isProductPublished(product) {
  const moderationStatus = toStr(product?.moderation?.status).toLowerCase();
  return moderationStatus === "published" && product?.placement?.isActive === true;
}

export function isVariantOnSale(variant) {
  return Boolean(variant?.sale?.is_on_sale && !variant?.sale?.disabled_by_admin);
}

export function getVariantActivePriceIncl(variant) {
  const salePrice = Number(variant?.sale?.sale_price_incl);
  if (isVariantOnSale(variant) && Number.isFinite(salePrice) && salePrice > 0) return salePrice;
  const pricingSale = Number(variant?.pricing?.sale_price_incl);
  if (Number.isFinite(pricingSale) && pricingSale > 0) return pricingSale;
  const pricingSell = Number(variant?.pricing?.selling_price_incl);
  if (Number.isFinite(pricingSell) && pricingSell > 0) return pricingSell;
  return 0;
}

export function getVariantStockState(variant) {
  const placement = variant?.placement && typeof variant.placement === "object" ? variant.placement : {};
  if (placement?.continue_selling_out_of_stock === true) return "in_stock";
  const rows = Array.isArray(variant?.inventory) ? variant.inventory : [];
  const total = rows.reduce((sum, row) => {
    const hidden = row?.supplier_out_of_stock === true || row?.in_stock === false;
    if (hidden) return sum;
    return sum + Math.max(0, Number(row?.in_stock_qty ?? row?.unit_stock_qty ?? row?.quantity ?? row?.qty ?? 0) || 0);
  }, 0);
  return total > 0 ? "in_stock" : "out_of_stock";
}

export async function listFollowersForSeller({ sellerCode = "", sellerSlug = "" } = {}) {
  const db = getAdminDb();
  if (!db) return [];
  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  let snap = null;
  if (code) {
    snap = await db.collection(SELLER_FOLLOWERS_COLLECTION).where("sellerCode", "==", code).get();
  } else if (slug) {
    snap = await db.collection(SELLER_FOLLOWERS_COLLECTION).where("sellerSlug", "==", slug).get();
  } else {
    return [];
  }
  const items = snap.docs.map((docSnap) => docSnap.data() || {}).filter((item) => toStr(item?.userId));
  const enriched = await Promise.all(
    items.map(async (item) => {
      const userId = toStr(item?.userId);
      if (!userId) return null;
      try {
        const userSnap = await db.collection("users").doc(userId).get();
        const user = userSnap.exists ? userSnap.data() || {} : {};
        return {
          ...item,
          userId,
          followerEmail: toStr(item?.followerEmail || user?.email || user?.account?.email),
          followerPhone: toStr(user?.account?.phoneNumber || user?.phoneNumber || user?.phone),
        };
      } catch {
        return {
          ...item,
          userId,
          followerEmail: toStr(item?.followerEmail),
          followerPhone: "",
        };
      }
    }),
  );
  return enriched.filter(Boolean);
}

export async function listUsersWhoFavoritedProduct(productId) {
  const db = getAdminDb();
  if (!db || !toStr(productId)) return [];
  const snap = await db.collection("users").get();
  const needle = toStr(productId);
  const matches = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const preferences = data?.preferences && typeof data.preferences === "object" ? data.preferences : {};
    const favorites = Array.isArray(preferences?.favoriteProducts) ? preferences.favoriteProducts : [];
    const normalized = favorites
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "object") return toStr(item?.unique_id || item?.uniqueId || item?.product_unique_id);
        return "";
      })
      .filter(Boolean);
    if (normalized.includes(needle)) {
      matches.push({
        userId: docSnap.id,
        email: toStr(data?.email || data?.account?.email),
        phone: toStr(data?.account?.phoneNumber || data?.phoneNumber || data?.phone),
        displayName: toStr(data?.account?.accountName || data?.displayName || data?.name),
      });
    }
  }
  return matches;
}

export async function createCustomerNotification({
  userId,
  type,
  title,
  message,
  href = "",
  metadata = {},
  dedupeKey = "",
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const uid = toStr(userId);
  if (!uid) throw new Error("A user is required.");

  const dedupeId = slugify(dedupeKey);
  if (dedupeId) {
    const dedupeRef = db.collection(CUSTOMER_NOTIFICATION_DEDUPE_COLLECTION).doc(dedupeId);
    const dedupeSnap = await dedupeRef.get();
    if (dedupeSnap.exists) return { created: false, duplicate: true };
    await dedupeRef.set({
      userId: uid,
      dedupeKey: toStr(dedupeKey),
      createdAt: new Date().toISOString(),
      type: toStr(type),
    });
  }

  const ref = db.collection(CUSTOMER_NOTIFICATIONS_COLLECTION).doc();
  await ref.set({
    userId: uid,
    type: toStr(type),
    title: toStr(title),
    message: toStr(message),
    href: toStr(href),
    read: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  });
  return { created: true, id: ref.id };
}

export async function listCustomerNotifications(userId) {
  const db = getAdminDb();
  if (!db || !toStr(userId)) return [];
  const snap = await db.collection(CUSTOMER_NOTIFICATIONS_COLLECTION).where("userId", "==", toStr(userId)).get();
  return snap.docs
    .map((docSnap) => normalizeCustomerNotification(docSnap))
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function markCustomerNotificationRead(notificationId, userId) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");
  const ref = db.collection(CUSTOMER_NOTIFICATIONS_COLLECTION).doc(toStr(notificationId));
  const snap = await ref.get();
  const current = normalizeCustomerNotification(snap);
  if (!current || current.userId !== toStr(userId)) throw new Error("Notification not found.");
  await ref.set({ read: true, readAt: new Date().toISOString() }, { merge: true });
}

export async function markAllCustomerNotificationsRead(userId) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");
  const items = await listCustomerNotifications(userId);
  await Promise.all(
    items
      .filter((item) => !item.read)
      .map((item) =>
        db.collection(CUSTOMER_NOTIFICATIONS_COLLECTION).doc(item.id).set(
          { read: true, readAt: new Date().toISOString() },
          { merge: true },
        ),
      ),
  );
}
