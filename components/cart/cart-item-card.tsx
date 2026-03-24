"use client";

import Image from "next/image";

type CartItem = {
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
      title?: string | null;
    };
    media?: {
      images?: Array<{ imageUrl?: string | null }>;
    };
  };
  selected_variant_snapshot?: {
    label?: string | null;
    pricing?: {
      selling_price_excl?: number;
    };
    sale?: {
      is_on_sale?: boolean;
      sale_price_excl?: number;
      qty_available?: number;
    };
  };
};

const VAT = 0.15;

const money = (value?: number) =>
  `R ${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(typeof value === "number" && Number.isFinite(value) ? value : 0)}`;

const toIncl = (value?: number) => {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Number((amount * (1 + VAT)).toFixed(2));
};

export function CartItemCard({
  item,
  compact = false,
}: {
  item: CartItem;
  compact?: boolean;
}) {
  const snapshot = item.product_snapshot;
  const variant = item.selected_variant_snapshot;
  const title = snapshot?.product?.title ?? "Untitled product";
  const variantLabel = variant?.label ?? "Selected variant";
  const qty = item.qty ?? item.quantity ?? 0;
  const saleQty = Math.max(0, item.sale_qty ?? 0);
  const regularQty = Math.max(0, item.regular_qty ?? Math.max(qty - saleQty, 0));
  const imageUrl = snapshot?.media?.images?.[0]?.imageUrl ?? "";
  const baseExcl = variant?.pricing?.selling_price_excl ?? 0;
  const saleExcl =
    variant?.sale?.is_on_sale && (variant?.sale?.sale_price_excl ?? 0) > 0
      ? variant.sale.sale_price_excl
      : null;
  const saleActive = Boolean(saleExcl != null && saleQty > 0);
  const baseIncl = toIncl(baseExcl);
  const saleIncl = saleExcl != null ? toIncl(saleExcl) : null;
  const lineIncl = item.line_totals?.final_incl ?? 0;
  return (
    <div className={`flex gap-3 rounded-[8px] border border-black/5 bg-white shadow-[0_6px_18px_rgba(20,24,27,0.05)] ${compact ? "p-2.5" : "p-3"}`}>
      <div className={`relative shrink-0 overflow-hidden rounded-[8px] bg-[#fafafa] ${compact ? "h-14 w-14" : "h-16 w-16"}`}>
        {imageUrl ? <Image src={imageUrl} alt={title} fill sizes="64px" className="object-cover" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-[1.25] text-[#202020]" title={title}>
              {title}
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-[1.2] text-[#8b94a3]" title={variantLabel}>
              {variantLabel}
            </p>
          </div>
          {saleActive ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-[#fbe8ea] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d63f52]">
              Sale
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#57636c]">
          <span>{qty} item{qty === 1 ? "" : "s"}</span>
          {saleActive ? <span className="text-[#d63f52]">Sale qty {saleQty}</span> : null}
          {regularQty > 0 ? <span>Regular qty {regularQty}</span> : null}
        </div>

        <div className="mt-3 space-y-2 text-[11px] leading-[1.35] text-[#57636c]">
          {saleActive && saleIncl != null ? (
            <div className="flex items-center justify-between gap-3">
              <span>Sale price</span>
              <span className="flex items-baseline gap-2">
                <span className="font-semibold text-[#d63f52]">{money(saleIncl)}</span>
                <span className="text-[#9aa3af] line-through">{money(baseIncl)}</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span>Unit price</span>
              <span className="font-semibold text-[#202020]">{money(baseIncl)}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8b94a3]">Line total</span>
          <span className="text-[13px] font-semibold text-[#202020]">{money(lineIncl)}</span>
        </div>
      </div>
    </div>
  );
}
