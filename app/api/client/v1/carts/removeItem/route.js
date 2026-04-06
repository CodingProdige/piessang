export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { findCartLineByProductVariant, normalizeCartForClient, readCartDoc } from "@/lib/cart/public-api";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    const productUniqueId = String(body?.unique_id || body?.productId || "").trim();
    const variantId = String(body?.variant_id || body?.variantId || "").trim();

    if (!uid || !productUniqueId || !variantId) {
      return err(400, "Invalid Request", "uid, unique_id, and variant_id are required.");
    }

    const cart = await readCartDoc(uid);
    const line = findCartLineByProductVariant(cart, productUniqueId, variantId);
    if (!line?.cart_item_key) {
      return ok({
        data: {
          cart: normalizeCartForClient(cart, uid),
          message: "Item not found in cart.",
        },
      });
    }

    const origin = new URL(req.url).origin;
    const response = await fetch(new URL("/api/catalogue/v1/carts/cart/updateAtomic", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        customerId: uid,
        productId: productUniqueId,
        variantId,
        mode: "remove",
        quantity: 0,
        cart_item_key: line.cart_item_key,
        channel: "storefront",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return err(
        response.status || 500,
        payload?.title || "Remove Failed",
        payload?.message || "Unable to remove the item.",
      );
    }

    return ok({
      data: {
        cart: normalizeCartForClient(payload?.data?.cart ?? null, uid),
        message: "Item removed from cart.",
      },
      ui: payload?.ui ?? null,
    });
  } catch (e) {
    console.error(e);
    return err(500, "Remove Failed", "Unexpected error.", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

