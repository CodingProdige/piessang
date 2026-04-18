export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import {
  DEFAULT_VARIANT_METADATA_SELECT_OPTIONS,
  VARIANT_METADATA_SELECT_FIELD_DEFS,
  sanitizeVariantMetadataSelectOptionsConfig,
} from "@/lib/catalogue/variant-metadata-select-options";
import { sanitizeCustomVariantMetadataFields } from "@/lib/catalogue/variant-metadata-custom-fields";
import {
  loadVariantMetadataSelectOptionsConfig,
  VARIANT_METADATA_OPTIONS_COLLECTION,
  VARIANT_METADATA_OPTIONS_DOC,
} from "@/lib/catalogue/variant-metadata-options-store";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });
const toStr = (value, fallback = "") => (value == null ? fallback : String(value).trim());

async function buildVariantMetadataUsageSummary(db) {
  const fieldKeys = VARIANT_METADATA_SELECT_FIELD_DEFS.map((field) => field.key);
  const fieldProductSets = new Map(fieldKeys.map((key) => [key, new Set()]));
  const optionProductSets = new Map(fieldKeys.map((key) => [key, new Map()]));

  const snap = await db.collection("products_v2").get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    for (const variant of variants) {
      for (const key of fieldKeys) {
        const value = toStr(variant?.[key]);
        if (!value) continue;
        fieldProductSets.get(key)?.add(docSnap.id);
        const valueMap = optionProductSets.get(key);
        if (!valueMap.has(value)) valueMap.set(value, new Set());
        valueMap.get(value).add(docSnap.id);
      }
    }
  }

  return Object.fromEntries(
    fieldKeys.map((key) => {
      const optionEntries = Array.from(optionProductSets.get(key)?.entries() || []).map(([value, ids]) => [
        value,
        { productsCount: ids.size },
      ]);
      return [
        key,
        {
          productsCount: fieldProductSets.get(key)?.size || 0,
          options: Object.fromEntries(optionEntries),
        },
      ];
    }),
  );
}

