export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { sendSellerNotificationEmails } from "@/lib/seller/notifications";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toInt(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback;
}

function is8(value) {
  return /^\d{8}$/.test(toStr(value));
}

function getSellerIdentifiers(userData) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return new Set(
    [
      seller?.sellerCode,
      seller?.activeSellerCode,
      seller?.groupSellerCode,
      seller?.sellerSlug,
      seller?.activeSellerSlug,
      seller?.groupSellerSlug,
    ]
      .map((item) => toStr(item).toLowerCase())
      .filter(Boolean),
  );
}

function isSystemAdminRequester(requester) {
  return toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase() === "admin";
}

function buildUpliftmentStatusAudit(nextStatus, uid) {
  const now = new Date().toISOString();
  if (nextStatus === "released") {
    return {
      releasedAt: now,
      releasedBy: uid,
    };
  }
  if (nextStatus === "completed") {
    return {
      completedAt: now,
      completedBy: uid,
    };
  }
  if (nextStatus === "cancelled") {
    return {
      cancelledAt: now,
      cancelledBy: uid,
    };
  }
  return {};
}

async function getRequesterContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage stock upliftments.") };
  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };
  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  return { db, requester, sessionUser };
}

function getRequesterSellerFilters(requester) {
  const identifiers = Array.from(getSellerIdentifiers(requester));
  const sellerCodes = new Set();
  const sellerSlugs = new Set();
  for (const value of identifiers) {
    if (!value) continue;
    if (/^sc-/i.test(value)) sellerCodes.add(value);
    else sellerSlugs.add(value);
  }
  return {
    sellerCodes: Array.from(sellerCodes),
    sellerSlugs: Array.from(sellerSlugs),
  };
}

async function ensureUpliftmentAccess(db, upliftmentId, requester) {
  const upliftmentSnap = await db.collection("seller_stock_upliftments").doc(upliftmentId).get();
  if (!upliftmentSnap.exists) return { error: err(404, "Upliftment Not Found", "Unable to find that stock upliftment.") };
  const upliftment = upliftmentSnap.data() || {};
  if (isSystemAdminRequester(requester)) return { upliftmentRef: upliftmentSnap.ref, upliftment };
  const identifiers = getSellerIdentifiers(requester);
  const owned = [upliftment?.sellerCode, upliftment?.sellerSlug]
    .map((item) => toStr(item).toLowerCase())
    .filter(Boolean)
    .some((item) => identifiers.has(item));
  if (!owned) return { error: err(403, "Access Denied", "You can only manage upliftments for your own seller products.") };
  return { upliftmentRef: upliftmentSnap.ref, upliftment };
}

async function loadProductForSeller(db, productId, requester) {
  const productSnap = await db.collection("products_v2").doc(productId).get();
  if (!productSnap.exists) return { error: err(404, "Product Not Found", "Unable to find that product.") };
  const product = productSnap.data() || {};
  if (isSystemAdminRequester(requester)) return { product };
  const identifiers = getSellerIdentifiers(requester);
  const productIdentifiers = [
    product?.product?.sellerCode,
    product?.product?.sellerSlug,
    product?.seller?.sellerCode,
    product?.seller?.sellerSlug,
  ]
    .map((item) => toStr(item).toLowerCase())
    .filter(Boolean);
  if (!productIdentifiers.some((item) => identifiers.has(item))) {
    return { error: err(403, "Access Denied", "You can only request upliftment for your own seller products.") };
  }
  return { product };
}

