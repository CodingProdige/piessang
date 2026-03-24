"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { BlurhashImage } from "@/components/shared/blurhash-image";

type ProductVariant = {
  variant_id?: string | number;
  label?: string | null;
  pack?: {
    unit_count?: number;
    volume?: number;
    volume_unit?: string | null;
  };
  pricing?: {
    selling_price_excl?: number;
    sale_price_excl?: number;
  };
  sale?: {
    is_on_sale?: boolean;
    sale_price_excl?: number;
  };
  placement?: {
    is_default?: boolean;
    continue_selling_out_of_stock?: boolean;
  };
  inventory?: Array<{
    location_id?: string;
    in_stock_qty?: number;
    in_stock?: boolean;
  }>;
  media?: {
    images?: Array<{
      imageUrl?: string | null;
      blurHashUrl?: string | null;
    }>;
  };
  total_in_stock_items_available?: number;
};

type ProductItem = {
  id?: string;
  data?: {
    docId?: string;
    product?: {
      unique_id?: string | number;
      title?: string | null;
      description?: string | null;
      keywords?: string[];
      vendorName?: string | null;
      vendorDescription?: string | null;
      sellerCode?: string | null;
    };
    seller?: {
      sellerCode?: string | null;
      vendorName?: string | null;
      vendorDescription?: string | null;
      sellerSlug?: string | null;
      activeSellerSlug?: string | null;
      groupSellerSlug?: string | null;
    };
    brand?: {
      title?: string | null;
      slug?: string | null;
    };
    vendor?: {
      title?: string | null;
      slug?: string | null;
    };
    shopify?: {
      vendorName?: string | null;
      handle?: string | null;
    };
    fulfillment?: {
      mode?: string | null;
      lead_time_days?: number | null;
      cutoff_time?: string | null;
    };
    grouping?: {
      category?: string | null;
      subCategory?: string | null;
      brand?: string | null;
      kind?: string | null;
    };
    media?: {
      images?: Array<{
        imageUrl?: string | null;
        blurHashUrl?: string | null;
      }>;
    };
    placement?: {
      isFeatured?: boolean;
      isActive?: boolean;
      position?: number;
      supplier_out_of_stock?: boolean;
    };
    variants?: ProductVariant[];
    ratings?: {
      average?: number;
      count?: number;
    };
    has_sale_variant?: boolean;
    is_favorite?: boolean;
    has_in_stock_variants?: boolean;
    is_eligible_by_variant_availability?: boolean;
    is_unavailable_for_listing?: boolean;
  };
};

type CartPreviewItem = {
  product_unique_id?: string;
  qty?: number;
  quantity?: number;
  line_totals?: {
    final_incl?: number;
    final_excl?: number;
    unit_price_excl?: number;
  };
  product_snapshot?: ProductItem["data"];
  selected_variant_snapshot?: ProductVariant;
  selected_variant?: ProductVariant;
};

type CartPreview = {
  items?: CartPreviewItem[];
  totals?: {
    final_incl?: number;
    final_excl?: number;
    subtotal_excl?: number;
    vat_total?: number;
    base_final_incl?: number;
    final_payable_incl?: number;
  };
  cart?: {
    item_count?: number;
  };
};

type SearchParamValue = string | string[] | undefined;

const VAT_MULTIPLIER = 1.15;
const PAGE_SIZE = 24;

function buildHref(
  pathname: string,
  searchParams: URLSearchParams,
  patch: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== "") params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function formatCurrencyInclVat(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const inclVat = value * VAT_MULTIPLIER;
  return `R ${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(inclVat)}`;
}

function getVariantPriceExVat(variant?: ProductVariant) {
  if (!variant) return null;
  if (variant.sale?.is_on_sale && typeof variant.sale.sale_price_excl === "number") {
    return variant.sale.sale_price_excl;
  }
  if (typeof variant.pricing?.sale_price_excl === "number") {
    return variant.pricing.sale_price_excl;
  }
  if (typeof variant.pricing?.selling_price_excl === "number") {
    return variant.pricing.selling_price_excl;
  }
  return null;
}

function getCompareAtVariantPriceExVat(variant?: ProductVariant) {
  if (!variant) return null;
  const prices = [variant.pricing?.selling_price_excl, variant.pricing?.sale_price_excl].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (!prices.length) {
    return null;
  }

  return Math.max(...prices);
}

function getImageCount(item: ProductItem) {
  const productImages = item.data?.media?.images ?? [];
  const variantImages =
    item.data?.variants?.flatMap((variant) => variant.media?.images ?? []).filter((image) => Boolean(image?.imageUrl)) ?? [];
  return productImages.filter((image) => Boolean(image?.imageUrl)).length + variantImages.length;
}

