"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CartActionStack } from "@/components/cart/cart-actions";
import { CartItemCard } from "@/components/cart/cart-item-card";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { readShopperDeliveryArea } from "@/components/products/delivery-area-gate";
import { resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";

type CartItem = {
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
  availability?: {
    status?: string;
    message?: string;
  };
  product_snapshot?: {
    product?: {
      unique_id?: string | number | null;
      title?: string | null;
      vendorName?: string | null;
    };
    seller?: {
      vendorName?: string | null;
      baseLocation?: string | null;
      deliveryProfile?: {
        localDeliveryRules?: Array<{ id?: string | null; label?: string | null; city?: string | null; suburb?: string | null; fee?: number; leadTimeDays?: number }>;
        courierZones?: Array<{ id?: string | null; label?: string | null; country?: string | null; province?: string | null; city?: string | null; postalCodes?: string[]; fee?: number; leadTimeDays?: number; isFallback?: boolean }>;
        allowsCollection?: boolean;
      };
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
    };
  };
};

type CartPayload = {
  items?: CartItem[];
  totals?: {
    subtotal_excl?: number;
    deposit_total_excl?: number;
    vat_total?: number;
    final_payable_incl?: number;
    final_incl?: number;
  };
  cart?: {
    item_count?: number;
  };
};

function getLineIds(item: CartItem) {
  const productId =
    String(item?.product_snapshot?.product?.unique_id || "") ||
    String(item?.product_unique_id || "");
  const variantId = String(item?.selected_variant_snapshot?.variant_id || "");
  return { productId, variantId };
}

function getSellerGroupLabel(item: CartItem) {
  return (
    item?.product_snapshot?.seller?.vendorName?.trim() ||
    item?.product_snapshot?.product?.vendorName?.trim() ||
    "Piessang seller"
  );
}

function getSellerFulfillmentSummary(items: CartItem[]) {
  const modes = new Set(
    items
      .map((item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (modes.has("bevgo") && modes.has("seller")) {
    return "Some items ship from Piessang and some ship directly from the seller.";
  }
  if (modes.has("bevgo")) {
    return "Piessang handles shipping for these items.";
  }
  return "The seller handles shipping for these items.";
}

function getSellerDeliveryFeeForGroup(items: CartItem[]) {
  const shopperArea = readShopperDeliveryArea();
  const sellerItems = items.filter(
    (item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase() === "seller",
  );
  if (!sellerItems.length) {
    return null;
  }

  const seller = sellerItems[0]?.product_snapshot?.seller;
  const deliveryProfile = seller?.deliveryProfile;
  if (!deliveryProfile) {
    return "Set your shipping location to confirm seller shipping";
  }
  const resolved = resolveSellerDeliveryOption({
    profile: deliveryProfile,
    sellerBaseLocation: seller?.baseLocation || "",
    shopperArea: shopperArea as any,
  });
  return resolved.label;
}

export function LiveCart({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, uid, openAuthModal, syncCartState } = useAuth();
  const { formatMoney } = useDisplayCurrency();
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !uid) {
      setCart(null);
      return;
    }

    let mounted = true;
    setLoading(true);

    fetch("/api/client/v1/carts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!mounted) return;
        const nextCart = (payload?.data?.cart ?? null) as CartPayload | null;
        setCart(nextCart);
        syncCartState(nextCart);
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
  }, [isAuthenticated, syncCartState, uid]);

  if (!isAuthenticated) {
    return (
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Your cart</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
          Sign in to see your live cart and continue to checkout.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal("Sign in to manage your cart.")}
          className="brand-button mt-5 inline-flex items-center rounded-[8px] px-4 py-2.5 text-[13px] font-semibold"
        >
          Sign in
        </button>
      </section>
    );
  }

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const totalIncl = cart?.totals?.final_payable_incl ?? cart?.totals?.final_incl ?? 0;
  const showCartLoading = loading && !hasLoaded;
  const sellerGroups = items.reduce<Array<{ seller: string; items: CartItem[] }>>((groups, item) => {
    const seller = getSellerGroupLabel(item);
    const existing = groups.find((group) => group.seller === seller);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ seller, items: [item] });
    }
    return groups;
  }, []);
  const unavailableItems = items.filter(
    (item) => String(item?.availability?.status || "").trim().toLowerCase() === "out_of_stock",
  );
  const checkoutBlocked = unavailableItems.length > 0;
  const checkoutBlockMessage = checkoutBlocked
    ? `${unavailableItems.length} item${unavailableItems.length === 1 ? "" : "s"} in your cart ${unavailableItems.length === 1 ? "is" : "are"} out of stock. Remove ${unavailableItems.length === 1 ? "it" : "them"} before continuing to checkout.`
    : "";

  const updateLine = async (item: CartItem, action: "increment" | "decrement" | "remove") => {
    if (!uid) return;
    const { productId, variantId } = getLineIds(item);
    if (!productId || !variantId) return;

    const lineKey = String(item?.cart_item_key || `${productId}::${variantId}`);
    setLineBusyKey(lineKey);
    try {
      const endpoint = action === "remove" ? "/api/client/v1/carts/removeItem" : "/api/client/v1/carts/update";
      const payload =
        action === "remove"
          ? { uid, unique_id: productId, variant_id: variantId }
          : {
              uid,
              productId,
              variantId,
              mode: action === "increment" ? "change" : "change",
              qty: action === "increment" ? 1 : -1,
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || "Unable to update cart.");
      const nextCart = (json?.data?.cart ?? null) as CartPayload | null;
      setCart(nextCart);
      syncCartState(nextCart);
      setSnackbarMessage(
        action === "remove"
          ? "Item removed from your cart."
          : action === "increment"
            ? "Cart quantity updated."
            : "Cart quantity updated.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update your cart.";
      setSnackbarMessage(message);
    } finally {
      setLineBusyKey(null);
    }
  };

  useEffect(() => {
    if (!snackbarMessage) return undefined;
    const timer = window.setTimeout(() => setSnackbarMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [snackbarMessage]);

  return (
    <section className={`rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart</p>
          {showCartLoading ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded bg-[#ece8df]" />
          ) : (
            <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">
              {itemCount} items
            </h1>
          )}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Total</p>
          {showCartLoading ? (
            <div className="mt-2 ml-auto h-7 w-32 animate-pulse rounded bg-[#ece8df]" />
          ) : (
            <p className="mt-1 text-[22px] font-semibold text-[#202020]">{formatMoney(totalIncl)}</p>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {!showCartLoading && checkoutBlocked ? (
          <div className="rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
            {checkoutBlockMessage}
          </div>
        ) : null}
        {showCartLoading ? (
          <>
            {[0, 1].map((index) => (
              <section key={index} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3">
                  <div>
                    <div className="h-3 w-16 animate-pulse rounded bg-[#f1ede4]" />
                    <div className="mt-2 h-5 w-40 animate-pulse rounded bg-[#ece8df]" />
                  </div>
                  <div className="h-4 w-44 animate-pulse rounded bg-[#f5f1e8]" />
                </div>

                <div className="space-y-3">
                  {[0, 1].map((cardIndex) => (
                    <div
                      key={cardIndex}
                      className="rounded-[8px] border border-black/5 bg-white p-3 shadow-[0_6px_18px_rgba(20,24,27,0.05)]"
                    >
                      <div className="flex gap-3">
                        <div className="h-16 w-16 animate-pulse rounded-[8px] bg-[#f1ede4]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-[#ece8df]" />
                          <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f1e8]" />
                          <div className="h-3 w-2/5 animate-pulse rounded bg-[#f5f1e8]" />
                          <div className="h-4 w-24 animate-pulse rounded bg-[#ece8df]" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : items.length ? (
          sellerGroups.map((group) => (
            <section key={group.seller} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
              {(() => {
                const sellerDeliveryLabel = getSellerDeliveryFeeForGroup(group.items);
                return (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Seller</p>
                  <h2 className="mt-1 text-[16px] font-semibold text-[#202020]">{group.seller}</h2>
                </div>
                <div className="max-w-[34ch] text-right">
                  <p className="text-[12px] text-[#57636c]">{getSellerFulfillmentSummary(group.items)}</p>
                  {sellerDeliveryLabel ? (
                    <p className="mt-1 text-[12px] font-semibold text-[#202020]">{sellerDeliveryLabel}</p>
                  ) : null}
                </div>
              </div>
                );
              })()}

              <div className="space-y-3">
                {group.items.map((item, index) => {
                  const { productId, variantId } = getLineIds(item);
                  const busyKey = String(item?.cart_item_key || `${productId}::${variantId}`);
                  return (
                    <CartItemCard
                      key={`${group.seller}-${item.product_snapshot?.product?.title ?? "item"}-${index}`}
                      item={item}
                      onIncrement={() => void updateLine(item, "increment")}
                      onDecrement={() => void updateLine(item, "decrement")}
                      onRemove={() => void updateLine(item, "remove")}
                      busy={lineBusyKey === busyKey}
                    />
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
            Your cart is empty right now.
          </div>
        )}
      </div>

      <CartActionStack
        showViewCart={false}
        disableCheckout={checkoutBlocked}
        checkoutHint={checkoutBlockMessage}
      />

      {snackbarMessage ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[85] -translate-x-1/2 rounded-full bg-[#202020] px-4 py-2 text-[12px] font-medium text-white shadow-[0_14px_30px_rgba(20,24,27,0.24)]">
          {snackbarMessage}
        </div>
      ) : null}
    </section>
  );
}
