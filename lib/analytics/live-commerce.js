import { getAdminDb } from "@/lib/firebase/admin";

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

export async function refreshLiveCommerceSnapshot() {
  const db = getAdminDb();
  if (!db) return null;

  const activeCartWindowMs = Math.max(5, Number(process.env.LIVE_ACTIVE_CART_WINDOW_MINUTES || 60)) * 60 * 1000;
  const checkoutWindowMs = Math.max(5, Number(process.env.LIVE_CHECKOUT_WINDOW_MINUTES || 30)) * 60 * 1000;
  const purchaseWindowMs = Math.max(1, Number(process.env.LIVE_PURCHASE_WINDOW_HOURS || 24)) * 60 * 60 * 1000;
  const nowMs = Date.now();
  const todayStartMs = getTodayStartMillis();
  const todayKey = getTodayKeyInTimezone();

  const [cartSnap, orderSnap, eventSnap, visitorSnap] = await Promise.all([
    db.collection("carts").get(),
    db.collection("orders_v2").get(),
    db.collection("analytics_live_events").get(),
    db.collection("analytics_daily_visitors").doc(todayKey).get(),
  ]);

  let activeCarts = 0;
  let checkingOut = 0;
  let purchased = 0;
  let checkoutSessionsToday = 0;
  let convertedCartsToday = 0;
  const topSoldProducts = new Map();

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
    const paidAtMs =
      parseDateMillis(order?.payment_summary?.paidAt) ||
      parseDateMillis(order?.payment?.paidAt) ||
      parseDateMillis(order?.timestamps?.updatedAt);
    if (!paidAtMs || nowMs - paidAtMs <= purchaseWindowMs) purchased += 1;
    if (paidAtMs && paidAtMs >= todayStartMs) {
      convertedCartsToday += 1;
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
        const title = String(product?.product?.title || product?.title || variant?.label || "Product").trim();
        const quantity = Math.max(0, Number(item?.quantity || 0));
        if (!productId || quantity <= 0) continue;
        const existing = topSoldProducts.get(productId) || { productId, title, unitsSold: 0 };
        existing.unitsSold += quantity;
        topSoldProducts.set(productId, existing);
      }
    }
  }

  for (const docSnap of eventSnap.docs) {
    const event = docSnap.data() || {};
    const type = String(event?.type || "").trim().toLowerCase();
    const createdAtMs = parseDateMillis(event?.createdAt);
    if (!createdAtMs || createdAtMs < todayStartMs) continue;
    if (type === "checkout_started") checkoutSessionsToday += 1;
  }

  const todayVisitors = Number(visitorSnap.exists ? visitorSnap.data()?.totalVisitors || 0 : 0);
  const topSoldProductsToday = Array.from(topSoldProducts.values())
    .sort((a, b) => Number(b.unitsSold || 0) - Number(a.unitsSold || 0))
    .slice(0, 5);

  const snapshot = {
    activeCarts,
    checkingOut,
    purchased,
    todayVisitors,
    checkoutSessionsToday,
    convertedCartsToday,
    topSoldProductsToday,
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
