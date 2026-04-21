"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import {
  hasPreciseShopperDeliveryArea,
  readShopperDeliveryArea,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { RenderWhenVisible } from "@/components/shared/render-when-visible";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { trackProductEngagement } from "@/lib/analytics/product-engagement-client";
import { resolveBrandKey, resolveBrandLabel } from "@/lib/catalogue/brand-key";
import { clampRequestedCartQty, getCartQuantityGuard, getVariantAvailableQuantity } from "@/lib/cart/interaction-guards";
import {
  buildVariantOptionMatrix,
  formatVariantAxisValue,
  getAvailableVariantIndexForOption,
  getVariantSelectionFromVariant,
  isOptionAvailableForSelection,
  type VariantAxis,
} from "@/lib/catalogue/variant-options";
import { getShopperFacingDeliveryMessage, getShopperFacingDeliveryPromise } from "@/lib/shipping/display";

type ProductVariant = {
  variant_id?: string | number;
  label?: string | null;
  size?: string | null;
  color?: string | null;
  shade?: string | null;
  scent?: string | null;
  skinType?: string | null;
  hairType?: string | null;
  flavor?: string | null;
  abv?: string | null;
  containerType?: string | null;
  storageCapacity?: string | null;
  memoryRam?: string | null;
  connectivity?: string | null;
  compatibility?: string | null;
  sizeSystem?: string | null;
  material?: string | null;
  ringSize?: string | null;
  strapLength?: string | null;
  bookFormat?: string | null;
  language?: string | null;
  ageRange?: string | null;
  modelFitment?: string | null;
  pack?: {
    unit_count?: number;
    volume?: number;
    volume_unit?: string | null;
  };
  pricing?: {
    selling_price_incl?: number;
    selling_price_excl?: number;
    sale_price_incl?: number;
    sale_price_excl?: number;
  };
  sale?: {
    is_on_sale?: boolean;
    sale_price_incl?: number;
    sale_price_excl?: number;
    disabled_by_admin?: boolean;
    qty_available?: number;
  };
  placement?: {
    is_default?: boolean;
    track_inventory?: boolean;
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
  sales?: {
    total_units_sold?: number;
  };
  total_in_stock_items_available?: number;
  checkout_reserved_qty?: number;
  checkout_reserved_unavailable?: boolean;
  logistics?: {
    parcel_preset?: string | null;
    shipping_class?: string | null;
    weight_kg?: number | null;
    length_cm?: number | null;
    width_cm?: number | null;
    height_cm?: number | null;
    volumetric_weight_kg?: number | null;
    billable_weight_kg?: number | null;
  };
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
      sellerSlug?: string | null;
      sales?: {
        total_units_sold?: number;
      };
    };
    seller?: {
      sellerCode?: string | null;
      vendorName?: string | null;
      vendorDescription?: string | null;
      sellerSlug?: string | null;
      activeSellerSlug?: string | null;
      groupSellerSlug?: string | null;
      baseLocation?: string | null;
      deliveryProfile?: {
        localDeliveryRules?: Array<{
          id?: string | null;
          label?: string | null;
          city?: string | null;
          suburb?: string | null;
          radiusKm?: number;
          fee?: number;
          leadTimeDays?: number;
        }>;
        courierZones?: Array<{
          id?: string | null;
          label?: string | null;
          country?: string | null;
          province?: string | null;
          city?: string | null;
          postalCodes?: string[];
          fee?: number;
          leadTimeDays?: number;
          cutoffTime?: string | null;
          isFallback?: boolean;
        }>;
        directDelivery?: {
          cutoffTime?: string | null;
        };
        origin?: {
          utcOffsetMinutes?: number | null;
        };
        allowsCollection?: boolean;
        notes?: string | null;
      };
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
    seller_offer_count?: number;
    alternate_offers?: Array<{
      productId?: string | null;
      title?: string | null;
      titleSlug?: string | null;
      sellerCode?: string | null;
      sellerSlug?: string | null;
      vendorName?: string | null;
      variantId?: string | null;
      variantLabel?: string | null;
      barcode?: string | null;
      priceIncl?: number | null;
      hasInStockVariants?: boolean;
      imageUrl?: string | null;
    }>;
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
    is_favorite?: boolean;
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

type RecommendationRailsState = {
  oftenBought?: {
    items?: ProductItem[];
    source?: "co_purchase" | "catalog_pairing" | "none";
    message?: string | null;
  };
  similar?: {
    items?: ProductItem[];
    source?: "co_purchase" | "catalog_pairing" | "none";
    message?: string | null;
  };
};

type RecommendationPayload = {
  ok?: boolean;
  items?: ProductItem[];
  source?: "co_purchase" | "catalog_pairing" | "none";
  message?: string;
};

async function fetchRecommendationRail(
  endpoint: "often-bought-together" | "similar",
  productId: string,
): Promise<{
  items: ProductItem[];
  source: "co_purchase" | "catalog_pairing" | "none";
  message: string | null;
}> {
  if (!productId) {
    return { items: [], source: "none", message: null };
  }

  try {
    const response = await fetch(`/api/client/v1/products/${endpoint}?productId=${encodeURIComponent(productId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as RecommendationPayload;
    if (!response.ok || payload?.ok === false) {
      return { items: [], source: "none", message: payload?.message ?? null };
    }

    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    const productIds = rawItems
      .map((item) => String(item?.data?.product?.unique_id ?? item?.id ?? "").trim())
      .filter((value, index, array) => /^\d{8}$/.test(value) && array.indexOf(value) === index)
      .slice(0, 12);

    let hydratedItems = rawItems;
    if (productIds.length) {
      try {
        const hydrateResponse = await fetch(
          `/api/catalogue/v1/products/product/get?ids=${encodeURIComponent(productIds.join(","))}&isActive=true`,
          { cache: "no-store" },
        );
        const hydratePayload = (await hydrateResponse.json().catch(() => ({}))) as { ok?: boolean; items?: ProductItem[]; groups?: Array<{ items?: ProductItem[] }> };
        if (hydrateResponse.ok && hydratePayload?.ok !== false) {
          const candidates = Array.isArray(hydratePayload?.items)
            ? hydratePayload.items
            : Array.isArray(hydratePayload?.groups)
              ? hydratePayload.groups.flatMap((group) => group.items ?? [])
              : [];
          const candidatesById = new Map(
            candidates.map((item) => [String(item?.data?.product?.unique_id ?? item?.id ?? "").trim(), item]),
          );
          hydratedItems = productIds
            .map((id) => candidatesById.get(id))
            .filter((item): item is ProductItem => Boolean(item));
        }
      } catch {
        // Keep the initial recommendation payload if hydration fails.
      }
    }

    return {
      items: hydratedItems,
      source: payload?.source ?? "none",
      message: payload?.message ?? null,
    };
  } catch {
    return { items: [], source: "none", message: null };
  }
}

const VAT_MULTIPLIER = 1.15;
const LOW_STOCK_THRESHOLD = 13;
const LIVE_VIEWER_FLAME_THRESHOLD = 5;
const HOT_SALES_FIRE_THRESHOLD = 100;

const ProductReviewsSection = dynamic(
  () => import("@/components/products/product-reviews-section").then((mod) => mod.ProductReviewsSection),
  {
    ssr: false,
    loading: () => (
      <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="h-6 w-40 rounded bg-[#f3f3f0] animate-pulse" />
        <div className="mt-4 h-32 rounded-[8px] bg-[#f3f3f0] animate-pulse" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 rounded-[8px] bg-[#f3f3f0] animate-pulse" />
          ))}
        </div>
      </section>
    ),
  },
);

const ProductPageRecommendations = dynamic(
  () => import("@/components/products/product-page-recommendations").then((mod) => mod.ProductPageRecommendations),
  {
    ssr: false,
    loading: () => (
      <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="h-6 w-40 rounded bg-[#f3f3f0] animate-pulse" />
        <div className="mt-4 h-28 rounded-[8px] bg-[#f3f3f0] animate-pulse" />
      </section>
    ),
  },
);

function scheduleWhenIdle(task: () => void, timeout = 1500) {
  if (typeof window === "undefined") return () => {};

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(() => task(), { timeout });
    return () => window.cancelIdleCallback(idleId);
  }

  const timer = globalThis.setTimeout(task, timeout);
  return () => globalThis.clearTimeout(timer);
}

function prefersLiteProductExperience() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    mozConnection?: { saveData?: boolean; effectiveType?: string };
    webkitConnection?: { saveData?: boolean; effectiveType?: string };
  }).connection
    ?? (navigator as Navigator & { mozConnection?: { saveData?: boolean; effectiveType?: string } }).mozConnection
    ?? (navigator as Navigator & { webkitConnection?: { saveData?: boolean; effectiveType?: string } }).webkitConnection;
  if (!connection) return false;
  if (connection.saveData) return true;
  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  return effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";
}

function splitCurrencyParts(formattedValue?: string | null) {
  if (!formattedValue) return null;
  const normalized = String(formattedValue).trim();
  const match = normalized.match(/^([^0-9-]*)(-?[0-9\s.,]+)$/);
  if (!match) return null;
  const symbol = (match[1] || "").trimEnd();
  const numeric = (match[2] || "").trim();
  const lastSeparatorIndex = Math.max(numeric.lastIndexOf("."), numeric.lastIndexOf(","));
  if (lastSeparatorIndex === -1) return { whole: `${symbol}${numeric}`, cents: "00" };
  const whole = `${symbol}${numeric.slice(0, lastSeparatorIndex)}`;
  const cents = numeric.slice(lastSeparatorIndex + 1).padEnd(2, "0").slice(0, 2);
  return { whole, cents };
}

function getDiscountPercent(compareAt?: number | null, salePrice?: number | null) {
  if (
    typeof compareAt !== "number" ||
    typeof salePrice !== "number" ||
    !Number.isFinite(compareAt) ||
    !Number.isFinite(salePrice) ||
    compareAt <= salePrice ||
    compareAt <= 0
  ) {
    return null;
  }
  return Math.max(1, Math.round(((compareAt - salePrice) / compareAt) * 100));
}

function hasMeaningfulSale(compareAt?: number | null, salePrice?: number | null) {
  if (
    typeof compareAt !== "number" ||
    typeof salePrice !== "number" ||
    !Number.isFinite(compareAt) ||
    !Number.isFinite(salePrice)
  ) {
    return false;
  }
  const compareAtRounded = Math.round(compareAt * 100) / 100;
  const saleRounded = Math.round(salePrice * 100) / 100;
  if (compareAtRounded <= saleRounded) return false;
  const percent = getDiscountPercent(compareAtRounded, saleRounded);
  return typeof percent === "number" && percent >= 2;
}

function formatSoldCount(value?: number | null) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count >= 1_000_000) {
    const compact = `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
    return `${compact} sold`;
  }
  if (count >= 1000) {
    const compact = `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
    return `${compact} sold`;
  }
  return `${Math.round(count)} sold`;
}

function StorefrontPrice({
  value,
  tone = "default",
  size = "lg",
}: {
  value?: number | null;
  tone?: "default" | "sale" | "muted";
  size?: "md" | "lg";
}) {
  const { formatMoney } = useDisplayCurrency();
  const parts = splitCurrencyParts(typeof value === "number" ? formatMoney(value) : null);
  if (!parts) return null;

  const toneClass =
    tone === "sale" ? "text-[#ff5963]" : tone === "muted" ? "text-[#8b94a3]" : "text-[#202020]";
  const wholeClass = size === "lg" ? "text-[28px]" : "text-[18px]";
  const centsClass = size === "lg" ? "text-[16px]" : "text-[11px]";

  return (
    <span className={`inline-flex items-start font-semibold leading-none ${toneClass}`}>
      <span className={wholeClass}>{parts.whole}</span>
      <span className={`ml-[1px] ${centsClass} leading-none`}>{parts.cents}</span>
    </span>
  );
}

function getVariantPriceInclVat(variant?: ProductVariant) {
  if (!variant) return null;
  if (variant.sale?.is_on_sale && typeof variant.sale.sale_price_incl === "number") {
    return variant.sale.sale_price_incl;
  }
  if (typeof variant.pricing?.selling_price_incl === "number") {
    return variant.pricing.selling_price_incl;
  }
  if (variant.sale?.is_on_sale && typeof variant.sale.sale_price_excl === "number") {
    return variant.sale.sale_price_excl * VAT_MULTIPLIER;
  }
  if (typeof variant.pricing?.selling_price_excl === "number") {
    return variant.pricing.selling_price_excl * VAT_MULTIPLIER;
  }
  return null;
}

function getCompareAtVariantPriceInclVat(variant?: ProductVariant) {
  if (!variant) return null;
  const prices = [
    variant.pricing?.selling_price_incl,
    typeof variant.pricing?.selling_price_excl === "number" ? variant.pricing.selling_price_excl * VAT_MULTIPLIER : undefined,
  ].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return prices.length ? Math.max(...prices) : null;
}

function pickDisplayVariant(variants?: ProductVariant[]) {
  if (!variants?.length) return null;
  return (
    variants.find((variant) => variant?.placement?.is_default === true) ||
    variants.find((variant) => String(variant?.variant_id || "").trim()) ||
    variants[0] ||
    null
  );
}

function getBrandLabel(item: ProductItem) {
  return resolveBrandLabel(item.data);
}

function getBrandSlug(item: ProductItem) {
  return resolveBrandKey(item.data);
}

function getVendorLabel(item: ProductItem) {
  return (
    item.data?.seller?.vendorName ??
    item.data?.product?.vendorName ??
    item.data?.vendor?.title ??
    item.data?.shopify?.vendorName ??
    "Piessang"
  );
}

function getVendorSlug(item: ProductItem) {
  return (
    item.data?.product?.sellerCode ??
    item.data?.seller?.sellerCode ??
    item.data?.seller?.sellerSlug ??
    item.data?.seller?.activeSellerSlug ??
    item.data?.seller?.groupSellerSlug ??
    item.data?.vendor?.slug ??
    item.data?.shopify?.vendorName ??
    "piessang"
  );
}

function normalizeProductSlug(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getAlternateOfferHref(offer: {
  productId?: string | null;
  title?: string | null;
  titleSlug?: string | null;
  variantId?: string | null;
}) {
  const uniqueId = String(offer?.productId ?? "").trim();
  if (!uniqueId) return "/products";
  const slug = normalizeProductSlug(offer?.titleSlug || offer?.title) || "product";
  const params = new URLSearchParams({ unique_id: uniqueId });
  if (offer?.variantId) params.set("variant_id", String(offer.variantId).trim());
  return `/products/${slug}?${params.toString()}`;
}

function getVariantLabel(variant?: ProductVariant | null) {
  return variant?.label?.trim() || "Default variant";
}

function isHexColor(value?: string | null) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value ?? "").trim());
}

function formatColorLabel(value?: string | null) {
  return formatVariantAxisValue("color", value);
}

function isApparelLikeVariant(variant?: ProductVariant | null) {
  if (!variant) return false;
  return Boolean(
    String(variant.size ?? "").trim() &&
      !String(variant.storageCapacity ?? "").trim() &&
      !String(variant.memoryRam ?? "").trim() &&
      !String(variant.connectivity ?? "").trim() &&
      !String(variant.compatibility ?? "").trim() &&
      !String(variant.bookFormat ?? "").trim() &&
      !String(variant.modelFitment ?? "").trim(),
  );
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
  if (variant?.placement?.track_inventory !== true || variant?.placement?.continue_selling_out_of_stock) {
    return { label: "In stock", tone: "success" as const, hideQty: true };
  }
  if (variant?.checkout_reserved_unavailable) {
    return { label: "Reserved in another shopper's checkout.", tone: "warning" as const, hideQty: false };
  }
  if (typeof variant?.total_in_stock_items_available === "number") {
    if (variant.total_in_stock_items_available <= 0) {
      return { label: "Out of stock", tone: "danger" as const, hideQty: false };
    }
    if (variant.total_in_stock_items_available <= LOW_STOCK_THRESHOLD) {
      return { label: `Only ${variant.total_in_stock_items_available} left`, tone: "warning" as const, hideQty: false };
    }
    return { label: "In stock", tone: "success" as const, hideQty: true };
  }
  const first = variant?.inventory?.[0];
  if (typeof first?.in_stock_qty === "number") {
    if (first.in_stock_qty <= 0) {
      return { label: "Out of stock", tone: "danger" as const, hideQty: false };
    }
    if (first.in_stock_qty <= LOW_STOCK_THRESHOLD) {
      return { label: `Only ${first.in_stock_qty} left`, tone: "warning" as const, hideQty: false };
    }
    return { label: "In stock", tone: "success" as const, hideQty: true };
  }
  return { label: "Stock unknown", tone: "neutral" as const, hideQty: false };
}

function getVariantSummary(variant?: ProductVariant | null) {
  if (!variant) return null;
  const parts: string[] = [];
  const isApparelLike = isApparelLikeVariant(variant);
  if (!isApparelLike && variant.pack?.unit_count != null) {
    const count = Number(variant.pack.unit_count);
    if (Number.isFinite(count) && count > 0) {
      parts.push(`${count} ${count === 1 ? "unit" : "units"}`);
    }
  }
  if (!isApparelLike && variant.pack?.volume != null && Number(variant.pack.volume) > 0) {
    parts.push(`${variant.pack.volume}${variant.pack.volume_unit ?? ""}`);
  }
  return parts.join(" • ") || null;
}

function getVariantExtraDetails(variant?: ProductVariant | null) {
  if (!variant) return [];
  const isApparelLike = isApparelLikeVariant(variant);
  const entries: Array<{ label: string; value: string }> = [];
  const push = (label: string, value?: string | number | null, suffix = "") => {
    const text = String(value ?? "").trim();
    if (!text) return;
    entries.push({ label, value: `${text}${suffix}` });
  };

  if (!isApparelLike) {
    push("Color", formatColorLabel(variant.color));
    push("Size", variant.size);
  }
  push("Size system", variant.sizeSystem);
  push("Shade", variant.shade);
  push("Scent", variant.scent);
  push("Skin type", variant.skinType);
  push("Hair type", variant.hairType);
  push("Flavour", variant.flavor);
  push("ABV", variant.abv, "%");
  push("Container", variant.containerType);
  push("Storage", variant.storageCapacity);
  push("Memory", variant.memoryRam);
  push("Connectivity", variant.connectivity);
  push("Compatibility", variant.compatibility);
  push("Material", variant.material);
  push("Ring size", variant.ringSize);
  push("Strap length", variant.strapLength);
  push("Format", variant.bookFormat);
  push("Language", variant.language);
  push("Age range", variant.ageRange);
  push("Fitment", variant.modelFitment);

  return entries;
}

function getVariantHighlightDetails(variant?: ProductVariant | null) {
  if (!variant) return [];
  if (isApparelLikeVariant(variant)) {
    const highlights: Array<{ label: string; value: string }> = [];
    const colorLabel = formatColorLabel(variant.color);
    if (colorLabel) highlights.push({ label: "Color", value: colorLabel });
    return highlights;
  }
  return getVariantExtraDetails(variant).slice(0, 4);
}

function isPreLovedCategory(category?: string | null) {
  const normalized = String(category ?? "").trim().toLowerCase();
  return normalized === "pre-loved" || normalized === "preloved";
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 ${filled ? "text-white" : "text-[#4a4545]"}`}>
      <path
        fill="currentColor"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.53L12 21.35z"
      />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10.8 1.7c.2 2.2-.7 3.6-1.8 4.8-1.1 1.1-2.2 2.2-2.2 4 0 1.6 1.3 3 3.1 3 2.1 0 3.8-1.6 3.8-4.2 0-1.6-.6-2.8-1.4-4 .1 1.4-.3 2.4-1.1 3.2.1-2-.2-4.4-2.4-6.8ZM10 18c-3.8 0-6.5-2.9-6.5-6.7 0-2.8 1.4-4.8 3-6.4.9-.9 1.7-1.7 1.8-3.2a1 1 0 0 1 1.8-.5c3.3 4.2 5.4 7 5.4 10.6 0 3.7-2.4 6.2-5.5 6.2Zm-.1-2.3c1.6 0 2.7-1.1 2.7-2.8 0-1-.3-1.8-1-2.8-.2.8-.7 1.4-1.3 1.9-.5.4-1 .8-1 1.7 0 1.1.8 2 1.6 2Z" />
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

function getRecommendationCardImageCount(item: ProductItem | null | undefined) {
  const productImages = Array.isArray(item?.data?.media?.images)
    ? item.data.media.images.filter((entry) => Boolean(entry?.imageUrl)).length
    : 0;
  const variantImages = Array.isArray(item?.data?.variants)
    ? item.data.variants.reduce(
        (sum, variant) =>
          sum +
          (Array.isArray(variant?.media?.images)
            ? variant.media.images.filter((entry) => Boolean(entry?.imageUrl)).length
            : 0),
        0,
      )
    : 0;
  return Math.max(productImages, variantImages);
}

function noopCartPreviewHandler() {}

function getDeliveryPromise(item: ProductItem, shopperArea: ShopperDeliveryArea | null, variant?: ProductVariant | null) {
  return getShopperFacingDeliveryPromise({
    fulfillmentMode: item.data?.fulfillment?.mode,
    profile: item.data?.seller?.deliveryProfile,
    sellerBaseLocation: item.data?.seller?.baseLocation || "",
    shopperArea,
    variant,
  });
}

function getSellerDeliveryMessage(item: ProductItem, shopperArea: ShopperDeliveryArea | null, variant?: ProductVariant | null) {
  return getShopperFacingDeliveryMessage({
    fulfillmentMode: item.data?.fulfillment?.mode,
    profile: item.data?.seller?.deliveryProfile,
    sellerBaseLocation: item.data?.seller?.baseLocation || "",
    shopperArea,
    variant,
    platformLabel: "Piessang handles shipping for this item",
    missingProfileLabel: shopperArea
      ? "Delivery availability confirmed at checkout"
      : "Set your shipping location to check availability",
  });
}

export function SingleProductView({
  item,
  selectedVariantId,
  recommendationRails,
}: {
  item: ProductItem;
  backHref?: string;
  selectedVariantId?: string | null;
  recommendationRails?: RecommendationRailsState;
}) {
  const router = useRouter();
  const {
    profile,
    cartOwnerId,
    isAuthenticated,
    openAuthModal,
    favoriteIds,
    refreshProfile,
    refreshCart,
    syncFavoriteState,
    syncCartState,
    optimisticAddToCart,
    cartVariantCounts,
  } = useAuth();
  const { formatMoney } = useDisplayCurrency();
  const variants = item.data?.variants ?? [];
  const defaultIndex = Math.max(
    0,
    variants.findIndex((variant) => variant?.placement?.is_default === true),
  );
  const requestedVariantIndex = Math.max(
    -1,
    variants.findIndex((variant) => String(variant?.variant_id || "").trim() === String(selectedVariantId || "").trim()),
  );
  const requestedVariant = requestedVariantIndex >= 0 ? variants[requestedVariantIndex] : null;
  const initialVariant = requestedVariant ?? pickDisplayVariant(variants) ?? variants[defaultIndex] ?? null;
  const initialIndex = initialVariant ? Math.max(0, variants.findIndex((variant) => variant === initialVariant)) : 0;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [zoomPoint, setZoomPoint] = useState<{ x: number; y: number } | null>(null);
  const [favoriteState, setFavoriteState] = useState(false);
  const [shopperArea, setShopperArea] = useState<ShopperDeliveryArea | null>(null);
  const [resolvedRecommendationRails, setResolvedRecommendationRails] = useState<RecommendationRailsState | undefined>(
    recommendationRails,
  );
  const [liteExperience, setLiteExperience] = useState(false);
  const [recommendationsActivated, setRecommendationsActivated] = useState(
    Boolean(recommendationRails?.oftenBought?.items?.length) || Boolean(recommendationRails?.similar?.items?.length),
  );

  useEffect(() => {
    setActiveIndex(initialIndex);
    setActiveImageIndex(0);
  }, [initialIndex, item.id, item.data?.product?.unique_id, selectedVariantId]);

  useEffect(() => {
    setActiveImageIndex(0);
    setZoomPoint(null);
    setSelectedQty(1);
    setHoveredVariantIndex(null);
  }, [activeIndex]);

  const activeVariant = variants[activeIndex] ?? initialVariant ?? null;
  const priceInclVat = getVariantPriceInclVat(activeVariant ?? undefined);
  const compareAtPriceInclVat = getCompareAtVariantPriceInclVat(activeVariant ?? undefined);
  const saleActive = Boolean(
    activeVariant?.sale?.is_on_sale &&
      hasMeaningfulSale(compareAtPriceInclVat, priceInclVat),
  );
  const salePercent = saleActive ? getDiscountPercent(compareAtPriceInclVat, priceInclVat) : null;
  const totalUnitsSold = Number(
    activeVariant?.sales?.total_units_sold ??
      item.data?.product?.sales?.total_units_sold ??
      0,
  );
  const soldCountLabel = formatSoldCount(totalUnitsSold);
  const showHotSales = totalUnitsSold >= HOT_SALES_FIRE_THRESHOLD;
  const productId = String(item.data?.product?.unique_id ?? item.id ?? "").trim();
  const stock = getStockLabel(activeVariant, item);
  const activeVariantId = String(activeVariant?.variant_id || "").trim();
  const cartVariantCount =
    productId && activeVariantId ? cartVariantCounts[`${productId}::${activeVariantId}`] ?? 0 : 0;
  const quantityGuard = getCartQuantityGuard({
    variant: activeVariant,
    currentCartQty: cartVariantCount,
    unavailable: stock.label === "Out of stock",
  });
  const availableQty = quantityGuard.availableQuantity;
  const isCheckoutReserved = quantityGuard.isCheckoutReserved;
  const maxAddableQty = quantityGuard.maxAddableQty;
  const blockedCartMessage = quantityGuard.message;
  const hasDeliveryEstimateLocation = Boolean(shopperArea?.country && hasPreciseShopperDeliveryArea(shopperArea));
  const deliveryPromise = hasDeliveryEstimateLocation ? getDeliveryPromise(item, shopperArea, activeVariant) : null;
  const sellerDeliveryMessage = hasDeliveryEstimateLocation ? getSellerDeliveryMessage(item, shopperArea, activeVariant) : null;
  const activeVariantExtraDetails = getVariantExtraDetails(activeVariant);
  const activeVariantHighlightDetails = getVariantHighlightDetails(activeVariant);
  const variantMatrix = useMemo(() => buildVariantOptionMatrix(variants), [variants]);
  const variantAxes = variantMatrix.axes;
  const hasStructuredVariantAxes = variantAxes.length > 0;
  const activeSelection = useMemo(
    () => getVariantSelectionFromVariant(activeVariant, variantAxes),
    [activeVariant, variantAxes],
  );
  const [hoveredVariantIndex, setHoveredVariantIndex] = useState<number | null>(null);
  const previewVariant = hoveredVariantIndex != null ? variants[hoveredVariantIndex] ?? null : null;
  const displayVariant = previewVariant ?? activeVariant;
  const activeImages = getVariantImages(item, displayVariant);
  const overview = item.data?.product?.overview ?? null;
  const description = item.data?.product?.description ?? "No description available.";
  const oftenBoughtItems = Array.isArray(resolvedRecommendationRails?.oftenBought?.items)
    ? resolvedRecommendationRails.oftenBought.items
    : [];
  const similarItems = Array.isArray(resolvedRecommendationRails?.similar?.items)
    ? resolvedRecommendationRails.similar.items
    : [];
  const oftenBoughtSubtitle =
    resolvedRecommendationRails?.oftenBought?.source === "co_purchase"
      ? "Based on previous orders"
      : resolvedRecommendationRails?.oftenBought?.source === "catalog_pairing"
        ? "Suggested from matching products in our catalog"
        : "Suggested from matching products in our catalog";
  const brandLabel = getBrandLabel(item);
  const vendorLabel = getVendorLabel(item);
  const alternateOffers = (Array.isArray(item.data?.alternate_offers) ? item.data.alternate_offers : [])
    .filter((offer) => String(offer?.productId ?? "").trim() && String(offer?.productId ?? "").trim() !== productId)
    .sort((a, b) => {
      const aReady = a?.hasInStockVariants === true ? 1 : 0;
      const bReady = b?.hasInStockVariants === true ? 1 : 0;
      if (bReady !== aReady) return bReady - aReady;
      const aPrice = typeof a?.priceIncl === "number" ? a.priceIncl : Number.POSITIVE_INFINITY;
      const bPrice = typeof b?.priceIncl === "number" ? b.priceIncl : Number.POSITIVE_INFINITY;
      if (aPrice !== bPrice) return aPrice - bPrice;
      return String(a?.vendorName || "").localeCompare(String(b?.vendorName || ""), "en", { sensitivity: "base" });
    });
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("wrong_listing");
  const [reportMessage, setReportMessage] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState(profile?.email ?? "");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [cartSubmittingAction, setCartSubmittingAction] = useState<"cart" | "checkout" | null>(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartAddedFlash, setCartAddedFlash] = useState(false);
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [liveViewerCount, setLiveViewerCount] = useState(0);
  const isFavorite = favoriteState;
  const addToCartLabel = cartSubmittingAction === "cart"
    ? "Adding..."
    : cartAddedFlash
      ? "Added to cart"
      : quantityGuard.reason === "reserved_in_checkout"
        ? "Reserved"
        : quantityGuard.reason === "max_in_cart"
          ? "Max reached"
          : quantityGuard.reason === "out_of_stock"
            ? "Out of stock"
            : "Add to cart";
  const buyNowLabel = cartSubmittingAction === "checkout"
    ? "Preparing checkout..."
    : cartAddedFlash
      ? "Buy now"
      : quantityGuard.reason === "reserved_in_checkout"
        ? "Reserved"
        : quantityGuard.reason === "max_in_cart"
          ? "Max reached"
          : quantityGuard.reason === "out_of_stock"
            ? "Out of stock"
            : "Buy now";

  const categoryLabel = item.data?.grouping?.category ? String(item.data.grouping.category).replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Products";
  const subCategoryLabel = item.data?.grouping?.subCategory ? String(item.data.grouping.subCategory).replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "";
  const isPreLoved = isPreLovedCategory(item.data?.grouping?.category);
  const hasThumbnailRail = activeImages.length > 1;

  useEffect(() => {
    setShopperArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea(setShopperArea);
  }, []);

  useEffect(() => {
    if (typeof maxAddableQty !== "number") return;
    setSelectedQty((current) => Math.min(Math.max(1, current), Math.max(1, maxAddableQty)));
  }, [maxAddableQty]);

  useEffect(() => {
    if (!cartAddedFlash) return undefined;
    const timeout = window.setTimeout(() => setCartAddedFlash(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [cartAddedFlash]);

  useEffect(() => {
    setLiteExperience(prefersLiteProductExperience());
  }, []);

  useEffect(() => {
    setResolvedRecommendationRails(recommendationRails);
  }, [recommendationRails]);

  useEffect(() => {
    if (!recommendationsActivated) return;
    if (liteExperience) return;
    if (!productId) return;
    const hasServerRecommendations =
      Boolean(recommendationRails?.oftenBought?.items?.length) || Boolean(recommendationRails?.similar?.items?.length);
    if (hasServerRecommendations) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const [oftenBought, similar] = await Promise.all([
        fetchRecommendationRail("often-bought-together", productId),
        fetchRecommendationRail("similar", productId),
      ]);
      if (!cancelled) {
        setResolvedRecommendationRails({
          oftenBought,
          similar,
        });
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [liteExperience, productId, recommendationRails, recommendationsActivated]);

  useEffect(() => {
    setFavoriteState(Boolean(item.data?.is_favorite) || Boolean(favoriteIds?.includes(productId)));
  }, [favoriteIds, item.data?.is_favorite, productId]);

  useEffect(() => {
    const activeImageUrl = String(activeImages[activeImageIndex]?.imageUrl || "").trim();
    if (!activeImageUrl || typeof window === "undefined") return;
    const preloadImage = new window.Image();
    preloadImage.decoding = "async";
    preloadImage.loading = "eager";
    preloadImage.src = activeImageUrl;
  }, [activeImageIndex, activeImages]);

  useEffect(() => {
    if (liteExperience) return;
    if (!productId || typeof window === "undefined") return;

    const sessionKey = `piessang:product-viewer:${productId}`;
    let sessionId = window.sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = `${productId}:${Math.random().toString(36).slice(2)}:${Date.now().toString(36)}`;
      window.sessionStorage.setItem(sessionKey, sessionId);
    }

    let cancelled = false;
    let interval: number | null = null;
    let inFlight = false;
    const heartbeat = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/client/v1/products/live-viewers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, sessionId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && typeof payload?.count === "number") {
          setLiveViewerCount(payload.count);
        }
      } catch {
      } finally {
        inFlight = false;
      }
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void heartbeat();
      }
    };

    const handleFocusRefresh = () => {
      void heartbeat();
    };

    const cancelIdle = scheduleWhenIdle(() => {
      void heartbeat();
      trackProductEngagement({
        action: "product_view",
        productId,
        productTitle: item.data?.product?.title || null,
        sellerCode: item.data?.product?.sellerCode ?? item.data?.seller?.sellerCode ?? null,
        sellerSlug: item.data?.seller?.sellerSlug ?? item.data?.product?.sellerSlug ?? null,
        vendorName:
          item.data?.seller?.vendorName ??
          item.data?.product?.vendorName ??
          item.data?.shopify?.vendorName ??
          null,
        source: "product_page",
        pageType: "product_detail",
        href: typeof window !== "undefined" ? window.location.href : null,
        userId: profile?.uid || null,
        dedupeKey: `piessang_product_view:${productId}`,
      });
      interval = window.setInterval(heartbeat, 10000);
      document.addEventListener("visibilitychange", handleVisibilityRefresh);
      window.addEventListener("focus", handleFocusRefresh);
    }, 2000);

    return () => {
      cancelled = true;
      cancelIdle();
      if (interval != null) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      window.removeEventListener("focus", handleFocusRefresh);
    };
  }, [item.data?.product?.sellerCode, item.data?.product?.sellerSlug, item.data?.product?.title, item.data?.product?.vendorName, item.data?.seller?.sellerCode, item.data?.seller?.sellerSlug, item.data?.seller?.vendorName, item.data?.shopify?.vendorName, liteExperience, productId, profile?.uid]);

  useEffect(() => {
    if (!snackbarMessage) return undefined;
    const timer = window.setTimeout(() => setSnackbarMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [snackbarMessage]);

  async function shareProduct() {
    const productUrl = typeof window !== "undefined" ? window.location.href : "";
    const sharePayload = {
      title: item.data?.product?.title || "Piessang product",
      text: `Take a look at ${item.data?.product?.title || "this product"} on Piessang.`,
      url: productUrl,
    };
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(sharePayload);
        setShareMessage("Product link shared.");
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(productUrl);
        setShareMessage("Product link copied.");
      } else {
        setShareMessage("Sharing is not available on this device.");
      }
    } catch {
      setShareMessage("Unable to share the product right now.");
    } finally {
      window.setTimeout(() => setShareMessage(null), 1800);
    }
  }

  async function copyProductLink() {
    const productUrl = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(productUrl);
        setShareMessage("Product link copied.");
        setSnackbarMessage("Product link copied.");
      } else {
        throw new Error("Copy is not available on this device.");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to copy the product link.";
      setShareMessage(message);
      setSnackbarMessage(message);
    } finally {
      setShareModalOpen(false);
    }
  }

  async function submitProductReport() {
    if (!productId) return;
    setReportSubmitting(true);
    setReportFeedback(null);
    try {
      const response = await fetch("/api/client/v1/products/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          reasonCode: reportReason,
          message: reportMessage,
          reporterName,
          reporterEmail,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to submit the report.");
      setReportFeedback(payload?.message || "Report sent.");
      setReportModalOpen(false);
      setReportMessage("");
    } catch (cause) {
      setReportFeedback(cause instanceof Error ? cause.message : "Unable to submit the report.");
    } finally {
      setReportSubmitting(false);
    }
  }

  async function addToCart(options?: { redirectToCheckout?: boolean }) {
    const redirectToCheckout = options?.redirectToCheckout === true;
    const activeCartOwnerId = cartOwnerId || profile?.uid || null;
    if (!activeCartOwnerId) return;
    if (!activeVariant?.variant_id) return;
    if (!activeVariantId) return;
    if (!quantityGuard.canAdd) {
      const stockMessage = quantityGuard.message || "This variant is unavailable right now.";
      setCartMessage(stockMessage);
      setSnackbarMessage(stockMessage);
      return;
    }
    const requestedQty = clampRequestedCartQty(selectedQty, maxAddableQty);
    if (requestedQty !== selectedQty) {
      setSelectedQty(requestedQty);
      const stockMessage =
        requestedQty === 1
          ? "Only 1 item is available, so we updated your quantity."
          : `Only ${requestedQty} items are available, so we updated your quantity.`;
      setCartMessage(stockMessage);
      setSnackbarMessage(stockMessage);
      if (!redirectToCheckout) return;
    }
    setCartSubmittingAction(redirectToCheckout ? "checkout" : "cart");
    setCartAddedFlash(false);
    setCartMessage(redirectToCheckout ? "Preparing checkout..." : "Adding to cart...");
    setSnackbarMessage(redirectToCheckout ? "Preparing checkout..." : "Adding to cart...");
    optimisticAddToCart(productId, activeVariantId, requestedQty);
    try {
      const response = await fetch("/api/client/v1/carts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartOwnerId: activeCartOwnerId,
          product: item.data,
          variant_id: activeVariantId,
          mode: "change",
          qty: requestedQty,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to add the product to your cart.");
      syncCartState(payload?.data?.cart ?? null);
      if (redirectToCheckout) {
        setCartMessage("Taking you to checkout...");
        setSnackbarMessage("Taking you to checkout...");
        router.push("/checkout");
        return;
      }
      setCartAddedFlash(true);
      setCartMessage("Added to cart.");
      setSnackbarMessage("Added to cart.");
    } catch (cause) {
      void refreshCart();
      setCartMessage(cause instanceof Error ? cause.message : "Unable to add to cart.");
      setSnackbarMessage(cause instanceof Error ? cause.message : "Unable to add to cart.");
    } finally {
      setCartSubmittingAction(null);
      window.setTimeout(() => setCartMessage(null), 1800);
    }
  }

  async function toggleFavorite() {
    if (!isAuthenticated || !profile?.uid) {
      openAuthModal("Sign in to save favourites.");
      return;
    }
    setFavoriteSubmitting(true);
    setFavoriteMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: profile.uid, unique_id: productId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update favourites.");
      const confirmedFavorite =
        typeof payload?.isFavorite === "boolean" ? payload.isFavorite : !isFavorite;
      setFavoriteState(confirmedFavorite);
      syncFavoriteState(productId, confirmedFavorite);
      const successMessage = confirmedFavorite ? "Added to favourites." : "Removed from favourites.";
      setFavoriteMessage(successMessage);
      setSnackbarMessage(successMessage);
      void refreshProfile();
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : "Unable to update favourites.";
      setFavoriteMessage(errorMessage);
      setSnackbarMessage(errorMessage);
    } finally {
      setFavoriteSubmitting(false);
      window.setTimeout(() => setFavoriteMessage(null), 1800);
    }
  }

  function renderVariantAxis(axis: VariantAxis) {
    const selectedKey = activeSelection[axis.key] ?? "";
    const selectedOption = axis.options.find((option) => option.key === selectedKey) ?? null;
    const axisHasPriceVariance = axis.options.some((option) => {
      const representative = variants[option.representativeVariantIndex];
      return getVariantPriceInclVat(representative) !== priceInclVat;
    });

    return (
      <div key={axis.key} className="space-y-3">
        <p className="text-[14px] font-medium text-[#57636c]">
          {axis.label}: <span className="font-semibold text-[#202020]">{selectedOption?.label || "Select"}</span>
        </p>
        <div className={axis.display === "pill" ? "flex flex-wrap gap-3" : "flex flex-wrap gap-3"}>
          {axis.options.map((option) => {
            const selected = option.key === selectedKey;
            const available = isOptionAvailableForSelection(variants, variantAxes, activeSelection, axis.key, option.key);
            const resolvedIndex = getAvailableVariantIndexForOption(variants, variantAxes, activeSelection, axis.key, option.key);
            const previewIndex = resolvedIndex >= 0 ? resolvedIndex : option.representativeVariantIndex;
            const representativeVariant = variants[previewIndex] ?? variants[option.representativeVariantIndex] ?? null;
            const optionImages = representativeVariant ? getVariantImages(item, representativeVariant) : [];
            const optionImage = optionImages[0] ?? null;
            const optionPrice = getVariantPriceInclVat(representativeVariant ?? undefined);
            const optionCompareAtPrice = getCompareAtVariantPriceInclVat(representativeVariant ?? undefined);
            const optionOnSale = hasMeaningfulSale(optionCompareAtPrice, optionPrice);

            const handleSelect = () => {
              if (resolvedIndex >= 0) {
                setActiveIndex(resolvedIndex);
                setHoveredVariantIndex(null);
              }
            };

            const handlePreviewStart = () => {
              if (previewIndex >= 0 && axis.display === "image_tile") setHoveredVariantIndex(previewIndex);
            };

            const handlePreviewEnd = () => {
              if (axis.display === "image_tile") setHoveredVariantIndex(null);
            };

            if (axis.display === "pill") {
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={handleSelect}
                  disabled={!available}
                  className={
                    selected
                      ? "inline-flex min-w-[92px] items-center justify-center rounded-full border-2 border-[#1da1ff] bg-white px-6 py-3 text-[18px] font-semibold text-[#202020] shadow-[0_8px_20px_rgba(29,161,255,0.14)]"
                      : available
                        ? "inline-flex min-w-[92px] items-center justify-center rounded-full border border-black/12 bg-white px-6 py-3 text-[18px] font-medium text-[#202020] transition-all hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_10px_24px_rgba(32,32,32,0.08)]"
                        : "inline-flex min-w-[92px] items-center justify-center rounded-full border border-dashed border-black/10 bg-[#fafafa] px-6 py-3 text-[18px] font-medium text-[#a0a7b0] opacity-70"
                  }
                  aria-label={`Select ${axis.label} ${option.label}`}
                  aria-pressed={selected}
                >
                  {option.label}
                </button>
              );
            }

            if (axis.display === "image_tile") {
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={handleSelect}
                  onMouseEnter={handlePreviewStart}
                  onMouseLeave={handlePreviewEnd}
                  onFocus={handlePreviewStart}
                  onBlur={handlePreviewEnd}
                  disabled={!available}
                  className={
                    selected
                      ? "group relative flex w-[104px] flex-col overflow-hidden rounded-[22px] border-2 border-[#1da1ff] bg-white p-0 text-left shadow-[0_8px_20px_rgba(29,161,255,0.18)]"
                      : available
                        ? "group relative flex w-[104px] flex-col overflow-hidden rounded-[22px] border border-black/12 bg-white p-0 text-left transition-all hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_10px_24px_rgba(32,32,32,0.08)]"
                        : "group relative flex w-[104px] flex-col overflow-hidden rounded-[22px] border border-dashed border-black/10 bg-[#fafafa] p-0 text-left opacity-65"
                  }
                  aria-label={`Select ${axis.label} ${option.label}`}
                  aria-pressed={selected}
                >
                  <span className="relative block h-[104px] w-full overflow-hidden bg-[#f6f6f6]">
                    {optionImage?.imageUrl ? (
                      <BlurhashImage
                        src={optionImage.imageUrl}
                        blurHash={optionImage.blurHashUrl}
                        alt={option.label}
                        className="h-full w-full"
                        imageClassName="object-cover"
                      />
                    ) : (
                      <span
                        className="block h-full w-full"
                        style={{ backgroundColor: isHexColor(option.rawValue) ? option.rawValue : undefined }}
                      />
                    )}
                    {selected ? (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[rgba(29,161,255,0.14)] to-transparent" />
                    ) : null}
                  </span>
                  <span className="flex items-center justify-between gap-2 border-t border-black/6 px-3 py-2">
                    <span className="min-w-0 truncate text-[12px] font-medium text-[#202020]">{option.label}</span>
                    {isHexColor(option.rawValue) ? (
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: option.rawValue }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={option.key}
                type="button"
                onClick={handleSelect}
                onMouseEnter={handlePreviewStart}
                onMouseLeave={handlePreviewEnd}
                onFocus={handlePreviewStart}
                onBlur={handlePreviewEnd}
                disabled={!available}
                className={
                  selected
                    ? "w-[152px] rounded-[14px] border-2 border-[#1da1ff] bg-white p-3 text-left shadow-[0_8px_20px_rgba(29,161,255,0.14)]"
                    : available
                      ? "w-[152px] rounded-[14px] border border-black/12 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_10px_24px_rgba(32,32,32,0.08)]"
                      : "w-[152px] rounded-[14px] border border-dashed border-black/10 bg-[#fafafa] p-3 text-left opacity-70"
                }
                aria-label={`Select ${axis.label} ${option.label}`}
                aria-pressed={selected}
              >
                <p className="text-[15px] font-semibold leading-tight text-[#202020]">{option.label}</p>
                {axisHasPriceVariance && typeof optionPrice === "number" ? (
                  <div className="mt-2">
                    <StorefrontPrice value={optionPrice} tone={optionOnSale ? "sale" : "default"} size="md" />
                    {optionOnSale && typeof optionCompareAtPrice === "number" ? (
                      <p className="mt-1 text-[11px] text-[#8b94a3] line-through">{formatMoney(optionCompareAtPrice)}</p>
                    ) : null}
                  </div>
                ) : available ? (
                  <p className="mt-2 text-[12px] font-medium text-[#57636c]">Available</p>
                ) : (
                  <p className="mt-2 text-[12px] font-medium text-[#a0a7b0]">Unavailable</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div data-safe-stack className="space-y-4 pb-28 lg:pb-0">
      <section data-safe-card="header" className="rounded-[8px] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="flex flex-wrap items-center justify-end gap-4 text-[13px] font-medium text-[#202020]">
            <button type="button" onClick={() => setShareModalOpen(true)} className="inline-flex items-center gap-2 transition-colors hover:text-[#907d4c]">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M13 3a1 1 0 0 0 0 2h1.59l-5.8 5.8a1 1 0 1 0 1.42 1.4L16 6.41V8a1 1 0 1 0 2 0V3z" />
                <path d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4a1 1 0 1 0-2 0v4H5V7h4a1 1 0 1 0 0-2z" />
              </svg>
              <span>Share</span>
            </button>
            <button type="button" onClick={() => setReportModalOpen(true)} className="inline-flex items-center gap-2 transition-colors hover:text-[#b91c1c]">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M5 2a1 1 0 0 1 1 1v1h7.38l-.17-.34A1 1 0 0 1 14.1 2h.9a1 1 0 0 1 .89 1.45L15.12 5l.77 1.55A1 1 0 0 1 15 8h-1a1 1 0 0 1-.89-.55L13 7H6v10a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1z" />
              </svg>
              <span>Report this product</span>
            </button>
        </div>
        {shareMessage ? <p className="mt-3 text-[12px] text-[#57636c]">{shareMessage}</p> : null}
        {reportFeedback ? <p className="mt-3 text-[12px] text-[#57636c]">{reportFeedback}</p> : null}
      </section>
      <section data-safe-grid="product" className="grid gap-4 lg:items-start lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <div className="space-y-4 self-start">
          <div data-safe-card="padded" className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
            <div className={hasThumbnailRail ? "grid gap-3 md:grid-cols-[88px_minmax(0,1fr)]" : "grid gap-3"}>
              {hasThumbnailRail ? (
                <div className="order-2 flex gap-2 overflow-x-auto md:order-1 md:max-h-[620px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pr-1">
                  {activeImages.map((image, index) => {
                    const selected = index === activeImageIndex;
                    return (
                      <button
                        key={`${image.imageUrl}-${index}`}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        className={
                          selected
                            ? "relative h-[84px] min-w-[84px] overflow-hidden rounded-[8px] border border-[rgba(203,178,107,0.8)] bg-white"
                            : "relative h-[84px] min-w-[84px] overflow-hidden rounded-[8px] border border-black/10 bg-white"
                        }
                      >
                        <BlurhashImage
                          src={image.imageUrl}
                          blurHash={image.blurHashUrl}
                          alt={`${item.data?.product?.title ?? "Product"} ${index + 1}`}
                          className="h-full w-full"
                          imageClassName="object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="order-1">
                <div
                  data-safe-media
                  className="relative aspect-[1/1] overflow-hidden rounded-[8px] bg-white"
                  onMouseMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setZoomPoint({
                      x: ((event.clientX - rect.left) / rect.width) * 100,
                      y: ((event.clientY - rect.top) / rect.height) * 100,
                    });
                  }}
                  onMouseLeave={() => setZoomPoint(null)}
                >
                  {activeImages[activeImageIndex] ? (
                    <>
                      {isPreLoved ? (
                        <span className="absolute left-3 top-3 z-10 inline-flex h-6 items-center rounded-full bg-[#202020] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(20,24,27,0.14)]">
                          Pre-Loved
                        </span>
                      ) : null}
                      <BlurhashImage
                        src={activeImages[activeImageIndex].imageUrl}
                        blurHash={activeImages[activeImageIndex].blurHashUrl}
                        alt={item.data?.product?.title ?? "Product image"}
                        sizes="(max-width: 768px) 100vw, 60vw"
                        priority={activeImageIndex === 0}
                        className="h-full w-full"
                        imageClassName="object-cover"
                      />
                      {activeImages.length > 1 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveImageIndex((current) => (current === 0 ? activeImages.length - 1 : current - 1))}
                            className="absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[18px] font-semibold text-[#202020] shadow-[0_8px_24px_rgba(20,24,27,0.14)]"
                            aria-label="Previous image"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveImageIndex((current) => (current === activeImages.length - 1 ? 0 : current + 1))}
                            className="absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[18px] font-semibold text-[#202020] shadow-[0_8px_24px_rgba(20,24,27,0.14)]"
                            aria-label="Next image"
                          >
                            ›
                          </button>
                          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[rgba(20,24,27,0.56)] px-3 py-1.5">
                            {activeImages.map((_, index) => (
                              <span
                                key={`indicator-${index}`}
                                className={index === activeImageIndex ? "h-2 w-2 rounded-full bg-white" : "h-2 w-2 rounded-full bg-white/35"}
                              />
                            ))}
                          </div>
                        </>
                      ) : null}
                      {zoomPoint && activeImages[activeImageIndex]?.imageUrl ? (
                        <div
                          className="pointer-events-none absolute z-10 hidden h-36 w-36 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-white/90 bg-white shadow-[0_12px_32px_rgba(20,24,27,0.24)] lg:block"
                          style={{ left: `${zoomPoint.x}%`, top: `${zoomPoint.y}%` }}
                        >
                          <div
                            className="h-full w-full bg-white"
                            style={{
                              backgroundImage: `url(${activeImages[activeImageIndex].imageUrl})`,
                              backgroundRepeat: "no-repeat",
                              backgroundSize: "320%",
                              backgroundPosition: `${zoomPoint.x}% ${zoomPoint.y}%`,
                              willChange: "background-position",
                            }}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[13px] text-[#8b94a3]">
                      No image available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <RenderWhenVisible
            className="hidden lg:block"
            rootMargin="320px 0px"
            fallback={<div className="h-0" aria-hidden="true" />}
            onVisible={() => setRecommendationsActivated(true)}
          >
            <ProductPageRecommendations
              title="Pairs well with"
              subtitle={oftenBoughtSubtitle}
              products={oftenBoughtItems}
              viewAllHref={`/products?recommendation=${encodeURIComponent(
                resolvedRecommendationRails?.oftenBought?.source === "co_purchase"
                  ? "often-bought-together"
                  : "catalog-pairing",
              )}&productId=${encodeURIComponent(productId)}`}
              shopperArea={shopperArea}
            />
          </RenderWhenVisible>
        </div>

        <div data-safe-card="padded" className="space-y-4 overflow-hidden rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
              About this item
            </p>
            <h1 data-safe-title className="mt-2 text-[28px] font-semibold leading-[1.05] text-[#202020]">
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

          <div className="space-y-2">
            {saleActive && salePercent ? (
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#d63f52]">
                Save {salePercent}%
              </p>
            ) : null}
            <div data-safe-actions className="flex flex-wrap items-end gap-3">
              {priceInclVat != null ? (
                <div className="flex items-end gap-2">
                  <StorefrontPrice value={priceInclVat} tone={saleActive ? "sale" : "default"} size="lg" />
                  {saleActive && compareAtPriceInclVat ? (
                    <p className="text-[13px] text-[#8b94a3] line-through">
                      {formatMoney(compareAtPriceInclVat)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[13px] text-[#8b94a3]">Price unavailable</p>
              )}

              <p
                className={
                  stock.tone === "success"
                    ? "text-[12px] font-semibold text-[#1a8553]"
                    : stock.tone === "danger"
                      ? "text-[12px] font-semibold text-[#b91c1c]"
                      : stock.tone === "warning"
                        ? "text-[12px] font-semibold text-[#b45309]"
                        : "text-[12px] font-semibold text-[#57636c]"
                }
              >
                {stock.label}
              </p>
            </div>
          </div>

          {alternateOffers.length ? (
            <div className="rounded-[8px] border border-black/8 bg-[#faf9f5] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Other sellers</p>
                  <p className="mt-1 text-[12px] text-[#57636c]">Compare other Piessang sellers offering this same product.</p>
                </div>
                <p className="text-[12px] font-semibold text-[#202020]">{alternateOffers.length} more option{alternateOffers.length === 1 ? "" : "s"}</p>
              </div>
              <div className="mt-3 space-y-2">
                {alternateOffers.slice(0, 4).map((offer) => (
                  <Link
                    key={`${offer.productId}:${offer.variantId || "default"}`}
                    href={getAlternateOfferHref(offer)}
                    scroll={false}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-black/6 bg-white px-3 py-2 transition hover:border-[#cbb26b]/40 hover:bg-[#fffdfa]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#202020]">{offer.vendorName || "Piessang seller"}</p>
                      <p className="truncate text-[11px] text-[#57636c]">
                        {offer.variantLabel || "Default option"}
                        {offer.hasInStockVariants === true ? " • In stock" : " • Check availability"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-[#202020]">
                        {typeof offer.priceIncl === "number" ? formatMoney(offer.priceIncl) : "View option"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {!hasDeliveryEstimateLocation ? (
            <div className="inline-flex w-full max-w-[360px] items-center gap-2 rounded-full bg-[rgba(144,125,76,0.08)] px-3 py-2 text-left text-[12px] font-semibold text-[#907d4c]">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M10 1.8a5.9 5.9 0 0 1 5.9 5.9c0 4.1-4.7 9.4-5.2 9.9a1 1 0 0 1-1.4 0c-.5-.5-5.2-5.8-5.2-9.9A5.9 5.9 0 0 1 10 1.8Zm0 8a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z" />
              </svg>
              <span>Set your address in the header to see delivery estimation.</span>
            </div>
          ) : deliveryPromise ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#1a8553]">
              <span className="inline-flex items-center gap-1">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                  <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h.5A2.5 2.5 0 0 1 18 6.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4H5V3a1 1 0 0 1 1-1zm9.5 6h-11a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5z" />
                </svg>
                {deliveryPromise.label}
              </span>
              {deliveryPromise.cutoffText ? (
                <span className="text-[#8b94a3]">{deliveryPromise.cutoffText}</span>
              ) : null}
            </div>
          ) : sellerDeliveryMessage ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[#57636c]">
              <span className="inline-flex items-center gap-1">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                  <path d="M10 1.8a5.9 5.9 0 0 1 5.9 5.9c0 4.1-4.7 9.4-5.2 9.9a1 1 0 0 1-1.4 0c-.5-.5-5.2-5.8-5.2-9.9A5.9 5.9 0 0 1 10 1.8Zm0 8a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z" />
                </svg>
                {sellerDeliveryMessage.label}
              </span>
            </div>
          ) : null}

          {!liteExperience && liveViewerCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
              <span className="inline-flex items-center gap-1 text-[#b45309]">
                {liveViewerCount <= LIVE_VIEWER_FLAME_THRESHOLD ? <FlameIcon /> : null}
                {liveViewerCount} shopper{liveViewerCount === 1 ? "" : "s"} viewing now
              </span>
            </div>
          ) : null}

          {soldCountLabel ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
              <span className={showHotSales ? "inline-flex items-center gap-1 text-[#f97316]" : "text-[#57636c]"}>
                {showHotSales ? <FlameIcon /> : null}
                {soldCountLabel}
              </span>
            </div>
          ) : null}

          {sellerDeliveryMessage ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
              <p
                className={
                  sellerDeliveryMessage.tone === "success"
                    ? "text-[#1a8553]"
                    : sellerDeliveryMessage.tone === "danger"
                      ? "text-[#b91c1c]"
                      : "text-[#57636c]"
                }
              >
                {sellerDeliveryMessage.label}
              </p>
            </div>
          ) : null}

          {overview ? (
            <p className="max-w-[64ch] text-[14px] font-medium leading-[1.55] text-[#202020]">
              {overview}
            </p>
          ) : null}

          {!hasStructuredVariantAxes ? (
            <div className="border-t border-black/5 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Selected variant</p>
              <p className="mt-1 text-[13px] font-semibold text-[#202020]">{getVariantLabel(activeVariant)}</p>
              {getVariantSummary(activeVariant) ? (
                <p className="mt-1 text-[11px] text-[#57636c]">{getVariantSummary(activeVariant)}</p>
              ) : null}
              {activeVariantHighlightDetails.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeVariantHighlightDetails.map((entry) => (
                    <span
                      key={`${entry.label}:${entry.value}`}
                      className="rounded-full bg-[rgba(144,125,76,0.08)] px-2.5 py-1 text-[11px] font-medium text-[#5f6773]"
                    >
                      {entry.label}: {entry.value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeVariantExtraDetails.length && !hasStructuredVariantAxes ? (
            <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Extra details</p>
              <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {activeVariantExtraDetails.map((entry) => (
                  <div key={`${entry.label}:${entry.value}`} className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">{entry.label}</p>
                    <p className="mt-0.5 text-[12px] text-[#202020]">{entry.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Select variant</p>
            {hasStructuredVariantAxes ? (
              <div className="space-y-5">
                {variantAxes.map((axis) => renderVariantAxis(axis))}
              </div>
            ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {variants.map((variant, index) => {
                const selected = index === activeIndex;
                const variantSalePrice = getVariantPriceInclVat(variant);
                const variantCompareAtPrice = getCompareAtVariantPriceInclVat(variant);
                const variantOnSale =
                  hasMeaningfulSale(variantCompareAtPrice, variantSalePrice);
                const variantDiscountPercent = variantOnSale
                  ? getDiscountPercent(variantCompareAtPrice, variantSalePrice)
                  : null;
                const stockMeta = getStockLabel(variant, item);
                const variantImages = getVariantImages(item, variant);
                const variantImage = variantImages[0] ?? null;
                return (
                  <button
                    key={String(variant.variant_id ?? index)}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    data-clickable-container="true"
                    className={
                      selected
                        ? "rounded-[8px] border border-[rgba(203,178,107,0.6)] bg-[rgba(203,178,107,0.08)] p-3 text-left"
                        : "rounded-[8px] border border-black/10 bg-white p-3 text-left transition-colors hover:border-[rgba(203,178,107,0.5)] hover:bg-[rgba(203,178,107,0.04)]"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {variantImage?.imageUrl ? (
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border border-black/8 bg-[#f6f6f6]">
                            <BlurhashImage
                              src={variantImage.imageUrl}
                              blurHash={variantImage.blurHashUrl}
                              alt={getVariantLabel(variant)}
                              className="h-full w-full"
                              imageClassName="object-cover"
                            />
                          </div>
                        ) : null}
                        <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#202020]">{getVariantLabel(variant)}</p>
                        {getVariantSummary(variant) ? (
                          <p className="mt-1 text-[11px] text-[#57636c]">{getVariantSummary(variant)}</p>
                        ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        {variantDiscountPercent ? (
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d63f52]">
                            Save {variantDiscountPercent}%
                          </p>
                        ) : null}
                        {variant?.placement?.is_default ? (
                          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#4a4545]">
                            Default
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {typeof variantSalePrice === "number" ? (
                      <div className="mt-2.5 flex flex-wrap items-end gap-2">
                        <StorefrontPrice value={variantSalePrice} tone={variantOnSale ? "sale" : "default"} size="md" />
                        {variantOnSale && typeof variantCompareAtPrice === "number" ? (
                          <p className="text-[11px] font-medium leading-none text-[#8b94a3] line-through">
                            {formatMoney(variantCompareAtPrice)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
                      <span
                        className={
                          stockMeta.tone === "success"
                            ? "rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 font-semibold text-[#1a8553]"
                            : stockMeta.tone === "danger"
                              ? "rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 font-semibold text-[#b91c1c]"
                              : stockMeta.tone === "warning"
                                ? "rounded-full bg-[rgba(217,119,6,0.12)] px-2.5 py-1 font-semibold text-[#b45309]"
                              : "rounded-full bg-[#f7f7f7] px-2.5 py-1 font-semibold text-[#57636c]"
                        }
                      >
                        {stockMeta.label}
                      </span>
                      {getVariantHighlightDetails(variant).slice(0, 2).map((entry) => (
                        <span
                          key={`${variant.variant_id}:${entry.label}:${entry.value}`}
                          className="rounded-full bg-[rgba(95,103,115,0.08)] px-2.5 py-1 font-medium text-[#57636c]"
                        >
                          {entry.value}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </div>

          <div className="hidden space-y-2 lg:block">
            <div className="space-y-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Quantity</p>
              <div className="flex items-stretch gap-3">
                <div className="inline-flex h-12 shrink-0 items-center overflow-hidden rounded-[8px] border border-black/10 bg-white">
                  <button type="button" onClick={() => setSelectedQty((current) => Math.max(1, current - 1))} className="inline-flex h-full w-10 items-center justify-center text-[18px] text-[#202020]" aria-label="Decrease quantity">
                    −
                  </button>
                  <span className="inline-flex h-full min-w-10 items-center justify-center border-x border-black/10 px-3 text-[14px] font-semibold text-[#202020]">
                    {selectedQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedQty((current) => (typeof maxAddableQty === "number" ? Math.min(maxAddableQty, current + 1) : current + 1))}
                    disabled={typeof maxAddableQty === "number" && selectedQty >= maxAddableQty}
                    className="inline-flex h-full w-10 items-center justify-center text-[18px] text-[#202020] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void addToCart()}
                  disabled={cartSubmittingAction !== null}
                  aria-disabled={!quantityGuard.canAdd}
                  title={blockedCartMessage || undefined}
                  className={`inline-flex h-12 flex-1 items-center justify-center rounded-[8px] px-5 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    cartAddedFlash
                      ? "bg-[#146c43] shadow-[0_12px_28px_rgba(20,108,67,0.2)]"
                      : !quantityGuard.canAdd
                        ? "bg-[#dfe4df] text-[#6b7280]"
                        : "bg-[#1a8553]"
                  }`}
                >
                  {addToCartLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleFavorite()}
                  disabled={favoriteSubmitting}
                  className={
                    isFavorite
                      ? "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[#f66b77] shadow-[0_4px_12px_rgba(20,24,27,0.12)] disabled:opacity-50"
                      : "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-black/10 bg-white shadow-[0_4px_12px_rgba(20,24,27,0.08)] disabled:opacity-50"
                  }
                  aria-label={isFavorite ? "Remove from favourites" : "Save to favourites"}
                  aria-pressed={isFavorite}
                >
                  <HeartIcon filled={isFavorite} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void addToCart({ redirectToCheckout: true })}
                disabled={cartSubmittingAction !== null}
                aria-disabled={!quantityGuard.canAdd}
                title={blockedCartMessage || undefined}
                className={`inline-flex h-12 w-full items-center justify-center rounded-[8px] px-5 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  cartAddedFlash
                    ? "bg-[#146c43] shadow-[0_12px_28px_rgba(20,108,67,0.2)]"
                    : !quantityGuard.canAdd
                      ? "bg-[#dfe4df] text-[#6b7280]"
                      : "bg-[#202020]"
                }`}
              >
                {buyNowLabel}
              </button>
            </div>
            {cartMessage ? <p className="text-[12px] text-[#57636c]">{cartMessage}</p> : null}
            {favoriteMessage ? <p className="text-[12px] text-[#57636c]">{favoriteMessage}</p> : null}
            <div className="rounded-[8px] border border-black/6 bg-[#fcfcfc] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Trusted marketplace checkout</p>
              <p className="mt-2 text-[13px] leading-[1.7] text-[#57636c]">
                Buy through Piessang with visible delivery, returns, payments, and support information before and after checkout.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href="/delivery"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-[#57636c] underline decoration-[rgba(144,125,76,0.35)] underline-offset-4 transition-colors hover:text-[#202020]"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current text-[#907d4c]">
                    <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h8a1.5 1.5 0 0 1 1.5 1.5V6H15a2 2 0 0 1 1.6.8l1.6 2.13c.2.26.3.58.3.91v2.68A1.5 1.5 0 0 1 17 14h-.55a2.45 2.45 0 0 1-4.9 0H8.45a2.45 2.45 0 0 1-4.9 0H3A1.5 1.5 0 0 1 1.5 12.5v-5A2 2 0 0 1 2.5 5.5ZM14 8v2h2.56l-1.2-1.6A.5.5 0 0 0 14.96 8H14Zm-9.5 6a.95.95 0 1 0 0-1.9.95.95 0 0 0 0 1.9Zm9 0a.95.95 0 1 0 0-1.9.95.95 0 0 0 0 1.9Z" />
                  </svg>
                  Delivery info
                </Link>
                <Link
                  href="/returns"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-[#57636c] underline decoration-[rgba(144,125,76,0.35)] underline-offset-4 transition-colors hover:text-[#202020]"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current text-[#907d4c]">
                    <path d="M10 2a8 8 0 1 0 5.66 2.34l1.13-1.13a1 1 0 1 1 1.42 1.42l-1.13 1.13A8 8 0 0 0 10 2Zm-.75 3a1 1 0 0 1 2 0v4.59l1.7 1.7a1 1 0 0 1-1.4 1.42l-2-2A1 1 0 0 1 9.25 10V5Z" />
                  </svg>
                  Returns
                </Link>
                <Link
                  href="/payments"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-[#57636c] underline decoration-[rgba(144,125,76,0.35)] underline-offset-4 transition-colors hover:text-[#202020]"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current text-[#907d4c]">
                    <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 15.5v-11Zm2 1.5v1h10V6H5Zm0 3v6.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V9H5Zm2.5 1.5h2.75a1 1 0 1 1 0 2H7.5a1 1 0 1 1 0-2Z" />
                  </svg>
                  Payments
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-[#57636c] underline decoration-[rgba(144,125,76,0.35)] underline-offset-4 transition-colors hover:text-[#202020]"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current text-[#907d4c]">
                    <path d="M10 2.5a7.5 7.5 0 1 0 4.6 13.43l2.92.75a.75.75 0 0 0 .91-.91l-.75-2.92A7.5 7.5 0 0 0 10 2.5Zm0 10.25a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Zm1-4.82v.32a1 1 0 0 1-2 0V7.6a1.74 1.74 0 1 1 2.78 1.4c-.42.32-.78.6-.78.93Z" />
                  </svg>
                  Need help?
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-[#57636c] underline decoration-[rgba(144,125,76,0.35)] underline-offset-4 transition-colors hover:text-[#202020]"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current text-[#907d4c]">
                    <path d="M10 2a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm0 3a1.1 1.1 0 1 1-1.1 1.1A1.1 1.1 0 0 1 10 5Zm1.25 9h-2.5a1 1 0 1 1 0-2h.25V9.5h-.25a1 1 0 1 1 0-2h1.25A1 1 0 0 1 11 8.5V12h.25a1 1 0 1 1 0 2Z" />
                  </svg>
                  About Piessang
                </Link>
              </div>
            </div>
            <div className="rounded-[8px] bg-[#fafafa] px-3 py-3">
              <Image
                src="/badges/Stripe%20Secure%20Checkout%20Badge.png"
                alt="Stripe Secure Checkout"
                width={1200}
                height={300}
                className="h-auto w-full object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-40 m-0 border-t border-black/10 bg-white px-4 pt-3 shadow-[0_-10px_30px_rgba(20,24,27,0.12)] lg:hidden">
        <div className="m-0 w-full space-y-3 pb-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Quantity</p>
            <div className="inline-flex h-12 items-center overflow-hidden rounded-[8px] border border-black/10 bg-white">
                  <button type="button" onClick={() => setSelectedQty((current) => Math.max(1, current - 1))} className="inline-flex h-full w-10 items-center justify-center text-[18px] text-[#202020]" aria-label="Decrease quantity">
                −
              </button>
              <span className="inline-flex h-full min-w-9 items-center justify-center border-x border-black/10 px-2 text-[13px] font-semibold text-[#202020]">
                {selectedQty}
              </span>
                  <button
                    type="button"
                    onClick={() => setSelectedQty((current) => (typeof maxAddableQty === "number" ? Math.min(maxAddableQty, current + 1) : current + 1))}
                    disabled={typeof maxAddableQty === "number" && selectedQty >= maxAddableQty}
                    className="inline-flex h-full w-10 items-center justify-center text-[18px] text-[#202020] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Increase quantity"
                  >
                +
              </button>
            </div>
          </div>
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={() => void addToCart()}
              disabled={cartSubmittingAction !== null}
              aria-disabled={!quantityGuard.canAdd}
              title={blockedCartMessage || undefined}
              className={`inline-flex h-12 flex-1 items-center justify-center rounded-[8px] px-5 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                cartAddedFlash
                  ? "bg-[#146c43] shadow-[0_12px_28px_rgba(20,108,67,0.2)]"
                  : !quantityGuard.canAdd
                    ? "bg-[#dfe4df] text-[#6b7280]"
                    : "bg-[#1a8553]"
              }`}
            >
              {addToCartLabel}
            </button>
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              disabled={favoriteSubmitting}
              className={
                isFavorite
                  ? "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[#f66b77] shadow-[0_4px_12px_rgba(20,24,27,0.12)] disabled:opacity-50"
                  : "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-black/10 bg-white shadow-[0_4px_12px_rgba(20,24,27,0.08)] disabled:opacity-50"
              }
              aria-label={isFavorite ? "Remove from favourites" : "Save to favourites"}
              aria-pressed={isFavorite}
            >
              <HeartIcon filled={isFavorite} />
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold text-[#202020]">More details</h2>
        </div>
        <div
          className="mt-4 max-w-[72ch] text-[13px] leading-[1.7] text-[#57636c]"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      </section>

      <RenderWhenVisible
        rootMargin="320px 0px"
        fallback={
          <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
            <div className="h-6 w-40 rounded bg-[#f3f3f0] animate-pulse" />
            <div className="mt-4 h-28 rounded-[8px] bg-[#f3f3f0] animate-pulse" />
          </section>
        }
      >
        <ProductReviewsSection item={item as any} productId={productId} />
      </RenderWhenVisible>

      <RenderWhenVisible
        className="lg:hidden"
        rootMargin="320px 0px"
        fallback={<div className="h-0" aria-hidden="true" />}
        onVisible={() => setRecommendationsActivated(true)}
      >
        <ProductPageRecommendations
          title="Frequently bought together"
          subtitle={oftenBoughtSubtitle}
          products={oftenBoughtItems}
          viewAllHref={`/products?recommendation=${encodeURIComponent(
            resolvedRecommendationRails?.oftenBought?.source === "co_purchase"
              ? "often-bought-together"
              : "catalog-pairing",
          )}&productId=${encodeURIComponent(productId)}`}
          shopperArea={shopperArea}
        />
      </RenderWhenVisible>

      <RenderWhenVisible
        rootMargin="320px 0px"
        fallback={<div className="h-0" aria-hidden="true" />}
        onVisible={() => setRecommendationsActivated(true)}
      >
        <ProductPageRecommendations
          title="You may also like"
          subtitle="More from this category"
          products={similarItems}
          viewAllHref="/products"
          shopperArea={shopperArea}
        />
      </RenderWhenVisible>

      {reportModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4">
          <div className="w-full max-w-[560px] rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Report this product</p>
                <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">{item.data?.product?.title || "Product"}</h3>
              </div>
              <button type="button" onClick={() => setReportModalOpen(false)} className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]">
                Close
              </button>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Issue</span>
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]">
                <option value="wrong_listing">Wrong or misleading listing</option>
                <option value="counterfeit">Counterfeit or fake item</option>
                <option value="restricted">Restricted or unsafe product</option>
                <option value="pricing">Suspicious pricing</option>
                <option value="content">Offensive or poor content</option>
                <option value="other">Other issue</option>
              </select>
            </label>

            {!profile?.uid ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Your name</span>
                  <input value={reporterName} onChange={(event) => setReporterName(event.target.value)} className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]" placeholder="Full name" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Your email</span>
                  <input value={reporterEmail} onChange={(event) => setReporterEmail(event.target.value)} className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]" placeholder="name@example.com" />
                </label>
              </div>
            ) : null}

            <label className="mt-4 block">
              <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Tell us what is wrong</span>
              <textarea value={reportMessage} onChange={(event) => setReportMessage(event.target.value)} rows={5} className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]" placeholder="Add any extra detail that will help Piessang review this product." />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReportModalOpen(false)} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={() => void submitProductReport()} disabled={reportSubmitting} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4">
          <div className="w-full max-w-[520px] rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Share product</p>
                <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">{item.data?.product?.title || "Product"}</h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">Choose how you want to share this product.</p>
              </div>
              <button type="button" onClick={() => setShareModalOpen(false)} className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void copyProductLink()}
                className="flex min-h-[116px] flex-col items-start justify-between rounded-[10px] border border-black/10 bg-[#fafafa] px-4 py-4 text-left transition-colors hover:border-[#cbb26b] hover:bg-[rgba(203,178,107,0.06)]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#202020] shadow-[0_6px_18px_rgba(20,24,27,0.08)]">
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                    <path d="M7 5a3 3 0 0 1 3-3h4a3 3 0 1 1 0 6h-1a1 1 0 1 1 0-2h1a1 1 0 1 0 0-2h-4a1 1 0 0 0-1 1v1a1 1 0 1 1-2 0z" />
                    <path d="M6 8a3 3 0 1 1 0 6h4a1 1 0 1 0 0-2H6a1 1 0 1 1 0-2h1a1 1 0 1 0 0-2z" />
                    <path d="M6.5 7a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1zm7 1a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1z" />
                  </svg>
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-[#202020]">Copy link</span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-[#57636c]">Copy the product link to your clipboard and share it anywhere.</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => void shareProduct()}
                className="flex min-h-[116px] flex-col items-start justify-between rounded-[10px] border border-black/10 bg-[#fafafa] px-4 py-4 text-left transition-colors hover:border-[#cbb26b] hover:bg-[rgba(203,178,107,0.06)]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#202020] shadow-[0_6px_18px_rgba(20,24,27,0.08)]">
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                    <path d="M14.5 13a2.5 2.5 0 0 0-1.9.88L7.4 10.9a2.7 2.7 0 0 0 0-1.8l5.2-3A2.5 2.5 0 1 0 12 4a2.7 2.7 0 0 0 .03.4l-5.18 3a2.5 2.5 0 1 0 0 5.2l5.18 3A2.7 2.7 0 0 0 12 16a2.5 2.5 0 1 0 2.5-3Z" />
                  </svg>
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-[#202020]">Share to platform</span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-[#57636c]">Use your device’s share options to send this product through an app or platform.</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}


      <AppSnackbar notice={snackbarMessage ? { tone: "info", message: snackbarMessage } : null} />
    </div>
  );
}
