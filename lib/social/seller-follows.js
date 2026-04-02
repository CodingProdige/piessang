import { getAdminDb } from "@/lib/firebase/admin";

export const SELLER_FOLLOWERS_COLLECTION = "seller_followers_v1";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toKey(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toIso(value) {
  const input = toStr(value);
  if (!input) return new Date().toISOString();
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function buildSellerFollowDocId(userId, sellerCode, sellerSlug) {
  const uid = toKey(userId);
  const sellerKey = toKey(sellerCode) || toKey(sellerSlug) || "seller";
  return `${uid}__${sellerKey}`;
}

export function normalizeSellerFollow(docSnap) {
  if (!docSnap?.exists) return null;
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    userId: toStr(data?.userId),
    sellerCode: toStr(data?.sellerCode),
    sellerSlug: toStr(data?.sellerSlug),
    vendorName: toStr(data?.vendorName),
    followerName: toStr(data?.followerName),
    followerEmail: toStr(data?.followerEmail),
    followedAt: toIso(data?.followedAt),
  };
}

export async function getSellerFollowerCount({ sellerCode = "", sellerSlug = "" } = {}) {
  const db = getAdminDb();
  if (!db) return 0;

  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  let snap = null;

  if (code) {
    snap = await db.collection(SELLER_FOLLOWERS_COLLECTION).where("sellerCode", "==", code).get();
  } else if (slug) {
    snap = await db.collection(SELLER_FOLLOWERS_COLLECTION).where("sellerSlug", "==", slug).get();
  }

  return snap?.size || 0;
}

export async function getSellerFollowState(userId, { sellerCode = "", sellerSlug = "" } = {}) {
  const db = getAdminDb();
  if (!db || !toStr(userId)) return { following: false, followerCount: 0, follow: null };

  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  const [count, userSnap] = await Promise.all([
    getSellerFollowerCount({ sellerCode: code, sellerSlug: slug }),
    code
      ? db
          .collection(SELLER_FOLLOWERS_COLLECTION)
          .where("userId", "==", toStr(userId))
          .where("sellerCode", "==", code)
          .limit(1)
          .get()
      : db
          .collection(SELLER_FOLLOWERS_COLLECTION)
          .where("userId", "==", toStr(userId))
          .where("sellerSlug", "==", slug)
          .limit(1)
          .get(),
  ]);

  const docSnap = userSnap?.docs?.[0] || null;
  return {
    following: Boolean(docSnap),
    followerCount: count,
    follow: docSnap ? normalizeSellerFollow(docSnap) : null,
  };
}

export async function followSeller({
  userId,
  sellerCode = "",
  sellerSlug = "",
  vendorName = "",
  followerName = "",
  followerEmail = "",
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const uid = toStr(userId);
  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  if (!uid || (!code && !slug)) throw new Error("A user and seller are required.");

  const docId = buildSellerFollowDocId(uid, code, slug);
  const ref = db.collection(SELLER_FOLLOWERS_COLLECTION).doc(docId);
  const payload = {
    userId: uid,
    sellerCode: code,
    sellerSlug: slug,
    vendorName: toStr(vendorName),
    followerName: toStr(followerName),
    followerEmail: toStr(followerEmail).toLowerCase(),
    followedAt: new Date().toISOString(),
  };
  await ref.set(payload, { merge: true });
  return payload;
}

export async function unfollowSeller({ userId, sellerCode = "", sellerSlug = "" }) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const uid = toStr(userId);
  const code = toStr(sellerCode);
  const slug = toStr(sellerSlug);
  if (!uid || (!code && !slug)) throw new Error("A user and seller are required.");

  if (code) {
    const snap = await db
      .collection(SELLER_FOLLOWERS_COLLECTION)
      .where("userId", "==", uid)
      .where("sellerCode", "==", code)
      .get();
    await Promise.all(snap.docs.map((docSnap) => docSnap.ref.delete()));
    return;
  }

  const snap = await db
    .collection(SELLER_FOLLOWERS_COLLECTION)
    .where("userId", "==", uid)
    .where("sellerSlug", "==", slug)
    .get();
  await Promise.all(snap.docs.map((docSnap) => docSnap.ref.delete()));
}

export async function listFollowedSellers(userId) {
  const db = getAdminDb();
  if (!db || !toStr(userId)) return [];
  const snap = await db
    .collection(SELLER_FOLLOWERS_COLLECTION)
    .where("userId", "==", toStr(userId))
    .get();

  return snap.docs
    .map((docSnap) => normalizeSellerFollow(docSnap))
    .filter(Boolean)
    .sort((a, b) => (a.followedAt < b.followedAt ? 1 : -1));
}
