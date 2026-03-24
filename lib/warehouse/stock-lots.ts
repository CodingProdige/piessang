import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";
import { getMarketplaceVolumeBand } from "@/lib/marketplace/fees";

export const STOCK_LOTS_COLLECTION = "warehouse_stock_lots_v1";
export const LOT_RESERVATION_TTL_MS = 60 * 60 * 1000;

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function r2(value: unknown) {
  return Number(toNum(value, 0).toFixed(2));
}

function normalizeLotReservations(entries: Array<Record<string, any>> = []) {
  const map = new Map<string, number>();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const lotId = toStr(entry?.lotId);
    const qty = Math.max(0, Math.trunc(toNum(entry?.quantity, 0)));
    if (!lotId || qty <= 0) continue;
    map.set(lotId, (map.get(lotId) || 0) + qty);
  }
  return [...map.entries()].map(([lotId, quantity]) => ({ lotId, quantity }));
}

function getReservationExpiryIso(from = new Date()) {
  return new Date(from.getTime() + LOT_RESERVATION_TTL_MS).toISOString();
}

function normalizeLiveLotReservationEntries(entries: Array<Record<string, any>> = [], now = new Date()) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const lotId = toStr(entry?.lotId);
      const cartId = toStr(entry?.cartId) || null;
      const quantity = Math.max(0, Math.trunc(toNum(entry?.quantity, 0)));
      const reservedAt = toStr(entry?.reservedAt) || null;
      const expiresAt = toStr(entry?.expiresAt) || null;
      const expiryDate = parseDate(expiresAt);
      if (!lotId || quantity <= 0) return null;
      if (expiryDate && expiryDate.getTime() <= now.getTime()) return null;
      return { lotId, cartId, quantity, reservedAt, expiresAt };
    })
    .filter(Boolean) as Array<{ lotId: string; cartId: string | null; quantity: number; reservedAt: string | null; expiresAt: string | null }>;
}

