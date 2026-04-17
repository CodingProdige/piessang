export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { releaseVariantCheckoutReservationsForItems } from "@/lib/cart/checkout-reservations";
import { getAdminDb } from "@/lib/firebase/admin";
import { releaseStockLotReservations } from "@/lib/warehouse/stock-lots";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, data: p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

const now = () => new Date().toISOString();
export async function POST(req) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { customerId, channel = "unknown" } = await req.json();
    if (!customerId) {
      return err(400, "Invalid Request", "customerId is required.");
    }

    const cartRef = adminDb.collection("carts").doc(String(customerId));
    const txResult = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(cartRef);

      const emptyCart = {
        docId: customerId,
        cart: {
          cartId: customerId,
          customerId,
          channel
        },
        items: [],
        totals: {
          subtotal_excl: 0,
          sale_savings_excl: 0,
          deposit_total_excl: 0,
          vat_total: 0,
          final_excl: 0,
          final_incl: 0
        },
        item_count: 0,
        cart_corrected: false,
        meta: {
          lastAction: "clear",
          notes: null,
          source: channel
        },
        timestamps: {
          createdAt: now(),
          updatedAt: now()
        },
        warnings: { global: [], items: [] }
      };

      if (!snap.exists) {
        tx.set(cartRef, emptyCart);
        return { cart: emptyCart, warnings: emptyCart.warnings };
      }

      const cart = snap.data();
      const items = Array.isArray(cart.items) ? cart.items : [];
      const warnings = { global: [], items: [] };

      await releaseVariantCheckoutReservationsForItems(items, customerId);

      for (const it of items) {
        const vSnap = it?.selected_variant_snapshot;
        if (!vSnap) continue;

        if (Array.isArray(vSnap?.warehouse_lot_reservations) && vSnap.warehouse_lot_reservations.length) {
          await releaseStockLotReservations({ reservations: vSnap.warehouse_lot_reservations });
        }
      }

      tx.set(cartRef, emptyCart);
      return { cart: emptyCart, warnings };
    });

    return ok({
      cart: txResult.cart,
      warnings: txResult.warnings
    });
  } catch (e) {
    console.error("CLEAR CART ERROR:", e);
    return err(500, "Clear Cart Failed", "Unexpected server error.", {
      error: String(e)
    });
  }
}
