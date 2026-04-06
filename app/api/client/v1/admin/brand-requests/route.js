export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  BRAND_REQUESTS_COLLECTION,
  ensureBrandRecord,
  findBrandRecord,
  normalizeBrandKey,
} from "@/lib/catalogue/brand-upsert";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isSystemAdminUser(data) {
  return toStr(data?.system?.accessType || data?.systemAccessType).toLowerCase() === "admin";
}

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage brand requests.") };
  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };
  const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage brand requests.") };
  }
  return { db, requester, sessionUser };
}

function normalizeRequest(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    brandTitle: toStr(data?.brand?.title || ""),
    brandSlug: toStr(data?.brand?.slug || ""),
    normalizedKey: toStr(data?.normalizedKey || ""),
    status: toStr(data?.status || "pending").toLowerCase(),
    requestedByUid: toStr(data?.seller?.requestedByUid || ""),
    vendorName: toStr(data?.seller?.vendorName || ""),
    productId: toStr(data?.latestProduct?.productId || ""),
    productTitle: toStr(data?.latestProduct?.productTitle || ""),
    createdAt: data?.timestamps?.createdAt && typeof data.timestamps.createdAt?.toDate === "function"
      ? data.timestamps.createdAt.toDate().toISOString()
      : toStr(data?.timestamps?.createdAt || ""),
    updatedAt: data?.timestamps?.updatedAt && typeof data.timestamps.updatedAt?.toDate === "function"
      ? data.timestamps.updatedAt.toDate().toISOString()
      : toStr(data?.timestamps?.updatedAt || ""),
    resolvedAt: toStr(data?.resolvedAt || ""),
    resolvedBy: toStr(data?.resolvedBy || ""),
    resolution: {
      action: toStr(data?.resolution?.action || ""),
      canonicalBrandSlug: toStr(data?.resolution?.canonicalBrandSlug || ""),
      canonicalBrandTitle: toStr(data?.resolution?.canonicalBrandTitle || ""),
      note: toStr(data?.resolution?.note || ""),
    },
  };
}

async function syncPendingProductsToBrand(db, requestId, pendingSlug, canonicalBrand) {
  const productsSnap = await db.collection("products_v2").where("product.brandRequestId", "==", requestId).get();
  if (productsSnap.empty) return 0;
  let updated = 0;
  const batch = db.batch();
  for (const docSnap of productsSnap.docs) {
    const data = docSnap.data() || {};
    const currentBrand = toStr(data?.grouping?.brand || data?.product?.brand);
    if (currentBrand && currentBrand !== pendingSlug) continue;
    batch.update(docSnap.ref, {
      "grouping.brand": canonicalBrand.slug,
      "product.brand": canonicalBrand.slug,
      "product.brandTitle": canonicalBrand.title,
      "product.brandCode": canonicalBrand.code || null,
      "product.brandStatus": "approved",
      "product.brandRequestId": requestId,
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });
    updated += 1;
  }
  if (updated) await batch.commit();
  return updated;
}

export async function GET(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = toStr(searchParams.get("status"), "pending").toLowerCase();
    const snap = status === "all"
      ? await auth.db.collection(BRAND_REQUESTS_COLLECTION).get()
      : await auth.db.collection(BRAND_REQUESTS_COLLECTION).where("status", "==", status).get();
    const items = snap.docs.map(normalizeRequest).sort((left, right) => {
      return (right.updatedAt || right.createdAt || "").localeCompare(left.updatedAt || left.createdAt || "");
    });
    return ok({ count: items.length, items });
  } catch (e) {
    console.error("admin/brand-requests get failed:", e);
    return err(500, "Unexpected Error", "Unable to load brand requests.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const requestId = toStr(body?.requestId || body?.id);
    const action = toStr(body?.action).toLowerCase();
    const canonicalTitle = toStr(body?.canonicalTitle || body?.brandTitle);
    const canonicalSlug = toStr(body?.canonicalSlug || body?.brandSlug);
    const mergeIntoBrandSlug = toStr(body?.mergeIntoBrandSlug);
    const note = toStr(body?.note);

    if (!requestId) return err(400, "Missing Request", "Provide the brand request you want to process.");
    if (!["approve", "reject"].includes(action)) return err(400, "Invalid Action", "Action must be approve or reject.");

    const ref = auth.db.collection(BRAND_REQUESTS_COLLECTION).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "Not Found", "Unable to find that brand request.");
    const request = snap.data() || {};
    const pendingTitle = toStr(request?.brand?.title || "");
    const pendingSlug = toStr(request?.brand?.slug || "");

    if (action === "reject") {
      await ref.set({
        status: "rejected",
        resolvedAt: new Date().toISOString(),
        resolvedBy: auth.sessionUser.uid,
        resolution: {
          action: "rejected",
          note,
        },
        timestamps: {
          ...(request.timestamps && typeof request.timestamps === "object" ? request.timestamps : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      return ok({ message: "Brand request rejected." });
    }

    let canonicalBrand = null;
    if (mergeIntoBrandSlug) {
      canonicalBrand = await findBrandRecord({ title: mergeIntoBrandSlug, slug: mergeIntoBrandSlug });
      if (!canonicalBrand) {
        return err(404, "Brand Not Found", "Unable to find the canonical brand you want to merge into.");
      }
    } else {
      canonicalBrand =
        (await findBrandRecord({ title: canonicalTitle || pendingTitle, slug: canonicalSlug || pendingSlug })) ||
        (await ensureBrandRecord({ title: canonicalTitle || pendingTitle, slug: canonicalSlug || pendingSlug }));
    }

    const brandRef = auth.db.collection("brands").doc(canonicalBrand.id);
    const brandSnap = await brandRef.get();
    const brandData = brandSnap.exists ? brandSnap.data() || {} : {};
    const aliases = Array.isArray(brandData?.brand?.aliases) ? brandData.brand.aliases : [];
    const aliasSet = new Set(
      aliases.map((item) => normalizeBrandKey(item)).filter(Boolean),
    );
    for (const item of [pendingTitle, pendingSlug, canonicalBrand.title, canonicalBrand.slug]) {
      const normalized = normalizeBrandKey(item);
      if (!normalized || aliasSet.has(normalized)) continue;
      aliases.push(item);
      aliasSet.add(normalized);
    }
    await brandRef.set({
      brand: {
        ...(brandData?.brand && typeof brandData.brand === "object" ? brandData.brand : {}),
        aliases,
      },
      timestamps: {
        ...(brandData?.timestamps && typeof brandData.timestamps === "object" ? brandData.timestamps : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });

    const syncedProducts = await syncPendingProductsToBrand(auth.db, requestId, pendingSlug, canonicalBrand);

    await ref.set({
      status: "approved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: auth.sessionUser.uid,
      resolution: {
        action: "approved",
        canonicalBrandSlug: canonicalBrand.slug,
        canonicalBrandTitle: canonicalBrand.title,
        note,
      },
      timestamps: {
        ...(request.timestamps && typeof request.timestamps === "object" ? request.timestamps : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });

    return ok({
      message: "Brand request approved.",
      brand: {
        id: canonicalBrand.id,
        slug: canonicalBrand.slug,
        title: canonicalBrand.title,
        code: canonicalBrand.code || null,
      },
      syncedProducts,
    });
  } catch (e) {
    console.error("admin/brand-requests update failed:", e);
    return err(500, "Unexpected Error", "Unable to update brand request.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
