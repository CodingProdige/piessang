import { getAdminDb } from "@/lib/firebase/admin";
import { getFrozenLineTotalIncl, getFrozenOrderPayableIncl, getFrozenOrderProductsIncl } from "@/lib/orders/frozen-money";
import { normalizeMoneyAmount } from "@/lib/money";

const nowIso = () => new Date().toISOString();
const ANALYTICS_TIMEZONE = "Africa/Johannesburg";

function parseDateMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasCartItems(cart) {
  return Array.isArray(cart?.items) && cart.items.some((item) => Number(item?.quantity || 0) > 0);
}

function getTodayKeyInTimezone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getTodayStartMillis() {
  const todayKey = getTodayKeyInTimezone();
  return Date.parse(`${todayKey}T00:00:00+02:00`);
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sentenceCase(value, fallback = "Unknown") {
  const normalized = toStr(value).replace(/_/g, " ");
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

function getOrderLocationLabel(order = {}) {
  const address =
    order?.delivery?.address_snapshot ||
    order?.delivery_snapshot?.address ||
    order?.delivery_snapshot?.address_snapshot ||
    {};

  const parts = [
    toStr(address?.country || "South Africa"),
    toStr(address?.province || address?.stateProvinceRegion),
    toStr(address?.city || address?.suburb),
  ].filter(Boolean);

  return parts.join(" · ") || "Unknown";
}

function getCustomerKey(order = {}) {
  return toStr(order?.customer?.customerId || order?.customerId || order?.meta?.orderedFor || order?.customer_snapshot?.account?.email);
}

function getProductTitle(item = {}) {
  return toStr(
    item?.product_snapshot?.product?.title ||
      item?.product_snapshot?.name ||
      item?.product?.product?.title ||
      item?.product?.title ||
      "Product"
  );
}

export async function refreshLiveCommerceSnapshot() {
  const db = getAdminDb();
  if (!db) return null;

  const activeCartWindowMs = Math.max(5, Number(process.env.LIVE_ACTIVE_CART_WINDOW_MINUTES || 60)) * 60 * 1000;
  const checkoutWindowMs = Math.max(5, Number(process.env.LIVE_CHECKOUT_WINDOW_MINUTES || 30)) * 60 * 1000;
  const purchaseWindowMs = Math.max(1, Number(process.env.LIVE_PURCHASE_WINDOW_HOURS || 24)) * 60 * 60 * 1000;
  const nowMs = Date.now();
  const todayStartMs = getTodayStartMillis();
  const todayKey = getTodayKeyInTimezone();

  const [cartSnap, orderSnap, eventSnap, visitorSnap, liveViewsSnap] = await Promise.all([
    db.collection("carts").get(),
    db.collection("orders_v2").get(),
    db.collection("analytics_live_events").get(),
    db.collection("analytics_daily_visitors").doc(todayKey).get(),
    db.collection("analytics_live_product_views").get(),
  ]);

  let activeCarts = 0;
  let checkingOut = 0;
  let purchased = 0;
  let checkoutSessionsToday = 0;
  let convertedCartsToday = 0;
  let ordersToday = 0;
  let totalSalesToday = 0;
  const topSoldProducts = new Map();
  const locationCounts = new Map();
  const returningCounts = { new: 0, returning: 0 };
  const recentActivity = [];
  const allPaidOrders = [];

  const viewerCountRightNow = liveViewsSnap.docs.reduce((sum, docSnap) => {
    const value = docSnap.data() || {};
    return sum + Math.max(0, Number(value?.viewerCount || 0));
  }, 0);

  for (const docSnap of cartSnap.docs) {
    const cart = docSnap.data() || {};
    if (!hasCartItems(cart)) continue;
    const status = String(cart?.cart?.status || "active").trim().toLowerCase();
    const updatedAtMs = parseDateMillis(cart?.timestamps?.updatedAt);
    if (status === "checkout") {
      if (!updatedAtMs || nowMs - updatedAtMs <= checkoutWindowMs) checkingOut += 1;
      continue;
    }
    if (!updatedAtMs || nowMs - updatedAtMs <= activeCartWindowMs) activeCarts += 1;
  }

  for (const docSnap of orderSnap.docs) {
    const order = docSnap.data() || {};
    const paymentStatus = String(order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment || "").trim().toLowerCase();
    if (paymentStatus !== "paid") continue;
    allPaidOrders.push(order);
    const paidAtMs =
      parseDateMillis(order?.payment_summary?.paidAt) ||
      parseDateMillis(order?.payment?.paidAt) ||
      parseDateMillis(order?.timestamps?.updatedAt);
    if (!paidAtMs || nowMs - paidAtMs <= purchaseWindowMs) purchased += 1;
    if (paidAtMs && paidAtMs >= todayStartMs) {
      convertedCartsToday += 1;
      ordersToday += 1;
      totalSalesToday = normalizeMoneyAmount(totalSalesToday + getOrderAmount(order));
      const locationLabel = getOrderLocationLabel(order);
      locationCounts.set(locationLabel, (locationCounts.get(locationLabel) || 0) + 1);
      recentActivity.push({
        kind: "order",
        title: toStr(order?.order?.orderNumber || order?.meta?.orderNumber || docSnap.id, "Order"),
        detail: `${locationLabel} • ${normalizeMoneyAmount(getOrderAmount(order)).toFixed(2)}`,
        createdAt: new Date(paidAtMs).toISOString(),
      });
      const items = Array.isArray(order?.items) ? order.items : [];
      for (const item of items) {
        const product = item?.product_snapshot || item?.product || {};
        const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
        const productId = String(
          item?.product_unique_id ||
            product?.product?.unique_id ||
            product?.unique_id ||
            product?.docId ||
            "",
        ).trim();
        const title = getProductTitle(item) || String(variant?.label || "Product").trim();
        const quantity = Math.max(0, Number(item?.quantity || 0));
        if (!productId || quantity <= 0) continue;
        const revenue = getFrozenLineTotalIncl(item);
        const existing = topSoldProducts.get(productId) || { productId, title, unitsSold: 0, revenue: 0 };
        existing.unitsSold += quantity;
        existing.revenue = normalizeMoneyAmount(existing.revenue + revenue);
        topSoldProducts.set(productId, existing);
      }
    }
  }

  const priorPaidByCustomer = new Map();
  for (const order of allPaidOrders) {
    const paidAtMs =
      parseDateMillis(order?.payment_summary?.paidAt) ||
      parseDateMillis(order?.payment?.paidAt) ||
      parseDateMillis(order?.timestamps?.updatedAt);
    const customerKey = getCustomerKey(order);
    if (!customerKey) continue;
    const current = priorPaidByCustomer.get(customerKey) || [];
    current.push(paidAtMs);
    priorPaidByCustomer.set(customerKey, current);
  }

  for (const order of allPaidOrders) {
    const paidAtMs =
      parseDateMillis(order?.payment_summary?.paidAt) ||
      parseDateMillis(order?.payment?.paidAt) ||
      parseDateMillis(order?.timestamps?.updatedAt);
    if (!paidAtMs || paidAtMs < todayStartMs) continue;
    const customerKey = getCustomerKey(order);
    const history = (customerKey ? priorPaidByCustomer.get(customerKey) : []) || [];
    const previousPurchases = history.filter((value) => value && value < todayStartMs).length;
    if (previousPurchases > 0) returningCounts.returning += 1;
    else returningCounts.new += 1;
  }

  for (const docSnap of eventSnap.docs) {
    const event = docSnap.data() || {};
    const type = String(event?.type || "").trim().toLowerCase();
    const createdAtMs = parseDateMillis(event?.createdAt);
    if (!createdAtMs || createdAtMs < todayStartMs) continue;
    if (type === "checkout_started") checkoutSessionsToday += 1;
    recentActivity.push({
      kind: type || "event",
      title: sentenceCase(type || "event"),
      detail: `${toNum(event?.payload?.itemCount)} item${toNum(event?.payload?.itemCount) === 1 ? "" : "s"}`,
      createdAt: toStr(event?.createdAt),
    });
  }

  const todayVisitors = Number(visitorSnap.exists ? visitorSnap.data()?.totalVisitors || 0 : 0);
  const topSoldProductsToday = Array.from(topSoldProducts.values())
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5);

  const sessionsByLocation = Array.from(locationCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const totalCustomerBehavior = activeCarts + checkingOut + purchased;
  const customerBehavior = [
    { label: "Active carts", value: activeCarts, color: "#f59e0b" },
    { label: "Checking out", value: checkingOut, color: "#3b82f6" },
    { label: "Purchased", value: purchased, color: "#10b981" },
  ];

  const snapshot = {
    activeCarts,
    checkingOut,
    purchased,
    viewerCountRightNow,
    todayVisitors,
    checkoutSessionsToday,
    convertedCartsToday,
    totalSalesToday: normalizeMoneyAmount(totalSalesToday),
    ordersToday,
    sessionsToday: todayVisitors,
    customerBehavior,
    customerBehaviorTotal: totalCustomerBehavior,
    sessionsByLocation,
    newVsReturning: {
      newCustomers: returningCounts.new,
      returningCustomers: returningCounts.returning,
    },
    topSoldProductsToday,
    recentActivity: recentActivity
      .filter((entry) => toStr(entry?.title))
      .sort((left, right) => parseDateMillis(right?.createdAt) - parseDateMillis(left?.createdAt))
      .slice(0, 8),
    windows: {
      activeCartMinutes: activeCartWindowMs / 60000,
      checkoutMinutes: checkoutWindowMs / 60000,
      purchasedHours: purchaseWindowMs / 3600000,
    },
    updatedAt: nowIso(),
  };

  await db.collection("analytics_live").doc("commerce").set(snapshot, { merge: true });
  return snapshot;
}

export async function recordLiveCommerceEvent(type, payload = {}) {
  const db = getAdminDb();
  if (!db || !type) return null;

  await db.collection("analytics_live_events").add({
    type: String(type).trim(),
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: nowIso(),
  }).catch(() => null);

  return refreshLiveCommerceSnapshot().catch(() => null);
}
