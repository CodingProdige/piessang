import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { summarizeMarketplaceProductEngagement } from "@/lib/analytics/product-engagement";
import {
  getFrozenOrderPayableIncl,
  getFrozenOrderProductsIncl,
  getFrozenLineTotalIncl,
} from "@/lib/orders/frozen-money";
import { normalizeMoneyAmount } from "@/lib/money";

export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sentenceCase(value, fallback = "Unknown") {
  const normalized = toStr(value).replace(/_/g, " ");
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDate(value) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function daysForTimeframe(value) {
  if (value === "7d") return 7;
  if (value === "90d") return 90;
  return 30;
}

function isWithinDays(value, days, offsetDays = 0) {
  const input = toStr(value);
  if (!input) return false;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - offsetDays);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function buildTimeSeries(items, days, getDate, getValue) {
  return Array.from({ length: days }, (_, index) => {
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() - (days - 1 - index));
    const key = target.toISOString().slice(0, 10);
    const bucketItems = items.filter((item) => toStr(getDate(item)).slice(0, 10) === key);
    return {
      key,
      label: new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short" }).format(target),
      value: bucketItems.reduce((sum, item) => sum + getValue(item), 0),
      count: bucketItems.length,
    };
  });
}

function getOrderCreatedAt(order = {}) {
  return toStr(
    order?.lifecycle?.createdAt ||
      order?.meta?.createdAt ||
      order?.timestamps?.createdAt ||
      order?.createdAt,
  );
}

function getOrderCustomer(order = {}) {
  return {
    id: toStr(order?.customer?.customerId || order?.customerId || order?.meta?.orderedFor),
    name: toStr(order?.customer?.accountName || order?.customer?.name || order?.customer?.email || "Customer"),
    last_order_at: getOrderCreatedAt(order),
  };
}

function getOrderPaymentStatus(order = {}) {
  return toStr(order?.lifecycle?.paymentStatus || order?.status?.payment || order?.payment?.status || "unknown").toLowerCase();
}

function getOrderFulfillmentStatus(order = {}) {
  return toStr(order?.lifecycle?.fulfillmentStatus || order?.status?.fulfillment || "unknown").toLowerCase();
}

function isFinanciallyCountableOrder(order = {}) {
  const paymentStatus = getOrderPaymentStatus(order);
  const fulfillmentStatus = getOrderFulfillmentStatus(order);
  return fulfillmentStatus !== "cancelled" && !["refunded", "partial_refund"].includes(paymentStatus);
}

function getOrderChannel(order = {}) {
  return sentenceCase(order?.meta?.channel || order?.channel || "Online store", "Online store");
}

function getOrderRegion(order = {}) {
  return sentenceCase(
    order?.delivery?.address_snapshot?.province ||
      order?.delivery_snapshot?.address?.province ||
      order?.delivery_snapshot?.address_snapshot?.province ||
      order?.delivery?.address_snapshot?.city ||
      order?.delivery?.address_snapshot?.label ||
      "Unknown",
  );
}

function getOrderDeliveryLabel(order = {}) {
  return sentenceCase(order?.delivery?.method || order?.delivery_snapshot?.method || "Unknown");
}

function getOrderAmount(order = {}) {
  const payable = getFrozenOrderPayableIncl(order);
  if (payable > 0) return payable;

  const productsIncl = getFrozenOrderProductsIncl(order);
  const deliveryFeeIncl = toNum(
    order?.totals?.delivery_fee_incl ??
      order?.pricing_snapshot?.deliveryFeeIncl ??
      order?.delivery_snapshot?.amountIncl ??
      order?.delivery?.fee?.amount_incl
  );

  return normalizeMoneyAmount(productsIncl + deliveryFeeIncl);
}

function getSellerCodes(order = {}) {
  const slices = Array.isArray(order?.seller_slices) ? order.seller_slices : [];
  return slices
    .map((slice) => toStr(slice?.sellerCode || slice?.seller?.sellerCode || slice?.seller_snapshot?.sellerCode))
    .filter(Boolean);
}

function getOrderLines(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((item) => ({
    title: toStr(item?.product_snapshot?.product?.title || item?.product_snapshot?.name || item?.name || "Product"),
    revenue: getFrozenLineTotalIncl(item),
    units: Math.max(1, toNum(item?.quantity)),
  }));
}

function summarize(items) {
  const revenue = items.reduce((sum, item) => sum + toNum(item?.amount), 0);
  const units = items.reduce((sum, item) => sum + toNum(item?.units), 0);
  const delivered = items.filter((item) => item?.delivered).length;
  const overdue = items.filter((item) => item?.overdue).length;
  return {
    revenue,
    orders: items.length,
    units,
    delivered,
    overdue,
    avgOrder: items.length ? revenue / items.length : 0,
  };
}

