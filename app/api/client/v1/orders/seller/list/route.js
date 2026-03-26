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

function getSellerDeliveryDetails(order, sellerIdentity) {
  const snapshot = order?.delivery_snapshot && typeof order.delivery_snapshot === "object" ? order.delivery_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const breakdown = Array.isArray(snapshot?.sellerDeliveryBreakdown)
    ? snapshot.sellerDeliveryBreakdown
    : Array.isArray(delivery?.fee?.seller_breakdown)
      ? delivery.fee.seller_breakdown
      : [];

  const sellerCode = toLower(sellerIdentity?.sellerCode);
  const sellerSlug = toLower(sellerIdentity?.sellerSlug);
  const entry = breakdown.find((item) => {
    const entryCode = toLower(item?.sellerCode || item?.seller_code || item?.seller_key || "");
    const entrySlug = toLower(item?.sellerSlug || item?.seller_slug || "");
    return Boolean(
      (sellerCode && entryCode === sellerCode) ||
      (sellerSlug && entrySlug === sellerSlug),
    );
  }) || null;

  const address = snapshot?.address || delivery?.address_snapshot || null;
  const destination = [toStr(address?.suburb), toStr(address?.city), toStr(address?.province || address?.stateProvinceRegion), toStr(address?.country)]
    .filter(Boolean)
    .join(", ");

  if (!entry) {
    return {
      type: "unknown",
      label: "Delivery method still needs to be confirmed",
      amountIncl: 0,
      leadTimeDays: null,
      matchedRuleLabel: "",
      destination,
      instructions: "We could not match a saved delivery method for this seller slice yet.",
      trackingMode: "hidden",
    };
  }

  const deliveryType = toLower(entry?.delivery_type || entry?.method || entry?.type || "");
  if (deliveryType === "collection") {
    return {
      type: "collection",
      label: toStr(entry?.label || "Customer collection"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "The customer chose collection, so you should prepare these items for pickup instead of dispatching them.",
      trackingMode: "hidden",
    };
  }
  if (deliveryType === "direct_delivery") {
    return {
      type: "direct_delivery",
      label: toStr(entry?.label || "Direct delivery"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "This order falls within your direct delivery coverage, so you should handle the delivery yourself instead of using courier tracking.",
      trackingMode: "direct",
    };
  }
  if (deliveryType === "shipping") {
    return {
      type: "shipping",
      label: toStr(entry?.label || "Shipping"),
      amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
      leadTimeDays: entry?.lead_time_days ?? null,
      matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
      destination,
      instructions: "This order uses your shipping settings, so you can add courier and tracking details when you dispatch it.",
      trackingMode: "courier",
    };
  }

  return {
    type: deliveryType || "unknown",
    label: toStr(entry?.label || "Delivery method"),
    amountIncl: Number(entry?.amountIncl ?? entry?.amount_incl ?? 0) || 0,
    leadTimeDays: entry?.lead_time_days ?? null,
    matchedRuleLabel: toStr(entry?.matched_rule_label || ""),
    destination,
    instructions: "Use the delivery method saved on this order when you fulfil it.",
    trackingMode: "hidden",
  };
}

function getSellerCustomerContact(order) {
  const snapshot = order?.customer_snapshot || {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const address = order?.delivery_snapshot?.address || delivery?.address_snapshot || null;
  const phone =
    toStr(address?.phoneNumber) ||
    toStr(snapshot?.phoneNumber) ||
    toStr(snapshot?.account?.phoneNumber) ||
    toStr(snapshot?.personal?.phoneNumber) ||
    "";
  const recipientName =
    toStr(address?.recipientName) ||
    toStr(snapshot?.account?.accountName) ||
    toStr(snapshot?.business?.companyName) ||
    toStr(snapshot?.personal?.fullName) ||
    "Customer";
  const destination = [
    toStr(address?.streetAddress),
    toStr(address?.addressLine2),
    toStr(address?.suburb),
    toStr(address?.city),
    toStr(address?.stateProvinceRegion || address?.province),
    toStr(address?.postalCode),
    toStr(address?.country),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    recipientName,
    phone,
    destination,
    notes: toStr(address?.instructions || address?.deliveryInstructions || delivery?.notes || ""),
  };
}

function buildSellerSlice(orderId, order, items, sellerIdentity) {
  const enrichedItems = items.map((item) => enrichOrderItemFulfillment(item, order));
  const selfFulfilmentLines = enrichedItems.filter((item) => getLineFulfillmentMode(item) === "seller");
  const piessangFulfilmentLines = enrichedItems.filter((item) => getLineFulfillmentMode(item) === "bevgo");
  const allQty = items.reduce((sum, item) => sum + getLineQuantity(item), 0);
  const subtotalIncl = Number(items.reduce((sum, item) => sum + getLinePriceIncl(item), 0).toFixed(2));
  const orderStatus = toLower(order?.lifecycle?.orderStatus || order?.order?.status?.order || "");
  const paymentStatus = toLower(order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment || "");
  const fulfillmentStatus = toLower(order?.lifecycle?.fulfillmentStatus || order?.order?.status?.fulfillment || "");
  const deliveryProgress = buildOrderDeliveryProgress({ ...order, items: enrichedItems }).progress;
  const deliveryOption = getSellerDeliveryDetails(order, sellerIdentity);
  const customerContact = getSellerCustomerContact(order);
  const newOrder = ["payment_pending", "confirmed"].includes(orderStatus);
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
    deliveryOption,
    customerContact,
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
    const allSlices = [];

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
      allSlices.push(slice);
    }

    const counts = {
      all: allSlices.length,
      new: allSlices.filter((item) => item.flags.new).length,
      unfulfilled: allSlices.filter((item) => item.flags.unfulfilled).length,
      fulfilled: allSlices.filter((item) => item.flags.fulfilled).length,
    };

    const slices = allSlices.filter((slice) => {
      if (filter === "new") return slice.flags.new;
      if (filter === "unfulfilled") return slice.flags.unfulfilled;
      if (filter === "fulfilled") return slice.flags.fulfilled;
      return true;
    });

    slices.sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));

    return ok({ items: slices, counts });
  } catch (e) {
    console.error("seller/orders/list failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller orders.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
