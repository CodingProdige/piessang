"use client";

import { useEffect, useRef, useState } from "react";
import { CartActionStack } from "@/components/cart/cart-actions";
import { CartItemCard } from "@/components/cart/cart-item-card";
import { DisplayCurrencySelector, useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { AppSnackbar } from "@/components/ui/app-snackbar";

type CartPreviewItem = {
  cart_item_key?: string;
  product_unique_id?: string;
  qty?: number;
  quantity?: number;
  sale_qty?: number;
  regular_qty?: number;
  line_totals?: {
    final_incl?: number;
    final_excl?: number;
  };
  product_snapshot?: {
    product?: {
      unique_id?: string | number | null;
      title?: string | null;
      vendorName?: string | null;
    };
    seller?: {
      vendorName?: string | null;
    };
    fulfillment?: {
      mode?: string | null;
    };
    media?: {
      images?: Array<{ imageUrl?: string | null }>;
    };
  };
  selected_variant_snapshot?: {
    variant_id?: string | number | null;
    label?: string | null;
    pricing?: {
      selling_price_excl?: number;
      selling_price_incl?: number;
      sale_price_incl?: number;
      sale_price_excl?: number;
    };
    sale?: {
      is_on_sale?: boolean;
      sale_price_incl?: number;
      sale_price_excl?: number;
      qty_available?: number;
    };
  };
};

function applyCartPreviewAction(
  currentCart: {
    items?: CartPreviewItem[];
    totals?: { final_payable_incl?: number; final_incl?: number };
    cart?: { item_count?: number };
  } | null,
  item: CartPreviewItem,
  action: "increment" | "decrement" | "remove",
) {
  if (!currentCart) return currentCart;
  const targetProductId =
    String(item?.product_snapshot?.product?.unique_id || "") || String(item?.product_unique_id || "");
  const targetVariantId = String(item?.selected_variant_snapshot?.variant_id || "");
  const targetKey = String(item?.cart_item_key || `${targetProductId}::${targetVariantId}`);
  const items = Array.isArray(currentCart.items) ? currentCart.items.map((entry) => ({ ...entry })) : [];
  const index = items.findIndex((entry) => {
    const productId =
      String(entry?.product_snapshot?.product?.unique_id || "") || String(entry?.product_unique_id || "");
    const variantId = String(entry?.selected_variant_snapshot?.variant_id || "");
    const entryKey = String(entry?.cart_item_key || `${productId}::${variantId}`);
    return entryKey === targetKey;
  });
  if (index < 0) return currentCart;

  if (action === "remove") {
    items.splice(index, 1);
  } else {
    const entry = items[index];
    const currentQty = Math.max(0, Number(entry?.quantity ?? entry?.qty ?? 0) || 0);
    const nextQty = action === "increment" ? currentQty + 1 : Math.max(1, currentQty - 1);
    const currentLineIncl = Number(entry?.line_totals?.final_incl || 0);
    const currentLineExcl = Number(entry?.line_totals?.final_excl || 0);
    const unitIncl = currentQty > 0 ? currentLineIncl / currentQty : 0;
    const unitExcl = currentQty > 0 ? currentLineExcl / currentQty : 0;
    items[index] = {
      ...entry,
      qty: nextQty,
      quantity: nextQty,
      regular_qty: nextQty,
      line_totals: {
        ...(entry?.line_totals || {}),
        final_incl: unitIncl * nextQty,
        final_excl: unitExcl * nextQty,
      },
    };
  }

  const itemCount = items.reduce((sum, entry) => sum + Math.max(0, Number(entry?.quantity ?? entry?.qty ?? 0) || 0), 0);
  const finalIncl = items.reduce((sum, entry) => sum + Math.max(0, Number(entry?.line_totals?.final_incl || 0) || 0), 0);

  return {
    ...currentCart,
    items,
    totals: {
      ...(currentCart.totals || {}),
      final_incl: finalIncl,
      final_payable_incl: finalIncl,
    },
    cart: {
      ...(currentCart.cart || {}),
      item_count: itemCount,
    },
  };
}

export function CartPreviewDrawer({
  open,
  onClose,
  cartOwnerId,
  onCartChange,
}: {
  open: boolean;
  onClose: () => void;
  cartOwnerId: string | null;
  onCartChange?: (cart: unknown) => void;
}) {
  const { authReady } = useAuth();
  const { formatMoney } = useDisplayCurrency();
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const cartRef = useRef<typeof cart>(null);
  const lineSyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lineBaselineCartRef = useRef<Record<string, typeof cart>>({});
  const lineLatestCartRef = useRef<Record<string, typeof cart>>({});
  const [cart, setCart] = useState<{
    items?: CartPreviewItem[];
    totals?: { final_payable_incl?: number; final_incl?: number };
    cart?: { item_count?: number; cart_id?: string };
  } | null>(null);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    if (!authReady) return;
    if (!open || !cartOwnerId) return;

    let mounted = true;
    setLoading(true);
    fetch("/api/client/v1/carts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartOwnerId }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!mounted) return;
        const nextCart = (payload?.data?.cart ?? null) as typeof cart;
        setCart(nextCart);
        onCartChange?.(nextCart);
        setHasLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setCart(null);
        setHasLoaded(true);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [authReady, cartOwnerId, onCartChange, open]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const totalIncl = cart?.totals?.final_payable_incl ?? cart?.totals?.final_incl ?? 0;
  const cartId = String(cart?.cart?.cart_id || "").trim();
  const viewCartHref = cartId ? `/cart?cart=${encodeURIComponent(cartId)}` : "/cart";
  const showDrawerLoading = !authReady || (loading && !hasLoaded);
  const sellerGroups = items.reduce<Array<{ seller: string; items: CartPreviewItem[] }>>((groups, item) => {
    const seller =
      item?.product_snapshot?.seller?.vendorName?.trim() ||
      item?.product_snapshot?.product?.vendorName?.trim() ||
      "Piessang seller";
    const existing = groups.find((group) => group.seller === seller);
    if (existing) existing.items.push(item);
    else groups.push({ seller, items: [item] });
    return groups;
  }, []);

  const updateLine = async (
    item: CartPreviewItem,
    action: "increment" | "decrement" | "remove",
  ) => {
    if (!cartOwnerId) return;
    const productId =
      String(item?.product_snapshot?.product?.unique_id || "") ||
      String(item?.product_unique_id || "");
    const variantId = String(item?.selected_variant_snapshot?.variant_id || "");
    if (!productId || !variantId) return;

    const busyKey = String(item?.cart_item_key || `${productId}::${variantId}`);
    if (lineSyncTimersRef.current[busyKey]) {
      clearTimeout(lineSyncTimersRef.current[busyKey]);
    } else {
      lineBaselineCartRef.current[busyKey] = cartRef.current;
    }
    const optimisticCart = applyCartPreviewAction(cartRef.current, item, action);
    if (optimisticCart) {
      setCart(optimisticCart);
      onCartChange?.(optimisticCart);
      cartRef.current = optimisticCart;
      lineLatestCartRef.current[busyKey] = optimisticCart;
    }
    setLineBusyKey(busyKey);
    lineSyncTimersRef.current[busyKey] = setTimeout(async () => {
      try {
        const latestCart = lineLatestCartRef.current[busyKey] ?? optimisticCart;
        const latestItems = Array.isArray(latestCart?.items) ? latestCart.items : [];
        const latestLine = latestItems.find((entry) => {
          const entryProductId =
            String(entry?.product_snapshot?.product?.unique_id || "") || String(entry?.product_unique_id || "");
          const entryVariantId = String(entry?.selected_variant_snapshot?.variant_id || "");
          const entryKey = String(entry?.cart_item_key || `${entryProductId}::${entryVariantId}`);
          return entryKey === busyKey;
        });

        const endpoint = latestLine ? "/api/client/v1/carts/update" : "/api/client/v1/carts/removeItem";
        const payload = latestLine
          ? {
              cartOwnerId,
              productId,
              variantId,
              mode: "set",
              qty: Math.max(0, Number(latestLine?.quantity ?? latestLine?.qty ?? 0) || 0),
              cart_item_key: latestLine?.cart_item_key || item?.cart_item_key || null,
            }
          : { cartOwnerId, unique_id: productId, variant_id: variantId };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.ok === false) throw new Error(json?.message || "Unable to update cart.");
        const nextCart = (json?.data?.cart ?? null) as typeof cart;
        setCart(nextCart);
        onCartChange?.(nextCart);
        cartRef.current = nextCart;
        setSnackbarMessage(latestLine ? "Cart quantity updated." : "Item removed from your cart.");
      } catch (error) {
        const fallbackCart = lineBaselineCartRef.current[busyKey] ?? null;
        setCart(fallbackCart);
        onCartChange?.(fallbackCart);
        cartRef.current = fallbackCart;
        const message = error instanceof Error ? error.message : "Unable to update your cart.";
        setSnackbarMessage(message);
      } finally {
        delete lineSyncTimersRef.current[busyKey];
        delete lineBaselineCartRef.current[busyKey];
        delete lineLatestCartRef.current[busyKey];
        setLineBusyKey((current) => (current === busyKey ? null : current));
      }
    }, 220);
  };

  useEffect(() => {
    return () => {
      for (const timer of Object.values(lineSyncTimersRef.current)) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!snackbarMessage) return undefined;
    const timer = window.setTimeout(() => setSnackbarMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [snackbarMessage]);

  return (
    <div className={`fixed inset-0 z-[68] ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close cart preview backdrop"
        className={`absolute inset-0 bg-black/35 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-[92vw] max-w-[420px] overflow-y-auto bg-white shadow-[0_20px_48px_rgba(20,24,27,0.22)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart preview</p>
            {showDrawerLoading ? (
              <div className="mt-2 h-6 w-24 animate-pulse rounded bg-[#ece8df]" />
            ) : (
              <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{itemCount} items</h3>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c] transition-colors hover:bg-[#ededed]"
            aria-label="Close cart"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-[8px] bg-[#fafafa] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Estimated total</p>
            {showDrawerLoading ? (
              <div className="mt-2 h-8 w-32 animate-pulse rounded bg-[#ece8df]" />
            ) : (
              <p className="mt-1 text-[22px] font-semibold text-[#202020]">{formatMoney(totalIncl)}</p>
            )}
          </div>

          {showDrawerLoading ? (
            <div className="space-y-3">
              {[0, 1].map((index) => (
                <div key={index} className="rounded-[8px] border border-black/5 bg-white p-3 shadow-[0_6px_18px_rgba(20,24,27,0.05)]">
                  <div className="flex gap-3">
                    <div className="h-14 w-14 animate-pulse rounded-[8px] bg-[#f1ede4]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-[#f1ede4]" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-[#eef1f4]" />
                      <div className="h-3 w-2/5 animate-pulse rounded bg-[#eef1f4]" />
                      <div className="h-3.5 w-24 animate-pulse rounded bg-[#f1ede4]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!showDrawerLoading && items.length ? (
            <div className="space-y-3">
              {sellerGroups.map((group) => (
                <section key={group.seller} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{group.seller}</p>
                    <p className="text-[10px] text-[#8b94a3]">
                      {group.items.some((item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase() === "bevgo")
                        ? "Piessang delivery available"
                        : "Seller delivery"}
                    </p>
                  </div>
                  {group.items.map((item, index) => {
                    const productId =
                      String(item?.product_snapshot?.product?.unique_id || "") ||
                      String(item?.product_unique_id || "");
                    const variantId = String(item?.selected_variant_snapshot?.variant_id || "");
                    const busyKey = String(item?.cart_item_key || `${productId}::${variantId}`);
                    return (
                      <CartItemCard
                        key={`${group.seller}-${item.product_snapshot?.product?.title ?? "item"}-${index}`}
                        item={item}
                        compact
                        onIncrement={() => void updateLine(item, "increment")}
                        onDecrement={() => void updateLine(item, "decrement")}
                        onRemove={() => void updateLine(item, "remove")}
                        onIncrementBlocked={(message) => setSnackbarMessage(message)}
                        busy={lineBusyKey === busyKey}
                      />
                    );
                  })}
                </section>
              ))}
            </div>
          ) : !showDrawerLoading ? (
            <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
              Your cart is empty right now.
            </div>
          ) : null}

          <CartActionStack
            compact
            viewCartHref={viewCartHref}
          />
        </div>

        <AppSnackbar notice={snackbarMessage ? { tone: "info", message: snackbarMessage } : null} />
      </aside>
    </div>
  );
}
