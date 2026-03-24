export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { buildOrderDeliveryProgress, enrichOrderItemFulfillment } from "@/lib/orders/fulfillment-progress";

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

function getLineSellerIdentifiers(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
    sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
    vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || ""),
  };
}

function getLineFulfillmentMode(item) {
  const product = item?.product_snapshot || item?.product || {};
  return toLower(product?.fulfillment?.mode) === "bevgo" ? "bevgo" : "seller";
}

function getLineQuantity(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLinePriceIncl(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const lineTotals = item?.line_totals && typeof item.line_totals === "object" ? item.line_totals : {};
  const explicit = Number(lineTotals?.total_incl);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const price = Number(variant?.pricing?.selling_price_incl || 0);
  return Number.isFinite(price) ? price * getLineQuantity(item) : 0;
}

function buildSellerSlice(orderId, order, items, sellerIdentity) {
  const enrichedItems = items.map((item) => enrichOrderItemFulfillment(item, order));
  const selfFulfilmentLines = enrichedItems.filter((item) => getLineFulfillmentMode(item) === "seller");
  const piessangFulfilmentLines = enrichedItems.filter((item) => getLineFulfillmentMode(item) === "bevgo");
  const allQty = items.reduce((sum, item) => sum + getLineQuantity(item), 0);
  const subtotalIncl = Number(items.reduce((sum, item) => sum + getLinePriceIncl(item), 0).toFixed(2));
  const orderStatus = toLower(order?.order?.status?.order || "");
  const paymentStatus = toLower(order?.payment?.status || order?.order?.status?.payment || "");
  const fulfillmentStatus = toLower(order?.order?.status?.fulfillment || "");
  const deliveryProgress = buildOrderDeliveryProgress({ ...order, items: enrichedItems }).progress;
  const newOrder = ["draft", "confirmed"].includes(orderStatus);
  const fulfilled = orderStatus === "completed" || fulfillmentStatus === "delivered";
  const unfulfilled = !fulfilled && orderStatus !== "cancelled";

  return {
    sellerCode: sellerIdentity.sellerCode || "",
    sellerSlug: sellerIdentity.sellerSlug || "",
    vendorName: sellerIdentity.vendorName || "",
    orderId,
    orderNumber: toStr(order?.order?.orderNumber || ""),
    createdAt: toStr(order?.timestamps?.createdAt || ""),
    customerName: toStr(
      order?.customer_snapshot?.account?.accountName ||
        order?.customer_snapshot?.business?.companyName ||
        order?.customer_snapshot?.personal?.fullName ||
        "",
    ),
    orderStatus,
    paymentStatus,
    fulfillmentStatus,
    deliveryProgress,
    counts: {
      items: enrichedItems.length,
      quantity: allQty,
      selfFulfilment: selfFulfilmentLines.length,
      piessangFulfilment: piessangFulfilmentLines.length,
    },
    totals: {
      subtotalIncl,
    },
    flags: {
      new: newOrder,
      unfulfilled,
      fulfilled,
    },
    lines: {
      selfFulfilment: selfFulfilmentLines,
      piessangFulfilment: piessangFulfilmentLines,
    },
  };
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load seller orders.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const isSystemAdmin = isSystemAdminUser(requester);

    const { searchParams } = new URL(req.url);
    const sellerCodeParam = toStr(searchParams.get("sellerCode"));
    const sellerSlugParam = toStr(searchParams.get("sellerSlug"));
    const filter = toLower(searchParams.get("filter") || "all");

    const requesterIdentifiers = getRequesterSellerIdentifiers(requester);
    const scopeSellerCode = isSystemAdmin ? sellerCodeParam : "";
    const scopeSellerSlug = isSystemAdmin ? sellerSlugParam : "";

    const snap = await db.collection("orders_v2").get();
    const slices = [];

    for (const docSnap of snap.docs) {
      const order = docSnap.data() || {};
      const items = Array.isArray(order?.items) ? order.items : [];
      const sellerItems = items.filter((item) => {
        const lineSeller = getLineSellerIdentifiers(item);
        const code = toLower(lineSeller.sellerCode);
        const slug = toLower(lineSeller.sellerSlug);
        if (scopeSellerCode) return code === toLower(scopeSellerCode);
        if (scopeSellerSlug) return slug === toLower(scopeSellerSlug);
        return requesterIdentifiers.has(code) || requesterIdentifiers.has(slug);
      });
      if (!sellerItems.length) continue;

      const sellerIdentity = getLineSellerIdentifiers(sellerItems[0]);
      const slice = buildSellerSlice(docSnap.id, order, sellerItems, sellerIdentity);
      if (filter === "new" && !slice.flags.new) continue;
      if (filter === "unfulfilled" && !slice.flags.unfulfilled) continue;
      if (filter === "fulfilled" && !slice.flags.fulfilled) continue;
      slices.push(slice);
    }

    slices.sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));

    const counts = {
      all: slices.length,
      new: slices.filter((item) => item.flags.new).length,
      unfulfilled: slices.filter((item) => item.flags.unfulfilled).length,
      fulfilled: slices.filter((item) => item.flags.fulfilled).length,
    };

    return ok({ items: slices, counts });
  } catch (e) {
    console.error("seller/orders/list failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller orders.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
