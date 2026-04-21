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

function buildInboundStatusAudit(nextStatus, uid) {
  const now = new Date().toISOString();
  if (nextStatus === "received") {
    return {
      receivedAt: now,
      receivedBy: uid,
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
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage inbound bookings.") };
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

async function ensureBookingAccess(db, bookingId, requester) {
  const bookingSnap = await db.collection("seller_inbound_bookings").doc(bookingId).get();
  if (!bookingSnap.exists) return { error: err(404, "Booking Not Found", "Unable to find that inbound booking.") };
  const booking = bookingSnap.data() || {};
  if (isSystemAdminRequester(requester)) return { bookingRef: bookingSnap.ref, booking };
  const identifiers = getSellerIdentifiers(requester);
  const owned = [booking?.sellerCode, booking?.sellerSlug]
    .map((item) => toStr(item).toLowerCase())
    .filter(Boolean)
    .some((item) => identifiers.has(item));
  if (!owned) return { error: err(403, "Access Denied", "You can only manage inbound bookings for your own seller products.") };
  return { bookingRef: bookingSnap.ref, booking };
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
    return { error: err(403, "Access Denied", "You can only book inbound stock for your own seller products.") };
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
      if (!is8(productId)) {
        return err(400, "Invalid Product ID", "Provide an 8-digit productId.");
      }
      const access = await loadProductForSeller(ctx.db, productId, ctx.requester);
      if (access.error) return access.error;
      snap = await ctx.db
        .collection("seller_inbound_bookings")
        .where("productId", "==", productId)
        .orderBy("deliveryDate", "asc")
        .get();
    } else {
      const filters = getRequesterSellerFilters(ctx.requester);
      const query = isSystemAdminRequester(ctx.requester) && sellerCode
        ? ctx.db.collection("seller_inbound_bookings").where("sellerCode", "==", sellerCode)
        : isSystemAdminRequester(ctx.requester) && sellerSlug
          ? ctx.db.collection("seller_inbound_bookings").where("sellerSlug", "==", sellerSlug)
          : filters.sellerCodes.length
            ? ctx.db.collection("seller_inbound_bookings").where("sellerCode", "in", filters.sellerCodes.slice(0, 10))
            : filters.sellerSlugs.length
              ? ctx.db.collection("seller_inbound_bookings").where("sellerSlug", "in", filters.sellerSlugs.slice(0, 10))
              : null;
      if (!query) return ok({ items: [] });
      snap = await query.orderBy("deliveryDate", "asc").get();
    }

    return ok({
      items: snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) })),
    });
  } catch (e) {
    console.error("seller inbound bookings get failed:", e);
    return err(500, "Unexpected Error", "Unable to load inbound bookings.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function PATCH(req) {
  const ctx = await getRequesterContext();
  if (ctx.error) return ctx.error;

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = toStr(body?.bookingId || body?.id);
    if (!bookingId) return err(400, "Missing Booking ID", "Provide the inbound booking you want to update.");

    const access = await ensureBookingAccess(ctx.db, bookingId, ctx.requester);
    if (access.error) return access.error;
    const currentStatus = String(access.booking?.status || "").trim().toLowerCase();
    if (currentStatus === "cancelled") {
      return err(409, "Booking Cancelled", "Cancelled inbound bookings cannot be edited.");
    }
    const nextStatus = toStr(body?.status).toLowerCase();
    const isAdmin = isSystemAdminRequester(ctx.requester);
    if (nextStatus) {
      if (!isAdmin) {
        return err(403, "Access Denied", "Only Piessang admins can change inbound lifecycle statuses.");
      }
      const allowedTransitions = {
        scheduled: ["received", "completed", "cancelled"],
        received: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowedTransitions[currentStatus || "scheduled"]?.includes(nextStatus)) {
        return err(400, "Invalid Status Transition", "That inbound lifecycle change is not allowed.");
      }
    }

    const updates = {
      deliveryDate: toStr(body?.deliveryDate) || access.booking.deliveryDate || null,
      notes: toStr(body?.notes || "", "") || null,
      ...(nextStatus
        ? {
            status: nextStatus,
            lifecycleUpdatedAt: new Date().toISOString(),
            lifecycleUpdatedBy: ctx.sessionUser.uid,
            ...buildInboundStatusAudit(nextStatus, ctx.sessionUser.uid),
          }
        : {}),
      timestamps: {
        ...(access.booking.timestamps && typeof access.booking.timestamps === "object" ? access.booking.timestamps : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    };

    await access.bookingRef.set(updates, { merge: true });
    return ok({ message: "Inbound booking updated." });
  } catch (e) {
    console.error("seller inbound bookings patch failed:", e);
    return err(500, "Unexpected Error", "Unable to update the inbound booking.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}

export async function DELETE(req) {
  const ctx = await getRequesterContext();
  if (ctx.error) return ctx.error;

  try {
    const { searchParams } = new URL(req.url);
    const bookingId = toStr(searchParams.get("bookingId"));
    if (!bookingId) return err(400, "Missing Booking ID", "Provide the inbound booking you want to cancel.");

    const access = await ensureBookingAccess(ctx.db, bookingId, ctx.requester);
    if (access.error) return access.error;

    await access.bookingRef.set(
      {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: ctx.sessionUser.uid,
        timestamps: {
          ...(access.booking.timestamps && typeof access.booking.timestamps === "object" ? access.booking.timestamps : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    return ok({ message: "Inbound booking cancelled." });
  } catch (e) {
    console.error("seller inbound bookings delete failed:", e);
    return err(500, "Unexpected Error", "Unable to cancel the inbound booking.", {
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
    if (!is8(productId)) {
      return err(400, "Invalid Product ID", "Provide an 8-digit productId.");
    }

    const access = await loadProductForSeller(ctx.db, productId, ctx.requester);
    if (access.error) return access.error;
    const product = access.product;
    const fulfillmentMode = toStr(product?.fulfillment?.mode, "seller");
    if (fulfillmentMode !== "bevgo") {
      return err(409, "Invalid Fulfilment Mode", "Inbound bookings are only available for Piessang fulfilment products.");
    }

    const deliveryDate = toStr(body?.deliveryDate);
    if (!deliveryDate) {
      return err(400, "Missing Delivery Date", "Choose the date you plan to deliver this stock.");
    }

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

    if (!variants.length) {
      return err(400, "Missing Variants", "Add at least one inbound quantity for this booking.");
    }

    const createdAt = new Date().toISOString();
    const bookingRef = ctx.db.collection("seller_inbound_bookings").doc();
    await bookingRef.set({
      bookingId: bookingRef.id,
      productId,
      productTitle: toStr(product?.product?.title || productId),
      sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
      sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
      deliveryDate,
      notes: toStr(body?.notes || "", "") || null,
      status: "scheduled",
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
          type: "seller-inbound-booking-internal",
          to: ["admin@piessang.com"],
          data: {
            vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || product?.product?.sellerSlug || "Piessang seller"),
            sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
            productTitle: toStr(product?.product?.title || productId),
            productId,
            bookingId: bookingRef.id,
            deliveryDate,
            totalUnits: variants.reduce((sum, item) => sum + toInt(item.quantity, 0), 0),
            variants,
            notes: toStr(body?.notes || "", "") || "",
            createdByUid: ctx.sessionUser.uid,
            createdByEmail: toStr(ctx.requester?.email || ctx.requester?.seller?.contactEmail || ""),
          },
        });
      } catch (notificationError) {
        console.error("seller inbound internal email failed:", notificationError);
      }
    }

    return ok({
      booking: {
        id: bookingRef.id,
        bookingId: bookingRef.id,
        productId,
        deliveryDate,
        variants,
        totalUnits: variants.reduce((sum, item) => sum + toInt(item.quantity, 0), 0),
        status: "scheduled",
        createdAt,
      },
      message: "Inbound booking saved.",
    });
  } catch (e) {
    console.error("seller inbound bookings create failed:", e);
    return err(500, "Unexpected Error", "Unable to save the inbound booking.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
