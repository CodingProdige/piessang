export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { minItems, olderThanHours, userId } = body || {};
    const db = getAdminDb();
    if (!db) return err(500, "List Carts Failed", "Admin database is unavailable.");

    const snap = await db.collection("carts").get();
    const now = Date.now();
    const hrsMs = 60 * 60 * 1000;

    const carts = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((data) => {
        const ownerId = String(data?.cart?.user_id || data?.cart?.customerId || data?.cart?.userId || "");
        if (userId && ownerId !== String(userId)) return false;

        const count = Number(data?.item_count) || (Array.isArray(data?.items) ? data.items.length : 0);
        if (minItems && count < Number(minItems)) return false;

        const updated = new Date(data?.timestamps?.updatedAt || data?.timestamps?.createdAt || now).getTime();
        const ageHours = (now - updated) / hrsMs;
        if (olderThanHours && ageHours < Number(olderThanHours)) return false;
        return true;
      })
      .map((data) => {
        const updated = new Date(data?.timestamps?.updatedAt || data?.timestamps?.createdAt || now).getTime();
        const ageHours = (now - updated) / hrsMs;
        return {
          cart_id: String(data?.cart?.cart_id || data?.cart?.cartId || data?.id || ""),
          user_id: String(data?.cart?.user_id || data?.cart?.customerId || data?.cart?.userId || ""),
          item_count: Number(data?.item_count) || (Array.isArray(data?.items) ? data.items.length : 0),
          updatedAt: data?.timestamps?.updatedAt || null,
          createdAt: data?.timestamps?.createdAt || null,
          age_hours: Math.round(ageHours * 10) / 10,
        };
      });

    return ok({
      data: {
        total: carts.length,
        carts,
      },
    });
  } catch (e) {
    console.error(e);
    return err(500, "List Carts Failed", "An unexpected error occurred.", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

