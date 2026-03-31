import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeSellerDeliveryProfile, resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

const SETTINGS_COLLECTION = "system_settings";
const SETTINGS_DOC_ID = "platform_delivery";

export function normalizePlatformDeliveryProfile(profile = {}) {
  return normalizeSellerDeliveryProfile(profile && typeof profile === "object" ? profile : {});
}

export async function loadPlatformDeliverySettings() {
  const db = getAdminDb();
  if (!db) return normalizePlatformDeliveryProfile({});

  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
  const data = snap.exists ? snap.data() || {} : {};
  return normalizePlatformDeliveryProfile(data?.deliveryProfile || {});
}

export async function savePlatformDeliverySettings({ uid = "", deliveryProfile = {} } = {}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const normalized = normalizePlatformDeliveryProfile(deliveryProfile);
  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(
    {
      deliveryProfile: normalized,
      timestamps: {
        updatedAt: new Date().toISOString(),
        updatedBy: toStr(uid),
      },
    },
    { merge: true },
  );

  return normalized;
}

export async function resolvePlatformDeliveryOption({ shopperArea = null, subtotalIncl = 0 } = {}) {
  const profile = await loadPlatformDeliverySettings();
  return resolveSellerDeliveryOption({
    profile,
    sellerBaseLocation: toStr(profile?.origin?.city || ""),
    shopperArea,
    subtotalIncl,
  });
}
