import { getAdminDb } from "@/lib/firebase/admin";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

export function sanitizeSellerRatingComment(comment = "") {
  const PROFANE_WORDS = [
    "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "cunt", "slut", "cock", "faggot",
    "nigger", "nigga", "damn", "crap", "whore",
  ];
  let clean = String(comment);
  for (const word of PROFANE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    clean = clean.replace(regex, "*".repeat(word.length));
  }
  return clean.trim();
}

export function normalizeSellerRatings(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const count = safeEntries.length;
  const average = count
    ? Number((safeEntries.reduce((sum, entry) => sum + Number(entry?.stars || 0), 0) / count).toFixed(2))
    : 0;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const entry of safeEntries) {
    const stars = Math.max(1, Math.min(5, Number(entry?.stars || 0)));
    counts[stars] += 1;
  }
  return {
    average,
    count,
    counts,
    lastUpdated: nowIso(),
  };
}

export function buildSellerRatingDocId({ orderId, userId, sellerCode, sellerSlug }) {
  const sellerKey = toStr(sellerCode || sellerSlug).replace(/[^a-zA-Z0-9_-]+/g, "-") || "seller";
  return `${toStr(orderId, "order")}__${toStr(userId, "user")}__${sellerKey}`;
}

function matchesSeller(entry, sellerCode, sellerSlug) {
  const normalizedCode = toStr(sellerCode).toLowerCase();
  const normalizedSlug = toStr(sellerSlug).toLowerCase();
  const entryCode = toStr(entry?.sellerCode).toLowerCase();
  const entrySlug = toStr(entry?.sellerSlug).toLowerCase();
  return Boolean((normalizedCode && entryCode === normalizedCode) || (normalizedSlug && entrySlug === normalizedSlug));
}

export async function listSellerRatings({ sellerCode = "", sellerSlug = "" } = {}) {
  const db = getAdminDb();
  if (!db) return { reviews: [], summary: normalizeSellerRatings([]) };

  const normalizedCode = toStr(sellerCode);
  const normalizedSlug = toStr(sellerSlug);
  const snap = await db.collection("seller_ratings_v1").get();
  const reviews = snap.docs
    .map((docSnap) => ({ docId: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((entry) => matchesSeller(entry, normalizedCode, normalizedSlug))
    .sort((a, b) => toStr(b?.updatedAt || b?.createdAt).localeCompare(toStr(a?.updatedAt || a?.createdAt)));

  return {
    reviews,
    summary: normalizeSellerRatings(reviews),
  };
}

export async function getSellerRatingsSummary({ sellerCode = "", sellerSlug = "" } = {}) {
  const { summary } = await listSellerRatings({ sellerCode, sellerSlug });
  return summary;
}

export async function getUserSellerRatingsForOrder({ orderId = "", userId = "" } = {}) {
  const db = getAdminDb();
  if (!db || !toStr(orderId) || !toStr(userId)) return [];
  const snap = await db.collection("seller_ratings_v1")
    .where("orderId", "==", toStr(orderId))
    .where("userId", "==", toStr(userId))
    .get();

  return snap.docs
    .map((docSnap) => ({ docId: docSnap.id, ...(docSnap.data() || {}) }))
    .sort((a, b) => toStr(b?.updatedAt || b?.createdAt).localeCompare(toStr(a?.updatedAt || a?.createdAt)));
}
