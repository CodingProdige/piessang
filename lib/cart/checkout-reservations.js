import { getAdminDb } from "@/lib/firebase/admin";
import {
  variantCanContinueSellingOutOfStock,
  variantTotalInStockItemsAvailable,
} from "@/lib/catalogue/availability";

export const VARIANT_CHECKOUT_RESERVATIONS_COLLECTION = "variant_checkout_reservations_v1";
export const VARIANT_CHECKOUT_RESERVATION_TTL_MS = 60 * 60 * 1000;

function toStr(value) {
  return String(value ?? "").trim();
}

function toQty(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function buildReservationDocId(productId, variantId) {
  return `${toStr(productId)}__${toStr(variantId)}`;
}

export function normalizeActiveVariantCheckoutReservations(entries, nowMs = Date.now()) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const cartId = toStr(entry?.cartId);
    const quantity = toQty(entry?.quantity);
    const expiresAtMs = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : 0;
    return cartId && quantity > 0 && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export async function reserveVariantCheckoutQuantity({
  productId,
  variantId,
  quantity,
  cartId,
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const productKey = toStr(productId);
  const variantKey = toStr(variantId);
  const cartKey = toStr(cartId);
  const desiredQty = toQty(quantity);

  if (!productKey || !variantKey || !cartKey || desiredQty <= 0) {
    return { ok: false, reason: "invalid_request", available: 0 };
  }

  const reservationRef = db.collection(VARIANT_CHECKOUT_RESERVATIONS_COLLECTION).doc(buildReservationDocId(productKey, variantKey));
  const productRef = db.collection("products_v2").doc(productKey);

  return db.runTransaction(async (tx) => {
    const [productSnap, reservationSnap] = await Promise.all([tx.get(productRef), tx.get(reservationRef)]);
    if (!productSnap.exists) {
      return { ok: false, reason: "product_missing", available: 0 };
    }

    const product = productSnap.data() || {};
    const variant = (Array.isArray(product?.variants) ? product.variants : []).find(
      (entry) => toStr(entry?.variant_id) === variantKey,
    );
    if (!variant) {
      return { ok: false, reason: "variant_missing", available: 0 };
    }
    if (variantCanContinueSellingOutOfStock(variant)) {
      return { ok: true, skipped: true, reservedQty: desiredQty, available: null };
    }

    const totalStock = toQty(variantTotalInStockItemsAvailable(variant));
    const liveReservations = normalizeActiveVariantCheckoutReservations(reservationSnap.exists ? reservationSnap.data()?.reservations : []);
    const currentCartReservedQty = liveReservations
      .filter((entry) => toStr(entry?.cartId) === cartKey)
      .reduce((sum, entry) => sum + toQty(entry?.quantity), 0);
    const otherReservedQty = liveReservations
      .filter((entry) => toStr(entry?.cartId) !== cartKey)
      .reduce((sum, entry) => sum + toQty(entry?.quantity), 0);
    const availableForCart = Math.max(0, totalStock - otherReservedQty);

    if (desiredQty > availableForCart) {
      return {
        ok: false,
        reason: otherReservedQty > 0 && availableForCart <= 0 ? "reserved_in_checkout" : "insufficient_stock",
        available: availableForCart,
        totalStock,
        reservedByOthers: otherReservedQty,
        currentCartReservedQty,
      };
    }

    const expiresAt = new Date(Date.now() + VARIANT_CHECKOUT_RESERVATION_TTL_MS).toISOString();
    const reservedAt = new Date().toISOString();
    const nextReservations = liveReservations
      .filter((entry) => toStr(entry?.cartId) !== cartKey)
      .concat({
        cartId: cartKey,
        quantity: desiredQty,
        reservedAt,
        expiresAt,
      });

    tx.set(
      reservationRef,
      {
        productId: productKey,
        variantId: variantKey,
        reservations: nextReservations,
        reservedQty: nextReservations.reduce((sum, entry) => sum + toQty(entry?.quantity), 0),
        timestamps: {
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );

    return {
      ok: true,
      reservedQty: desiredQty,
      available: availableForCart,
      totalStock,
      reservedByOthers: otherReservedQty,
      currentCartReservedQty,
    };
  });
}

export async function releaseVariantCheckoutReservation({
  productId,
  variantId,
  cartId,
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const productKey = toStr(productId);
  const variantKey = toStr(variantId);
  const cartKey = toStr(cartId);
  if (!productKey || !variantKey || !cartKey) return { released: false };

  const reservationRef = db.collection(VARIANT_CHECKOUT_RESERVATIONS_COLLECTION).doc(buildReservationDocId(productKey, variantKey));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reservationRef);
    if (!snap.exists) return { released: false };
    const liveReservations = normalizeActiveVariantCheckoutReservations(snap.data()?.reservations || []);
    const nextReservations = liveReservations.filter((entry) => toStr(entry?.cartId) !== cartKey);
    if (nextReservations.length === liveReservations.length) return { released: false };
    tx.set(
      reservationRef,
      {
        reservations: nextReservations,
        reservedQty: nextReservations.reduce((sum, entry) => sum + toQty(entry?.quantity), 0),
        timestamps: {
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
    return { released: true };
  });
}

export async function releaseVariantCheckoutReservationsForItems(items, cartId) {
  const results = [];
  for (const item of Array.isArray(items) ? items : []) {
    const product = item?.product_snapshot || item?.product || {};
    const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
    const productId = toStr(product?.product?.unique_id || product?.docId || item?.product_unique_id);
    const variantId = toStr(variant?.variant_id || item?.selected_variant_id);
    if (!productId || !variantId) continue;
    results.push(await releaseVariantCheckoutReservation({ productId, variantId, cartId }));
  }
  return results;
}

export async function loadActiveCheckoutReservationMap({ productId, variantIds }) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const productKey = toStr(productId);
  if (!productKey) return new Map();
  const needles = new Set((Array.isArray(variantIds) ? variantIds : []).map((entry) => toStr(entry)).filter(Boolean));
  if (!needles.size) return new Map();

  const snap = await db.collection(VARIANT_CHECKOUT_RESERVATIONS_COLLECTION).where("productId", "==", productKey).get();
  const map = new Map();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const variantId = toStr(data?.variantId);
    if (!needles.has(variantId)) continue;
    const liveReservations = normalizeActiveVariantCheckoutReservations(data?.reservations || []);
    map.set(variantId, liveReservations.reduce((sum, entry) => sum + toQty(entry?.quantity), 0));
  }
  return map;
}

export async function reclaimExpiredVariantCheckoutReservations() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const snap = await db.collection(VARIANT_CHECKOUT_RESERVATIONS_COLLECTION).get();
  const reclaimed = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const liveReservations = normalizeActiveVariantCheckoutReservations(data?.reservations || []);
    const originalCount = Array.isArray(data?.reservations) ? data.reservations.length : 0;
    if (liveReservations.length === originalCount) continue;
    await doc.ref.set(
      {
        reservations: liveReservations,
        reservedQty: liveReservations.reduce((sum, entry) => sum + toQty(entry?.quantity), 0),
        timestamps: {
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
    reclaimed.push(doc.id);
  }

  return reclaimed;
}
