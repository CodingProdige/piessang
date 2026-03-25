export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { findCartLineByProductVariant, normalizeCartForClient, readCartDoc } from "@/lib/cart/public-api";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function normalizeLegacyMode(mode, hasExistingLine, qty) {
  const normalizedMode = String(mode || "").toLowerCase();
  if (normalizedMode === "change") {
    return Number(qty) >= 0 ? (hasExistingLine ? "increment" : "add") : "decrement";
  }
  if (normalizedMode === "set") {
    return hasExistingLine ? "set" : Number(qty) <= 0 ? "remove" : "add";
  }
  if (["add", "increment", "decrement", "remove"].includes(normalizedMode)) {
    return normalizedMode;
  }
  return hasExistingLine ? "set" : "add";
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    const productUniqueId = String(body?.product?.product?.unique_id || body?.productId || "").trim();
    const variantId = String(body?.variant_id || body?.variantId || "").trim();
    const qty = Number(body?.qty ?? body?.quantity ?? 0);

    if (!uid || !productUniqueId || !variantId || !Number.isFinite(qty)) {
      return err(400, "Invalid Request", "uid, product unique id, variant id, and qty are required.");
    }

    const existingCart = await readCartDoc(uid);
    const existingLine = findCartLineByProductVariant(existingCart, productUniqueId, variantId);
    const nextMode = normalizeLegacyMode(body?.mode, Boolean(existingLine), qty);

    const origin = new URL(req.url).origin;
    const response = await fetch(new URL("/api/catalogue/v1/carts/cart/updateAtomic", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        customerId: uid,
        productId: productUniqueId,
        variantId,
        quantity: Math.abs(qty),
        mode: nextMode,
        cart_item_key: existingLine?.cart_item_key || null,
        channel: "storefront",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return err(
        response.status || 500,
        payload?.title || "Cart Update Failed",
        payload?.message || "Unable to update cart.",
        payload?.ui ? { ui: payload.ui } : {},
      );
    }

    return ok({
      data: {
        cart: normalizeCartForClient(payload?.data?.cart ?? null, uid),
        generatedKey: payload?.data?.generatedKey ?? null,
      },
      ui: payload?.ui ?? null,
    });
  } catch (e) {
    console.error(e);
    return err(500, "Cart Update Failed", "Unexpected error", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