async function cleanExpiredReservations(ref: any, lot: Record<string, any>) {
  const liveReservations = normalizeLiveLotReservationEntries(lot?.reservations || []);
  const expiredCount = Array.isArray(lot?.reservations) ? lot.reservations.length - liveReservations.length : 0;
  if (expiredCount <= 0) return liveReservations;
  const nextReservedQty = liveReservations.reduce((sum, entry) => sum + entry.quantity, 0);
  await ref.set(
    {
      reservations: liveReservations,
      reservedQty: nextReservedQty,
      status: nextReservedQty > 0 ? "reserved" : Math.max(0, Math.trunc(toNum(lot?.remainingQty, 0))) > 0 ? "open" : "consumed",
      timestamps: {
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
  return liveReservations;
}

function parseDate(value: unknown) {
  const raw = toStr(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildStockLotId(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => toStr(part).toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))
    .filter(Boolean)
    .join("__");
}

export function getVariantVolumeCm3(variant: Record<string, any> | null | undefined) {
  const logistics = variant?.logistics && typeof variant.logistics === "object" ? variant.logistics : {};
  const length = toNum(logistics.lengthCm ?? logistics.length_cm, 0);
  const width = toNum(logistics.widthCm ?? logistics.width_cm, 0);
  const height = toNum(logistics.heightCm ?? logistics.height_cm, 0);
  const volume = length * width * height;
  return volume > 0 ? volume : 0;
}

export async function createInboundStockLot({
  captureId,
  bookingId,
  productId,
  productTitle,
  variant,
  quantity,
  locationId,
  sellerCode,
  sellerSlug,
  receivedAt,
  receivedBy,
}: {
  captureId: string;
  bookingId?: string | null;
  productId: string;
  productTitle?: string | null;
  variant: Record<string, any>;
  quantity: number;
  locationId: string;
  sellerCode?: string | null;
  sellerSlug?: string | null;
  receivedAt?: string | null;
  receivedBy?: string | null;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const qty = Math.max(0, Math.trunc(toNum(quantity, 0)));
  if (!qty) return null;

  const variantId = toStr(variant?.variant_id);
  const effectiveReceivedAt = toStr(receivedAt) || new Date().toISOString();
  const volumeCm3 = getVariantVolumeCm3(variant);
  const lotId = buildStockLotId([captureId || bookingId || "lot", productId, variantId, locationId, Date.now()]);

  const lot = {
    lotId,
    captureId: toStr(captureId) || null,
    bookingId: toStr(bookingId) || null,
    productId: toStr(productId),
    productTitle: toStr(productTitle || productId),
    variantId,
    variantLabel: toStr(variant?.label || variantId),
    barcode: toStr(variant?.barcode) || null,
    sellerCode: toStr(sellerCode) || null,
    sellerSlug: toStr(sellerSlug) || null,
    locationId: toStr(locationId),
    warehouseId: toStr(locationId),
    receivedQty: qty,
    remainingQty: qty,
    reservedQty: 0,
    reservations: [],
    receivedAt: effectiveReceivedAt,
    receivedBy: toStr(receivedBy) || null,
    volumeCm3,
    storageBand: null as string | null,
    status: "open",
    timestamps: {
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  };

  if (volumeCm3 > 0) {
    const config = await loadMarketplaceFeeConfig();
    lot.storageBand = toStr(getMarketplaceVolumeBand(volumeCm3, config)?.label) || null;
  }

  await db.collection(STOCK_LOTS_COLLECTION).doc(lotId).set(lot);
  return lot;
}

export async function reverseLotsForCapture(captureId: string, reason: "reversed" | "deleted") {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const snap = await db.collection(STOCK_LOTS_COLLECTION).where("captureId", "==", toStr(captureId)).get();
  if (snap.empty) return [];
  const batch = db.batch();
  const ids: string[] = [];
  for (const docSnap of snap.docs) {
    ids.push(docSnap.id);
    batch.set(
      docSnap.ref,
      {
        remainingQty: 0,
        reservedQty: 0,
        reservations: [],
        status: reason,
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  }
  await batch.commit();
  return ids;
}

export async function getSellerLotStorageSummary({
  sellerSlug,
  sellerCode,
  periodEnd,
}: {
  sellerSlug?: string | null;
  sellerCode?: string | null;
  periodEnd: Date;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const config = await loadMarketplaceFeeConfig();
  const thresholdDays = Math.max(0, toNum(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays, 35));
  const storageBands = Array.isArray(config?.storage?.bands) ? config.storage.bands : [];
  const sellerSlugNeedle = toStr(sellerSlug).toLowerCase();
  const sellerCodeNeedle = toStr(sellerCode).toLowerCase();

  const snap = await db.collection(STOCK_LOTS_COLLECTION).get();
  const lots = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }) as any)
    .filter((lot) => {
      const lotSlug = toStr(lot?.sellerSlug).toLowerCase();
      const lotCode = toStr(lot?.sellerCode).toLowerCase();
      const sellerMatch = (sellerSlugNeedle && lotSlug === sellerSlugNeedle) || (sellerCodeNeedle && lotCode === sellerCodeNeedle);
      if (!sellerMatch) return false;
      if (toNum(lot?.remainingQty, 0) <= 0) return false;
      const receivedAt = parseDate(lot?.receivedAt);
      if (!receivedAt) return false;
      return receivedAt <= periodEnd;
    });

  const agedLots = lots.map((lot) => {
    const receivedAt = parseDate(lot.receivedAt) || periodEnd;
    const ageDays = Math.floor((periodEnd.getTime() - receivedAt.getTime()) / 86400000);
    const matchedBand =
      storageBands.find((band: any) => String(band?.label || "").trim().toLowerCase() === toStr(lot?.storageBand).toLowerCase()) ||
      (lot?.volumeCm3 ? getMarketplaceVolumeBand(toNum(lot.volumeCm3, 0), config) : null);
    const monthlyRate = ageDays > thresholdDays ? r2(matchedBand?.overstockedFeeIncl || 0) : 0;
    const amount = r2(monthlyRate * toNum(lot?.remainingQty, 0));
    return {
      ...lot,
      ageDays,
      monthlyRate,
      amount,
      overThreshold: ageDays > thresholdDays,
    };
  });

  return {
    thresholdDays,
    lots: agedLots,
    overThresholdLots: agedLots.filter((lot) => lot.overThreshold),
    storageFeeTotal: r2(agedLots.reduce((sum, lot) => sum + lot.amount, 0)),
  };
}

export async function previewFifoConsumption({
  sellerSlug,
  sellerCode,
  variantId,
  quantity,
}: {
  sellerSlug?: string | null;
  sellerCode?: string | null;
  variantId: string;
  quantity: number;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const requiredQty = Math.max(0, Math.trunc(toNum(quantity, 0)));
  const sellerSlugNeedle = toStr(sellerSlug).toLowerCase();
  const sellerCodeNeedle = toStr(sellerCode).toLowerCase();

  const snap = await db.collection(STOCK_LOTS_COLLECTION).where("variantId", "==", toStr(variantId)).get();
  const lots = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }) as any)
    .filter((lot) => {
      const sellerMatch =
        (sellerSlugNeedle && toStr(lot?.sellerSlug).toLowerCase() === sellerSlugNeedle) ||
        (sellerCodeNeedle && toStr(lot?.sellerCode).toLowerCase() === sellerCodeNeedle);
      return sellerMatch && toNum(lot?.remainingQty, 0) > 0;
    })
    .sort((left, right) => {
      const leftDate = parseDate(left?.receivedAt)?.getTime() || 0;
      const rightDate = parseDate(right?.receivedAt)?.getTime() || 0;
      return leftDate - rightDate;
    });

  let remaining = requiredQty;
  const allocations = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const ref = db.collection(STOCK_LOTS_COLLECTION).doc(lot.id);
    const liveReservations = await cleanExpiredReservations(ref, lot);
    const reservedQty = liveReservations.reduce((sum, entry) => sum + entry.quantity, 0);
    const available = Math.max(0, Math.trunc(toNum(lot?.remainingQty, 0)) - reservedQty);
    if (!available) continue;
    const take = Math.min(available, remaining);
    allocations.push({
      lotId: lot.id,
      variantId: toStr(lot?.variantId),
      quantity: take,
      receivedAt: lot.receivedAt || null,
    });
    remaining -= take;
  }

  return {
    ok: remaining === 0,
    allocations,
    unallocatedQty: remaining,
  };
}

export async function consumeStockLotsFifo({
  sellerSlug,
  sellerCode,
  variantId,
  quantity,
  orderId,
}: {
  sellerSlug?: string | null;
  sellerCode?: string | null;
  variantId: string;
  quantity: number;
  orderId?: string | null;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const preview = await previewFifoConsumption({
    sellerSlug,
    sellerCode,
    variantId,
    quantity,
  });

  if (!preview.ok) {
    return {
      ok: false,
      allocations: preview.allocations,
      unallocatedQty: preview.unallocatedQty,
    };
  }

  const batch = db.batch();
  for (const allocation of preview.allocations) {
    const ref = db.collection(STOCK_LOTS_COLLECTION).doc(allocation.lotId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const lot = snap.data() || {};
    const currentRemaining = Math.max(0, Math.trunc(toNum(lot?.remainingQty, 0)));
    const nextRemaining = Math.max(0, currentRemaining - allocation.quantity);
    batch.set(
      ref,
      {
        remainingQty: nextRemaining,
        status: nextRemaining > 0 ? "open" : "consumed",
        lastOrderId: toStr(orderId) || null,
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  }
  await batch.commit();

  return {
    ok: true,
    allocations: preview.allocations,
    unallocatedQty: 0,
  };
}

export async function reserveStockLotsFifo({
  sellerSlug,
  sellerCode,
  variantId,
  quantity,
  cartId,
}: {
  sellerSlug?: string | null;
  sellerCode?: string | null;
  variantId: string;
  quantity: number;
  cartId?: string | null;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const preview = await previewFifoConsumption({ sellerSlug, sellerCode, variantId, quantity });
  if (!preview.ok) {
    return { ok: false, allocations: preview.allocations, unallocatedQty: preview.unallocatedQty };
  }
  const batch = db.batch();
  const reservedAt = new Date().toISOString();
  const expiresAt = getReservationExpiryIso(new Date());
  for (const allocation of preview.allocations) {
    const ref = db.collection(STOCK_LOTS_COLLECTION).doc(allocation.lotId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const lot = snap.data() || {};
    const liveReservations = normalizeLiveLotReservationEntries(lot?.reservations || []);
    const currentReserved = liveReservations.reduce((sum, entry) => sum + entry.quantity, 0);
    batch.set(
      ref,
      {
        reservedQty: currentReserved + allocation.quantity,
        reservations: [
          ...liveReservations,
          {
            lotId: allocation.lotId,
            cartId: toStr(cartId) || null,
            quantity: allocation.quantity,
            reservedAt,
            expiresAt,
          },
        ],
        lastCartId: toStr(cartId) || null,
        status: "reserved",
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  }
  await batch.commit();
  return {
    ok: true,
    allocations: preview.allocations.map((entry) => ({ ...entry, cartId: toStr(cartId) || null, reservedAt, expiresAt })),
    unallocatedQty: 0,
  };
}

export async function releaseStockLotReservations({
  reservations,
  quantity,
}: {
  reservations: Array<Record<string, any>>;
  quantity?: number | null;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const normalized = normalizeLotReservations(reservations);
  let remainingToRelease = quantity == null ? null : Math.max(0, Math.trunc(toNum(quantity, 0)));
  const batch = db.batch();
  const released = [];

  for (const entry of normalized) {
    if (remainingToRelease !== null && remainingToRelease <= 0) break;
    const ref = db.collection(STOCK_LOTS_COLLECTION).doc(entry.lotId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const lot = snap.data() || {};
    const liveReservations = normalizeLiveLotReservationEntries(lot?.reservations || []);
    const currentReserved = liveReservations.reduce((sum, item) => sum + item.quantity, 0);
    const requested = remainingToRelease === null ? entry.quantity : Math.min(entry.quantity, remainingToRelease);
    const releaseQty = Math.min(currentReserved, requested);
    const nextReserved = Math.max(0, currentReserved - releaseQty);
    let qtyToRelease = releaseQty;
    const nextEntries = [];
    for (const reservation of liveReservations) {
      if (reservation.lotId !== entry.lotId || qtyToRelease <= 0) {
        nextEntries.push(reservation);
        continue;
      }
      const take = Math.min(reservation.quantity, qtyToRelease);
      const left = reservation.quantity - take;
      if (left > 0) nextEntries.push({ ...reservation, quantity: left });
      qtyToRelease -= take;
    }
    batch.set(
      ref,
      {
        reservedQty: nextReserved,
        reservations: nextEntries,
        status: nextReserved > 0 ? "reserved" : Math.max(0, Math.trunc(toNum(lot?.remainingQty, 0))) > 0 ? "open" : "consumed",
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    if (releaseQty > 0) released.push({ lotId: entry.lotId, quantity: releaseQty });
    if (remainingToRelease !== null) remainingToRelease -= releaseQty;
  }

  await batch.commit();
  return { released, remainingQty: remainingToRelease == null ? 0 : Math.max(0, remainingToRelease) };
}

export async function consumeReservedStockLots({
  reservations,
  orderId,
}: {
  reservations: Array<Record<string, any>>;
  orderId?: string | null;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const normalized = normalizeLotReservations(reservations);
  const batch = db.batch();
  for (const entry of normalized) {
    const ref = db.collection(STOCK_LOTS_COLLECTION).doc(entry.lotId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const lot = snap.data() || {};
    const liveReservations = normalizeLiveLotReservationEntries(lot?.reservations || []);
    const currentReserved = liveReservations.reduce((sum, item) => sum + item.quantity, 0);
    const currentRemaining = Math.max(0, Math.trunc(toNum(lot?.remainingQty, 0)));
    const consumeQty = Math.min(entry.quantity, currentReserved, currentRemaining);
    const nextReserved = Math.max(0, currentReserved - consumeQty);
    const nextRemaining = Math.max(0, currentRemaining - consumeQty);
    let qtyToConsume = consumeQty;
    const nextEntries = [];
    for (const reservation of liveReservations) {
      if (reservation.lotId !== entry.lotId || qtyToConsume <= 0) {
        nextEntries.push(reservation);
        continue;
      }
      const take = Math.min(reservation.quantity, qtyToConsume);
      const left = reservation.quantity - take;
      if (left > 0) nextEntries.push({ ...reservation, quantity: left });
      qtyToConsume -= take;
    }
    batch.set(
      ref,
      {
        reservedQty: nextReserved,
        reservations: nextEntries,
        remainingQty: nextRemaining,
        lastOrderId: toStr(orderId) || null,
        status: nextRemaining > 0 ? (nextReserved > 0 ? "reserved" : "open") : "consumed",
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
  }
  await batch.commit();
  return { ok: true, allocations: normalized };
}
