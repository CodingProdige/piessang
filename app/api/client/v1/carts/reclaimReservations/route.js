export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { releaseStockLotReservations } from "@/lib/warehouse/stock-lots";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function normalizeActiveReservations(entries) {
  const now = Date.now();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const lotId = String(entry?.lotId || "").trim();
    const quantity = Math.max(0, Number(entry?.quantity || 0));
    const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : 0;
    return lotId && quantity > 0 && expiresAt <= now;
  });
}

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Reclaim Failed", "Admin database is unavailable.");

    const snap = await db.collection("carts").get();
    const reclaimed = [];

    for (const docSnap of snap.docs) {
      const cart = docSnap.data() || {};
      const items = Array.isArray(cart?.items) ? cart.items : [];
      let changed = false;
      const nextItems = [];

      for (const item of items) {
        const variant = item?.selected_variant_snapshot || {};
        const expiredReservations = normalizeActiveReservations(variant?.warehouse_lot_reservations);
        if (expiredReservations.length) {
          await releaseStockLotReservations({ reservations: expiredReservations });
          changed = true;
        }

        const activeReservations = (Array.isArray(variant?.warehouse_lot_reservations) ? variant.warehouse_lot_reservations : []).filter(
          (entry) => !expiredReservations.some((released) => String(released.lotId) === String(entry?.lotId || "")),
        );

        nextItems.push({
          ...item,
          selected_variant_snapshot: {
            ...variant,
            warehouse_lot_reservations: activeReservations,
          },
        });
      }

      if (!changed) continue;

      await db.collection("carts").doc(docSnap.id).set(
        {
          items: nextItems,
          timestamps: {
            ...(cart?.timestamps || {}),
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );

      reclaimed.push(docSnap.id);
    }

    return ok({
      message: "Expired cart reservations reclaimed.",
      reclaimed,
    });
  } catch (e) {
    console.error(e);
    return err(500, "Reclaim Failed", "Unexpected error", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

