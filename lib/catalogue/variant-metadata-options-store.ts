import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_VARIANT_METADATA_SELECT_OPTIONS,
  sanitizeVariantMetadataSelectOptionsConfig,
} from "@/lib/catalogue/variant-metadata-select-options";

export const VARIANT_METADATA_OPTIONS_COLLECTION = "platform_variant_metadata_v1";
export const VARIANT_METADATA_OPTIONS_DOC = "select_options";

export async function loadVariantMetadataSelectOptionsConfig() {
  const db = getAdminDb();
  if (!db) return DEFAULT_VARIANT_METADATA_SELECT_OPTIONS;
  const snap = await db.collection(VARIANT_METADATA_OPTIONS_COLLECTION).doc(VARIANT_METADATA_OPTIONS_DOC).get();
  if (!snap.exists) return DEFAULT_VARIANT_METADATA_SELECT_OPTIONS;
  const data = snap.data() || {};
  return sanitizeVariantMetadataSelectOptionsConfig(data?.config ?? {});
}
