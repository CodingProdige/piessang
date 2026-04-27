export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { formatShippingDestinationLabel, getOrderShippingAddress, getSellerShippingEntry } from "@/lib/orders/shipping-breakdown";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function isSystemAdminUser(data) {
  return toLower(data?.system?.accessType || data?.systemAccessType) === "admin";
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

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load shipping handoff details.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const isSystemAdmin = isSystemAdminUser(requester);
    const requesterIdentifiers = getRequesterSellerIdentifiers(requester);

    const { searchParams } = new URL(req.url);
    const orderId = toStr(searchParams.get("orderId"));
    const sellerCode = toStr(searchParams.get("sellerCode"));
    const sellerSlug = toStr(searchParams.get("sellerSlug"));
    if (!orderId) return err(400, "Missing Order", "An orderId is required.");

    if (!isSystemAdmin && !requesterIdentifiers.has(toLower(sellerCode)) && !requesterIdentifiers.has(toLower(sellerSlug))) {
      const ownerDoc =
        (sellerCode ? await findSellerOwnerByCode(sellerCode) : null) ??
        (sellerSlug ? await findSellerOwnerBySlug(sellerSlug) : null);
      const ownerData = ownerDoc?.data || {};
      const ownerSeller = ownerData?.seller || {};
      const ownerIdentifiers = [ownerSeller?.sellerCode, ownerSeller?.sellerSlug].map((item) => toLower(item));
      if (!ownerIdentifiers.some((item) => item && requesterIdentifiers.has(item))) {
        return err(403, "Forbidden", "You do not have access to this seller order.");
      }
    }

    const orderSnap = await db.collection("orders_v2").doc(orderId).get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "This order could not be found.");
    const order = orderSnap.data() || {};
    const shippingEntry = getSellerShippingEntry(order, sellerCode, sellerSlug);
    if (!shippingEntry) {
      return err(404, "Shipping Not Found", "No shipping details were found for this seller slice.");
    }

    const address = getOrderShippingAddress(order);
    const items = (Array.isArray(order?.items) ? order.items : []).filter((item) => {
      const product = item?.product_snapshot || item?.product || {};
      const code = toLower(product?.product?.sellerCode || product?.seller?.sellerCode || "");
      const slug = toLower(product?.product?.sellerSlug || product?.seller?.sellerSlug || "");
      return Boolean((sellerCode && code === toLower(sellerCode)) || (sellerSlug && slug === toLower(sellerSlug)));
    });

    return ok({
      details: {
        type: "shipping",
        ruleName: toStr(shippingEntry?.matchedRuleName || "Shipping"),
        matchType: toStr(shippingEntry?.matchType || ""),
        destination: {
          label:
            formatShippingDestinationLabel({
              city: address?.city,
              province: address?.province,
              postalCode: address?.postalCode,
              country: address?.country,
            }) || formatShippingDestinationLabel(shippingEntry?.destination || {}),
          city: address?.city || shippingEntry?.destination?.city || "",
          province: address?.province || shippingEntry?.destination?.province || "",
          postalCode: address?.postalCode || shippingEntry?.destination?.postalCode || "",
          country: address?.country || shippingEntry?.destination?.country || shippingEntry?.destination?.countryCode || "",
        },
        estimatedDeliveryDays: shippingEntry?.estimatedDeliveryDays || { min: 0, max: 0 },
        shippingFee: Number(shippingEntry?.finalShippingFee || 0),
        status: toStr(shippingEntry?.status || "pending"),
        tracking: shippingEntry?.tracking || null,
        items: items.map((item) => ({
          title: toStr(item?.product_snapshot?.product?.title || item?.product_snapshot?.title || "Product"),
          variant: toStr(item?.selected_variant_snapshot?.label || item?.selected_variant_snapshot?.variant_id || ""),
          quantity: Number(item?.quantity || 0),
        })),
        note: "Use the matched shipping rule and destination details when fulfilling this seller shipment.",
      },
    });
  } catch (error) {
    return err(500, "Shipping Detail Lookup Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
