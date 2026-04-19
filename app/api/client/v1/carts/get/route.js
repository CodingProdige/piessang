export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { normalizeCartForClient } from "@/lib/cart/public-api";
import { enrichLocationWithGeocode } from "@/lib/server/google-geocode";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function resolveCartOwnerId(body) {
  return String(body?.cartOwnerId || body?.customerId || body?.uid || "").trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cartOwnerId = resolveCartOwnerId(body);
    const deliveryAddressInput = body?.deliveryAddress && typeof body.deliveryAddress === "object" ? body.deliveryAddress : null;
    const deliveryAddress = deliveryAddressInput ? await enrichLocationWithGeocode(deliveryAddressInput) : null;
    const pickupSelections = Array.isArray(body?.pickupSelections) ? body.pickupSelections : [];
    if (!cartOwnerId) return err(400, "Invalid Request", "cartOwnerId is required.");

    const origin = new URL(req.url).origin;
    const response = await fetch(new URL("/api/catalogue/v1/carts/cart/fetchCart", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        customerId: cartOwnerId,
        userId: cartOwnerId,
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
        cart: normalizeCartForClient(payload?.data?.cart ?? null, cartOwnerId),
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
