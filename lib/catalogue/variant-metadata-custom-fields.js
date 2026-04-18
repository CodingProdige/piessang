import { getAdminDb } from "@/lib/firebase/admin";
import { VARIANT_METADATA_GROUP_ORDER } from "@/lib/catalogue/variant-context";

export const DEFAULT_CUSTOM_VARIANT_METADATA_FIELDS = [];

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeKey(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function sanitizeCustomVariantMetadataFields(input = []) {
  const seenKeys = new Set();
  const allowedGroups = new Set(VARIANT_METADATA_GROUP_ORDER);
  return (Array.isArray(input) ? input : [])
    .map((entry) => {
      const key = normalizeKey(entry?.key || entry?.label);
      const label = toStr(entry?.label);
      const group = allowedGroups.has(toStr(entry?.group)) ? toStr(entry?.group) : "Core options";
      const seenOptions = new Set();
      const options = (Array.isArray(entry?.options) ? entry.options : [])
        .map((item) => toStr(item))
        .filter((item) => {
          if (!item) return false;
          const normalized = item.toLowerCase();
          if (seenOptions.has(normalized)) return false;
          seenOptions.add(normalized);
          return true;
        });
      if (!key || !label || seenKeys.has(key)) return null;
      seenKeys.add(key);
      return { key, label, group, options };
    })
    .filter(Boolean);
}

export async function loadCustomVariantMetadataFields() {
  const db = getAdminDb();
  if (!db) return DEFAULT_CUSTOM_VARIANT_METADATA_FIELDS;
  const snap = await db.collection("platform_variant_metadata_v1").doc("select_options").get();
  if (!snap.exists) return DEFAULT_CUSTOM_VARIANT_METADATA_FIELDS;
  const data = snap.data() || {};
  return sanitizeCustomVariantMetadataFields(data?.customFields || []);
}
