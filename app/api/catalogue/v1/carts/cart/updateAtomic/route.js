/* eslint-disable import/namespace */
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { runTransaction } from "firebase/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { releaseStockLotReservations, reserveStockLotsFifo } from "@/lib/warehouse/stock-lots";
import { updateCartAtomic } from "./functions";

/* ------------------ HELPERS ------------------ */
const ok = (data = {}, ui = null, status = 200) =>
  NextResponse.json({ ok: true, data, ui }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error", ui = null) => {
  status = Number(status);
  if (!status || status < 200 || status > 599) status = 500;

  return NextResponse.json(
    { ok: false, title, message, ui },
    { status }
  );
};

/* ------------------ POST ------------------ */
export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return err(400, "Bad Request", "Request JSON body required");
  }

  if (!body?.customerId) {
    return err(400, "Missing Input", "customerId required");
  }

  try {
    const result = await runTransaction(db, (tx) => updateCartAtomic(tx, body));

    const { _ui, _generatedKey, ...clean } = result ?? {};
    const reconciledCart = await reconcileCartWarehouseReservations(clean?.cart || null, body?.customerId);
    const responseCart = reconciledCart || clean?.cart || null;

    return ok(
      { ...clean, cart: responseCart, generatedKey: _generatedKey ?? null },
      _ui ?? null,
      200
    );
  } catch (e) {
    console.error("[updateAtomic]", e);

    return err(
      e.code ?? 500,
      e.title ?? "Transaction Failed",
      e.message ?? "Unexpected error occurred",
      e.ui ?? null
    );
  }
}

/* ------------------ NEXT CONFIG ------------------ */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function normalizeActiveCartLotReservations(entries) {
  const now = Date.now();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const lotId = String(entry?.lotId || "").trim();
    const qty = Math.max(0, Number(entry?.quantity || 0));
    const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    return lotId && qty > 0 && expiresAt > now;
  });
}

async function reconcileCartWarehouseReservations(cart, customerId) {
  const adminDb = getAdminDb();
  if (!adminDb || !cart || !Array.isArray(cart?.items)) return cart;

  const nextItems = [];
  for (const item of cart.items) {
    const product = item?.product_snapshot || item?.product || {};
    const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
    const fulfilmentMode = String(product?.fulfillment?.mode || "").trim().toLowerCase();
    const isSaleLine = Boolean(variant?.sale?.is_on_sale);
    const desiredQty = Math.max(0, Number(item?.quantity || 0));
    const existingReservations = normalizeActiveCartLotReservations(variant?.warehouse_lot_reservations);
    const reservedQty = existingReservations.reduce((sum, entry) => sum + Math.max(0, Number(entry?.quantity || 0)), 0);

    let nextReservations = existingReservations;
    if (fulfilmentMode !== "bevgo" || isSaleLine || desiredQty <= 0) {
      if (existingReservations.length) {
        await releaseStockLotReservations({ reservations: existingReservations });
      }
      nextReservations = [];
    } else if (desiredQty > reservedQty) {
      const sellerSlug = String(product?.product?.sellerSlug || product?.seller?.sellerSlug || "").trim();
      const sellerCode = String(product?.product?.sellerCode || product?.seller?.sellerCode || "").trim();
      const variantId = String(variant?.variant_id || "").trim();
      const reserve = await reserveStockLotsFifo({
        sellerSlug,
        sellerCode,
        variantId,
        quantity: desiredQty - reservedQty,
        cartId: customerId,
      });
      nextReservations = [...existingReservations, ...(reserve.allocations || [])];
    } else if (desiredQty < reservedQty) {
      const releaseQty = reservedQty - desiredQty;
      const release = await releaseStockLotReservations({ reservations: existingReservations, quantity: releaseQty });
      const releasedMap = new Map((release.released || []).map((entry) => [String(entry.lotId), Number(entry.quantity || 0)]));
      nextReservations = existingReservations
        .map((entry) => {
          const lotId = String(entry?.lotId || "");
          const qty = Math.max(0, Number(entry?.quantity || 0) - Number(releasedMap.get(lotId) || 0));
          return qty > 0 ? { ...entry, quantity: qty } : null;
        })
        .filter(Boolean);
    }

    nextItems.push({
      ...item,
      selected_variant_snapshot: {
        ...variant,
        warehouse_lot_reservations: nextReservations,
      },
    });
  }

  const nextCart = {
    ...cart,
    items: nextItems,
    timestamps: {
      ...(cart?.timestamps || {}),
      updatedAt: new Date().toISOString(),
    },
  };

  await adminDb.collection("carts").doc(String(customerId)).set(nextCart, { merge: true });
  return nextCart;
}