export async function GET(req) {
  const ctx = await getRequesterContext();
  if (ctx.error) return ctx.error;

  try {
    const { searchParams } = new URL(req.url);
    const productId = toStr(searchParams.get("productId"));
    const sellerCode = toStr(searchParams.get("sellerCode"));
    const sellerSlug = toStr(searchParams.get("sellerSlug")).toLowerCase();
    let snap = null;
    if (productId) {
      if (!is8(productId)) return err(400, "Invalid Product ID", "Provide an 8-digit productId.");
      const access = await loadProductForSeller(ctx.db, productId, ctx.requester);
      if (access.error) return access.error;
      snap = await ctx.db
        .collection("seller_stock_upliftments")
        .where("productId", "==", productId)
        .orderBy("upliftDate", "asc")
        .get();
    } else {
      const filters = getRequesterSellerFilters(ctx.requester);
      const query = isSystemAdminRequester(ctx.requester) && sellerCode
        ? ctx.db.collection("seller_stock_upliftments").where("sellerCode", "==", sellerCode)
        : isSystemAdminRequester(ctx.requester) && sellerSlug
          ? ctx.db.collection("seller_stock_upliftments").where("sellerSlug", "==", sellerSlug)
          : filters.sellerCodes.length
            ? ctx.db.collection("seller_stock_upliftments").where("sellerCode", "in", filters.sellerCodes.slice(0, 10))
            : filters.sellerSlugs.length
              ? ctx.db.collection("seller_stock_upliftments").where("sellerSlug", "in", filters.sellerSlugs.slice(0, 10))
              : null;
      if (!query) return ok({ items: [] });
      snap = await query.orderBy("upliftDate", "asc").get();
    }

    return ok({
      items: snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })),
    });
  } catch (e) {
    console.error("seller stock upliftments get failed:", e);
    return err(500, "Unexpected Error", "Unable to load stock upliftments.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function PATCH(req) {
  const ctx = await getRequesterContext();
  if (ctx.error) return ctx.error;

  try {
    const body = await req.json().catch(() => ({}));
    const upliftmentId = toStr(body?.upliftmentId || body?.id);
    if (!upliftmentId) return err(400, "Missing Upliftment ID", "Provide the stock upliftment you want to update.");

    const access = await ensureUpliftmentAccess(ctx.db, upliftmentId, ctx.requester);
    if (access.error) return access.error;
    const currentStatus = String(access.upliftment?.status || "").trim().toLowerCase();
    if (currentStatus === "cancelled") {
      return err(409, "Upliftment Cancelled", "Cancelled stock upliftments cannot be edited.");
    }
    const nextStatus = toStr(body?.status).toLowerCase();
    const isAdmin = isSystemAdminRequester(ctx.requester);
    if (nextStatus) {
      if (!isAdmin) {
        return err(403, "Access Denied", "Only Piessang admins can change upliftment lifecycle statuses.");
      }
      const allowedTransitions = {
        requested: ["released", "completed", "cancelled"],
        released: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowedTransitions[currentStatus || "requested"]?.includes(nextStatus)) {
        return err(400, "Invalid Status Transition", "That upliftment lifecycle change is not allowed.");
      }
    }

    await access.upliftmentRef.set(
      {
        upliftDate: toStr(body?.upliftDate) || access.upliftment.upliftDate || null,
        notes: toStr(body?.notes || "", "") || null,
        reason: toStr(body?.reason || "", "") || null,
        ...(nextStatus
          ? {
              status: nextStatus,
              lifecycleUpdatedAt: new Date().toISOString(),
              lifecycleUpdatedBy: ctx.sessionUser.uid,
              ...buildUpliftmentStatusAudit(nextStatus, ctx.sessionUser.uid),
            }
          : {}),
        timestamps: {
          ...(access.upliftment.timestamps && typeof access.upliftment.timestamps === "object" ? access.upliftment.timestamps : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    return ok({ message: "Stock upliftment updated." });
  } catch (e) {
    console.error("seller stock upliftments patch failed:", e);
    return err(500, "Unexpected Error", "Unable to update the stock upliftment.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function DELETE(req) {
  const ctx = await getRequesterContext();
  if (ctx.error) return ctx.error;

  try {
    const { searchParams } = new URL(req.url);
    const upliftmentId = toStr(searchParams.get("upliftmentId"));
    if (!upliftmentId) return err(400, "Missing Upliftment ID", "Provide the stock upliftment you want to cancel.");

    const access = await ensureUpliftmentAccess(ctx.db, upliftmentId, ctx.requester);
    if (access.error) return access.error;

    await access.upliftmentRef.set(
      {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: ctx.sessionUser.uid,
        timestamps: {
          ...(access.upliftment.timestamps && typeof access.upliftment.timestamps === "object" ? access.upliftment.timestamps : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    return ok({ message: "Stock upliftment cancelled." });
  } catch (e) {
    console.error("seller stock upliftments delete failed:", e);
    return err(500, "Unexpected Error", "Unable to cancel the stock upliftment.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function POST(req) {
  const ctx = await getRequesterContext();
  if (ctx.error) return ctx.error;

  try {
    const body = await req.json().catch(() => ({}));
    const productId = toStr(body?.productId);
    if (!is8(productId)) return err(400, "Invalid Product ID", "Provide an 8-digit productId.");

    const access = await loadProductForSeller(ctx.db, productId, ctx.requester);
    if (access.error) return access.error;
    const product = access.product;
    const fulfillmentMode = toStr(product?.fulfillment?.mode, "seller");
    if (fulfillmentMode !== "bevgo") {
      return err(409, "Invalid Fulfilment Mode", "Stock upliftments are only available for Piessang fulfilment products.");
    }

    const upliftDate = toStr(body?.upliftDate);
    if (!upliftDate) return err(400, "Missing Uplift Date", "Choose the date you want Piessang to release this stock.");

    const variantRows = Array.isArray(body?.variants) ? body.variants : [];
    const productVariants = Array.isArray(product?.variants) ? product.variants : [];
    const variants = variantRows
      .map((item) => {
        const variantId = toStr(item?.variantId || item?.variant_id);
        const quantity = toInt(item?.quantity, 0);
        if (!variantId || quantity <= 0) return null;
        const variant = productVariants.find((entry) => toStr(entry?.variant_id) === variantId);
        if (!variant) return null;
        return {
          variantId,
          label: toStr(variant?.label || variantId),
          barcode: toStr(variant?.barcode || ""),
          quantity,
        };
      })
      .filter(Boolean);

    if (!variants.length) return err(400, "Missing Variants", "Add at least one uplift quantity for this request.");

    const createdAt = new Date().toISOString();
    const upliftRef = ctx.db.collection("seller_stock_upliftments").doc();
    await upliftRef.set({
      upliftmentId: upliftRef.id,
      productId,
      productTitle: toStr(product?.product?.title || productId),
      sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
      sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
      upliftDate,
      notes: toStr(body?.notes || "", "") || null,
      reason: toStr(body?.reason || "", "") || null,
      status: "requested",
      variants,
      totalUnits: variants.reduce((sum, item) => sum + toInt(item.quantity, 0), 0),
      createdAt,
      createdBy: ctx.sessionUser.uid,
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      try {
        await sendSellerNotificationEmails({
          origin: new URL(req.url).origin,
          type: "seller-stock-upliftment-internal",
          to: ["support@piessang.com"],
          data: {
            vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || product?.product?.sellerSlug || "Piessang seller"),
            sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
            productTitle: toStr(product?.product?.title || productId),
            productId,
            upliftmentId: upliftRef.id,
            upliftDate,
            totalUnits: variants.reduce((sum, item) => sum + toInt(item.quantity, 0), 0),
            variants,
            reason: toStr(body?.reason || "", "") || "",
            notes: toStr(body?.notes || "", "") || "",
            createdByUid: ctx.sessionUser.uid,
            createdByEmail: toStr(ctx.requester?.email || ctx.requester?.seller?.contactEmail || ""),
          },
        });
      } catch (notificationError) {
        console.error("seller upliftment internal email failed:", notificationError);
      }
    }

    return ok({
      upliftment: {
        id: upliftRef.id,
        upliftmentId: upliftRef.id,
        productId,
        upliftDate,
        variants,
        totalUnits: variants.reduce((sum, item) => sum + toInt(item.quantity, 0), 0),
        status: "requested",
        createdAt,
      },
      message: "Stock upliftment request saved.",
    });
  } catch (e) {
    console.error("seller stock upliftments create failed:", e);
    return err(500, "Unexpected Error", "Unable to save the stock upliftment request.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
