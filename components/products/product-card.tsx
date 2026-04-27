"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type TouchEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";

export const PRODUCT_CARD_LIST_IMAGE_SIZES = "(max-width: 640px) calc(100vw - 2rem), 180px";
export const PRODUCT_CARD_GRID_IMAGE_SIZES = "(max-width: 640px) 72vw, (max-width: 1024px) 40vw, 280px";

function getProductHref(item: ShopperVisibleProductCard) {
  const uniqueId = String(item.id || "").trim();
  const slug =
    String(item.slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product";
  return uniqueId ? `/products/${slug}?unique_id=${encodeURIComponent(uniqueId)}` : "/products";
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M8 1.25 9.58 5l3.92.31-2.99 2.62.94 3.82L8 9.74l-3.45 2.01.94-3.82L2.5 5.31 6.42 5 8 1.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProductBadgeIcon({
  iconKey,
  iconUrl,
}: {
  iconKey?: string | null;
  iconUrl?: string | null;
}) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="h-3.5 w-3.5 object-contain" aria-hidden="true" />;
  }
  if (iconKey === "spark") return <SparkIcon />;
  if (iconKey === "star") return <SparkIcon />;
  return null;
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M10 16.25 4.56 11.1A3.93 3.93 0 0 1 10 5.53a3.93 3.93 0 0 1 5.44 5.57L10 16.25Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M6.25 5.5 7.5 4h5l1.25 1.5H16A1.5 1.5 0 0 1 17.5 7v7A1.5 1.5 0 0 1 16 15.5H4A1.5 1.5 0 0 1 2.5 14V7A1.5 1.5 0 0 1 4 5.5h2.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="10.25" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M7.25 5.25 15 10l-7.75 4.75v-9.5Z" fill="currentColor" />
    </svg>
  );
}

function CartPlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path
        d="M2.5 3.75h2l1.25 7.5h8.5l1.5-5.5H6.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle cx="8" cy="15.5" r="1.1" fill="currentColor" />
      <circle cx="13.75" cy="15.5" r="1.1" fill="currentColor" />
      <path d="M15.5 4.25v3.5M13.75 6h3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export function ProductCard({
  item,
  openInNewTab,
  onAddToCartSuccess,
  cartBurstKey,
}: {
  item: ShopperVisibleProductCard;
  view?: "grid" | "list";
  openInNewTab: boolean;
  brandHref?: string;
  vendorHref?: string;
  brandLabel?: string;
  vendorLabel?: string;
  currentUrl?: string;
  onAddToCartSuccess?: (cart: any) => void;
  cartBurstKey?: number;
}) {
  const router = useRouter();
  const { formatMoney } = useDisplayCurrency();
  const {
    isAuthenticated,
    uid,
    cartOwnerId,
    openAuthModal,
    refreshProfile,
    refreshCart,
    optimisticAddToCart,
    cartProductCounts,
    favoriteIds,
  } = useAuth();
  const [isFavorite, setIsFavorite] = useState(Boolean(favoriteIds?.includes(item.id)));
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartJustAdded, setCartJustAdded] = useState(false);
  const [cartBlockedNotice, setCartBlockedNotice] = useState<string | null>(null);
  const [mediaHovered, setMediaHovered] = useState(false);
  const [hoveredImageIndex, setHoveredImageIndex] = useState(0);
  const titleText = item.title || "Untitled product";
  const href = getProductHref(item);
  const priceText = typeof item.price.amountIncl === "number" ? formatMoney(item.price.amountIncl) : null;
  const compareAtText =
    item.price.onSale && typeof item.price.compareAtIncl === "number" ? formatMoney(item.price.compareAtIncl) : null;
  const salePercent = item.price.salePercent;
  const videoUrl = String(item.image.videoUrl || "").trim();
  const hasPlayableVideo = Boolean(videoUrl);
  const showVideoPreview = Boolean(videoUrl && mediaHovered);
  const displayImages =
    Array.isArray(item.image.images) && item.image.images.length
      ? item.image.images
      : item.image.imageUrl
        ? [{ imageUrl: item.image.imageUrl, blurHashUrl: item.image.blurHashUrl }]
        : [];
  const displayImage = displayImages[hoveredImageIndex] ?? displayImages[0] ?? null;
  const cartCount = cartProductCounts[item.id] ?? 0;
  const availableQty =
    typeof item.stock.availableQty === "number" && Number.isFinite(item.stock.availableQty)
      ? Math.max(0, Math.trunc(item.stock.availableQty))
      : null;
  const reachedCartLimit = typeof availableQty === "number" && availableQty > 0 && cartCount >= availableQty;
  const cartLimitMessage =
    typeof availableQty === "number" && availableQty > 0
      ? `You already have the maximum available quantity (${availableQty}) in your cart.`
      : "You already have the maximum available quantity in your cart.";
  const canAddToCart =
    item.shipping.isPurchasable &&
    item.stock.state !== "out_of_stock" &&
    !reachedCartLimit &&
    !cartBusy;
  const hasPrefetchedHrefRef = useRef(false);
  const shouldHighlightStock =
    item.stock.state === "low_stock" ||
    (/^only\s+\d+/i.test(item.stock.label) && item.stock.state !== "out_of_stock");
  const showStockLabel = shouldHighlightStock || item.stock.state === "out_of_stock";

  useEffect(() => {
    setIsFavorite(Boolean(favoriteIds?.includes(item.id)));
  }, [favoriteIds, item.id]);

  useEffect(() => {
    if (!cartJustAdded) return undefined;
    const timeout = window.setTimeout(() => setCartJustAdded(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [cartJustAdded]);

  useEffect(() => {
    if (!cartBlockedNotice) return undefined;
    const timeout = window.setTimeout(() => setCartBlockedNotice(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [cartBlockedNotice]);

  const prefetchProductHref = () => {
    if (hasPrefetchedHrefRef.current || !href) return;
    hasPrefetchedHrefRef.current = true;
    void router.prefetch(href);
  };

  useEffect(() => {
    hasPrefetchedHrefRef.current = false;
    setHoveredImageIndex(0);
  }, [href]);

  useEffect(() => {
    if (!href || typeof window === "undefined") return;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const schedulePrefetch = () => {
      prefetchProductHref();
    };
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(schedulePrefetch, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(schedulePrefetch, 250);
    }
    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [href, router]);

  const openProduct = () => {
    if (openInNewTab) {
      window.open(href, "_blank", "noreferrer,noopener");
      return;
    }
    router.push(href, { scroll: true });
  };

  const handleCardMouseEnter = () => {
    prefetchProductHref();
  };

  const handleCardTouchStart = (_event: TouchEvent<HTMLElement>) => {
    prefetchProductHref();
  };

  const handleCardFocus = (_event: FocusEvent<HTMLElement>) => {
    prefetchProductHref();
  };

  const handleMediaPointerMove = (event: MouseEvent<HTMLElement>) => {
    if (hasPlayableVideo) {
      if (hoveredImageIndex !== 0) setHoveredImageIndex(0);
      return;
    }
    if (displayImages.length <= 1) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const position = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
    const nextIndex = Math.min(displayImages.length - 1, Math.floor((position / bounds.width) * displayImages.length));
    if (nextIndex !== hoveredImageIndex) setHoveredImageIndex(nextIndex);
  };

  const handleMediaPointerLeave = () => {
    setMediaHovered(false);
    if (hoveredImageIndex !== 0) setHoveredImageIndex(0);
  };

  const handleFavoriteToggle = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated || !uid) {
      openAuthModal("Sign in to save favourites.");
      return;
    }
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      const response = await fetch("/api/client/v1/accounts/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, unique_id: item.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error("Unable to update favourites.");
      setIsFavorite(typeof payload?.isFavorite === "boolean" ? payload.isFavorite : !isFavorite);
      void refreshProfile();
    } catch {
      openAuthModal("We could not update your favourites right now.");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleAddToCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) return;
    if (!canAddToCart) {
      setCartBlockedNotice(
        reachedCartLimit
          ? cartLimitMessage
          : item.shipping.isPurchasable
            ? "This item cannot be added right now."
            : item.shipping.deliveryMessage,
      );
      return;
    }
    setCartBusy(true);
    try {
      const hydrate = await fetch(`/api/catalogue/v1/products/product/get?id=${encodeURIComponent(item.id)}`);
      const hydrated = await hydrate.json().catch(() => ({}));
      const productSnapshot = hydrated?.data;
      const variants = Array.isArray(productSnapshot?.variants) ? productSnapshot.variants : [];
      const defaultVariant =
        variants.find((variant: any) => variant?.placement?.is_default === true) ||
        variants.find((variant: any) => String(variant?.variant_id || "").trim()) ||
        variants[0] ||
        null;
      const variantId = String(defaultVariant?.variant_id || "").trim();
      if (!hydrate.ok || !productSnapshot || !variantId) {
        throw new Error("Please open the product to choose a variant first.");
      }
      optimisticAddToCart(item.id, variantId, 1);
      const response = await fetch("/api/client/v1/carts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartOwnerId: activeCartOwnerId,
          product: productSnapshot,
          variant_id: variantId,
          mode: cartCount > 0 ? "increment" : "add",
          qty: 1,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update cart.");
      setCartJustAdded(true);
      onAddToCartSuccess?.(payload?.data?.cart ?? null);
    } catch (error) {
      setCartBlockedNotice(error instanceof Error ? error.message : "Unable to update cart.");
      void refreshCart();
    } finally {
      setCartBusy(false);
    }
  };

  return (
    <>
      <article
        role="link"
        tabIndex={0}
        onClick={openProduct}
        onMouseEnter={handleCardMouseEnter}
        onTouchStart={handleCardTouchStart}
        onFocus={handleCardFocus}
        className="relative isolate mb-2 inline-block w-full break-inside-avoid rounded-[4px] bg-transparent before:pointer-events-none before:absolute before:-inset-2 before:-z-10 before:rounded-[4px] before:bg-white before:opacity-0 before:shadow-[0_10px_28px_rgba(20,24,27,0.14)] before:transition-opacity before:duration-150 hover:before:opacity-100"
      >
        <div className="flex h-full flex-col">
          <div
            className="relative aspect-[1/1] overflow-hidden bg-[#fafafa]"
            onMouseEnter={() => setMediaHovered(true)}
            onMouseMove={handleMediaPointerMove}
            onMouseLeave={handleMediaPointerLeave}
          >
            {item.image.imageCount > 0 ? (
              <span className="absolute bottom-2 left-2 z-10 inline-flex h-4 items-center gap-1 rounded-full bg-white/92 px-1 text-[8px] font-semibold text-[#4a4545] shadow-[0_4px_12px_rgba(20,24,27,0.12)]">
                <CameraIcon />
                <span>{item.image.imageCount}</span>
              </span>
            ) : null}
            {hasPlayableVideo ? (
              <span className="absolute bottom-2 right-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/38 text-white shadow-[0_4px_12px_rgba(20,24,27,0.16)] ring-1 ring-white/25">
                <PlayIcon />
              </span>
            ) : null}
            <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-4rem)] flex-col gap-1">
              {item.merchandising.isPreLoved ? (
                <span className="inline-flex h-4 items-center rounded-full bg-[#202020] px-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(20,24,27,0.14)]">
                  Pre-Loved
                </span>
              ) : null}
              {item.merchandising.isNewArrival ? (
                <span className="inline-flex h-4 items-center gap-1 rounded-full bg-[#e3c52f] px-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#3d3420] shadow-[0_4px_12px_rgba(20,24,27,0.14)]">
                  <SparkIcon />
                  New
                </span>
              ) : null}
            </div>
            <button
              type="button"
              data-ignore-card-open="true"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleFavoriteToggle}
              disabled={favoriteBusy}
              className={
                isFavorite
                  ? "absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f66b77] shadow-[0_4px_12px_rgba(20,24,27,0.12)]"
                  : "absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/92 shadow-[0_4px_12px_rgba(20,24,27,0.12)]"
              }
            >
              <HeartIcon filled={isFavorite} />
            </button>
            <BlurhashImage
              src={displayImage?.imageUrl ?? ""}
              blurHash={displayImage?.blurHashUrl ?? ""}
              alt={titleText}
              sizes={PRODUCT_CARD_GRID_IMAGE_SIZES}
              className="absolute inset-0 h-full w-full"
              imageClassName="object-cover"
            />
            {displayImages.slice(1).map((entry, index) =>
              entry?.imageUrl ? (
                <img
                  key={`${entry.imageUrl}-${index}`}
                  src={entry.imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute h-px w-px opacity-0"
                  loading="eager"
                />
              ) : null,
            )}
            {showVideoPreview ? (
              <video
                src={videoUrl}
                className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
              />
            ) : null}
          </div>
          <div className="flex flex-1 flex-col px-0.5 py-1.5">
            <div className="group/title relative min-w-0">
              <div className="flex min-w-0 items-center gap-1">
                {salePercent ? (
                  <span className="inline-flex h-[18px] shrink-0 items-center rounded-[3px] bg-[#ff4646] px-1 text-[10px] font-bold leading-none text-white shadow-[0_2px_7px_rgba(255,70,70,0.18)]">
                    % Sale
                  </span>
                ) : null}
                <h2 className="min-w-0 flex-1 truncate text-[12px] font-normal leading-[1.2] text-[#333] sm:text-[13px]">
                  {titleText}
                </h2>
              </div>
              <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 z-50 hidden max-w-[min(320px,80vw)] rounded-[4px] bg-[#202020] px-2.5 py-1.5 text-[12px] font-medium leading-[1.35] text-white shadow-[0_10px_28px_rgba(20,24,27,0.22)] group-hover/title:block">
                {titleText}
              </span>
            </div>
            {priceText ? (
              <div className="mt-1 flex flex-wrap items-end gap-1.5">
                <span className={`inline-flex items-start text-[17px] font-semibold leading-none tracking-tight ${item.price.onSale ? "text-[#ff5a00]" : "text-[#202020]"}`}>
                  {priceText}
                </span>
                {item.price.onSale && compareAtText ? <p className="text-[11px] font-medium leading-none text-[#777] line-through">{compareAtText}</p> : null}
              </div>
            ) : (
              <p className="mt-auto pt-2 text-[12px] text-[#8b94a3]">Price unavailable</p>
            )}
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                {showStockLabel ? (
                  <p className={`truncate text-[12px] leading-none ${shouldHighlightStock ? "font-medium text-[#ff5a00]" : "text-[#555]"}`}>
                    {item.stock.label}
                  </p>
                ) : null}
                {item.review.count > 0 && item.review.average != null ? (
                  <p className="truncate text-[11px] leading-none text-[#555]">
                    <span className="font-semibold text-[#202020]">★★★★★</span>{" "}
                    {item.review.count.toLocaleString()}
                  </p>
                ) : null}
                {item.badge?.label ? (
                  <span className="inline-flex h-[18px] max-w-full items-center gap-1 rounded-[3px] bg-[#6d2fa2] px-1.5 text-[10px] font-bold leading-none text-white shadow-[0_3px_9px_rgba(109,47,162,0.18)]">
                    <ProductBadgeIcon iconKey={item.badge.iconKey || "star"} iconUrl={item.badge.iconUrl} />
                    <span className="truncate">{item.badge.label}</span>
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                data-ignore-card-open="true"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleAddToCart}
                disabled={cartBusy || reachedCartLimit}
                title={reachedCartLimit ? cartLimitMessage : "Add to cart"}
                aria-label={reachedCartLimit ? cartLimitMessage : "Add to cart"}
                className={`relative inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${cartJustAdded ? "border-[#1a8553] bg-[#1a8553] text-white shadow-[0_10px_24px_rgba(26,133,83,0.18)]" : !canAddToCart ? "border-black/10 bg-transparent text-[#7d7d7d]" : "border-[#202020] bg-transparent text-[#202020] hover:border-[#cbb26b] hover:text-[#cbb26b]"}`}
              >
                <CartPlusIcon />
                {cartCount > 0 ? <span className="absolute -right-1.5 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff6a00] px-1 text-[11px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(255,106,0,0.32)]">{cartCount}</span> : null}
                {cartBurstKey ? <span className="absolute -top-3 right-2 animate-bevgo-pop text-[10px] font-semibold text-[#cbb26b]">+1</span> : null}
              </button>
            </div>
          </div>
        </div>
      </article>
      <AppSnackbar notice={cartBlockedNotice ? { tone: "info", message: cartBlockedNotice } : null} onClose={() => setCartBlockedNotice(null)} />
    </>
  );
}
