export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { releaseVariantCheckoutReservationsForItems, reserveVariantCheckoutQuantity } from "@/lib/cart/checkout-reservations";
import { releaseStockLotReservations, reserveStockLotsFifo } from "@/lib/warehouse/stock-lots";
import { recordLiveCommerceEvent } from "@/lib/analytics/live-commerce";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

function normalizeActiveCartLotReservations(entries) {
  const now = Date.now();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const lotId = String(entry?.lotId || "").trim();
    const qty = Math.max(0, Number(entry?.quantity || 0));
    const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    return lotId && qty > 0 && expiresAt > now;
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const customerId = String(body?.customerId || body?.uid || "").trim();
    if (!customerId) return err(400, "Missing Input", "customerId is required.");

    const adminDb = getAdminDb();
    if (!adminDb) return err(500, "Database Unavailable", "Admin database is not configured.");

    const cartRef = adminDb.collection("carts").doc(customerId);
    const cartSnap = await cartRef.get();
    if (!cartSnap.exists) {
      return ok({ cart: null, reservedItemCount: 0, message: "No active cart found." });
    }

    const cart = cartSnap.data() || {};
    const items = Array.isArray(cart?.items) ? cart.items : [];
    const nextItems = [];
    let reservedItemCount = 0;

    for (const item of items) {
      const product = item?.product_snapshot || item?.product || {};
      const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
      const fulfillmentMode = String(product?.fulfillment?.mode || "").trim().toLowerCase();
      const isSaleLine = Boolean(variant?.sale?.is_on_sale);
      const desiredQty = Math.max(0, Number(item?.quantity || 0));
      const productId = String(product?.product?.unique_id || product?.docId || item?.product_unique_id || "").trim();
      const variantId = String(variant?.variant_id || item?.selected_variant_id || "").trim();

      if (productId && variantId && desiredQty > 0) {
        const genericReserve = await reserveVariantCheckoutQuantity({
          productId,
          variantId,
          quantity: desiredQty,
          cartId: customerId,
        });
        if (genericReserve?.ok === false) {
          await releaseVariantCheckoutReservationsForItems(nextItems, customerId);
          return err(409, "Reserved", "Reserved in another shopper's checkout.");
        }
      }

      const existingReservations = normalizeActiveCartLotReservations(variant?.warehouse_lot_reservations);
      const reservedQty = existingReservations.reduce((sum, entry) => sum + Math.max(0, Number(entry?.quantity || 0)), 0);

      let nextReservations = existingReservations;
      if (fulfillmentMode !== "bevgo" || isSaleLine || desiredQty <= 0) {
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
        if (reserve?.ok === false) {
          await releaseVariantCheckoutReservationsForItems([...nextItems, item], customerId);
          return err(409, "Reserved", "Reserved in another shopper's checkout.");
        }
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

      if (nextReservations.length) reservedItemCount += 1;
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
      cart: {
        ...(cart?.cart || {}),
        status: "checkout",
        checkout_started_at: new Date().toISOString(),
      },
      items: nextItems,
      timestamps: {
        ...(cart?.timestamps || {}),
        updatedAt: new Date().toISOString(),
      },
    };

    await cartRef.set(nextCart, { merge: true });

    await recordLiveCommerceEvent("checkout_started", {
      customerId,
      itemCount: Number(nextCart?.item_count || nextItems.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0)),
      cartStatus: "checkout",
    });

    return ok({
      cart: nextCart,
      reservedItemCount,
      message: reservedItemCount
        ? "Checkout stock hold created for Piessang-fulfilled items."
        : "Checkout stock hold created.",
    });
  } catch (error) {
    console.error("CHECKOUT RESERVE ERROR:", error);
    return err(500, "Checkout Reserve Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
