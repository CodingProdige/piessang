"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
    disabled_by_admin?: boolean;
    qty_available?: number;
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
    product?: {
      unique_id?: string | number;
      title?: string | null;
      overview?: string | null;
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
      supplier_out_of_stock?: boolean;
      isActive?: boolean;
    };
    ratings?: {
      average?: number;
      count?: number;
    };
    variants?: ProductVariant[];
    has_sale_variant?: boolean;
    has_in_stock_variants?: boolean;
    moderation?: {
      status?: string | null;
      reason?: string | null;
      notes?: string | null;
      reviewedAt?: string | null;
      reviewedBy?: string | null;
    };
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

function getBrandSlug(item: ProductItem) {
  return item.data?.brand?.slug ?? item.data?.grouping?.brand ?? "";
}

function getVendorLabel(item: ProductItem) {
  return item.data?.vendor?.title ?? item.data?.shopify?.vendorName ?? "Piessang";
}

function getVendorSlug(item: ProductItem) {
  return item.data?.product?.sellerCode ?? item.data?.seller?.sellerCode ?? item.data?.vendor?.slug ?? item.data?.shopify?.vendorName ?? "piessang";
}

function getVariantLabel(variant?: ProductVariant | null) {
  return variant?.label?.trim() || "Default variant";
}

function getVariantImages(item: ProductItem, variant?: ProductVariant | null) {
  const images = [
    ...(variant?.media?.images ?? []),
    ...(item.data?.media?.images ?? []),
  ]
    .map((image) => ({
      imageUrl: image?.imageUrl?.trim() ?? "",
      blurHashUrl: image?.blurHashUrl?.trim() ?? "",
    }))
    .filter((image) => Boolean(image.imageUrl));
  return Array.from(new Map(images.map((image) => [image.imageUrl, image])).values());
}

function getStockLabel(variant?: ProductVariant | null, item?: ProductItem) {
  if (item?.data?.placement?.supplier_out_of_stock) {
    return { label: "Supplier out of stock", tone: "neutral" as const, hideQty: true };
  }
  if (variant?.placement?.continue_selling_out_of_stock) {
    return { label: "Continue selling out of stock", tone: "success" as const, hideQty: true };
  }
  if (typeof variant?.total_in_stock_items_available === "number") {
    return variant.total_in_stock_items_available > 0
      ? { label: `${variant.total_in_stock_items_available} in stock`, tone: "success" as const, hideQty: false }
      : { label: "Out of stock", tone: "danger" as const, hideQty: false };
  }
  const first = variant?.inventory?.[0];
  if (typeof first?.in_stock_qty === "number") {
    return first.in_stock_qty > 0
      ? { label: `${first.in_stock_qty} in stock`, tone: "success" as const, hideQty: false }
      : { label: "Out of stock", tone: "danger" as const, hideQty: false };
  }
  return { label: "Stock unknown", tone: "neutral" as const, hideQty: false };
}

function getVariantSummary(variant?: ProductVariant | null) {
  if (!variant) return null;
  const parts: string[] = [];
  if (variant.pack?.unit_count != null) parts.push(`${variant.pack.unit_count} units`);
  if (variant.pack?.volume != null) parts.push(`${variant.pack.volume}${variant.pack.volume_unit ?? ""}`);
  return parts.join(" • ") || null;
}

function getModerationLabel(status?: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "approved") return { label: "Approved", tone: "success" as const };
  if (normalized === "rejected") return { label: "Rejected", tone: "danger" as const };
  if (normalized === "in_review" || normalized === "pending_review") {
    return { label: "In review", tone: "neutral" as const };
  }
  return { label: "Draft", tone: "neutral" as const };
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