async function buildCustomVariantMetadataUsageSummary(db) {
  const fieldProductSets = new Map();
  const optionProductSets = new Map();
  const snap = await db.collection("products_v2").get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    for (const variant of variants) {
      const customMetadata = variant?.customMetadata && typeof variant.customMetadata === "object" ? variant.customMetadata : {};
      for (const [key, rawValue] of Object.entries(customMetadata)) {
        const value = toStr(rawValue);
        if (!value) continue;
        if (!fieldProductSets.has(key)) fieldProductSets.set(key, new Set());
        if (!optionProductSets.has(key)) optionProductSets.set(key, new Map());
        fieldProductSets.get(key).add(docSnap.id);
        const optionMap = optionProductSets.get(key);
        if (!optionMap.has(value)) optionMap.set(value, new Set());
        optionMap.get(value).add(docSnap.id);
      }
    }
  }
  return {
    fields: Object.fromEntries(
      Array.from(fieldProductSets.entries()).map(([key, ids]) => [key, { productsCount: ids.size }]),
    ),
    options: Object.fromEntries(
      Array.from(optionProductSets.entries()).map(([key, optionMap]) => [
        key,
        Object.fromEntries(
          Array.from(optionMap.entries()).map(([value, ids]) => [value, { productsCount: ids.size }]),
        ),
      ]),
    ),
  };
}

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage variant metadata options.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage variant metadata options.") };
  }
  return { db, sessionUser };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;
  try {
    const config = await loadVariantMetadataSelectOptionsConfig();
    const usage = await buildVariantMetadataUsageSummary(auth.db);
    const docSnap = await auth.db.collection(VARIANT_METADATA_OPTIONS_COLLECTION).doc(VARIANT_METADATA_OPTIONS_DOC).get();
    const docData = docSnap.exists ? docSnap.data() || {} : {};
    const customFields = sanitizeCustomVariantMetadataFields(docData?.customFields || []);
    const customFieldUsage = await buildCustomVariantMetadataUsageSummary(auth.db);
    return ok({ config, defaults: DEFAULT_VARIANT_METADATA_SELECT_OPTIONS, usage, customFields, customFieldUsage });
  } catch (e) {
    console.error("admin/variant-metadata-options get failed:", e);
    return err(500, "Unexpected Error", "Unable to load variant metadata options.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const docSnap = await auth.db.collection(VARIANT_METADATA_OPTIONS_COLLECTION).doc(VARIANT_METADATA_OPTIONS_DOC).get();
    const docData = docSnap.exists ? docSnap.data() || {} : {};
    const previousConfig = await loadVariantMetadataSelectOptionsConfig();
    const previousCustomFields = sanitizeCustomVariantMetadataFields(docData?.customFields || []);
    const usage = await buildVariantMetadataUsageSummary(auth.db);
    const customFieldUsage = await buildCustomVariantMetadataUsageSummary(auth.db);
    const config = sanitizeVariantMetadataSelectOptionsConfig(body?.config ?? body ?? {});
    const customFields = sanitizeCustomVariantMetadataFields(body?.customFields ?? previousCustomFields);

    for (const field of VARIANT_METADATA_SELECT_FIELD_DEFS) {
      const key = field.key;
      const previousValues = Array.isArray(previousConfig?.[key]) ? previousConfig[key] : [];
      const nextValues = new Set(Array.isArray(config?.[key]) ? config[key] : []);
      const removedValues = previousValues.filter((value) => !nextValues.has(value));
      const optionUsage = usage?.[key]?.options || {};
      const blockedValues = removedValues.filter((value) => Number(optionUsage?.[value]?.productsCount || 0) > 0);

      if (blockedValues.length) {
        return err(
          409,
          "Option In Use",
          `You cannot remove ${field.label.toLowerCase()} option${blockedValues.length === 1 ? "" : "s"} that products still use. Update those products first.`,
          {
            fieldKey: key,
            blockedValues,
            usage: blockedValues.map((value) => ({
              value,
              productsCount: Number(optionUsage?.[value]?.productsCount || 0),
            })),
          },
        );
      }
    }

    for (const previousField of previousCustomFields) {
      const nextField = customFields.find((field) => field.key === previousField.key);
      if (!nextField && Number(customFieldUsage?.fields?.[previousField.key]?.productsCount || 0) > 0) {
        return err(409, "Field In Use", `You cannot remove ${previousField.label.toLowerCase()} yet because products still use it. Update those products first.`, {
          fieldKey: previousField.key,
          productsCount: Number(customFieldUsage?.fields?.[previousField.key]?.productsCount || 0),
        });
      }
      if (!nextField) continue;
      const removedValues = (Array.isArray(previousField.options) ? previousField.options : []).filter(
        (value) => !(Array.isArray(nextField.options) ? nextField.options : []).includes(value),
      );
      const optionUsage = customFieldUsage?.options?.[previousField.key] || {};
      const blockedValues = removedValues.filter((value) => Number(optionUsage?.[value]?.productsCount || 0) > 0);
      if (blockedValues.length) {
        return err(409, "Option In Use", `You cannot remove selectable values from ${previousField.label.toLowerCase()} while products still use them. Update those products first.`, {
          fieldKey: previousField.key,
          blockedValues,
        });
      }
    }

    await auth.db.collection(VARIANT_METADATA_OPTIONS_COLLECTION).doc(VARIANT_METADATA_OPTIONS_DOC).set(
      {
        config,
        customFields,
        updatedBy: auth.sessionUser.uid,
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    const nextConfig = await loadVariantMetadataSelectOptionsConfig();
    const nextUsage = await buildVariantMetadataUsageSummary(auth.db);
    const nextCustomFieldUsage = await buildCustomVariantMetadataUsageSummary(auth.db);
    return ok({ config: nextConfig, usage: nextUsage, customFields, customFieldUsage: nextCustomFieldUsage, message: "Variant metadata options saved." });
  } catch (e) {
    console.error("admin/variant-metadata-options update failed:", e);
    return err(500, "Unexpected Error", "Unable to save variant metadata options.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
