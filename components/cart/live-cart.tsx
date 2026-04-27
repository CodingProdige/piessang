"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { CartActionStack } from "@/components/cart/cart-actions";
import { CartItemCard } from "@/components/cart/cart-item-card";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { readShopperDeliveryArea } from "@/components/products/delivery-area-gate";
import { PHONE_REGION_OPTIONS } from "@/components/shared/phone-input";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { fetchCheckoutShippingPreview, type CheckoutShippingPreview } from "@/lib/shipping/client-preview";

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
    cart_id?: string;
  };
};

type SharedCartState = {
  cart: CartPayload | null;
  cartId: string;
  shareToken: string;
  isOwner: boolean;
};

function applyLocalCartAction(currentCart: CartPayload | null, item: CartItem, action: "increment" | "decrement" | "remove") {
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

function getSellerGroupKey(item: CartItem) {
  const productSnapshot = item?.product_snapshot as any;
  return String(
    productSnapshot?.product?.sellerCode ||
      productSnapshot?.seller?.sellerCode ||
      productSnapshot?.seller?.sellerSlug ||
      "",
  ).trim();
}

function toCountryCode(countryValue?: string | null) {
  const normalized = String(countryValue || "").trim().toLowerCase();
  if (!normalized) return "";
  const match = PHONE_REGION_OPTIONS.find((option) => option.label.replace(/\s*\(\+\d+\)$/, "").trim().toLowerCase() === normalized);
  return match?.iso || String(countryValue || "").trim().toUpperCase();
}

function buildBuyerDestinationFromShopperArea() {
  const shopperArea = readShopperDeliveryArea() as any;
  if (!shopperArea) return null;
  const country = String(shopperArea.country || "").trim();
  const province = String(shopperArea.province || shopperArea.stateProvinceRegion || "").trim();
  const postalCode = String(shopperArea.postalCode || "").trim();
  const city = String(shopperArea.city || shopperArea.suburb || "").trim();
  const countryCode = toCountryCode(country);
  if (!countryCode && !province && !postalCode && !city) return null;
  return {
    countryCode,
    province,
    city,
    postalCode,
  };
}

function formatEta(estimatedDeliveryDays?: { min?: number | null; max?: number | null } | null) {
  const min = Number(estimatedDeliveryDays?.min);
  const max = Number(estimatedDeliveryDays?.max);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}-${max} days`;
  }
  if (Number.isFinite(min)) return `${min}+ days`;
  if (Number.isFinite(max)) return `Up to ${max} days`;
  return "";
}

function formatGroupShippingLabel(
  sellerKey: string,
  preview: CheckoutShippingPreview | null,
  destinationKnown: boolean,
  formatMoney: (amount: number) => string,
) {
  if (!destinationKnown) return "Shipping calculated at checkout";
  const error = preview?.errors.find((entry) => String(entry?.sellerId || "").trim() === sellerKey);
  if (error) return error.message || "This seller does not ship to the selected destination.";
  const option = preview?.options.find((entry) => String(entry?.sellerId || "").trim() === sellerKey);
  if (!option) return "Shipping unavailable";
  const eta = formatEta(option.estimatedDeliveryDays);
  return eta ? `${formatMoney(option.finalShippingFee)} · ${eta}` : formatMoney(option.finalShippingFee);
}

export function LiveCart({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { uid, cartOwnerId, authReady, syncCartState } = useAuth();
  const { formatMoney } = useDisplayCurrency();
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [sharedCart, setSharedCart] = useState<SharedCartState | null>(null);
  const [sharedCartLoading, setSharedCartLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copyingSharedCart, setCopyingSharedCart] = useState(false);
  const [shippingPreview, setShippingPreview] = useState<CheckoutShippingPreview | null>(null);
  const [shippingPreviewLoading, setShippingPreviewLoading] = useState(false);
  const cartRef = useRef<CartPayload | null>(null);
  const lineSyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lineBaselineCartRef = useRef<Record<string, CartPayload | null>>({});
  const lineLatestCartRef = useRef<Record<string, CartPayload | null>>({});

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const shareToken = String(searchParams?.get("share") || "").trim();

  useEffect(() => {
    const currentCartId = String(cart?.cart?.cart_id || "").trim();
    const requestedCartId = String(searchParams?.get("cart") || "").trim();
    if (!currentCartId || pathname !== "/cart" || shareToken || currentCartId === requestedCartId) return;
    const nextParams = new URLSearchParams(searchParams?.toString() || "");
    nextParams.set("cart", currentCartId);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [cart?.cart?.cart_id, pathname, router, searchParams, shareToken]);

  useEffect(() => {
    if (!authReady) return;
    if (!shareToken) {
      setSharedCart(null);
      setSharedCartLoading(false);
      return;
    }

    let mounted = true;
    setSharedCartLoading(true);

    fetch("/api/client/v1/carts/shared/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareToken,
        cartOwnerId: cartOwnerId || uid || null,
      }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (!mounted) return;
        if (payload?.ok === false) {
          throw new Error(payload?.message || "We could not load that shared cart.");
        }
        setSharedCart({
          cart: (payload?.data?.cart ?? null) as CartPayload | null,
          cartId: String(payload?.data?.cartId || "").trim(),
          shareToken,
          isOwner: payload?.data?.isOwner === true,
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setSharedCart(null);
        setSnackbarMessage(error instanceof Error ? error.message : "We could not load that shared cart.");
      })
      .finally(() => {
        if (!mounted) return;
        setSharedCartLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [authReady, cartOwnerId, shareToken, uid]);

  useEffect(() => {
    if (!authReady) return;
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) {
      setCart(null);
      setHasLoaded(true);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setHasLoaded(false);

    fetch("/api/client/v1/carts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartOwnerId: activeCartOwnerId, lightweight: true }),
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
  }, [authReady, cartOwnerId, syncCartState, uid]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const buyerDestination = buildBuyerDestinationFromShopperArea();
  const destinationKnown = Boolean(buyerDestination);
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const productsTotalIncl = items.reduce((sum, item) => sum + Math.max(0, Number(item?.line_totals?.final_incl || 0) || 0), 0);
  const totalIncl = destinationKnown
    ? productsTotalIncl + Number(shippingPreview?.shippingFinalTotal || 0)
    : productsTotalIncl;
  const showSharedCartView = Boolean(sharedCart && !sharedCart.isOwner);
  const displayedCart = showSharedCartView ? sharedCart?.cart ?? null : cart;
  const displayedItems = Array.isArray(displayedCart?.items) ? displayedCart.items : [];
  const displayedItemCount = displayedCart?.cart?.item_count ?? displayedItems.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const displayedTotalIncl = displayedCart?.totals?.final_payable_incl ?? displayedCart?.totals?.final_incl ?? 0;
  const showCartLoading = !authReady || !hasLoaded || sharedCartLoading;
  const sellerGroups = items.reduce<Array<{ seller: string; sellerKey: string; items: CartItem[] }>>((groups, item) => {
    const seller = getSellerGroupLabel(item);
    const sellerKey = getSellerGroupKey(item) || seller;
    const existing = groups.find((group) => group.sellerKey === sellerKey);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ seller, sellerKey, items: [item] });
    }
    return groups;
  }, []);
  const unavailableItems = items.filter((item) => {
    const status = String(item?.availability?.status || "").trim().toLowerCase();
    return status === "out_of_stock" || status === "unavailable";
  });
  const shippingBlockedSellerKeys = new Set(
    (shippingPreview?.errors || [])
      .filter((entry) =>
        String(entry?.code || "").trim() === "SELLER_DOES_NOT_SHIP_TO_LOCATION" ||
        String(entry?.code || "").trim() === "WEIGHT_REQUIRED_FOR_SHIPPING_MODE",
      )
      .map((entry) => String(entry?.sellerId || "").trim())
      .filter(Boolean),
  );
  const checkoutBlocked = unavailableItems.length > 0 || shippingBlockedSellerKeys.size > 0;
  const unavailableStateSummary = unavailableItems.reduce(
    (summary, item) => {
      const status = String(item?.availability?.status || "").trim().toLowerCase();
      if (status === "unavailable") summary.noLongerAvailable += 1;
      else if (status === "out_of_stock") summary.outOfStock += 1;
      return summary;
    },
    { noLongerAvailable: 0, outOfStock: 0 },
  );
  const checkoutBlockMessage = checkoutBlocked
    ? unavailableStateSummary.noLongerAvailable > 0 && unavailableStateSummary.outOfStock === 0
      ? `${unavailableStateSummary.noLongerAvailable} item${unavailableStateSummary.noLongerAvailable === 1 ? "" : "s"} in your cart ${unavailableStateSummary.noLongerAvailable === 1 ? "is" : "are"} no longer available. Remove ${unavailableStateSummary.noLongerAvailable === 1 ? "it" : "them"} before continuing to checkout.`
      : unavailableStateSummary.outOfStock > 0 && unavailableStateSummary.noLongerAvailable === 0
        ? `${unavailableStateSummary.outOfStock} item${unavailableStateSummary.outOfStock === 1 ? "" : "s"} in your cart ${unavailableStateSummary.outOfStock === 1 ? "is" : "are"} out of stock. Remove ${unavailableStateSummary.outOfStock === 1 ? "it" : "them"} before continuing to checkout.`
        : unavailableItems.length > 0
          ? `${unavailableItems.length} item${unavailableItems.length === 1 ? "" : "s"} in your cart need attention before checkout. Remove the unavailable item${unavailableItems.length === 1 ? "" : "s"} first.`
          : "One or more sellers do not ship to your selected destination. Update your destination or remove those items before checkout."
    : "";
  const displayedSellerGroups = displayedItems.reduce<Array<{ seller: string; sellerKey: string; items: CartItem[] }>>((groups, item) => {
    const seller = getSellerGroupLabel(item);
    const sellerKey = getSellerGroupKey(item) || seller;
    const existing = groups.find((group) => group.sellerKey === sellerKey);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ seller, sellerKey, items: [item] });
    }
    return groups;
  }, []);

  useEffect(() => {
    if (showSharedCartView) {
      setShippingPreview(null);
      setShippingPreviewLoading(false);
      return;
    }
    if (!items.length || !destinationKnown || checkoutBlocked && unavailableItems.length > 0) {
      setShippingPreview(null);
      setShippingPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setShippingPreviewLoading(true);
    fetchCheckoutShippingPreview({
      items: items as Array<Record<string, unknown>>,
      buyerDestination: buyerDestination as Record<string, unknown>,
    })
      .then((preview) => {
        if (!cancelled) setShippingPreview(preview);
      })
      .catch(() => {
        if (!cancelled) setShippingPreview({ options: [], errors: [], shippingBaseTotal: 0, shippingFinalTotal: 0 });
      })
      .finally(() => {
        if (!cancelled) setShippingPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerDestination, destinationKnown, items, showSharedCartView, unavailableItems.length]);

  const updateLine = async (item: CartItem, action: "increment" | "decrement" | "remove") => {
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) return;
    const { productId, variantId } = getLineIds(item);
    if (!productId || !variantId) return;

    const lineKey = String(item?.cart_item_key || `${productId}::${variantId}`);
    if (lineSyncTimersRef.current[lineKey]) {
      clearTimeout(lineSyncTimersRef.current[lineKey]);
    } else {
      lineBaselineCartRef.current[lineKey] = cartRef.current;
    }
    const optimisticCart = applyLocalCartAction(cartRef.current, item, action);
    if (optimisticCart) {
      setCart(optimisticCart);
      syncCartState(optimisticCart);
      cartRef.current = optimisticCart;
      lineLatestCartRef.current[lineKey] = optimisticCart;
    }
    setLineBusyKey(lineKey);
    lineSyncTimersRef.current[lineKey] = setTimeout(async () => {
      try {
        const latestCart = lineLatestCartRef.current[lineKey] ?? optimisticCart;
        const latestItems = Array.isArray(latestCart?.items) ? latestCart.items : [];
        const latestLine = latestItems.find((entry) => {
          const entryIds = getLineIds(entry);
          const entryKey = String(entry?.cart_item_key || `${entryIds.productId}::${entryIds.variantId}`);
          return entryKey === lineKey;
        });

        const endpoint = latestLine ? "/api/client/v1/carts/update" : "/api/client/v1/carts/removeItem";
        const payload = latestLine
          ? {
              cartOwnerId: activeCartOwnerId,
              productId,
              variantId,
              mode: "set",
              qty: Math.max(0, Number(latestLine?.quantity ?? latestLine?.qty ?? 0) || 0),
              cart_item_key: latestLine?.cart_item_key || item?.cart_item_key || null,
            }
          : { cartOwnerId: activeCartOwnerId, unique_id: productId, variant_id: variantId };

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
        cartRef.current = nextCart;
        setSnackbarMessage(latestLine ? "Cart quantity updated." : "Item removed from your cart.");
      } catch (error) {
        const fallbackCart = lineBaselineCartRef.current[lineKey] ?? null;
        setCart(fallbackCart);
        syncCartState(fallbackCart);
        cartRef.current = fallbackCart;
        const message = error instanceof Error ? error.message : "Unable to update your cart.";
        setSnackbarMessage(message);
      } finally {
        delete lineSyncTimersRef.current[lineKey];
        delete lineBaselineCartRef.current[lineKey];
        delete lineLatestCartRef.current[lineKey];
        setLineBusyKey((current) => (current === lineKey ? null : current));
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

  const handleShareCart = async () => {
    const activeCartOwnerId = cartOwnerId || uid || null;
    const currentCartId = String(cart?.cart?.cart_id || "").trim();
    if (!activeCartOwnerId || !currentCartId) return;
    setSharing(true);
    try {
      const response = await fetch("/api/client/v1/carts/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartOwnerId: activeCartOwnerId, cartId: currentCartId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not create a share link for this cart.");
      }
      const shareUrl = String(payload?.data?.shareUrl || "").trim();
      if (shareUrl && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setSnackbarMessage("Share link copied.");
      } else if (shareUrl) {
        setSnackbarMessage(shareUrl);
      }
    } catch (error) {
      setSnackbarMessage(error instanceof Error ? error.message : "We could not create a share link for this cart.");
    } finally {
      setSharing(false);
    }
  };

  const handleCopySharedCart = async () => {
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId || !shareToken) return;
    setCopyingSharedCart(true);
    try {
      const response = await fetch("/api/client/v1/carts/shared/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareToken, cartOwnerId: activeCartOwnerId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not copy this cart into your cart.");
      }
      const nextCart = (payload?.data?.cart ?? null) as CartPayload | null;
      setCart(nextCart);
      syncCartState(nextCart);
      cartRef.current = nextCart;
      const nextParams = new URLSearchParams(searchParams?.toString() || "");
      nextParams.delete("share");
      const nextCartId = String(nextCart?.cart?.cart_id || "").trim();
      if (nextCartId) nextParams.set("cart", nextCartId);
      router.replace(`${pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`, { scroll: false });
      setSnackbarMessage("Cart copied to your cart.");
    } catch (error) {
      setSnackbarMessage(error instanceof Error ? error.message : "We could not copy this cart into your cart.");
    } finally {
      setCopyingSharedCart(false);
    }
  };

  return (
    <section className={`rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart</p>
          {showCartLoading ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded bg-[#ece8df]" />
          ) : (
            <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">
              {displayedItemCount} items
            </h1>
          )}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Total</p>
          {showCartLoading ? (
            <div className="mt-2 ml-auto h-7 w-32 animate-pulse rounded bg-[#ece8df]" />
          ) : (
            <p className="mt-1 text-[22px] font-semibold text-[#202020]">{formatMoney(displayedTotalIncl)}</p>
          )}
        </div>
      </div>

      {!showCartLoading && showSharedCartView ? (
        <div className="mt-4 rounded-[8px] border border-[#d6cffb] bg-[rgba(111,85,246,0.06)] px-4 py-4 text-[13px] text-[#4c3fb3]">
          <p className="font-semibold text-[#202020]">Shared cart preview</p>
          <p className="mt-1 leading-[1.6]">
            You&apos;re viewing a shared cart. Copy these items into your own cart to continue shopping or checkout.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCopySharedCart()}
              disabled={copyingSharedCart || !(cartOwnerId || uid)}
              className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copyingSharedCart ? "Copying cart..." : "Copy cart to my cart"}
            </button>
            <Link href="/products" className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]">
              Continue shopping
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {!showCartLoading && !showSharedCartView && checkoutBlocked ? (
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
                  <div className="h-4 w-44 animate-pulse rounded bg-[#eef1f4]" />
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
                          <div className="h-3 w-1/2 animate-pulse rounded bg-[#eef1f4]" />
                          <div className="h-3 w-2/5 animate-pulse rounded bg-[#eef1f4]" />
                          <div className="h-4 w-24 animate-pulse rounded bg-[#ece8df]" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : displayedItems.length ? (
          displayedSellerGroups.map((group) => (
            <section key={group.seller} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
              {(() => {
                const sellerDeliveryLabel = formatGroupShippingLabel(group.sellerKey, shippingPreview, destinationKnown, formatMoney);
                const sellerShippingError = shippingPreview?.errors.find((entry) => String(entry?.sellerId || "").trim() === group.sellerKey);
                return (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Seller</p>
                  <h2 className="mt-1 text-[16px] font-semibold text-[#202020]">{group.seller}</h2>
                </div>
                <div className="max-w-[34ch] text-right">
                  <p className="text-[12px] text-[#57636c]">{getSellerFulfillmentSummary(group.items)}</p>
                  {sellerDeliveryLabel ? (
                    <p className={`mt-1 text-[12px] font-semibold ${sellerShippingError ? "text-[#b91c1c]" : "text-[#202020]"}`}>{sellerDeliveryLabel}</p>
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
                      onIncrement={showSharedCartView ? undefined : () => void updateLine(item, "increment")}
                      onDecrement={showSharedCartView ? undefined : () => void updateLine(item, "decrement")}
                      onRemove={showSharedCartView ? undefined : () => void updateLine(item, "remove")}
                      onIncrementBlocked={showSharedCartView ? undefined : (message) => setSnackbarMessage(message)}
                      busy={!showSharedCartView && lineBusyKey === busyKey}
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

      {!showSharedCartView ? (
        <>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleShareCart()}
              disabled={sharing || !cart?.cart?.cart_id}
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sharing ? "Creating share link..." : "Share cart"}
            </button>
          </div>
          <CartActionStack
            showViewCart={false}
            disableCheckout={checkoutBlocked}
            checkoutHint={checkoutBlockMessage}
          />
        </>
      ) : null}

      <AppSnackbar notice={snackbarMessage ? { tone: "info", message: snackbarMessage } : null} />
    </section>
  );
}
