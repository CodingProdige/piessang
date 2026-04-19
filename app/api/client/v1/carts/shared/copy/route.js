export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { resolveSharedCart } from "@/lib/cart/shares";
import { normalizeCartForClient } from "@/lib/cart/public-api";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value) {
  return String(value || "").trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const shareToken = toStr(body?.shareToken);
    const targetCartOwnerId = toStr(body?.cartOwnerId || body?.customerId || body?.uid);
    if (!shareToken || !targetCartOwnerId) {
      return err(400, "Invalid Request", "shareToken and cartOwnerId are required.");
    }

    const shared = await resolveSharedCart({ shareToken });
    if (!shared?.cart) {
      return err(404, "Shared Cart Not Found", "This shared cart is no longer available.");
    }

    const items = Array.isArray(shared.cart?.items) ? shared.cart.items : [];
    if (!items.length) {
      return err(400, "Empty Shared Cart", "There are no items left in this shared cart.");
    }

    const origin = new URL(req.url).origin;
    let latestCart = null;

    for (const item of items) {
      const productId =
        toStr(item?.product_snapshot?.product?.unique_id) ||
        toStr(item?.product_unique_id);
      const variantId =
        toStr(item?.selected_variant_snapshot?.variant_id) ||
        toStr(item?.selected_variant?.variant_id) ||
        toStr(item?.variant_id);
      const quantity = Math.max(0, Number(item?.quantity ?? item?.qty ?? 0) || 0);
      if (!productId || !variantId || quantity <= 0) continue;

      const response = await fetch(new URL("/api/catalogue/v1/carts/cart/updateAtomic", origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          customerId: targetCartOwnerId,
          productId,
          variantId,
          quantity,
          mode: "add",
          channel: "storefront-share-copy",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        return err(
          response.status || 500,
          payload?.title || "Copy Cart Failed",
          payload?.message || "We could not copy this cart into your cart.",
        );
      }
      latestCart = payload?.data?.cart ?? latestCart;
    }

    return ok({
      data: {
        cart: normalizeCartForClient(latestCart, targetCartOwnerId),
      },
    });
  } catch (error) {
    console.error(error);
    return err(500, "Copy Cart Failed", "Unexpected server error.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
