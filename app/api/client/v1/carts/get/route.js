export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { normalizeCartForClient } from "@/lib/cart/public-api";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    const deliveryAddress = body?.deliveryAddress && typeof body.deliveryAddress === "object" ? body.deliveryAddress : null;
    const pickupSelections = Array.isArray(body?.pickupSelections) ? body.pickupSelections : [];
    if (!uid) return err(400, "Invalid Request", "uid is required.");

    const origin = new URL(req.url).origin;
    const response = await fetch(new URL("/api/catalogue/v1/carts/cart/fetchCart", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        customerId: uid,
        userId: uid,
        deliveryAddress,
        pickupSelections,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return err(
        response.status || 500,
        payload?.title || "Cart Retrieval Failed",
        payload?.message || "Unable to load cart.",
        payload?.error ? { error: payload.error } : {},
      );
    }

    return ok({
      data: {
        cart: normalizeCartForClient(payload?.data?.cart ?? null, uid),
        warnings: payload?.data?.warnings || { global: [], items: [] },
      },
    });
  } catch (e) {
    console.error(e);
    return err(500, "Cart Retrieval Failed", "Unexpected server error.", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