export async function GET(request) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load admin analytics.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "System admin access required.");
    }

    const { searchParams } = new URL(request.url);
    const timeframe = toStr(searchParams.get("timeframe"), "30d").toLowerCase();
    const days = daysForTimeframe(timeframe);

    const [ordersSnap, returnsSnap, productsSnap, usersSnap, engagementCurrent, engagementPrevious] = await Promise.all([
      db.collection("orders_v2").get(),
      db.collection("returns_v2").get(),
      db.collection("products_v2").get(),
      db.collection("users").get(),
      summarizeMarketplaceProductEngagement({ days, offsetDays: 0 }),
      summarizeMarketplaceProductEngagement({ days, offsetDays: days }),
    ]);

    const orders = ordersSnap.docs.map((docSnap) => ({ docId: docSnap.id, ...(docSnap.data() || {}) }));
    const currentOrderRows = orders
      .filter((order) => isWithinDays(getOrderCreatedAt(order), days, 0) && isFinanciallyCountableOrder(order))
      .map((order) => ({
        orderId: toStr(order.docId),
        orderNumber: toStr(order?.meta?.orderNumber || order?.orderNumber || order.docId),
        createdAt: getOrderCreatedAt(order),
        customerName: getOrderCustomer(order).name,
        amount: getOrderAmount(order),
        units: Array.isArray(order?.items) ? order.items.reduce((sum, item) => sum + Math.max(1, toNum(item?.quantity)), 0) : 0,
        delivered: ["delivered", "completed"].includes(getOrderFulfillmentStatus(order)),
        overdue:
          order?.delivery_progress?.isComplete !== true &&
          !["delivered", "completed", "cancelled"].includes(getOrderFulfillmentStatus(order)) &&
          order?.fulfilment_deadline?.overdue === true,
        channel: getOrderChannel(order),
        region: getOrderRegion(order),
        deliveryLabel: getOrderDeliveryLabel(order),
      }));
    const previousOrderRows = orders
      .filter((order) => isWithinDays(getOrderCreatedAt(order), days, days) && isFinanciallyCountableOrder(order))
      .map((order) => ({
        amount: getOrderAmount(order),
        units: Array.isArray(order?.items) ? order.items.reduce((sum, item) => sum + Math.max(1, toNum(item?.quantity)), 0) : 0,
        delivered: ["delivered", "completed"].includes(getOrderFulfillmentStatus(order)),
        overdue:
          order?.delivery_progress?.isComplete !== true &&
          !["delivered", "completed", "cancelled"].includes(getOrderFulfillmentStatus(order)) &&
          order?.fulfilment_deadline?.overdue === true,
      }));

    const current = summarize(currentOrderRows);
    const previous = summarize(previousOrderRows);

    const salesSeries = buildTimeSeries(
      currentOrderRows,
      days,
      (order) => order.createdAt,
      (order) => toNum(order.amount),
    );
    const orderSeries = buildTimeSeries(currentOrderRows, days, (order) => order.createdAt, () => 1);

    const channelRevenue = new Map();
    const deliveryMix = new Map();
    const regionMix = new Map();
    const topProductsMap = new Map();
    for (const order of orders.filter((item) => isWithinDays(getOrderCreatedAt(item), days, 0) && isFinanciallyCountableOrder(item))) {
      const amount = getOrderAmount(order);
      const channel = getOrderChannel(order);
      const region = getOrderRegion(order);
      const delivery = getOrderDeliveryLabel(order);
      channelRevenue.set(channel, (channelRevenue.get(channel) || 0) + amount);
      regionMix.set(region, (regionMix.get(region) || 0) + 1);
      deliveryMix.set(delivery, (deliveryMix.get(delivery) || 0) + 1);
      for (const line of getOrderLines(order)) {
        const key = line.title.toLowerCase();
        const currentEntry = topProductsMap.get(key) || { title: line.title, revenue: 0, units: 0, orders: 0 };
        currentEntry.revenue += line.revenue;
        currentEntry.units += line.units;
        currentEntry.orders += 1;
        topProductsMap.set(key, currentEntry);
      }
    }

    const topProducts = Array.from(topProductsMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

    const customerMap = new Map();
    for (const order of orders.filter((item) => isWithinDays(getOrderCreatedAt(item), days, 0) && isFinanciallyCountableOrder(item))) {
      const customer = getOrderCustomer(order);
      const key = customer.id || customer.name.toLowerCase();
      const currentEntry = customerMap.get(key) || { ...customer, orders: 0 };
      currentEntry.orders += 1;
      currentEntry.last_order_at = customer.last_order_at;
      customerMap.set(key, currentEntry);
    }
    const customerList = Array.from(customerMap.values());
    const repeatCustomers = customerList.filter((customer) => toNum(customer.orders) > 1);
    const lastCustomer =
      customerList.slice().sort((left, right) => new Date(toStr(right.last_order_at)).getTime() - new Date(toStr(left.last_order_at)).getTime())[0] || null;

    const currentReturns = returnsSnap.docs
      .map((docSnap) => ({ docId: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((entry) => isWithinDays(entry?.timestamps?.createdAt, days, 0));
    const openReturns = currentReturns.filter((entry) => {
      const status = toStr(entry?.return?.status).toLowerCase();
      return status && !["approved", "refunded", "rejected", "closed"].includes(status);
    });

    const products = productsSnap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
    const liveProducts = products.filter((entry) => entry?.data?.placement?.isActive);
    const outOfStockProducts = liveProducts.filter((entry) => {
      const variants = Array.isArray(entry?.data?.variants) ? entry.data.variants : [];
      if (!variants.length) return true;
      return variants.every((variant) => toNum(variant?.inventory?.quantity ?? variant?.quantity) <= 0);
    });
    const onSaleProducts = liveProducts.filter((entry) => {
      const variants = Array.isArray(entry?.data?.variants) ? entry.data.variants : [];
      return variants.some((variant) => variant?.sale?.is_on_sale === true);
    });

    const sellers = usersSnap.docs
      .map((docSnap) => docSnap.data() || {})
      .filter((entry) => toStr(entry?.seller?.sellerSlug || entry?.seller?.activeSellerSlug));
    const activeSellerCount = sellers.filter((entry) => toStr(entry?.seller?.status).toLowerCase() !== "blocked").length;

    return ok({
      marketplaceName: "Marketplace",
      timeframe,
      current,
      previous,
      salesSeries,
      orderSeries,
      channelRevenue: Array.from(channelRevenue.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5),
      deliveryMix: Array.from(deliveryMix.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 4),
      regionMix: Array.from(regionMix.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5),
      topProducts,
      totalCustomers: customerList.length,
      repeatRate: customerList.length ? Math.round((repeatCustomers.length / customerList.length) * 100) : 0,
      lastCustomer,
      currentReturns,
      openReturns,
      liveProductsCount: liveProducts.length,
      outOfStockCount: outOfStockProducts.length,
      onSaleCount: onSaleProducts.length,
      recentOrders: currentOrderRows
        .slice()
        .sort((a, b) => new Date(toStr(b.createdAt)).getTime() - new Date(toStr(a.createdAt)).getTime())
        .slice(0, 5),
      engagementCurrent: {
        impressions: toNum(engagementCurrent?.totals?.impressions),
        clicks: toNum(engagementCurrent?.totals?.clicks),
        hovers: toNum(engagementCurrent?.totals?.hovers),
        productViews: toNum(engagementCurrent?.totals?.productViews),
        ctr: toNum(engagementCurrent?.totals?.ctr),
      },
      engagementPrevious: {
        impressions: toNum(engagementPrevious?.totals?.impressions),
        clicks: toNum(engagementPrevious?.totals?.clicks),
        hovers: toNum(engagementPrevious?.totals?.hovers),
        productViews: toNum(engagementPrevious?.totals?.productViews),
        ctr: toNum(engagementPrevious?.totals?.ctr),
      },
      topEngagementProducts: Array.isArray(engagementCurrent?.topProducts) ? engagementCurrent.topProducts : [],
      engagementSeries: Array.isArray(engagementCurrent?.daily)
        ? engagementCurrent.daily.map((entry) => ({
            label: formatDate(entry?.dayKey),
            value: toNum(entry?.productViews),
            count: toNum(entry?.clicks),
          }))
        : [],
      activeSellerCount,
      orderSellerCount: Array.from(
        orders
          .filter((item) => isWithinDays(getOrderCreatedAt(item), days, 0) && isFinanciallyCountableOrder(item))
          .reduce((acc, order) => {
            for (const sellerCode of getSellerCodes(order)) acc.add(sellerCode);
            return acc;
          }, new Set()),
      ).length,
    });
  } catch (error) {
    console.error("admin analytics failed:", error);
    return err(500, "Server Error", "Unable to load admin analytics right now.");
  }
}
