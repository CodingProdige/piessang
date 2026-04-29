import { getAdminDb } from "@/lib/firebase/admin";
import { defaultPiessangFulfillmentShipping } from "@/lib/shipping/settings";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeMarkup(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const mode = toStr(source.mode || "percentage").toLowerCase();
  const appliesTo = toStr(source.appliesTo || "seller_fulfilled").toLowerCase();
  return {
    enabled: source.enabled === true,
    mode: mode === "fixed" ? "fixed" : "percentage",
    value: Math.max(0, toNum(source.value, 0)),
    appliesTo:
      appliesTo === "all" || appliesTo === "piessang_fulfilled" || appliesTo === "seller_fulfilled"
        ? appliesTo
        : "seller_fulfilled",
    countryCode: toStr(source.countryCode || "ZA").toUpperCase() || "ZA",
    updatedAt: toStr(source.updatedAt || ""),
    updatedBy: toStr(source.updatedBy || ""),
  };
}

export function normalizePlatformShippingSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaults = defaultPiessangFulfillmentShipping();
  return {
    piessangFulfillmentShipping: {
      countryCode: toStr(source?.piessangFulfillmentShipping?.countryCode || defaults.countryCode).toUpperCase() || defaults.countryCode,
      warehouseOrigin: {
        province: toStr(source?.piessangFulfillmentShipping?.warehouseOrigin?.province || defaults.warehouseOrigin.province),
        city: toStr(source?.piessangFulfillmentShipping?.warehouseOrigin?.city || defaults.warehouseOrigin.city),
        postalCode: toStr(source?.piessangFulfillmentShipping?.warehouseOrigin?.postalCode || defaults.warehouseOrigin.postalCode),
      },
      zones: Array.isArray(source?.piessangFulfillmentShipping?.zones) ? source.piessangFulfillmentShipping.zones : defaults.zones,
    },
    platformShippingMarkup: normalizeMarkup(
      source?.platformShippingMarkup && Object.keys(source.platformShippingMarkup || {}).length
        ? source.platformShippingMarkup
        : source?.piessangFulfillmentShipping?.shippingMargin || {},
    ),
  };
}

export async function loadPlatformShippingSettings() {
  const db = getAdminDb();
  if (!db) return normalizePlatformShippingSettings({});

  const shippingSnap = await db.collection("system_settings").doc("platform_shipping").get().catch(() => null);
  if (shippingSnap?.exists) {
    return normalizePlatformShippingSettings(shippingSnap.data() || {});
  }

  const legacySnap = await db.collection("system_settings").doc("platform_delivery").get().catch(() => null);
  const legacyData = legacySnap?.exists ? legacySnap.data() || {} : {};
  return normalizePlatformShippingSettings({
    piessangFulfillmentShipping: legacyData?.piessangFulfillmentShipping || {},
    platformShippingMarkup: legacyData?.platformShippingMarkup || legacyData?.piessangFulfillmentShipping?.shippingMargin || {},
  });
}

export async function savePlatformShippingSettings({ uid = "", data = {} } = {}) {
  const db = getAdminDb();
  if (!db) return normalizePlatformShippingSettings(data);

  const normalized = normalizePlatformShippingSettings({
    ...data,
    platformShippingMarkup: {
      ...(data?.platformShippingMarkup || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: toStr(uid),
    },
  });

  await db.collection("system_settings").doc("platform_shipping").set(normalized, { merge: true });
  return normalized;
}
