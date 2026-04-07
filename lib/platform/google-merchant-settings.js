import { getAdminDb } from "@/lib/firebase/admin";
import { SUPPORTED_GOOGLE_MERCHANT_COUNTRIES, SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES, normalizeCountryCode } from "@/lib/marketplace/country-config";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

const SETTINGS_COLLECTION = "system_settings";
const SETTINGS_DOC_ID = "google_merchant_rollout";

function normalizeCountryCodes(input = []) {
  const supportedCheckout = new Set(SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES.map((entry) => entry.code));
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : [])
        .map((value) => normalizeCountryCode(value))
        .filter((code) => Boolean(code) && supportedCheckout.has(code)),
    ),
  );
}

export function getDefaultGoogleMerchantCountryCodes() {
  return SUPPORTED_GOOGLE_MERCHANT_COUNTRIES.map((entry) => entry.code);
}

export function mapGoogleMerchantCountryEntries(codes = []) {
  const normalizedCodes = normalizeCountryCodes(codes);
  return SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES.filter((entry) => normalizedCodes.includes(entry.code));
}

export async function loadGoogleMerchantSettings() {
  const db = getAdminDb();
  const fallbackCodes = getDefaultGoogleMerchantCountryCodes();
  const fallbackCountries = mapGoogleMerchantCountryEntries(fallbackCodes);
  if (!db) {
    return { countryCodes: fallbackCodes, countries: fallbackCountries, updatedAt: "", updatedBy: "" };
  }

  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
  const data = snap.exists ? snap.data() || {} : {};
  const countryCodes = normalizeCountryCodes(data?.countryCodes || fallbackCodes);
  const safeCountryCodes = countryCodes.length ? countryCodes : fallbackCodes;
  return {
    countryCodes: safeCountryCodes,
    countries: mapGoogleMerchantCountryEntries(safeCountryCodes),
    updatedAt: toStr(data?.timestamps?.updatedAt),
    updatedBy: toStr(data?.timestamps?.updatedBy),
  };
}

export async function saveGoogleMerchantSettings({ uid = "", countryCodes = [] } = {}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const normalizedCountryCodes = normalizeCountryCodes(countryCodes);
  if (!normalizedCountryCodes.length) {
    throw new Error("Select at least one Google Merchant rollout country.");
  }

  await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(
    {
      countryCodes: normalizedCountryCodes,
      timestamps: {
        updatedAt: new Date().toISOString(),
        updatedBy: toStr(uid),
      },
    },
    { merge: true },
  );

  return {
    countryCodes: normalizedCountryCodes,
    countries: mapGoogleMerchantCountryEntries(normalizedCountryCodes),
    updatedAt: new Date().toISOString(),
    updatedBy: toStr(uid),
  };
}
