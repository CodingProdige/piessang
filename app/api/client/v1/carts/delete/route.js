export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { normalizeCartForClient } from "@/lib/cart/public-api";
import { recordLiveCommerceEvent } from "@/lib/analytics/live-commerce";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function resolveCartOwnerId(body) {
  return String(body?.cartOwnerId || body?.customerId || body?.uid || "").trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cartOwnerId = resolveCartOwnerId(body);
    if (!cartOwnerId) {
      return err(400, "Invalid Request", "cartOwnerId is required.");
    }

    const origin = new URL(req.url).origin;
    const response = await fetch(new URL("/api/catalogue/v1/carts/cart/clear", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        customerId: cartOwnerId,
        channel: "storefront",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return err(
        response.status || 500,
        payload?.title || "Delete Failed",
        payload?.message || "Unable to clear cart.",
      );
    }

    await recordLiveCommerceEvent("cart_cleared", {
      customerId: cartOwnerId,
      itemCount: 0,
      cartStatus: "empty",
    });

    return ok({
      data: {
        cart: normalizeCartForClient(payload?.data?.cart ?? null, cartOwnerId),
        message: "Cart cleared.",
      },
    });
  } catch (e) {
    console.error(e);
    return err(500, "Delete Failed", "Unexpected server error.", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
