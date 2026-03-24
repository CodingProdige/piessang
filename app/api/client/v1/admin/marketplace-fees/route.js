export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  CATEGORY_SUCCESS_FEES_COLLECTION,
  FULFILMENT_FEES_COLLECTION,
  LEGACY_HANDLING_FEES_COLLECTION,
  LEGACY_FEE_SETTINGS_COLLECTION,
  STORAGE_FEES_COLLECTION,
  FULFILMENT_FEES_ID,
  STORAGE_SETTINGS_ID,
  loadMarketplaceFeeConfig,
} from "@/lib/marketplace/fees-store";
import { DEFAULT_MARKETPLACE_FEE_CONFIG } from "@/lib/marketplace/fees";
import { requireSessionUser } from "@/lib/api/security";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toNum(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeFeeRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const kind = toStr(rule.kind).toLowerCase();
  if (kind === "fixed") {
    return { kind: "fixed", percent: toNum(rule.percent, 0), label: toStr(rule.label, "") || undefined };
  }
  if (kind === "range") {
    return {
      kind: "fixed",
      percent: toNum(rule.estimatePercent ?? rule.minPercent ?? rule.maxPercent, 0),
      label: toStr(rule.label, "") || undefined,
    };
  }
  if (kind === "tiers") {
    const firstTier = Array.isArray(rule.tiers) ? rule.tiers.find((item) => toNum(item?.percent, 0) > 0) : null;
    return {
      kind: "fixed",
      percent: toNum(firstTier?.percent, 0),
    };
  }
  return null;
}

function sanitizeCategories(input) {
  const fallback = DEFAULT_MARKETPLACE_FEE_CONFIG.categories;
  const source = Array.isArray(input) ? input : fallback;
  const categories = source
    .map((category) => {
      const slug = toStr(category?.slug).toLowerCase();
      const title = toStr(category?.title);
      if (!slug || !title) return null;
      const subCategories = Array.isArray(category?.subCategories)
        ? category.subCategories
            .map((subCategory) => {
              const subSlug = toStr(subCategory?.slug).toLowerCase();
              const subTitle = toStr(subCategory?.title);
              if (!subSlug || !subTitle) return null;
              return {
                slug: subSlug,
                title: subTitle,
                feeRule: sanitizeFeeRule(subCategory?.feeRule) || sanitizeFeeRule(category?.feeRule),
              };
            })
            .filter(Boolean)
        : [];
      return {
        slug,
        title,
        feeRule: sanitizeFeeRule(category?.feeRule) || { kind: "fixed", percent: 12 },
        subCategories,
      };
    })
    .filter(Boolean);

  return categories.length ? categories : fallback;
}

function sanitizeStorageBands(input) {
  const fallback = DEFAULT_MARKETPLACE_FEE_CONFIG.storage.bands;
  const source = Array.isArray(input) ? input : fallback;
  const bands = source
    .map((band) => {
      const label = toStr(band?.label);
      if (!label) return null;
      return {
        label,
        minVolumeCm3: band?.minVolumeCm3 == null ? null : toNum(band.minVolumeCm3, 0),
        maxVolumeCm3: band?.maxVolumeCm3 == null ? null : toNum(band.maxVolumeCm3, 0),
        overstockedFeeIncl: toNum(band?.overstockedFeeIncl, 0),
      };
    })
    .filter(Boolean);
  return bands.length ? bands : fallback;
}

function sanitizeFulfilmentRows(input) {
  const fallback = Array.isArray(DEFAULT_MARKETPLACE_FEE_CONFIG?.fulfilment?.rows)
    ? DEFAULT_MARKETPLACE_FEE_CONFIG.fulfilment.rows
    : [];
  const source = Array.isArray(input) ? input : fallback;
  const rows = source
    .map((row) => {
      const label = toStr(row?.label);
      if (!label) return null;
      return {
        id: toStr(row?.id, label.toLowerCase().replace(/\s+/g, "-")),
        label,
        minVolumeCm3: row?.minVolumeCm3 == null ? null : toNum(row.minVolumeCm3, 0),
        maxVolumeCm3: row?.maxVolumeCm3 == null ? null : toNum(row.maxVolumeCm3, 0),
        prices: {
          light: toNum(row?.prices?.light, 0),
          heavy: toNum(row?.prices?.heavy, 0),
          heavyPlus: toNum(row?.prices?.heavyPlus, 0),
          veryHeavy: toNum(row?.prices?.veryHeavy, 0),
        },
        isActive: row?.isActive !== false,
      };
    })
    .filter(Boolean);
  return rows.length ? rows : fallback;
}

function sanitizeConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    version: toStr(source.version, DEFAULT_MARKETPLACE_FEE_CONFIG.version) || DEFAULT_MARKETPLACE_FEE_CONFIG.version,
    currency: toStr(source.currency, DEFAULT_MARKETPLACE_FEE_CONFIG.currency) || DEFAULT_MARKETPLACE_FEE_CONFIG.currency,
    handlingFeeIncl: toNum(source.handlingFeeIncl, DEFAULT_MARKETPLACE_FEE_CONFIG.handlingFeeIncl),
    stockCoverThresholdDays: toNum(
      source.stockCoverThresholdDays,
      DEFAULT_MARKETPLACE_FEE_CONFIG.stockCoverThresholdDays,
    ),
    categories: sanitizeCategories(source.categories),
    fulfilment: {
      handlingFeeIncl: 0,
      rows: sanitizeFulfilmentRows(source?.fulfilment?.rows),
    },
    storage: {
      thresholdDays: toNum(
        source?.storage?.thresholdDays,
        DEFAULT_MARKETPLACE_FEE_CONFIG.storage.thresholdDays,
      ),
      bands: sanitizeStorageBands(source?.storage?.bands),
    },
  };
}

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage marketplace fees.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage marketplace fees.") };
  }

  return { db, sessionUser, requester };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const config = await loadMarketplaceFeeConfig();
    return ok({ config });
  } catch (e) {
    console.error("admin/marketplace-fees get failed:", e);
    return err(500, "Unexpected Error", "Unable to load marketplace fees.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const nextConfig = sanitizeConfig(body?.config ?? body?.data ?? body);
    const nowPayload = {
      updatedBy: auth.sessionUser.uid,
      timestamps: {
        updatedAt: FieldValue.serverTimestamp(),
      },
    };

    const categoryWrites = nextConfig.categories.flatMap((category) => {
      const categoryId = `${category.slug}__root`;
      const writes = [
        auth.db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).doc(categoryId).set(
          {
            id: categoryId,
            categorySlug: category.slug,
            subCategorySlug: null,
            title: category.title,
            rule: category.feeRule || null,
            isActive: true,
            ...nowPayload,
          },
          { merge: true },
        ),
      ];
      for (const subCategory of category.subCategories || []) {
        const subId = `${category.slug}__${subCategory.slug}`;
        writes.push(
          auth.db.collection(CATEGORY_SUCCESS_FEES_COLLECTION).doc(subId).set(
            {
              id: subId,
              categorySlug: category.slug,
              subCategorySlug: subCategory.slug,
              title: subCategory.title,
              rule: subCategory.feeRule || category.feeRule || null,
              isActive: true,
              ...nowPayload,
            },
            { merge: true },
          ),
        );
      }
      return writes;
    });

    const storageWrites = nextConfig.storage.bands.map((band) =>
      auth.db.collection(STORAGE_FEES_COLLECTION).doc(String(band.label).toLowerCase().replace(/\s+/g, "-")).set(
        {
          id: String(band.label).toLowerCase().replace(/\s+/g, "-"),
          sizeBand: band.label,
          minVolumeCm3: band.minVolumeCm3 ?? null,
          maxVolumeCm3: band.maxVolumeCm3 ?? null,
          overstockedFeeIncl: band.overstockedFeeIncl,
          isActive: true,
          ...nowPayload,
        },
        { merge: true },
      ),
    );

    await Promise.all([
      ...categoryWrites,
      ...storageWrites,
      auth.db.collection(FULFILMENT_FEES_COLLECTION).doc(FULFILMENT_FEES_ID).set(
        {
          id: FULFILMENT_FEES_ID,
          rows: nextConfig.fulfilment.rows,
          ...nowPayload,
        },
        { merge: true },
      ),
      auth.db.collection(STORAGE_FEES_COLLECTION).doc(STORAGE_SETTINGS_ID).set(
        {
          id: STORAGE_SETTINGS_ID,
          version: nextConfig.version,
          currency: nextConfig.currency,
          stockCoverThresholdDays: nextConfig.stockCoverThresholdDays,
          ...nowPayload,
        },
        { merge: true },
      ),
    ]);

    const legacyFulfilmentSnap = await auth.db.collection(FULFILMENT_FEES_COLLECTION).get();
    const legacyFulfilmentDocs = legacyFulfilmentSnap.docs.filter((doc) => doc.id !== FULFILMENT_FEES_ID);
    if (legacyFulfilmentDocs.length) {
      const batch = auth.db.batch();
      for (const doc of legacyFulfilmentDocs) batch.delete(doc.ref);
      await batch.commit();
    }

    const legacyHandlingSnap = await auth.db.collection(LEGACY_HANDLING_FEES_COLLECTION).get();
    if (!legacyHandlingSnap.empty) {
      const batch = auth.db.batch();
      for (const doc of legacyHandlingSnap.docs) batch.delete(doc.ref);
      await batch.commit();
    }

    const legacySettingsSnap = await auth.db.collection(LEGACY_FEE_SETTINGS_COLLECTION).get();
    if (!legacySettingsSnap.empty) {
      const batch = auth.db.batch();
      for (const doc of legacySettingsSnap.docs) batch.delete(doc.ref);
      await batch.commit();
    }

    const config = await loadMarketplaceFeeConfig();
    return ok({
      config,
      message: "Marketplace fee collections updated.",
    });
  } catch (e) {
    console.error("admin/marketplace-fees update failed:", e);
    return err(500, "Unexpected Error", "Unable to update marketplace fees.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