export function SingleProductView({ item, backHref = "/products" }: { item: ProductItem; backHref?: string }) {
  const router = useRouter();
  const { isSeller, profile } = useAuth();
  const variants = item.data?.variants ?? [];
  const defaultIndex = Math.max(
    0,
    variants.findIndex((variant) => variant?.placement?.is_default === true),
  );
  const initialVariant = pickDisplayVariant(variants) ?? variants[defaultIndex] ?? null;
  const initialIndex = initialVariant ? Math.max(0, variants.findIndex((variant) => variant === initialVariant)) : 0;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(initialIndex);
    setActiveImageIndex(0);
  }, [initialIndex, item.id, item.data?.product?.unique_id]);

  const activeVariant = variants[activeIndex] ?? initialVariant ?? null;
  const activeImages = getVariantImages(item, activeVariant);
  const priceExVat = getVariantPriceExVat(activeVariant ?? undefined);
  const compareAtPriceExVat = getCompareAtVariantPriceExVat(activeVariant ?? undefined);
  const saleActive = Boolean(
    activeVariant?.sale?.is_on_sale &&
      typeof priceExVat === "number" &&
      typeof compareAtPriceExVat === "number" &&
      compareAtPriceExVat > priceExVat,
  );
  const stock = getStockLabel(activeVariant, item);
  const deliveryPromise = getDeliveryPromise(item);
  const overview = item.data?.product?.overview ?? null;
  const description = item.data?.product?.description ?? "No description available.";
  const brandLabel = getBrandLabel(item);
  const vendorLabel = getVendorLabel(item);
  const moderation = item.data?.moderation ?? null;
  const moderationLabel = getModerationLabel(moderation?.status);
  const sellerVendorName = String(profile?.sellerVendorName ?? "").trim().toLowerCase();
  const productVendorName = String(
    item.data?.product?.vendorName ?? item.data?.shopify?.vendorName ?? vendorLabel ?? "",
  )
    .trim()
    .toLowerCase();
  const canResubmit =
    isSeller &&
    moderationLabel.label === "Rejected" &&
    (sellerVendorName ? sellerVendorName === productVendorName : true);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitMessage, setResubmitMessage] = useState<string | null>(null);

  async function resubmitForReview() {
    const uniqueId = String(item.data?.product?.unique_id ?? item.id ?? "").trim();
    if (!uniqueId) return;

    setResubmitting(true);
    setResubmitMessage(null);
    try {
      const response = await fetch("/api/catalogue/v1/products/product/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_id: uniqueId,
          data: {
            moderation: {
              status: "in_review",
              reason: null,
              notes: null,
              reviewedAt: null,
              reviewedBy: null,
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to resubmit the product.");
      }

      setResubmitMessage("Product resubmitted for review.");
      router.refresh();
    } catch {
      setResubmitMessage("Unable to resubmit right now.");
    } finally {
      setResubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        scroll={false}
        className="inline-flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] font-semibold text-[#4b5563] transition-colors hover:border-[#cbb26b] hover:text-[#202020]"
      >
        ← Back to products
      </Link>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <div className="relative aspect-[1/1] bg-white">
            {activeImages[activeImageIndex] ? (
              <BlurhashImage
                src={activeImages[activeImageIndex].imageUrl}
                blurHash={activeImages[activeImageIndex].blurHashUrl}
                alt={item.data?.product?.title ?? "Product image"}
                sizes="(max-width: 768px) 100vw, 60vw"
                className="h-full w-full"
                imageClassName="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[13px] text-[#8b94a3]">
                No image available
              </div>
            )}
          </div>
          {activeImages.length > 1 ? (
            <div className="grid grid-cols-4 gap-2 p-3">
              {activeImages.slice(0, 4).map((image, index) => (
                <button
                  key={`${image.imageUrl}-${index}`}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className="relative aspect-square overflow-hidden rounded-[8px] bg-white"
                >
                  <BlurhashImage
                    src={image.imageUrl}
                    blurHash={image.blurHashUrl}
                    alt={`${item.data?.product?.title ?? "Product"} ${index + 1}`}
                    className="h-full w-full"
                    imageClassName="object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 overflow-hidden rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
              Product details
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={
                  moderationLabel.tone === "success"
                    ? "rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#1a8553]"
                    : moderationLabel.tone === "danger"
                      ? "rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 text-[11px] font-semibold text-[#b91c1c]"
                      : "rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#907d4c]"
                }
              >
                {moderationLabel.label}
              </span>
              {moderation?.reviewedAt ? (
                <span className="text-[11px] text-[#8b94a3]">Reviewed {new Date(moderation.reviewedAt).toLocaleDateString()}</span>
              ) : null}
            </div>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.05] text-[#202020]">
              {item.data?.product?.title ?? "Untitled product"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-normal">
              <Link href={`/products?brand=${encodeURIComponent(getBrandSlug(item) || "piessang")}`} scroll={false} className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                {brandLabel}
              </Link>
              <span className="text-[#d6d6d6]">•</span>
              <Link
                href={`/vendors/${encodeURIComponent(getVendorSlug(item) || "piessang")}`}
                scroll={false}
                className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2"
              >
                {vendorLabel}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {priceExVat != null ? (
              <div className="flex items-end gap-2">
                <p className={saleActive ? "text-[28px] font-semibold leading-none text-[#ff5963]" : "text-[28px] font-semibold leading-none text-[#202020]"}>
                  {formatCurrencyInclVat(priceExVat)}
                </p>
                {saleActive && compareAtPriceExVat ? (
                  <p className="text-[13px] text-[#8b94a3] line-through">
                    {formatCurrencyInclVat(compareAtPriceExVat)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-[#8b94a3]">Price unavailable</p>
            )}

            <span
              className={
                stock.tone === "success"
                  ? "rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#1a8553]"
                  : stock.tone === "danger"
                    ? "rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 text-[11px] font-semibold text-[#b91c1c]"
                    : "rounded-full bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#57636c]"
              }
            >
              {stock.label}
            </span>
          </div>

          {deliveryPromise ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
              <span className="rounded-full bg-[rgba(26,133,83,0.1)] px-2.5 py-1 text-[#1a8553]">
                {deliveryPromise.label}
              </span>
              <span className="text-[#8b94a3]">{deliveryPromise.cutoffText}</span>
            </div>
          ) : null}

          {overview ? (
            <p className="max-w-[64ch] text-[14px] font-medium leading-[1.55] text-[#202020]">
              {overview}
            </p>
          ) : null}
          <div
            className="max-w-[64ch] text-[13px] leading-[1.55] text-[#57636c]"
            dangerouslySetInnerHTML={{ __html: description }}
          />

          {moderationLabel.label === "Rejected" ? (
            <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b91c1c]">Rejection reason</p>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#7f1d1d]">
                {moderation?.reason || "No reason was supplied yet."}
              </p>
              {moderation?.notes ? (
                <p className="mt-2 text-[12px] leading-[1.6] text-[#9f1239]">{moderation.notes}</p>
              ) : null}
              {canResubmit ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void resubmitForReview()}
                    disabled={resubmitting}
                    className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resubmitting ? "Resubmitting..." : "Resubmit for review"}
                  </button>
                  {resubmitMessage ? (
                    <span className="text-[12px] text-[#57636c]">{resubmitMessage}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[8px] bg-[#fafafa] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Selected variant</p>
              <p className="mt-1 text-[14px] font-semibold text-[#202020]">{getVariantLabel(activeVariant)}</p>
              {getVariantSummary(activeVariant) ? (
                <p className="mt-1 text-[12px] text-[#57636c]">{getVariantSummary(activeVariant)}</p>
              ) : null}
            </div>
            <div className="rounded-[8px] bg-[#fafafa] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Variants</p>
              <p className="mt-1 text-[14px] font-semibold text-[#202020]">{variants.length} total</p>
              <p className="mt-1 text-[12px] text-[#57636c]">Choose the option that matches your stock and pricing.</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Select variant</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((variant, index) => {
                const selected = index === activeIndex;
                const variantPrice = formatCurrencyInclVat(getVariantPriceExVat(variant) ?? 0);
                return (
                  <button
                    key={String(variant.variant_id ?? index)}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    data-clickable-container="true"
                    className={
                      selected
                        ? "rounded-[8px] border border-[rgba(203,178,107,0.6)] bg-[rgba(203,178,107,0.12)] px-3 py-2 text-left text-[12px] font-semibold text-[#202020]"
                        : "rounded-[8px] border border-black/10 bg-white px-3 py-2 text-left text-[12px] font-semibold text-[#57636c] transition-colors hover:border-[rgba(203,178,107,0.6)] hover:bg-[rgba(203,178,107,0.08)] hover:text-[#202020]"
                    }
                  >
                    <span className="block">{getVariantLabel(variant)}</span>
                    {variantPrice ? <span className="mt-1 block text-[11px] font-medium text-[#8b94a3]">{variantPrice}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[#202020]">Variant details</h2>
          <p className="text-[12px] text-[#57636c]">
            {activeVariant?.sale?.is_on_sale ? "Sale active" : "Standard pricing"}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {variants.map((variant, index) => {
            const selected = index === activeIndex;
            const variantPrice = formatCurrencyInclVat(getVariantPriceExVat(variant) ?? 0);
            const stockMeta = getStockLabel(variant, item);
            const compareAt = variant?.sale?.is_on_sale ? formatCurrencyInclVat(getCompareAtVariantPriceExVat(variant) ?? 0) : null;
            return (
              <button
                key={String(variant.variant_id ?? index)}
                type="button"
                onClick={() => setActiveIndex(index)}
                data-clickable-container="true"
                className={
                  selected
                    ? "rounded-[8px] border border-[rgba(203,178,107,0.6)] bg-[rgba(203,178,107,0.08)] p-4 text-left"
                    : "rounded-[8px] border border-black/10 bg-white p-4 text-left transition-colors hover:border-[rgba(203,178,107,0.5)] hover:bg-[rgba(203,178,107,0.04)]"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[#202020]">{getVariantLabel(variant)}</p>
                    {getVariantSummary(variant) ? (
                      <p className="mt-1 text-[12px] text-[#57636c]">{getVariantSummary(variant)}</p>
                    ) : null}
                  </div>
                  {variant?.placement?.is_default ? (
                    <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a4545]">
                      Default
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <p className="text-[18px] font-semibold leading-none text-[#202020]">{variantPrice}</p>
                  {variant?.sale?.is_on_sale && compareAt ? (
                    <p className="text-[11px] text-[#8b94a3] line-through">{compareAt}</p>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span
                    className={
                      stockMeta.tone === "success"
                        ? "rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 font-semibold text-[#1a8553]"
                        : stockMeta.tone === "danger"
                          ? "rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 font-semibold text-[#b91c1c]"
                          : "rounded-full bg-[#f7f7f7] px-2.5 py-1 font-semibold text-[#57636c]"
                    }
                  >
                    {stockMeta.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
