export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { createOrderTimelineEvent, appendOrderTimelineEvent } from "@/lib/orders/timeline";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function isValidUrl(value) {
  const input = toStr(value);
  if (!input) return false;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getRequesterSellerIdentifiers(userData) {
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
      .map((item) => toLower(item))
      .filter(Boolean),
  );
}

export async function PATCH(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to update shipping tracking.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const admin = isSystemAdminUser(requester);
    const requesterIdentifiers = getRequesterSellerIdentifiers(requester);

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const courierName = toStr(body?.courierName);
    const trackingNumber = toStr(body?.trackingNumber);
    const trackingUrl = toStr(body?.trackingUrl);
    const notes = toStr(body?.notes).slice(0, 500);

    if (!orderId) return err(400, "Missing Order", "orderId is required.");
    if (!trackingNumber && !trackingUrl) {
      return err(400, "Missing Tracking", "Provide a tracking number or a tracking URL.");
    }
    if (trackingUrl && !isValidUrl(trackingUrl)) {
      return err(400, "Invalid Tracking URL", "trackingUrl must be a valid http or https URL.");
    }

    let effectiveSellerCode = sellerCode;
    let effectiveSellerSlug = sellerSlug;

    if (!admin && !requesterIdentifiers.has(toLower(sellerCode)) && !requesterIdentifiers.has(toLower(sellerSlug))) {
      const owner =
        (sellerCode ? await findSellerOwnerByCode(sellerCode) : null) ??
        (sellerSlug ? await findSellerOwnerBySlug(sellerSlug) : null);
      const ownerSeller = owner?.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
      const ownerIdentifiers = [ownerSeller?.sellerCode, ownerSeller?.sellerSlug].map((item) => toLower(item));
      if (!ownerIdentifiers.some((item) => item && requesterIdentifiers.has(item))) {
        return err(403, "Forbidden", "You do not have access to update tracking for this seller shipment.");
      }
      effectiveSellerCode = effectiveSellerCode || toStr(ownerSeller?.sellerCode);
      effectiveSellerSlug = effectiveSellerSlug || toStr(ownerSeller?.sellerSlug);
    }

    const orderRef = db.collection("orders_v2").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "This order could not be found.");
    const order = orderSnap.data() || {};
    const shippingBreakdown = Array.isArray(order?.shippingBreakdown) ? order.shippingBreakdown : [];
    if (!shippingBreakdown.length) return err(404, "Shipping Not Found", "No shipping breakdown exists on this order.");

    let updated = false;
    const updatedAt = new Date().toISOString();
    const nextBreakdown = shippingBreakdown.map((entry) => {
      const entryCode = toLower(entry?.sellerCode || entry?.seller_code || entry?.seller_key || "");
      const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
      const matches = Boolean(
        (effectiveSellerCode && entryCode === toLower(effectiveSellerCode)) ||
          (effectiveSellerSlug && entrySlug === toLower(effectiveSellerSlug)),
      );
      if (!matches) return entry;
      updated = true;
      return {
        ...entry,
        tracking: {
          ...(entry?.tracking && typeof entry.tracking === "object" ? entry.tracking : {}),
          courierName: courierName || null,
          trackingNumber: trackingNumber || null,
          trackingUrl: trackingUrl || null,
          notes: notes || "",
          updatedAt,
          updatedBy: sessionUser.uid,
        },
      };
    });

    if (!updated) {
      return err(404, "Seller Shipment Not Found", "No seller shipping group matched this order.");
    }

    const timelineEntry = createOrderTimelineEvent({
      type: "shipping_tracking_updated",
      title: "Shipping tracking updated",
      message: "Seller updated the shipment tracking details.",
      actorType: "seller",
      actorLabel: toStr(requester?.seller?.vendorName || requester?.account?.accountName || "Seller"),
      createdAt: updatedAt,
      sellerCode: effectiveSellerCode || null,
      sellerSlug: effectiveSellerSlug || null,
      metadata: {
        courierName: courierName || null,
        trackingNumber: trackingNumber || null,
        trackingUrl: trackingUrl || null,
      },
    });

    await orderRef.set(
      {
        shippingBreakdown: nextBreakdown,
        timeline: appendOrderTimelineEvent(order, timelineEntry),
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt,
        },
      },
      { merge: true },
    );

    return ok({
      orderId,
      tracking: {
        courierName,
        trackingNumber,
        trackingUrl,
        notes,
        updatedAt,
      },
    });
  } catch (error) {
    return err(500, "Tracking Update Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
