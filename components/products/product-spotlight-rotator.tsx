"use client";

import { useEffect, useMemo, useState } from "react";
import { BlurhashImage } from "@/components/shared/blurhash-image";

type ProductVariant = {
  label?: string | null;
  sale?: {
    is_on_sale?: boolean;
    sale_price_excl?: number;
    disabled_by_admin?: boolean;
    qty_available?: number;
  };
  pricing?: {
    selling_price_excl?: number;
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

type ProductSpotlightItem = {
  id?: string;
  data?: {
    docId?: string;
    product?: {
      unique_id?: string | number;
      title?: string | null;
      overview?: string | null;
      description?: string | null;
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
    };
    media?: {
      images?: Array<{ imageUrl?: string | null; blurHashUrl?: string | null }>;
    };
    placement?: {
      supplier_out_of_stock?: boolean;
      isFeatured?: boolean;
      isActive?: boolean;
      position?: number;
    };
    variants?: ProductVariant[];
  };
};

const VAT_MULTIPLIER = 1.15;

function formatCurrencyInclVat(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `R ${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value * VAT_MULTIPLIER)}`;
}

function getBrandLabel(item: ProductSpotlightItem) {
  return item.data?.brand?.title ?? "Piessang";
}

function getVendorLabel(item: ProductSpotlightItem) {
  return item.data?.vendor?.title ?? item.data?.shopify?.vendorName ?? "Piessang";
}

function pickDisplayVariant(variants?: ProductVariant[]) {
  if (!variants?.length) return null;

  const getPrice = (variant: ProductVariant) => {
    if (variant?.sale?.is_on_sale && typeof variant?.sale?.sale_price_excl === "number") {
      return variant.sale.sale_price_excl;
    }
    if (typeof variant?.pricing?.sale_price_excl === "number") {
      return variant.pricing.sale_price_excl;
    }
    if (typeof variant?.pricing?.selling_price_excl === "number") {
      return variant.pricing.selling_price_excl;
    }
    return null;
  };

  return (
    [...variants]
      .map((variant) => ({ variant, price: getPrice(variant) }))
      .filter((entry): entry is { variant: ProductVariant; price: number } => typeof entry.price === "number")
      .sort((a, b) => b.price - a.price)[0]?.variant ?? variants[0]
  );
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
  return prices.length ? Math.max(...prices) : null;
}

function getVariantImages(item: ProductSpotlightItem, variant: ProductVariant | null) {
  const productImages = item.data?.media?.images ?? [];
  const variantImages = variant?.media?.images ?? [];
  const images = [...variantImages, ...productImages]
    .map((image) => ({
      imageUrl: image?.imageUrl?.trim() ?? "",
      blurHashUrl: image?.blurHashUrl?.trim() ?? "",
    }))
    .filter((image) => Boolean(image.imageUrl));
  return Array.from(new Map(images.map((image) => [image.imageUrl, image])).values());
}

function getVariantLabel(variant: ProductVariant | null) {
  return String(variant?.label ?? "").trim() || "Default variant";
}

function getVariantInfo(variant: ProductVariant | null) {
  if (!variant) return null;

  if (variant?.sale?.is_on_sale === true) {
    return {
      label: "Sale price",
      value: formatCurrencyInclVat(Number(variant?.sale?.sale_price_excl ?? 0)) ?? "R 0.00",
      extra: "On sale",
    };
  }

  return {
    label: "Selling price",
    value: formatCurrencyInclVat(Number(getVariantPriceExVat(variant) ?? 0)) ?? "R 0.00",
    extra: null,
  };
}

function getStockLabel(variant: ProductVariant | null, item: ProductSpotlightItem) {
  if (item?.data?.placement?.supplier_out_of_stock) {
    return { label: "Supplier out of stock", tone: "neutral" as const };
  }

  if (variant?.placement?.continue_selling_out_of_stock) {
    return { label: "Continue selling out of stock", tone: "success" as const };
  }

  const stock = variant?.total_in_stock_items_available;
  if (typeof stock === "number") {
    return stock > 0
      ? { label: `${stock} in stock`, tone: "success" as const }
      : { label: "Out of stock", tone: "danger" as const };
  }

  const row = variant?.inventory?.[0];
  const qty = Number(row?.in_stock_qty ?? 0);
  if (Number.isFinite(qty)) {
    return qty > 0
      ? { label: `${qty} in stock`, tone: "success" as const }
      : { label: "Out of stock", tone: "danger" as const };
  }

  return { label: "Stock unknown", tone: "neutral" as const };
}

export function ProductSpotlightRotator({ items }: { items: ProductSpotlightItem[] }) {
  const spotlightItems = useMemo(() => {
    const seeded = [...items]
      .filter((item) => Boolean(item?.data?.product?.title))
      .sort((a, b) => String(a.id ?? a.data?.docId ?? "").localeCompare(String(b.id ?? b.data?.docId ?? "")));

    if (!seeded.length) return [];

    return [...seeded].sort(() => Math.random() - 0.5);
  }, [items]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!spotlightItems.length) return;
    setActiveIndex(0);
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % spotlightItems.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [spotlightItems.length]);

  if (!spotlightItems.length) {
    return null;
  }

  const item = spotlightItems[activeIndex] ?? spotlightItems[0];
  const variant = pickDisplayVariant(item.data?.variants) ?? null;
  const image = getVariantImages(item, variant)[0] ?? item.data?.media?.images?.find((entry) => Boolean(entry?.imageUrl)) ?? null;
  const variantInfo = getVariantInfo(variant);
  const stock = getStockLabel(variant, item);
  const price = variant ? formatCurrencyInclVat(getVariantPriceExVat(variant) ?? 0) : null;
  const overview = item.data?.product?.overview ?? null;

  return (
    <section className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
            Product spotlight
          </p>
          <p className="mt-1 text-[13px] text-[#57636c]">
            Rotating picks from the currently selected brand.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {spotlightItems.map((entry, index) => (
            <span
              key={entry.id ?? entry.data?.docId ?? index}
              className={
                index === activeIndex
                  ? "h-2 w-6 rounded-full bg-[#cbb26b]"
                  : "h-2 w-2 rounded-full bg-[#d8d8d8]"
              }
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-[8px] bg-white">
          <div className="relative aspect-[1/1]">
            {image ? (
              <BlurhashImage
                src={image.imageUrl ?? ""}
                blurHash={image.blurHashUrl ?? ""}
                alt={item.data?.product?.title ?? "Spotlight product"}
                sizes="(max-width: 768px) 100vw, 260px"
                className="h-full w-full"
                imageClassName="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[13px] text-[#8b94a3]">
                No image available
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
            {getBrandLabel(item)}
          </p>
          <h3 className="mt-1 text-[22px] font-semibold leading-[1.1] text-[#202020]">
            {item.data?.product?.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-normal">
            <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
              {getBrandLabel(item)}
            </span>
            <span className="text-[#d6d6d6]">•</span>
            <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
              {getVendorLabel(item)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
            <span
              className={
                stock.tone === "success"
                  ? "rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 text-[#1a8553]"
                  : stock.tone === "danger"
                    ? "rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 text-[#b91c1c]"
                    : "rounded-full bg-[#f7f7f7] px-2.5 py-1 text-[#57636c]"
              }
            >
              {stock.label}
            </span>
            {variantInfo ? (
              <span className="rounded-full bg-[rgba(203,178,107,0.12)] px-2.5 py-1 text-[#4a4545]">
                {variantInfo.label}
              </span>
            ) : null}
          </div>

          {variantInfo ? (
            <div className="mt-4 flex items-end gap-3">
              <p className="text-[28px] font-semibold leading-none tracking-tight text-[#202020]">
                {variantInfo.value}
              </p>
              {variant?.sale?.is_on_sale && getCompareAtVariantPriceExVat(variant) ? (
                <p className="text-[13px] text-[#8b94a3] line-through">
                  {formatCurrencyInclVat(getCompareAtVariantPriceExVat(variant) ?? 0)}
                </p>
              ) : null}
            </div>
          ) : null}

          {overview ? (
            <p className="mt-4 max-w-[58ch] text-[14px] font-medium leading-[1.55] text-[#202020]">
              {overview}
            </p>
          ) : null}
          <div
            className={
              overview
                ? "mt-2 max-w-[58ch] text-[13px] leading-[1.55] text-[#57636c]"
                : "mt-4 max-w-[58ch] text-[13px] leading-[1.55] text-[#57636c]"
            }
            dangerouslySetInnerHTML={{
              __html:
                item.data?.product?.description ??
                "Browse the rotating highlight from this brand while keeping the rest of the catalogue below.",
            }}
          />

          <div className="mt-4 grid gap-2 text-[12px] text-[#57636c] sm:grid-cols-2">
            <div className="rounded-[8px] bg-[#fafafa] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
                Selected variant
              </p>
              <p className="mt-1 font-medium text-[#202020]">{variant ? getVariantLabel(variant) : "Default"}</p>
            </div>
            <div className="rounded-[8px] bg-[#fafafa] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
                Spotlight source
              </p>
              <p className="mt-1 font-medium text-[#202020]">{activeIndex + 1} of {spotlightItems.length}</p>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
