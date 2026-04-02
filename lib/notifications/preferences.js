import { getAdminDb } from "@/lib/firebase/admin";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toBool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeUserNotificationPreferences(raw) {
  const preferences = raw && typeof raw === "object" ? raw : {};
  const topics = preferences.notificationTopics && typeof preferences.notificationTopics === "object"
    ? preferences.notificationTopics
    : {};

  return {
    emailNotifications: toBool(preferences.emailNotifications, true),
    smsNotifications: toBool(preferences.smsNotifications, true),
    pushNotifications: toBool(preferences.pushNotifications, true),
    notificationTopics: {
      orders: toBool(topics.orders, true),
      delivery: toBool(topics.delivery, true),
      returns: toBool(topics.returns, true),
      support: toBool(topics.support, true),
      promotions: toBool(topics.promotions, false),
      account: toBool(topics.account, true),
      following: toBool(topics.following, true),
      favorites: toBool(topics.favorites, true),
    },
  };
}

export function getNotificationTopicForType(type) {
  const value = toStr(type).toLowerCase();
  if (!value) return null;
  if (["order-confirmation", "order-processing", "payment-received"].includes(value)) return "orders";
  if (["order-dispatched", "order-seller-fulfillment-update"].includes(value)) return "delivery";
  if (["return-request-submitted", "return-status-update"].includes(value)) return "returns";
  if (["support-ticket-created", "support-ticket-updated", "support-ticket-closing-warning"].includes(value)) return "support";
  if (["cart-item-sale"].includes(value)) return "promotions";
  if (["welcome", "account-pending"].includes(value)) return "account";
  if (["followed-seller-new-product"].includes(value)) return "following";
  if (["favorite-on-sale", "favorite-back-in-stock", "favorite-out-of-stock"].includes(value)) return "favorites";
  return null;
}

export function shouldRespectNotificationPreferences(type) {
  return Boolean(getNotificationTopicForType(type));
}

async function findUserByEmail(db, email) {
  const value = toStr(email).toLowerCase();
  if (!value) return null;
  const snap = await db.collection("users").where("email", "==", value).limit(1).get();
  if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  const accountSnap = await db.collection("users").where("account.email", "==", value).limit(1).get();
  if (!accountSnap.empty) return { uid: accountSnap.docs[0].id, ...accountSnap.docs[0].data() };
  return null;
}

async function findUserByPhone(db, phone) {
  const value = toStr(phone);
  if (!value) return null;
  const snap = await db.collection("users").where("account.phoneNumber", "==", value).limit(1).get();
  if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  return null;
}

export async function resolveNotificationPreferenceRecipient({ uid, email, phone } = {}) {
  const db = getAdminDb();
  if (!db) return null;

  const userId = toStr(uid);
  if (userId) {
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return null;
    return { uid: snap.id, ...snap.data() };
  }

  if (email) {
    const hit = await findUserByEmail(db, email);
    if (hit) return hit;
  }

  if (phone) {
    const hit = await findUserByPhone(db, phone);
    if (hit) return hit;
  }

  return null;
}

export function canSendNotificationToUser({ channel, type, user }) {
  const topic = getNotificationTopicForType(type);
  if (!topic || !user) return true;
  const preferences = normalizeUserNotificationPreferences(user.preferences);
  if (channel === "email" && !preferences.emailNotifications) return false;
  if (channel === "sms" && !preferences.smsNotifications) return false;
  if (channel === "push" && !preferences.pushNotifications) return false;
  return Boolean(preferences.notificationTopics?.[topic]);
}
