// app/api/catalogue/v1/products/utils/checkSkuUnique/route.js
/**
 * Check if an SKU is unique across products_v2 (product.sku + variants[].sku),
 * optionally excluding the current product/variant when editing.
 *
 * METHOD: POST
 * BODY:
 *   - sku         (string, required)
 *   - productId   (string, optional)
 *   - variantId   (string, optional)
 */

import { NextResponse } from "next/server";
import { ensureSkuUnique } from "@/lib/catalogue/sku-uniqueness";

/* ---------- helpers ---------- */
const ok  = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });
/* ---------- route ---------- */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const src  = typeof body?.data === "object" ? body.data : body;

    const sku       = String(src?.sku ?? "").trim();
    const productId = String(src?.productId ?? "").trim();
    const variantId = String(src?.variantId ?? "").trim();

    if (!sku) return err(400, "Invalid SKU", "Provide a non-empty 'sku' string.");
    const result = await ensureSkuUnique(sku, {
      excludeProductId: productId,
      excludeVariantId: variantId,
    });

    return ok(result);
  } catch (e) {
    if (e?.status === 409) {
      return ok({ unique: false, conflict: e.conflict ?? null });
    }
    console.error("checkSkuUnique failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while checking SKU uniqueness.");
  }
}
