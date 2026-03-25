import { getAdminDb } from "@/lib/firebase/admin";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function findCartLineByProductVariant(cart, productId, variantId) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const productKey = String(productId || "").trim();
  const variantKey = String(variantId || "").trim();
  if (!productKey || !variantKey) return null;

  return (
    items.find((item) => {
      const itemProductId =
        String(item?.product_snapshot?.product?.unique_id || "") ||
        String(item?.product_unique_id || "") ||
        String(item?.product?.unique_id || "");
      const itemVariantId =
        String(item?.selected_variant_snapshot?.variant_id || "") ||
        String(item?.selected_variant?.variant_id || "") ||
        String(item?.selected_variant_id || "");

      return itemProductId === productKey && itemVariantId === variantKey;
    }) || null
  );
}

export async function readCartDoc(customerId) {
  const db = getAdminDb();
  if (!db || !customerId) return null;
  const snap = await db.collection("carts").doc(String(customerId)).get();
  return snap.exists ? { id: snap.id, ...clone(snap.data() || {}) } : null;
}

export function normalizeCartForClient(cart, fallbackCustomerId = "") {
  if (!cart) return null;

  const normalized = clone(cart);
  const items = Array.isArray(normalized?.items) ? normalized.items : [];
  const totals = normalized?.totals && typeof normalized.totals === "object" ? normalized.totals : {};
  const cartMeta = normalized?.cart && typeof normalized.cart === "object" ? normalized.cart : {};
  const itemCount =
    Number.isFinite(Number(normalized?.item_count))
      ? Number(normalized.item_count)
      : items.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity ?? item?.qty ?? 0)), 0);
  const customerId =
    String(cartMeta.customerId || cartMeta.user_id || cartMeta.userId || fallbackCustomerId || "").trim();

  return {
    ...normalized,
    items,
    totals: {
      ...totals,
      final_payable_incl:
        Number.isFinite(Number(totals?.final_payable_incl))
          ? Number(totals.final_payable_incl)
          : Number.isFinite(Number(totals?.final_incl))
            ? Number(totals.final_incl)
            : 0,
    },
    cart: {
      ...cartMeta,
      cart_id: String(cartMeta.cart_id || cartMeta.cartId || (customerId ? `CART-${customerId}` : "")),
      user_id: String(cartMeta.user_id || cartMeta.customerId || customerId),
      customerId: String(cartMeta.customerId || cartMeta.user_id || customerId),
      item_count: itemCount,
    },
    item_count: itemCount,
    cart_corrected: normalized?.cart_corrected === true,
  };
}
