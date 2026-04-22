"use client";

import { BlurhashImage } from "@/components/shared/blurhash-image";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { ProductLink } from "@/components/products/product-link";
import { getCartQuantityGuard } from "@/lib/cart/interaction-guards";
import { normalizeMoneyAmount } from "@/lib/money";

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
    };
    fulfillment?: {
      mode?: string | null;
    };
    media?: {
      images?: Array<{ imageUrl?: string | null; blurHashUrl?: string | null }>;
    };
  };
  selected_variant_snapshot?: {
    variant_id?: string | number | null;
    label?: string | null;
    total_in_stock_items_available?: number;
    checkout_reserved_unavailable?: boolean;
    placement?: {
      track_inventory?: boolean;
      continue_selling_out_of_stock?: boolean;
    };
    inventory?: Array<{
      in_stock_qty?: number;
    }>;
    media?: {
      images?: Array<{ imageUrl?: string | null; blurHashUrl?: string | null }>;
    };
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

const toMoneyNumber = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? normalizeMoneyAmount(value) : 0;

const buildProductHref = (title: string, uniqueId: string) => {
  const slug = String(title || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "product";
  return uniqueId ? `/products/${slug}?unique_id=${encodeURIComponent(uniqueId)}` : "/products";
};

export function CartItemCard({
  item,
  compact = false,
  onIncrement,
  onDecrement,
  onRemove,
  onIncrementBlocked,
  busy = false,
}: {
  item: CartItem;
  compact?: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
  onIncrementBlocked?: (message: string) => void;
  busy?: boolean;
}) {
  const { formatMoney } = useDisplayCurrency();
  const snapshot = item.product_snapshot;
  const variant = item.selected_variant_snapshot;
  const title = snapshot?.product?.title ?? "Untitled product";
  const productUniqueId = String(snapshot?.product?.unique_id ?? item.product_unique_id ?? "").trim();
  const productHref = buildProductHref(title, productUniqueId);
  const variantLabel = variant?.label ?? "Selected variant";
  const qty = item.qty ?? item.quantity ?? 0;
  const saleQty = Math.max(0, item.sale_qty ?? 0);
  const regularQty = Math.max(0, item.regular_qty ?? Math.max(qty - saleQty, 0));
  const imageUrl = variant?.media?.images?.[0]?.imageUrl ?? snapshot?.media?.images?.[0]?.imageUrl ?? "";
  const imageBlurHash = variant?.media?.images?.[0]?.blurHashUrl ?? snapshot?.media?.images?.[0]?.blurHashUrl ?? "";
  const baseIncl =
    toMoneyNumber(variant?.pricing?.selling_price_incl) ||
    toMoneyNumber(variant?.pricing?.selling_price_excl ? variant.pricing.selling_price_excl * 1.15 : 0);
  const saleIncl =
    variant?.sale?.is_on_sale &&
    (toMoneyNumber(variant?.sale?.sale_price_incl) ||
      toMoneyNumber(variant?.pricing?.sale_price_incl) ||
      toMoneyNumber(variant?.sale?.sale_price_excl ? variant.sale.sale_price_excl * 1.15 : 0) ||
      toMoneyNumber(variant?.pricing?.sale_price_excl ? variant.pricing.sale_price_excl * 1.15 : 0)) > 0
      ? (
          toMoneyNumber(variant?.sale?.sale_price_incl) ||
          toMoneyNumber(variant?.pricing?.sale_price_incl) ||
          toMoneyNumber(variant?.sale?.sale_price_excl ? variant.sale.sale_price_excl * 1.15 : 0) ||
          toMoneyNumber(variant?.pricing?.sale_price_excl ? variant.pricing.sale_price_excl * 1.15 : 0)
        )
      : null;
  const lineIncl = item.line_totals?.final_incl ?? 0;
  const saleActiveLine = Boolean(saleIncl != null && baseIncl > saleIncl);
  const sellerLabel =
    item.product_snapshot?.seller?.vendorName?.trim() ||
    item.product_snapshot?.product?.vendorName?.trim() ||
    "Piessang seller";
  const fulfillmentMode = String(item.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase();
  const fulfillmentLabel =
    fulfillmentMode === "bevgo"
      ? "Piessang handles delivery"
      : "Seller handles delivery";
  const canDecrease = qty > 1;
  const availabilityStatus = String(item?.availability?.status || "").trim().toLowerCase();
  const isUnavailable = availabilityStatus === "out_of_stock" || availabilityStatus === "unavailable";
  const quantityGuard = getCartQuantityGuard({
    variant,
    currentCartQty: qty,
    unavailable: isUnavailable,
  });
  const availableQuantity = quantityGuard.availableQuantity;
  const hasReachedMaxQuantity = quantityGuard.reachedCartLimit;
  const incrementBlocked = quantityGuard.incrementBlocked;
  const controlsVisible = Boolean(onIncrement || onDecrement || onRemove);
  const incrementBlockedMessage =
    quantityGuard.reason === "reserved_in_checkout"
      ? quantityGuard.message || "This item is currently reserved in another shopper's checkout."
      : hasReachedMaxQuantity
        ? `You already have the maximum available quantity${typeof availableQuantity === "number" ? ` (${availableQuantity})` : ""} in your cart.`
        : quantityGuard.message;
  return (
    <div className={`flex gap-3 rounded-[8px] border border-black/5 bg-white shadow-[0_6px_18px_rgba(20,24,27,0.05)] ${compact ? "p-2.5" : "p-3"}`}>
      <div className={`relative shrink-0 overflow-hidden rounded-[8px] bg-[#fafafa] ${compact ? "h-14 w-14" : "h-16 w-16"}`}>
        <BlurhashImage
          src={imageUrl || null}
          blurHash={imageBlurHash || null}
          alt={title}
          sizes="64px"
          className="h-full w-full"
          imageClassName="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <ProductLink
              href={productHref}
              className="block truncate text-[13px] font-semibold leading-[1.25] text-[#202020] transition-colors hover:text-[#907d4c]"
              title={title}
            >
              {title}
            </ProductLink>
            <p className="mt-1 truncate text-[11px] leading-[1.2] text-[#57636c]" title={sellerLabel}>
              Sold by {sellerLabel}
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-[1.2] text-[#8b94a3]" title={variantLabel}>
              {variantLabel}
            </p>
          </div>
          {saleActiveLine ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-[#fbe8ea] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d63f52]">
              Sale
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#57636c]">
          <span>{qty} item{qty === 1 ? "" : "s"}</span>
          <span>{fulfillmentLabel}</span>
          {saleActiveLine ? <span className="text-[#d63f52]">{saleQty > 0 ? `Sale qty ${saleQty}` : "On sale"}</span> : null}
          {regularQty > 0 ? <span>Regular qty {regularQty}</span> : null}
        </div>

        {isUnavailable ? (
          <div className="mt-3 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] font-medium text-[#b91c1c]">
            {item?.availability?.message || "This item is out of stock."}
          </div>
        ) : null}

        <div className="mt-3 space-y-2 text-[11px] leading-[1.35] text-[#57636c]">
          {saleActiveLine && saleIncl != null ? (
            <div className="flex items-center justify-between gap-3">
              <span>Sale price</span>
              <span className="flex items-baseline gap-2">
                <span className="font-semibold text-[#d63f52]">{formatMoney(saleIncl)}</span>
                <span className="text-[#9aa3af] line-through">{formatMoney(baseIncl)}</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span>Unit price</span>
              <span className="font-semibold text-[#202020]">{formatMoney(baseIncl)}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8b94a3]">Line total</span>
          <span className="text-[13px] font-semibold text-[#202020]">{formatMoney(lineIncl)}</span>
        </div>

        {controlsVisible ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {!isUnavailable ? (
              <div className="inline-flex items-center overflow-hidden rounded-[8px] border border-black/10 bg-white">
                <button
                  type="button"
                  onClick={onDecrement}
                  disabled={!canDecrease}
                  className="inline-flex h-8 w-8 items-center justify-center text-[16px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="inline-flex h-8 min-w-9 items-center justify-center border-x border-black/10 px-2 text-[12px] font-semibold text-[#202020]">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (incrementBlocked) {
                      if (incrementBlockedMessage) onIncrementBlocked?.(incrementBlockedMessage);
                      return;
                    }
                    onIncrement?.();
                  }}
                  disabled={busy}
                  className="inline-flex h-8 w-8 items-center justify-center text-[16px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Increase quantity"
                  title={
                    incrementBlockedMessage || undefined
                  }
                >
                  +
                </button>
              </div>
            ) : <div />}

            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