function parseCutoffMinutes(cutoff?: string | null) {
  if (!cutoff) return null;
  const [hoursRaw, minutesRaw] = String(cutoff).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getDeliveryPromise(item: ProductItem) {
  const fulfillment = item.data?.fulfillment;
  if (String(fulfillment?.mode ?? "").toLowerCase() !== "seller") return null;

  const leadTimeDays = Number(fulfillment?.lead_time_days);
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) return null;

  const cutoffMinutes = parseCutoffMinutes(fulfillment?.cutoff_time ?? null);
  if (cutoffMinutes == null) return null;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const afterCutoff = nowMinutes >= cutoffMinutes;
  const promisedDate = new Date(now);
  promisedDate.setDate(promisedDate.getDate() + leadTimeDays + (afterCutoff ? 1 : 0));

  const cutoffText = `Order by ${String(fulfillment?.cutoff_time ?? "").slice(0, 5)}`;
  const formatDate = new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  if (leadTimeDays <= 1) {
    return {
      label: afterCutoff ? "Get it tomorrow" : "Get it today",
      cutoffText,
    };
  }

  return {
    label: `Get it by ${formatDate.format(promisedDate)}`,
    cutoffText,
  };
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-3.5 w-3.5 ${filled ? "text-white" : "text-[#4a4545]"}`}>
      <path
        fill="currentColor"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.53L12 21.35z"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-[#4a4545]">
      <path
        fill="currentColor"
        d="M9 4.5 7.8 6H5.5A2.5 2.5 0 0 0 3 8.5v8A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 18.5 6h-2.3L15 4.5H9Zm3 12A4.5 4.5 0 1 1 12 7a4.5 4.5 0 0 1 0 9Zm0-2A2.5 2.5 0 1 0 12 9a2.5 2.5 0 0 0 0 5Z"
      />
    </svg>
  );
}

function CartPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5">
      <path
        fill="currentColor"
        d="M7.5 6h13l-1.4 6.9c-.2 1.1-1.1 1.9-2.2 1.9H9.2c-1.1 0-2-.8-2.2-1.8L5.2 3.5H2V2h4.7L7.5 6Zm0 0 .8 3.8h11.3L20.6 7H8.1Zm4.2 11.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm7 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm-3.9-6V9.8h-1.4v1.7h-1.7v1.4h1.7v1.7h1.4v-1.7h1.7v-1.4h-1.7Z"
      />
    </svg>
  );
}

function CartDrawer({
  open,
  cart,
  onClose,
}: {
  open: boolean;
  cart: CartPreview | null;
  onClose: () => void;
}) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const totalIncl =
    cart?.totals?.final_payable_incl ??
    cart?.totals?.final_incl ??
    cart?.totals?.base_final_incl ??
    0;
  const money = (value?: number) =>
    `R ${new Intl.NumberFormat("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(typeof value === "number" && Number.isFinite(value) ? value : 0)}`;

  return (
    <div className={`fixed inset-0 z-[65] ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close cart drawer backdrop"
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
            <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{itemCount} items</h3>
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
            <p className="mt-1 text-[22px] font-semibold text-[#202020]">
              {money(totalIncl)}
            </p>
          </div>

          {items.length ? (
            <div className="space-y-3">
              {items.map((item, index) => {
                const snapshot = item.product_snapshot;
                const productTitle = snapshot?.product?.title ?? "Untitled product";
                const variant = item.selected_variant_snapshot ?? item.selected_variant ?? null;
                const variantLabel = variant?.label ?? "Selected variant";
                const qty = item.qty ?? item.quantity ?? 0;
                const lineIncl =
                  item.line_totals?.final_incl ??
                  ((item.line_totals?.final_excl ?? 0) * VAT_MULTIPLIER);
                const image = snapshot?.media?.images?.find((entry) => Boolean(entry?.imageUrl)) ?? null;

                return (
                  <div key={`${productTitle}-${variant?.variant_id ?? index}`} className="flex gap-3 rounded-[8px] border border-black/5 bg-white p-3 shadow-[0_6px_18px_rgba(20,24,27,0.05)]">
                    <BlurhashImage
                      src={image?.imageUrl ?? ""}
                      blurHash={image?.blurHashUrl ?? ""}
                      alt={productTitle}
                      sizes="64px"
                      className="h-16 w-16 shrink-0 rounded-[8px]"
                      imageClassName="object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#202020]">{productTitle}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#8b94a3]">{variantLabel}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-[#57636c]">Qty {qty}</span>
                        <span className="text-[13px] font-semibold text-[#202020]">
                          {money(lineIncl)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
              Your cart is empty right now.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/cart"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-[8px] border border-black bg-white px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#202020]"
              onClick={onClose}
            >
              View cart
            </Link>
            <Link
              href="/cart?step=checkout"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-white"
              onClick={onClose}
            >
              Proceed to checkout
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-[#cbb26b]">
      <path
        fill="currentColor"
        d="m12 17.27 5.18 3.13-1.39-5.89L20.5 10.5l-6.03-.51L12 4.5l-2.47 5.49L3.5 10.5l4.71 4.01-1.39 5.89L12 17.27Z"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-[#cbb26b]">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="m12 17.27 5.18 3.13-1.39-5.89L20.5 10.5l-6.03-.51L12 4.5l-2.47 5.49L3.5 10.5l4.71 4.01-1.39 5.89L12 17.27Z"
      />
    </svg>
  );
}

function getSalePercent(item: ProductItem) {
  const variant = pickDisplayVariant(item.data?.variants) ?? undefined;
  const salePrice = getVariantPriceExVat(variant);
  const compareAtPrice = getCompareAtVariantPriceExVat(variant);

  if (
    !variant?.sale?.is_on_sale ||
    typeof salePrice !== "number" ||
    typeof compareAtPrice !== "number" ||
    compareAtPrice <= salePrice ||
    compareAtPrice <= 0
  ) {
    return null;
  }

  return Math.max(1, Math.round(((compareAtPrice - salePrice) / compareAtPrice) * 100));
}

function pickDisplayVariant(variants?: ProductVariant[]) {
  if (!variants?.length) return null;
  return (
    [...variants]
      .map((variant) => ({ variant, price: getVariantPriceExVat(variant) }))
      .filter((entry): entry is { variant: ProductVariant; price: number } => typeof entry.price === "number")
      .sort((a, b) => b.price - a.price)[0]?.variant ?? variants[0]
  );
}

function getBrandLabel(item: ProductItem) {
  return item.data?.brand?.title ?? item.data?.grouping?.brand ?? "Piessang";
}

function normalizeSlug(value?: string | null) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getBrandSlug(item: ProductItem) {
  return item.data?.brand?.slug ?? item.data?.grouping?.brand ?? normalizeSlug(item.data?.brand?.title);
}

function getVendorLabel(item: ProductItem) {
  return item.data?.vendor?.title ?? item.data?.product?.vendorName ?? item.data?.shopify?.vendorName ?? "Piessang";
}

function getVendorSlug(item: ProductItem) {
  return (
    item.data?.product?.sellerCode ??
    item.data?.seller?.sellerCode ??
    item.data?.vendor?.slug ??
    normalizeSlug(item.data?.product?.vendorName) ??
    normalizeSlug(item.data?.shopify?.vendorName)
  ) || "piessang";
}

function getVariantCount(item: ProductItem) {
  return item.data?.variants?.length ?? 0;
}

function getSelectedVariantLabel(item: ProductItem) {
  const variant = pickDisplayVariant(item.data?.variants) ?? undefined;
  return variant?.label?.trim() || null;
}

function getStockState(variant?: ProductVariant, item?: ProductItem) {
  if (item?.data?.placement?.supplier_out_of_stock) {
    return { label: "Supplier out of stock", tone: "neutral" as const, hideQuantity: true };
  }

  if (variant?.placement?.continue_selling_out_of_stock) {
    return { label: "In stock", tone: "success" as const, hideQuantity: true };
  }

  if (item?.data?.has_in_stock_variants === false) {
    return { label: "Out of stock", tone: "danger" as const, hideQuantity: false };
  }

  const stock = variant?.total_in_stock_items_available;
  if (typeof stock === "number") {
    return stock > 0
      ? { label: `${stock} in stock`, tone: "success" as const, hideQuantity: false }
      : { label: "Out of stock", tone: "danger" as const, hideQuantity: false };
  }

  const firstLocation = variant?.inventory?.[0];
  if (typeof firstLocation?.in_stock_qty === "number") {
    return firstLocation.in_stock_qty > 0
      ? { label: `${firstLocation.in_stock_qty} in stock`, tone: "success" as const, hideQuantity: false }
      : { label: "Out of stock", tone: "danger" as const, hideQuantity: false };
  }

  return { label: "Stock unknown", tone: "neutral" as const, hideQuantity: false };
}

function getReviewState(item: ProductItem) {
  const average = item.data?.ratings?.average;
  const count = item.data?.ratings?.count;
  if (typeof average === "number" && typeof count === "number") {
    return `${average.toFixed(1)} (${count} reviews)`;
  }
  return null;
}

function getRatingAverage(item: ProductItem) {
  return typeof item.data?.ratings?.average === "number" ? item.data.ratings.average : null;
}

function getReviewMeta(item: ProductItem) {
  const average = getRatingAverage(item);
  const count = item.data?.ratings?.count;
  if (typeof average === "number" && typeof count === "number") {
    return { average, count };
  }
  return null;
}

function getSortPrice(item: ProductItem) {
  const variant = pickDisplayVariant(item.data?.variants) ?? undefined;
  return getVariantPriceExVat(variant) ?? Number.POSITIVE_INFINITY;
}

function getDisplayPrice(item: ProductItem) {
  const price = getSortPrice(item);
  return Number.isFinite(price) ? price * VAT_MULTIPLIER : Number.POSITIVE_INFINITY;
}

function filterByPriceRange(items: ProductItem[], minPrice?: number, maxPrice?: number) {
  const hasMin = Number.isFinite(minPrice);
  const hasMax = Number.isFinite(maxPrice);
  if (!hasMin && !hasMax) {
    return items;
  }

  return items.filter((item) => {
    const price = getDisplayPrice(item);
    if (!Number.isFinite(price)) return false;
    if (hasMin && price < (minPrice as number)) return false;
    if (hasMax && price > (maxPrice as number)) return false;
    return true;
  });
}

function filterByMinRating(items: ProductItem[], minRating?: number) {
  if (!Number.isFinite(minRating)) {
    return items;
  }

  return items.filter((item) => (getRatingAverage(item) ?? 0) >= (minRating as number));
}

function sortProducts(items: ProductItem[], sort: string) {
  const copy = [...items];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => getDisplayPrice(a) - getDisplayPrice(b));
    case "price-desc":
      return copy.sort((a, b) => getDisplayPrice(b) - getDisplayPrice(a));
    case "name-asc":
      return copy.sort((a, b) =>
        (a.data?.product?.title ?? "").localeCompare(b.data?.product?.title ?? "", "en", {
          sensitivity: "base",
        }),
      );
    case "name-desc":
      return copy.sort((a, b) =>
        (b.data?.product?.title ?? "").localeCompare(a.data?.product?.title ?? "", "en", {
          sensitivity: "base",
        }),
      );
    default:
      return copy;
  }
}

function getProductHref(item: ProductItem) {
  const uniqueId = item.id ?? item.data?.docId ?? item.data?.product?.unique_id;
  const slug =
    item.data?.product?.title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product";
  return uniqueId ? `/products/${slug}?unique_id=${encodeURIComponent(String(uniqueId))}` : "/products";
}

function ProductCard({
  item,
  view,
  openInNewTab,
  brandHref,
  vendorHref,
  brandLabel,
  vendorLabel,
  currentUrl,
  onAddToCartSuccess,
  cartBurstKey,
}: {
  item: ProductItem;
  view: "grid" | "list";
  openInNewTab: boolean;
  brandHref: string;
  vendorHref: string;
  brandLabel: string;
  vendorLabel: string;
  currentUrl: string;
  onAddToCartSuccess: (cart: CartPreview | null) => void;
  cartBurstKey: number;
}) {
  const image = item.data?.media?.images?.find((entry) => Boolean(entry?.imageUrl)) ?? null;
  const titleText = item.data?.product?.title ?? "Untitled product";
  const {
    isAuthenticated,
    uid,
    openAuthModal,
    refreshProfile,
    refreshCart,
    cartProductCounts,
    cartVariantCounts,
    favoriteIds,
  } = useAuth();
  const [isFavorite, setIsFavorite] = useState(Boolean(item.data?.is_favorite));
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const defaultVariant = pickDisplayVariant(item.data?.variants) ?? undefined;
  const productUniqueId = String(item.id ?? item.data?.docId ?? item.data?.product?.unique_id ?? "").trim();
  const defaultVariantId = String(defaultVariant?.variant_id ?? "").trim();
  const displayPriceValue = getVariantPriceExVat(defaultVariant) ?? undefined;
  const compareAtPriceValue = getCompareAtVariantPriceExVat(defaultVariant) ?? undefined;
  const saleActive = Boolean(
    defaultVariant?.sale?.is_on_sale &&
      typeof displayPriceValue === "number" &&
      typeof compareAtPriceValue === "number" &&
      compareAtPriceValue > displayPriceValue,
  );
  const salePrice = formatCurrencyInclVat(displayPriceValue);
  const compareAtPrice = saleActive ? formatCurrencyInclVat(compareAtPriceValue) : null;
  const stockState = getStockState(defaultVariant, item);
  const reviewState = getReviewState(item);
  const reviewMeta = getReviewMeta(item);
  const variantCount = getVariantCount(item);
  const selectedVariantLabel = getSelectedVariantLabel(item);
  const imageCount = getImageCount(item);
  const salePercent = getSalePercent(item);
  const deliveryPromise = getDeliveryPromise(item);
  const href = getProductHref(item);
  const linkTarget = openInNewTab ? "_blank" : undefined;
  const linkRel = openInNewTab ? "noreferrer noopener" : undefined;
  const renderBrandLink = brandHref !== currentUrl;
  const renderVendorLink = vendorHref !== currentUrl;
  const cartProductCount = productUniqueId ? cartProductCounts[productUniqueId] ?? 0 : 0;
  const cartVariantCount =
    productUniqueId && defaultVariantId ? cartVariantCounts[`${productUniqueId}::${defaultVariantId}`] ?? 0 : 0;
  const cartCount = cartProductCount || cartVariantCount;
  useEffect(() => {
    const favoriteMatch = favoriteIds?.includes(productUniqueId);
    setIsFavorite(Boolean(item.data?.is_favorite) || Boolean(favoriteMatch));
  }, [favoriteIds, item.data?.is_favorite, productUniqueId]);
  const favoriteVisible = isAuthenticated;

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
        body: JSON.stringify({
          uid,
          unique_id: String(item.id ?? item.data?.docId ?? item.data?.product?.unique_id ?? ""),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update favourites.");
      }
      if (typeof payload?.isFavorite === "boolean") {
        setIsFavorite(payload.isFavorite);
      } else {
        setIsFavorite((current) => !current);
      }
      void refreshProfile();
    } catch {
      openAuthModal("We could not update your favourites right now.");
    } finally {
      setFavoriteBusy(false);
    }
  };
  const handleAddDefaultVariantToCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated || !uid) {
      openAuthModal("Sign in to add products to your cart.");
      return;
    }

    if (!defaultVariant || !productUniqueId) {
      openAuthModal("Please open the product to choose a variant first.");
      return;
    }

    if (cartBusy) return;
    setCartBusy(true);

    try {
      const response = await fetch("/api/client/v1/carts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          product: item.data,
          variant_id: defaultVariant.variant_id,
          mode: cartCount > 0 ? "change" : "set",
          qty: 1,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update cart.");
      }
      await refreshCart();
      onAddToCartSuccess((payload?.data?.cart ?? null) as CartPreview | null);
    } catch {
      openAuthModal("We could not update your cart right now.");
    } finally {
      setCartBusy(false);
    }
  };
  const openProduct = () => {
    if (openInNewTab) {
      window.open(href, "_blank", "noreferrer,noopener");
      return;
    }

    window.location.assign(href);
  };
  const shouldIgnoreCardOpen = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest("[data-ignore-card-open='true']"));

  const openCardIfAllowed = (event: MouseEvent<HTMLElement>) => {
    if (shouldIgnoreCardOpen(event.target)) return;
    openProduct();
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProduct();
    }
  };
  const titleClampStyle = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  } as const;
  const imageBadges = (
    <>
      {imageCount > 0 ? (
        <span className="absolute bottom-2 left-2 z-10 inline-flex h-6 items-center gap-1 rounded-full bg-white/92 px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#4a4545] shadow-[0_4px_12px_rgba(20,24,27,0.12)]">
          <CameraIcon />
          <span>{imageCount}</span>
        </span>
      ) : null}
      {salePercent ? (
        <span className="absolute left-2 top-2 z-10 inline-flex h-6 items-center rounded-full bg-[#1a8553] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(20,24,27,0.14)]">
          {salePercent}% off
        </span>
      ) : null}
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
        style={{ opacity: favoriteVisible ? 1 : 0 }}
        aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
        aria-pressed={isFavorite}
      >
        <HeartIcon filled={isFavorite} />
      </button>
    </>
  );
  const reviewStars = reviewMeta ? Math.max(0, Math.min(5, Math.round(reviewMeta.average))) : 0;

  if (view === "list") {
    return (
      <article
        role="link"
        tabIndex={0}
        onClick={openCardIfAllowed}
        onKeyDown={onCardKeyDown}
        data-clickable-container="true"
    className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]"
      >
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative h-[160px] w-full shrink-0 overflow-hidden rounded-[8px] bg-[#fafafa] sm:w-[180px]">
            {imageBadges}
            <BlurhashImage
              src={image?.imageUrl ?? ""}
              blurHash={image?.blurHashUrl ?? ""}
              alt={titleText}
              sizes="(max-width: 640px) 100vw, 180px"
              className="h-full w-full"
              imageClassName="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
          <h2
            title={titleText}
            style={titleClampStyle}
            className="text-[15px] font-normal leading-[1.2] text-[#202020] sm:text-[16px]"
          >
            {titleText}
          </h2>

          {selectedVariantLabel ? (
            <p className="text-[11px] font-medium leading-none text-[#8b94a3]">
              {selectedVariantLabel}
            </p>
          ) : null}

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-normal leading-none">
              {renderBrandLink ? (
                <Link
                  href={brandHref}
                  target={linkTarget}
                  rel={linkRel}
                  prefetch={false}
                  scroll={false}
                  onClick={(event) => event.stopPropagation()}
                  className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                >
                  {brandLabel}
                </Link>
              ) : (
                <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                  {brandLabel}
                </span>
              )}
              <span className="text-[#d6d6d6]">•</span>
              {renderVendorLink ? (
                <Link
                  href={vendorHref}
                  target={linkTarget}
                  rel={linkRel}
                  prefetch={false}
                  scroll={false}
                  onClick={(event) => event.stopPropagation()}
                  className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                >
                  {vendorLabel}
                </Link>
              ) : (
                <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                  {vendorLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em]">
              <span
                className={
                  stockState.tone === "success"
                    ? "text-[#1a8553]"
                    : stockState.tone === "danger"
                      ? "text-[#b91c1c]"
                      : "text-[#57636c]"
                }
              >
                {stockState.label}
              </span>
              <span className="text-[#d6d6d6]">•</span>
              <span>{variantCount} variants</span>
              {reviewMeta ? (
                <>
                  <span className="text-[#d6d6d6]">•</span>
                  <span className="inline-flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <StarIcon key={`${titleText}-list-star-${index}`} filled={index < reviewStars} />
                    ))}
                    <span className="ml-1 text-[#4a4545]">
                      {reviewMeta.average.toFixed(1)} ({reviewMeta.count})
                    </span>
                  </span>
                </>
            ) : (
              <span className="text-[#8b94a3]">No reviews yet</span>
            )}
          </div>

          {deliveryPromise ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold normal-case tracking-normal">
              <span className="rounded-full bg-[rgba(26,133,83,0.1)] px-2.5 py-1 text-[#1a8553]">
                {deliveryPromise.label}
              </span>
              <span className="text-[#8b94a3]">{deliveryPromise.cutoffText}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3 pt-0.5">
            {salePrice ? (
              <div className="flex flex-wrap items-end gap-2">
                <p className={saleActive ? "text-[20px] font-medium leading-none tracking-tight text-[#ff5963]" : "text-[20px] font-medium leading-none tracking-tight text-[#4a4545]"}>
                  {salePrice}
                </p>
                {saleActive && compareAtPrice ? (
                  <p className="text-[12px] font-medium leading-none text-[#8b94a3] line-through">
                    {compareAtPrice}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-[12px] text-[#8b94a3]">Price unavailable</p>
            )}
            {isFavorite ? (
                <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1.5 text-[11px] font-semibold text-[#4a4545]">
                  In wishlist
                </span>
              ) : null}
            </div>

            <div className="mt-3">
              <button
                type="button"
                data-ignore-card-open="true"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleAddDefaultVariantToCart}
                disabled={cartBusy}
                className="relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-black/20 bg-transparent px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b] disabled:cursor-wait disabled:opacity-70"
                aria-label="Add default variant to cart"
              >
                <CartPlusIcon />
                <span className="whitespace-nowrap">Add to cart</span>
                {cartCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-black/20 bg-white px-1 text-[10px] font-semibold leading-none text-[#202020]">
                    {cartCount}
                  </span>
                ) : null}
                {cartBurstKey ? (
                  <span className="absolute -top-3 right-2 text-[10px] font-semibold text-[#cbb26b] animate-bevgo-pop">
                    +1
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={openCardIfAllowed}
      onKeyDown={onCardKeyDown}
      data-clickable-container="true"
      className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]"
    >
      <div className="block">
        <div className="relative aspect-[1/1] overflow-hidden bg-[#fafafa]">
          {imageBadges}
          <BlurhashImage
            src={image?.imageUrl ?? ""}
            blurHash={image?.blurHashUrl ?? ""}
            alt={titleText}
            sizes="(max-width: 640px) 50vw, 25vw"
            className="h-full w-full"
            imageClassName="object-cover"
          />
        </div>

        <div className="space-y-1.5 px-4 py-4 sm:px-4 sm:py-4">
          <h2
            title={titleText}
            style={titleClampStyle}
            className="text-[14px] font-normal leading-[1.2] text-[#202020] sm:text-[15px]"
          >
            {titleText}
          </h2>

          {selectedVariantLabel ? (
            <p className="text-[11px] font-medium leading-none text-[#8b94a3]">
              {selectedVariantLabel}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-normal leading-none">
            {renderBrandLink ? (
              <Link
                href={brandHref}
                target={linkTarget}
                rel={linkRel}
                prefetch={false}
                scroll={false}
                onClick={(event) => event.stopPropagation()}
                className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
              >
                {brandLabel}
              </Link>
            ) : (
              <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                {brandLabel}
              </span>
            )}
            <span className="text-[#d6d6d6]">•</span>
            {renderVendorLink ? (
              <Link
                href={vendorHref}
                target={linkTarget}
                rel={linkRel}
                prefetch={false}
                scroll={false}
                onClick={(event) => event.stopPropagation()}
                className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
              >
                {vendorLabel}
              </Link>
            ) : (
              <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                {vendorLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em]">
            <span
              className={
                stockState.tone === "success"
                  ? "text-[#1a8553]"
                  : stockState.tone === "danger"
                    ? "text-[#b91c1c]"
                    : "text-[#57636c]"
              }
            >
              {stockState.label}
            </span>
            <span className="text-[#d6d6d6]">•</span>
            <span>{variantCount} variants</span>
            {reviewMeta ? (
              <>
                <span className="text-[#d6d6d6]">•</span>
                <span className="inline-flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <StarIcon key={`${titleText}-grid-star-${index}`} filled={index < reviewStars} />
                  ))}
                  <span className="ml-1 text-[#4a4545]">
                    {reviewMeta.average.toFixed(1)} ({reviewMeta.count})
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[#8b94a3]">No reviews yet</span>
            )}
          </div>

          {deliveryPromise ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold normal-case tracking-normal">
              <span className="rounded-full bg-[rgba(26,133,83,0.1)] px-2.5 py-1 text-[#1a8553]">
                {deliveryPromise.label}
              </span>
              <span className="text-[#8b94a3]">{deliveryPromise.cutoffText}</span>
            </div>
          ) : null}

          {salePrice ? (
            <div className="flex flex-wrap items-end gap-2 pt-0.5">
              <p className={saleActive ? "text-[18px] font-medium leading-none tracking-tight text-[#ff5963]" : "text-[18px] font-medium leading-none tracking-tight text-[#4a4545]"}>
                {salePrice}
              </p>
              {saleActive && compareAtPrice ? (
                <p className="text-[11px] font-medium leading-none text-[#8b94a3] line-through">
                  {compareAtPrice}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="pt-0.5 text-[12px] text-[#8b94a3]">Price unavailable</p>
          )}

          <div className="mt-3">
            <button
              type="button"
              data-ignore-card-open="true"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleAddDefaultVariantToCart}
              disabled={cartBusy}
              className="relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-black/20 bg-transparent px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b] disabled:cursor-wait disabled:opacity-70"
              aria-label="Add default variant to cart"
            >
              <CartPlusIcon />
              <span className="whitespace-nowrap">Add to cart</span>
              {cartCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-black/20 bg-white px-1 text-[10px] font-semibold leading-none text-[#202020]">
                  {cartCount}
                </span>
              ) : null}
              {cartBurstKey ? (
                <span className="absolute -top-3 right-2 text-[10px] font-semibold text-[#cbb26b] animate-bevgo-pop">
                  +1
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductsResults({
  initialItems,
  currentSort,
  currentView,
  openInNewTab,
  searchParams,
  totalCount,
}: {
  initialItems: ProductItem[];
  currentSort: string;
  currentView: "grid" | "list";
  openInNewTab: boolean;
  searchParams: Record<string, SearchParamValue>;
  totalCount: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [cartPreview, setCartPreview] = useState<CartPreview | null>(null);
  const [cartToastVisible, setCartToastVisible] = useState(false);
  const [cartBurstKey, setCartBurstKey] = useState<number>(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { uid, isAuthenticated, favoriteCount, refreshProfile, openAuthModal } = useAuth();
  const pathname = usePathname();
  const liveSearchParams = useSearchParams();
  const filterParams = useMemo(() => new URLSearchParams(liveSearchParams.toString()), [liveSearchParams]);
  const currentUrl = useMemo(() => {
    const query = liveSearchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [liveSearchParams, pathname]);
  const minRatingParam = filterParams.get("minRating");
  const minRating = minRatingParam ? Number(minRatingParam) : undefined;
  const favoritesOnly = filterParams.get("favoritesOnly") === "true";

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ min?: number; max?: number }>).detail;
      if (
        typeof detail?.min === "number" &&
        typeof detail?.max === "number" &&
        Number.isFinite(detail.min) &&
        Number.isFinite(detail.max)
      ) {
        setPriceRange({ min: detail.min, max: detail.max });
      }
    };

    window.addEventListener("bevgo-price-range-change", handler);
    return () => window.removeEventListener("bevgo-price-range-change", handler);
  }, []);

  const filteredItems = useMemo(
    () => filterByPriceRange(filterByMinRating(items, minRating), priceRange?.min, priceRange?.max),
    [items, minRating, priceRange?.min, priceRange?.max],
  );
  const sortedItems = useMemo(() => sortProducts(filteredItems, currentSort), [filteredItems, currentSort]);
  const clearCatalogFilters = {
    id: undefined,
    unique_id: undefined,
    category: undefined,
    subCategory: undefined,
    brand: undefined,
    vendor: undefined,
    kind: undefined,
    packUnit: undefined,
    inStock: undefined,
    onSale: undefined,
    isFeatured: undefined,
    minRating: undefined,
  };
  const makeBrandHref = (item: ProductItem) =>
    buildHref("/products", filterParams, { ...clearCatalogFilters, brand: getBrandSlug(item) || undefined });
  const makeVendorHref = (item: ProductItem) =>
    `/vendors/${encodeURIComponent(getVendorSlug(item) || "piessang")}`;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("bevgo-products-results-change", {
        detail: { count: filteredItems.length },
      }),
    );
  }, [filteredItems.length]);

  useEffect(() => {
    const header = document.getElementById("bevgo-site-header");
    if (!header) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setShowBackToTop(!entry.isIntersecting);
        if (entry.isIntersecting && items.length < totalCount) {
          void loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(header);
    return () => observer.disconnect();
  }, [items.length, currentSort, liveSearchParams, totalCount]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (items.length < totalCount) {
          void loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "240px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, totalCount]);

  useEffect(() => {
    if (!cartBurstKey) return;
    const timeout = window.setTimeout(() => setCartBurstKey(0), 700);
    return () => window.clearTimeout(timeout);
  }, [cartBurstKey]);

  async function loadMore() {
    if (loading || items.length >= totalCount) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      for (const [key, value] of liveSearchParams.entries()) {
        if (value) params.set(key, value);
      }

      const nextLimit = Math.max(items.length + PAGE_SIZE, PAGE_SIZE);
      params.set("limit", String(nextLimit));
      if (!params.has("isActive")) {
        params.set("isActive", "true");
      }

      const response = await fetch(`/api/catalogue/products?${params.toString()}`);
      const payload = (await response.json()) as { items?: ProductItem[]; groups?: Array<{ items?: ProductItem[] }>; count?: number; total?: number };
      const raw = payload.items ?? payload.groups?.flatMap((group) => group.items ?? []) ?? [];
      const merged = new Map<string, ProductItem>();

      for (const item of [...items, ...raw]) {
        const key = item.id ?? item.data?.docId ?? String(item.data?.product?.unique_id ?? "");
        if (!key || merged.has(key)) continue;
        merged.set(key, item);
      }

      const nextItems = Array.from(merged.values());
      if (nextItems.length === items.length) {
        setLoading(false);
        return;
      }

      setItems(nextItems);
    } finally {
      setLoading(false);
    }
  }

  const handleAddToCartSuccess = async (cart: CartPreview | null) => {
    let nextCart = cart;
    if (uid) {
      try {
        const response = await fetch("/api/client/v1/carts/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        });
        const payload = await response.json().catch(() => ({}));
        nextCart = (payload?.data?.cart ?? nextCart ?? null) as CartPreview | null;
      } catch {
        nextCart = nextCart ?? null;
      }
    }

    setCartPreview(nextCart);
    setCartDrawerOpen(true);
    setCartToastVisible(true);
    setCartBurstKey(Date.now());
    window.setTimeout(() => setCartToastVisible(false), 1600);
  };
  const handleClearFavorites = async () => {
    if (!isAuthenticated || !uid) {
      openAuthModal("Sign in to manage your favourites.");
      return;
    }

    try {
      await fetch("/api/client/v1/accounts/favorites/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      await refreshProfile();
      window.location.assign("/products");
    } catch {
      openAuthModal("We could not clear your favourites right now.");
    }
  };

  if (sortedItems.length === 0) {
    const hasFavorites = favoriteCount > 0;
    return (
      <div className="rounded-[8px] bg-white px-5 py-10 text-center shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
          {favoritesOnly ? "Favourites" : "No results"}
        </p>
        <h2 className="mt-2 text-[22px] font-semibold text-[#202020]">
          {favoritesOnly
            ? hasFavorites
              ? "No favourites match your current filter."
              : "You have no favourites saved yet."
            : "No products match these filters."}
        </h2>
        <p className="mx-auto mt-2 max-w-[44ch] text-[13px] leading-[1.6] text-[#57636c]">
          {favoritesOnly
            ? "Use the favourites menu to view everything you’ve saved, or clear the list and start again."
            : "Try resetting the filters or broadening your search to see more products."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/products"
            scroll={false}
            className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b]"
          >
            View all products
          </Link>
          {favoritesOnly && hasFavorites ? (
            <button
              type="button"
              onClick={() => void handleClearFavorites()}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
            >
              Clear favourites
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
          {currentView === "list" ? (
        <div className="space-y-4">
          {sortedItems.map((item) => (
              <ProductCard
                key={item.id ?? item.data?.docId}
                item={item}
                view="list"
                openInNewTab={openInNewTab}
                brandHref={makeBrandHref(item)}
                vendorHref={makeVendorHref(item)}
                brandLabel={getBrandLabel(item)}
                vendorLabel={getVendorLabel(item)}
                currentUrl={currentUrl}
                onAddToCartSuccess={handleAddToCartSuccess}
                cartBurstKey={cartBurstKey}
              />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {sortedItems.map((item) => (
            <ProductCard
              key={item.id ?? item.data?.docId}
              item={item}
              view="grid"
              openInNewTab={openInNewTab}
              brandHref={makeBrandHref(item)}
              vendorHref={makeVendorHref(item)}
              brandLabel={getBrandLabel(item)}
              vendorLabel={getVendorLabel(item)}
              currentUrl={currentUrl}
              onAddToCartSuccess={handleAddToCartSuccess}
              cartBurstKey={cartBurstKey}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-4" />

      {loading ? (
        <div className="flex items-center justify-center rounded-[8px] bg-white px-4 py-4 text-[12px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#cbb26b] border-t-transparent" />
            Loading more products...
          </span>
        </div>
      ) : null}

      {showBackToTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-4 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#4a4545] text-white shadow-[0_10px_24px_rgba(20,24,27,0.18)]"
          aria-label="Back to top"
        >
          ↑
        </button>
      ) : null}

      {cartToastVisible ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-200">
          <div className="rounded-[8px] bg-[#202020] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(20,24,27,0.2)]">
            Added to cart
          </div>
        </div>
      ) : null}

      <CartDrawer open={cartDrawerOpen} cart={cartPreview} onClose={() => setCartDrawerOpen(false)} />
    </div>
  );
}
