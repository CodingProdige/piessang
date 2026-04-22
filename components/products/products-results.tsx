"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent, type FocusEvent, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import {
  hasPreciseShopperDeliveryArea,
  readShopperDeliveryArea,
  saveShopperDeliveryArea,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { trackProductEngagement, useProductImpressionTracker } from "@/lib/analytics/product-engagement-client";
import { resolveBrandKey, resolveBrandLabel } from "@/lib/catalogue/brand-key";
import { getCartQuantityGuard, getVariantAvailableQuantity } from "@/lib/cart/interaction-guards";
import { formatCurrency } from "@/lib/seller/delivery-profile";
import { getShopperFacingDeliveryMessage, getShopperFacingDeliveryPromise } from "@/lib/shipping/display";
import { isProductEligibleForShopperCountry } from "@/lib/shipping/shopper-country";
import { getBadgeColorStyle } from "@/lib/analytics/product-engagement-badge-colors";

export const PRODUCT_CARD_LIST_IMAGE_SIZES = "(max-width: 640px) calc(100vw - 2rem), 180px";
export const PRODUCT_CARD_GRID_IMAGE_SIZES = "(max-width: 640px) 72vw, (max-width: 1024px) 40vw, 280px";

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
};

export type ProductItem = {
  id?: string;
  data?: {
    docId?: string;
    product?: {
      unique_id?: string | number;
      title?: string | null;
      brandTitle?: string | null;
      brand?: string | null;
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
    is_new_arrival?: boolean;
    is_favorite?: boolean;
    has_in_stock_variants?: boolean;
    is_eligible_by_variant_availability?: boolean;
    is_unavailable_for_listing?: boolean;
  };
  ad?: {
    sponsored?: boolean;
    campaignId?: string | null;
    placement?: string | null;
    label?: string | null;
  };
};

const ATTRIBUTE_FILTER_KEYS = [
  "size",
  "color",
  "material",
  "shade",
  "scent",
  "skinType",
  "hairType",
  "flavor",
  "abv",
  "containerType",
  "storageCapacity",
  "memoryRam",
  "connectivity",
  "compatibility",
  "ringSize",
  "strapLength",
  "bookFormat",
  "language",
  "ageRange",
  "modelFitment",
] as const;

type AttributeFilterKey = (typeof ATTRIBUTE_FILTER_KEYS)[number];

function normalizeAttributeValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function itemMatchesAttributeFilter(item: ProductItem, key: AttributeFilterKey, expectedValue: string) {
  const normalizedExpected = normalizeAttributeValue(expectedValue);
  if (!normalizedExpected) return true;
  const variants = Array.isArray(item.data?.variants) ? item.data.variants : [];
  return variants.some((variant) => normalizeAttributeValue(variant?.[key]) === normalizedExpected);
}

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
const VAT_DIVISOR = 1.15;
const PAGE_SIZE = 24;
const LOW_STOCK_THRESHOLD = 13;
const HOT_SALES_FIRE_THRESHOLD = 100;
const DEFERRED_CARD_EAGER_COUNT_GRID = 8;
const DEFERRED_CARD_EAGER_COUNT_LIST = 6;

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

function FlameIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10.8 1.7c.2 2.2-.7 3.6-1.8 4.8-1.1 1.1-2.2 2.2-2.2 4 0 1.6 1.3 3 3.1 3 2.1 0 3.8-1.6 3.8-4.2 0-1.6-.6-2.8-1.4-4 .1 1.4-.3 2.4-1.1 3.2.1-2-.2-4.4-2.4-6.8ZM10 18c-3.8 0-6.5-2.9-6.5-6.7 0-2.8 1.4-4.8 3-6.4.9-.9 1.7-1.7 1.8-3.2a1 1 0 0 1 1.8-.5c3.3 4.2 5.4 7 5.4 10.6 0 3.7-2.4 6.2-5.5 6.2Zm-.1-2.3c1.6 0 2.7-1.1 2.7-2.8 0-1-.3-1.8-1-2.8-.2.8-.7 1.4-1.3 1.9-.5.4-1 .8-1 1.7 0 1.1.8 2 1.6 2Z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10 1.5c.4 0 .7.2.9.6l1.5 3.6 3.9.3c.4 0 .8.3.9.7.1.4 0 .8-.4 1.1l-3 2.6.9 3.8c.1.4-.1.8-.4 1.1-.3.2-.8.3-1.2 0L10 13.4l-3.3 1.9c-.4.2-.8.2-1.2 0-.3-.3-.5-.7-.4-1.1l.9-3.8-3-2.6c-.3-.3-.5-.7-.4-1.1.1-.4.5-.7.9-.7l3.9-.3 1.5-3.6c.2-.4.5-.6.9-.6Z" />
    </svg>
  );
}

function CursorClickIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M6.4 2.8c.3 0 .5.2.7.4l4.9 7.8c.2.3.2.7 0 1-.2.3-.5.5-.9.5l-2.3.2 1.8 3.3c.3.5.1 1.1-.4 1.4-.5.3-1.1.1-1.4-.4L7 13.8l-1.7 1.7c-.3.3-.7.4-1 .2-.4-.2-.6-.5-.6-.9V3.8c0-.4.2-.7.6-.9.1-.1.3-.1.5-.1Z" />
    </svg>
  );
}

function RisingStarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10 2.2 11.8 6l4.2.6-3 2.9.7 4.1-3.7-2-3.8 2 .7-4.1-3-2.9 4.2-.6L10 2.2Zm0 9.9 1.7.9-.3-1.9 1.4-1.4-1.9-.3-.9-1.7-.9 1.7-1.9.3 1.4 1.4-.3 1.9 1.7-.9Z" />
    </svg>
  );
}

function BestSellerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M6 2.5h8v3.2l-1.5 2.3a5 5 0 1 1-5 0L6 5.7V2.5Zm2 1.8v.9l1.7 2.5-.7.4A3.2 3.2 0 1 0 11 8l-.7-.4L12 5.2v-.9H8Z" />
    </svg>
  );
}

function TrendingNowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M4 13.5 8 9.5l2.5 2.5L16 6.5V10h1.5V4H11v1.5h3.4l-3.9 3.9L8 6.9 3 11.9l1 1.6Z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M11.4 1.8c.4 0 .7.2.9.5.2.3.2.7.1 1l-1.4 4h4c.4 0 .8.2.9.6.2.4.1.8-.2 1.1l-7 8.2a1 1 0 0 1-1.8-.9l1.4-4.1H4.4c-.4 0-.8-.2-.9-.6-.2-.4-.1-.8.2-1.1l7-8.2c.2-.3.4-.5.7-.5Z" />
    </svg>
  );
}

function ProductBadgeIcon({
  iconKey,
  iconUrl,
  badge,
  hasHighClicks = false,
}: {
  iconKey?: string | null;
  iconUrl?: string | null;
  badge?: string | null;
  hasHighClicks?: boolean;
}) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="h-3.5 w-3.5 object-contain" aria-hidden="true" />;
  }
  if (iconKey === "cursor") return <CursorClickIcon />;
  if (iconKey === "trophy") return <BestSellerIcon />;
  if (iconKey === "trend") return <TrendingNowIcon />;
  if (iconKey === "star") return <RisingStarIcon />;
  if (iconKey === "bolt") return <BoltIcon />;
  if (iconKey === "spark") return <SparkIcon />;
  if (badge === "best_seller") return <BestSellerIcon />;
  if (badge === "popular" || hasHighClicks) return <CursorClickIcon />;
  if (badge === "trending_now") return <TrendingNowIcon />;
  return <RisingStarIcon />;
}

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

function buildProductsApiUrl(searchParams: URLSearchParams) {
  const params = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    if (!value) continue;
    if (key === "unique_id") {
      params.set("id", value);
    } else if (key === "vendor") {
      params.set("sellerSlug", value);
      params.set("vendor", value);
    } else {
      params.set(key, value);
    }
  }

  if (!params.has("isActive")) {
    params.set("isActive", "true");
  }

  return `/api/catalogue/v1/products/product/get?${params.toString()}`;
}

function getCampaignSessionId(uid?: string | null) {
  if (typeof window === "undefined") return "";
  const normalizedUid = typeof uid === "string" ? uid.trim() : "";
  const key = normalizedUid
    ? `piessang_campaign_session_id:${normalizedUid}`
    : "piessang_campaign_session_id";
  const storage = normalizedUid ? window.localStorage : window.sessionStorage;
  let sessionId = storage.getItem(key);
  if (!sessionId) {
    const prefix = normalizedUid ? `campaign:user:${normalizedUid}` : "campaign:anon";
    sessionId = `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now().toString(36)}`;
    storage.setItem(key, sessionId);
  }
  return sessionId;
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

function DeferredProductCard({
  eager = false,
  minHeight,
  children,
}: {
  eager?: boolean;
  minHeight: number;
  children: React.ReactNode;
}) {
  if (eager) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <div
      className="w-full"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `${Math.max(180, Math.round(minHeight))}px`,
      }}
    >
      {children}
    </div>
  );
}

function StorefrontPrice({
  valueExVat,
  tone = "default",
  size = "md",
}: {
  valueExVat?: number | null;
  tone?: "default" | "sale";
  size?: "md" | "lg";
}) {
  const { formatMoney } = useDisplayCurrency();
  const inclVat = typeof valueExVat === "number" ? valueExVat * VAT_MULTIPLIER : undefined;
  const parts = splitCurrencyParts(typeof inclVat === "number" ? formatMoney(inclVat) : null);
  if (!parts) return null;

  const toneClass = tone === "sale" ? "text-[#ff5963]" : "text-[#4a4545]";
  const wholeClass = size === "lg" ? "text-[20px]" : "text-[18px]";
  const centsClass = size === "lg" ? "text-[12px]" : "text-[11px]";

  return (
    <span className={`inline-flex items-start font-medium leading-none tracking-tight ${toneClass}`}>
      <span className={wholeClass}>{parts.whole}</span>
      <span className={`ml-[1px] ${centsClass} leading-none`}>{parts.cents}</span>
    </span>
  );
}

function formatMoney(value: number, formatDisplay: (amount: number) => string) {
  return formatDisplay(typeof value === "number" && Number.isFinite(value) ? value : 0);
}


function getVariantPriceExVat(variant?: ProductVariant) {
  if (!variant) return null;
  if (variant.sale?.is_on_sale && typeof variant.sale.sale_price_incl === "number") {
    return variant.sale.sale_price_incl / VAT_DIVISOR;
  }
  if (variant.sale?.is_on_sale && typeof variant.sale.sale_price_excl === "number") {
    return variant.sale.sale_price_excl;
  }
  if (typeof variant.pricing?.selling_price_incl === "number") {
    return variant.pricing.selling_price_incl / VAT_DIVISOR;
  }
  if (typeof variant.pricing?.selling_price_excl === "number") {
    return variant.pricing.selling_price_excl;
  }
  return null;
}

function getCompareAtVariantPriceExVat(variant?: ProductVariant) {
  if (!variant) return null;
  const prices = [
    variant.pricing?.selling_price_excl,
    typeof variant.pricing?.selling_price_incl === "number"
      ? variant.pricing.selling_price_incl / VAT_DIVISOR
      : undefined,
  ].filter(
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

function getDisplayImages(item: ProductItem) {
  const productImages = (item.data?.media?.images ?? []).filter((image) => Boolean(image?.imageUrl));
  if (productImages.length) return productImages;

  const defaultVariant =
    item.data?.variants?.find((variant) => variant?.placement?.is_default) ??
    item.data?.variants?.[0];

  return (defaultVariant?.media?.images ?? []).filter((image) => Boolean(image?.imageUrl));
}

export function hasShopperFacingProductImage(item: ProductItem | null | undefined) {
  if (!item) return false;
  return getDisplayImages(item).length > 0;
}

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
    courierProfile: (item.data?.seller as any)?.courierProfile,
    productShipping: (item.data?.product as any)?.shipping,
    sellerBaseLocation: item.data?.seller?.baseLocation || "",
    shopperArea,
    variant,
    platformLabel: "Piessang shipping available",
    missingProfileLabel: shopperArea ? "Delivery availability confirmed at checkout" : "Set your shipping location",
  });
}

function getVariantCardMeta(variant?: ProductVariant | null) {
  if (!variant) return [];
  const entries = [
    variant.storageCapacity ? `Storage ${String(variant.storageCapacity).trim()}` : "",
    variant.memoryRam ? `${String(variant.memoryRam).trim()} RAM` : "",
    variant.connectivity ? String(variant.connectivity).trim() : "",
    variant.compatibility ? String(variant.compatibility).trim() : "",
    variant.material ? String(variant.material).trim() : "",
    variant.bookFormat ? String(variant.bookFormat).trim() : "",
    variant.language ? String(variant.language).trim() : "",
    variant.ageRange ? String(variant.ageRange).trim() : "",
    variant.modelFitment ? String(variant.modelFitment).trim() : "",
    variant.containerType ? String(variant.containerType).trim() : "",
    variant.flavor ? String(variant.flavor).trim() : "",
  ].filter(Boolean);
  return entries.slice(0, 2);
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
              href="/checkout"
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
    variants.find((variant) => variant?.placement?.is_default === true) ||
    variants.find((variant) => String(variant?.variant_id || "").trim()) ||
    variants[0] ||
    null
  );
}

function getBrandLabel(item: ProductItem) {
  return resolveBrandLabel(item.data);
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
  return resolveBrandKey(item.data);
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

  if (variant?.placement?.track_inventory !== true || variant?.placement?.continue_selling_out_of_stock) {
    return { label: "In stock", tone: "success" as const, hideQuantity: true };
  }
  if (variant?.checkout_reserved_unavailable) {
    return { label: "Reserved in checkout", tone: "warning" as const, hideQuantity: true };
  }

  if (item?.data?.has_in_stock_variants === false) {
    return { label: "Out of stock", tone: "danger" as const, hideQuantity: false };
  }

  const stock = variant?.total_in_stock_items_available;
  if (typeof stock === "number") {
    if (stock <= 0) return { label: "Out of stock", tone: "danger" as const, hideQuantity: false };
    if (stock <= LOW_STOCK_THRESHOLD) return { label: `Only ${stock} left`, tone: "warning" as const, hideQuantity: false };
    return { label: "In stock", tone: "success" as const, hideQuantity: true };
  }

  const firstLocation = variant?.inventory?.[0];
  if (typeof firstLocation?.in_stock_qty === "number") {
    if (firstLocation.in_stock_qty <= 0) return { label: "Out of stock", tone: "danger" as const, hideQuantity: false };
    if (firstLocation.in_stock_qty <= LOW_STOCK_THRESHOLD) return { label: `Only ${firstLocation.in_stock_qty} left`, tone: "warning" as const, hideQuantity: false };
    return { label: "In stock", tone: "success" as const, hideQuantity: true };
  }

  return { label: "Stock unknown", tone: "neutral" as const, hideQuantity: false };
}

function isPreLovedProduct(item: ProductItem) {
  const category = String(item.data?.grouping?.category || "").trim().toLowerCase();
  return category === "pre-loved" || category === "preloved";
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

export function BrowseProductCard({
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
  shopperArea,
}: {
  item: ProductItem;
  view: "grid" | "list";
  openInNewTab: boolean;
  brandHref?: string;
  vendorHref?: string;
  brandLabel?: string;
  vendorLabel?: string;
  currentUrl?: string;
  onAddToCartSuccess?: (cart: CartPreview | null) => void;
  cartBurstKey?: number;
  shopperArea?: ShopperDeliveryArea | null;
}) {
  const router = useRouter();
  const { formatMoney } = useDisplayCurrency();
  const displayImages = getDisplayImages(item);
  const [hoveredImageIndex, setHoveredImageIndex] = useState(0);
  const image = displayImages[hoveredImageIndex] ?? displayImages[0] ?? null;
  const titleText = item.data?.product?.title ?? "Untitled product";
  const {
    isAuthenticated,
    uid,
    cartOwnerId,
    openAuthModal,
    refreshProfile,
    refreshCart,
    optimisticAddToCart,
    cartProductCounts,
    cartVariantCounts,
    favoriteIds,
  } = useAuth();
  const [isFavorite, setIsFavorite] = useState(Boolean(item.data?.is_favorite));
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartJustAdded, setCartJustAdded] = useState(false);
  const [cartBlockedNotice, setCartBlockedNotice] = useState<string | null>(null);
  const defaultVariant = pickDisplayVariant(item.data?.variants) ?? undefined;
  const productUniqueId = String(item.id ?? item.data?.docId ?? item.data?.product?.unique_id ?? "").trim();
  const sellerCode = String(item.data?.product?.sellerCode ?? item.data?.seller?.sellerCode ?? "").trim();
  const sellerSlug = String(item.data?.seller?.sellerSlug ?? item.data?.product?.sellerSlug ?? item.data?.vendor?.slug ?? "").trim();
  const vendorName = String(item.data?.vendor?.title ?? item.data?.product?.vendorName ?? item.data?.shopify?.vendorName ?? "").trim();
  const defaultVariantId = String(defaultVariant?.variant_id ?? "").trim();
  const displayPriceValue = getVariantPriceExVat(defaultVariant) ?? undefined;
  const compareAtPriceValue = getCompareAtVariantPriceExVat(defaultVariant) ?? undefined;
  const saleActive = Boolean(
    defaultVariant?.sale?.is_on_sale &&
      typeof displayPriceValue === "number" &&
      typeof compareAtPriceValue === "number" &&
      compareAtPriceValue > displayPriceValue,
  );
  const salePrice = typeof displayPriceValue === "number" ? formatMoney(displayPriceValue * VAT_MULTIPLIER) : null;
  const compareAtPrice =
    saleActive && typeof compareAtPriceValue === "number"
      ? formatMoney(compareAtPriceValue * VAT_MULTIPLIER)
      : null;
  const stockState = getStockState(defaultVariant, item);
  const reviewState = getReviewState(item);
  const reviewMeta = getReviewMeta(item);
  const variantCount = getVariantCount(item);
  const sellerOfferCount = Number(item.data?.seller_offer_count || 0);
  const selectedVariantLabel = getSelectedVariantLabel(item);
  const selectedVariantMeta = getVariantCardMeta(defaultVariant);
  const imageCount = getImageCount(item);
  const salePercent = getSalePercent(item);
  const totalUnitsSold = Number(
    defaultVariant?.sales?.total_units_sold ??
      item.data?.product?.sales?.total_units_sold ??
      0,
  );
  const soldCountLabel = formatSoldCount(totalUnitsSold);
  const showHotSales = totalUnitsSold >= HOT_SALES_FIRE_THRESHOLD;
  const isNewArrival = item.data?.is_new_arrival === true;
  const isPreLoved = isPreLovedProduct(item);
  const isSponsored = item.ad?.sponsored === true;
  const engagementBadge = String((item.data as any)?.analytics?.badge || "").trim().toLowerCase();
  const engagementBadgeIconKey = String((item.data as any)?.analytics?.badgeIconKey || "").trim().toLowerCase();
  const engagementBadgeIconUrl = String((item.data as any)?.analytics?.badgeIconUrl || "").trim();
  const engagementBadgeColorKey = String((item.data as any)?.analytics?.badgeColorKey || "").trim().toLowerCase();
  const engagementBadgeBackgroundColor = String((item.data as any)?.analytics?.badgeBackgroundColor || "").trim();
  const engagementBadgeForegroundColor = String((item.data as any)?.analytics?.badgeForegroundColor || "").trim();
  const hasHighClicks = (item.data as any)?.analytics?.hasHighClicks === true;
  const engagementBadgeStyle = getBadgeColorStyle({
    presetKey: engagementBadgeColorKey,
    backgroundColor: engagementBadgeBackgroundColor,
    foregroundColor: engagementBadgeForegroundColor,
    fallbackPreset:
      engagementBadge === "best_seller"
        ? "green"
        : engagementBadge === "popular"
          ? "blue"
          : engagementBadge === "trending_now"
            ? "slate"
            : "amber",
  });
  const resolvedShopperArea = shopperArea ?? null;
  const hasDeliveryEstimateLocation = Boolean(
    resolvedShopperArea?.country && hasPreciseShopperDeliveryArea(resolvedShopperArea),
  );
  const deliveryPromise = hasDeliveryEstimateLocation ? getDeliveryPromise(item, resolvedShopperArea, defaultVariant) : null;
  const sellerDeliveryMessage = hasDeliveryEstimateLocation
    ? getSellerDeliveryMessage(item, resolvedShopperArea, defaultVariant)
    : null;
  const deliveryLabel = deliveryPromise?.label ?? sellerDeliveryMessage?.label ?? null;
  const deliveryCutoffText = deliveryPromise?.cutoffText ?? null;
  const deliveryTone: "success" | "danger" | "warning" | "neutral" =
    deliveryPromise ? "success" : (sellerDeliveryMessage?.tone ?? "neutral");
  const deliveryToneClass =
    {
      success: "inline-flex items-center gap-1 rounded-full bg-[rgba(26,133,83,0.1)] px-2.5 py-1 text-[#1a8553]",
      danger: "inline-flex items-center gap-1 rounded-full bg-[rgba(185,28,28,0.08)] px-2.5 py-1 text-[#b91c1c]",
      warning: "inline-flex items-center gap-1 rounded-full bg-[rgba(180,83,9,0.08)] px-2.5 py-1 text-[#b45309]",
      neutral: "inline-flex items-center gap-1 rounded-full bg-[rgba(87,99,108,0.08)] px-2.5 py-1 text-[#57636c]",
    }[deliveryTone];
  const deliveryPillClass =
    {
      success: "rounded-full bg-[rgba(26,133,83,0.1)] px-2 py-1 text-[#1a8553]",
      danger: "rounded-full bg-[rgba(185,28,28,0.08)] px-2 py-1 text-[#b91c1c]",
      warning: "rounded-full bg-[rgba(180,83,9,0.08)] px-2 py-1 text-[#b45309]",
      neutral: "rounded-full bg-[rgba(87,99,108,0.08)] px-2 py-1 text-[#57636c]",
    }[deliveryTone];
  const href = getProductHref(item);
  const resolvedBrandLabel = brandLabel || getBrandLabel(item);
  const resolvedVendorLabel = vendorLabel || getVendorLabel(item);
  const resolvedBrandHref =
    brandHref || `/products?brand=${encodeURIComponent(getBrandSlug(item) || "piessang")}`;
  const resolvedVendorHref =
    vendorHref || `/vendors/${encodeURIComponent(getVendorSlug(item) || "piessang")}`;
  const resolvedCurrentUrl = currentUrl || href;
  const linkTarget = openInNewTab ? "_blank" : undefined;
  const linkRel = openInNewTab ? "noreferrer noopener" : undefined;
  const renderBrandLink = resolvedBrandHref !== resolvedCurrentUrl;
  const renderVendorLink = resolvedVendorHref !== resolvedCurrentUrl;
  const cartProductCount = productUniqueId ? cartProductCounts[productUniqueId] ?? 0 : 0;
  const cartVariantCount =
    productUniqueId && defaultVariantId ? cartVariantCounts[`${productUniqueId}::${defaultVariantId}`] ?? 0 : 0;
  const cartCount = cartVariantCount || cartProductCount;
  const cartQuantityGuard = getCartQuantityGuard({
    variant: defaultVariant,
    currentCartQty: cartVariantCount,
    unavailable: stockState.label === "Out of stock",
  });
  const availableQuantity = cartQuantityGuard.availableQuantity;
  const isOutOfStock = cartQuantityGuard.isOutOfStock;
  const isCheckoutReserved = cartQuantityGuard.isCheckoutReserved;
  const reachedCartLimit = cartQuantityGuard.reachedCartLimit;
  const canAddDefaultVariantToCart = !cartBusy && cartQuantityGuard.canAdd;
  const handleCartSuccess = onAddToCartSuccess ?? (() => {});
  const hasPrefetchedHrefRef = useRef(false);
  const blockedCartMessage = cartQuantityGuard.message;

  const prefetchProductHref = () => {
    if (hasPrefetchedHrefRef.current || !href) return;
    hasPrefetchedHrefRef.current = true;
    void router.prefetch(href);
  };

  useEffect(() => {
    const favoriteMatch = favoriteIds?.includes(productUniqueId);
    setIsFavorite(Boolean(item.data?.is_favorite) || Boolean(favoriteMatch));
  }, [favoriteIds, item.data?.is_favorite, productUniqueId]);

  useEffect(() => {
    hasPrefetchedHrefRef.current = false;
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
  }, [href]);

  useEffect(() => {
    setHoveredImageIndex(0);
  }, [productUniqueId]);
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
  const favoriteVisible = isAuthenticated;

  const handleImagePointerMove = (event: MouseEvent<HTMLElement>) => {
    prefetchProductHref();
    if (displayImages.length <= 1) return;
    trackProductEngagement({
      action: "hover",
      productId: productUniqueId,
      productTitle: titleText,
      sellerCode,
      sellerSlug,
      vendorName,
      source: item.ad?.placement || "catalogue",
      pageType: view === "list" ? "product_list" : "product_grid",
      href,
      userId: uid || null,
      dedupeKey: `piessang_product_hover:${productUniqueId}:${view}`,
    });
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const position = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
    const nextIndex = Math.min(displayImages.length - 1, Math.floor((position / bounds.width) * displayImages.length));
    setHoveredImageIndex(nextIndex);
  };

  const handleImagePointerLeave = () => {
    if (hoveredImageIndex !== 0) setHoveredImageIndex(0);
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
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) return;

    if (!defaultVariant || !productUniqueId) {
      openAuthModal("Please open the product to choose a variant first.");
      return;
    }
    const defaultVariantId = String(defaultVariant.variant_id || "").trim();
    if (!defaultVariantId) {
      openAuthModal("Please open the product to choose a variant first.");
      return;
    }

    if (cartBusy) return;
    if (blockedCartMessage) {
      setCartBlockedNotice(blockedCartMessage);
      return;
    }
    setCartBusy(true);
    setCartJustAdded(false);
    optimisticAddToCart(productUniqueId, defaultVariantId, 1);

    try {
      const response = await fetch("/api/client/v1/carts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartOwnerId: activeCartOwnerId,
          product: item.data,
          variant_id: defaultVariantId,
          mode: cartVariantCount > 0 ? "increment" : "add",
          qty: 1,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update cart.");
      }
      setCartJustAdded(true);
      handleCartSuccess((payload?.data?.cart ?? null) as CartPreview | null);
    } catch {
      void refreshCart();
      setCartJustAdded(false);
    } finally {
      setCartBusy(false);
    }
  };
  const openProduct = () => {
    trackProductEngagement({
      action: "click",
      productId: productUniqueId,
      productTitle: titleText,
      sellerCode,
      sellerSlug,
      vendorName,
      source: item.ad?.placement || "catalogue",
      pageType: view === "list" ? "product_list" : "product_grid",
      href,
      userId: uid || null,
    });
    if (isSponsored && item.ad?.campaignId && productUniqueId) {
      const payload = JSON.stringify({
        action: "click",
        campaignId: item.ad.campaignId,
        productId: productUniqueId,
        placement: item.ad.placement || "category_grid",
        sessionId: getCampaignSessionId(uid),
        userId: uid || null,
      });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/client/v1/campaigns/track", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/client/v1/campaigns/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => null);
      }
    }
    if (openInNewTab) {
      window.open(href, "_blank", "noreferrer,noopener");
      return;
    }

    router.push(href, { scroll: true });
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
  const leftTopBadges = [
    salePercent
      ? {
          key: "sale",
          title: null,
          className:
            "inline-flex h-6 items-center rounded-full bg-[#1a8553] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(20,24,27,0.14)]",
          content: <>{salePercent}% off</>,
          style: undefined,
        }
      : null,
    isPreLoved
      ? {
          key: "pre-loved",
          title: null,
          className:
            "inline-flex h-6 items-center rounded-full bg-[#202020] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(20,24,27,0.14)]",
          content: <>Pre-Loved</>,
          style: undefined,
        }
      : null,
    isNewArrival
      ? {
          key: "new",
          title: null,
          className:
            "inline-flex h-6 items-center gap-1 rounded-full bg-[#e3c52f] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#3d3420] shadow-[0_4px_12px_rgba(20,24,27,0.14)]",
          content: (
            <>
              <SparkIcon />
              New
            </>
          ),
          style: undefined,
        }
      : null,
    engagementBadge
      ? {
          key: "engagement",
          title:
            engagementBadge === "best_seller"
              ? "Best seller: strong sales in the recent badge window."
              : engagementBadge === "popular"
                ? "Popular: strong shopper engagement in the recent badge window."
                : engagementBadge === "trending_now"
                  ? "Trending now: sales are accelerating in the recent badge window."
                  : "Rising star: growing shopper engagement in the recent badge window.",
          className:
            "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-semibold uppercase tracking-[0.08em] shadow-[0_4px_12px_rgba(20,24,27,0.14)]",
          content: (
            <>
              <ProductBadgeIcon
                iconKey={engagementBadgeIconKey}
                iconUrl={engagementBadgeIconUrl}
                badge={engagementBadge}
                hasHighClicks={hasHighClicks}
              />
              {engagementBadge === "best_seller"
                ? "Best seller"
                : engagementBadge === "popular" || hasHighClicks
                  ? "Popular"
                  : engagementBadge === "trending_now"
                    ? "Trending now"
                    : "Rising star"}
            </>
          ),
          style: engagementBadgeStyle,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    title: string | null;
    className: string;
    content: ReactNode;
    style?: CSSProperties;
  }>;

  const imageBadges = (
    <>
      {imageCount > 0 ? (
        <span className="absolute bottom-2 left-2 z-10 inline-flex h-6 items-center gap-1 rounded-full bg-white/92 px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#4a4545] shadow-[0_4px_12px_rgba(20,24,27,0.12)]">
          <CameraIcon />
          <span>{imageCount}</span>
        </span>
      ) : null}
      {leftTopBadges.length ? (
        <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-4rem)] flex-col gap-2">
          {leftTopBadges.map((badge) => (
            <span key={badge.key} title={badge.title ?? undefined} className={badge.className} style={badge.style}>
              {badge.content}
            </span>
          ))}
        </div>
      ) : null}
      {isSponsored ? (
        <span className="absolute right-10 top-2 z-10 inline-flex h-6 items-center rounded-full bg-[#202020] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(20,24,27,0.14)]">
          {item.ad?.label || "Sponsored"}
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

  useEffect(() => {
    if (!isSponsored || !item.ad?.campaignId || !productUniqueId) return;
    const sessionId = getCampaignSessionId(uid);
    const storageKey = `piessang_campaign_impression:${item.ad.campaignId}:${productUniqueId}:${item.ad.placement || "category_grid"}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
    void fetch("/api/client/v1/campaigns/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "impression",
        campaignId: item.ad.campaignId,
        productId: productUniqueId,
        placement: item.ad.placement || "category_grid",
        sessionId,
        userId: uid || null,
      }),
      keepalive: true,
    }).catch(() => null);
  }, [isSponsored, item.ad?.campaignId, item.ad?.placement, productUniqueId, uid]);

  const impressionRef = useProductImpressionTracker(
    {
      productId: productUniqueId,
      productTitle: titleText,
      sellerCode,
      sellerSlug,
      vendorName,
      source: item.ad?.placement || "catalogue",
      pageType: view === "list" ? "product_list" : "product_grid",
      href,
      userId: uid || null,
      dedupeKey: `piessang_product_impression:${productUniqueId}:${view}:${item.ad?.placement || "catalogue"}`,
    },
    { enabled: Boolean(productUniqueId) },
  );

  if (view === "list") {
    return (
      <>
        <article
          ref={impressionRef as any}
          role="link"
          tabIndex={0}
          onClick={openCardIfAllowed}
          onMouseEnter={handleCardMouseEnter}
          onTouchStart={handleCardTouchStart}
          onFocus={handleCardFocus}
          onKeyDown={onCardKeyDown}
          data-clickable-container="true"
          className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]"
        >
          <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <div
            className="relative h-[160px] w-full shrink-0 overflow-hidden rounded-[8px] bg-[#fafafa] sm:w-[180px]"
            onMouseMove={handleImagePointerMove}
            onMouseLeave={handleImagePointerLeave}
          >
            {imageBadges}
            <BlurhashImage
              src={image?.imageUrl ?? ""}
              blurHash={image?.blurHashUrl ?? ""}
              alt={titleText}
              sizes={PRODUCT_CARD_LIST_IMAGE_SIZES}
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
          {selectedVariantMeta.length ? (
            <p className="text-[11px] leading-[1.4] text-[#57636c]">
              {selectedVariantMeta.join(" • ")}
            </p>
          ) : null}

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-normal leading-none">
              {renderBrandLink ? (
                <Link
                  href={resolvedBrandHref}
                  target={linkTarget}
                  rel={linkRel}
                  scroll={false}
                  onClick={(event) => event.stopPropagation()}
                  className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                >
                  {resolvedBrandLabel}
                </Link>
              ) : (
                <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                  {resolvedBrandLabel}
                </span>
              )}
              <span className="text-[#d6d6d6]">•</span>
              {renderVendorLink ? (
                <Link
                  href={resolvedVendorHref}
                  target={linkTarget}
                  rel={linkRel}
                  scroll={false}
                  onClick={(event) => event.stopPropagation()}
                  className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                >
                  {resolvedVendorLabel}
                </Link>
              ) : (
                <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">
                  {resolvedVendorLabel}
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

          {deliveryLabel ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold normal-case tracking-normal">
              <span className={deliveryToneClass}>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                  <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h.5A2.5 2.5 0 0 1 18 6.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4H5V3a1 1 0 0 1 1-1zm9.5 6h-11a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5z" />
                </svg>
                {deliveryLabel}
              </span>
              {deliveryCutoffText ? <span className="text-[#8b94a3]">{deliveryCutoffText}</span> : null}
            </div>
          ) : null}
          {soldCountLabel ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold normal-case tracking-normal">
              <span className={showHotSales ? "inline-flex items-center gap-1 text-[#f97316]" : "text-[#57636c]"}>
                {showHotSales ? <FlameIcon /> : null}
                {soldCountLabel}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3 pt-0.5">
            {salePrice ? (
              <div className="flex flex-wrap items-end gap-2">
                <StorefrontPrice valueExVat={displayPriceValue} tone={saleActive ? "sale" : "default"} size="lg" />
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

            <div className="mt-3 flex items-stretch gap-2">
              <button
                type="button"
                data-ignore-card-open="true"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleAddDefaultVariantToCart}
                disabled={cartBusy}
                className={`relative inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[8px] border px-4 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                  cartJustAdded
                    ? "border-[#1a8553] bg-[#1a8553] text-white shadow-[0_10px_24px_rgba(26,133,83,0.18)]"
                    : !canAddDefaultVariantToCart
                      ? "border-black/10 bg-[#f5f5f5] text-[#7d7d7d]"
                      : "border-black/20 bg-transparent text-[#202020] hover:border-[#cbb26b] hover:text-[#cbb26b]"
                }`}
                aria-label="Add default variant to cart"
                aria-disabled={!canAddDefaultVariantToCart}
                title={
                  reachedCartLimit
                    ? `Maximum available quantity already in cart${typeof availableQuantity === "number" ? ` (${availableQuantity})` : ""}.`
                    : isCheckoutReserved
                      ? "This item is currently reserved in another shopper's checkout."
                      : isOutOfStock
                      ? "This item is out of stock."
                      : undefined
                }
              >
                <CartPlusIcon />
                <span className="whitespace-nowrap sm:hidden">
                  {cartBusy ? "Adding" : reachedCartLimit ? "Max" : isCheckoutReserved ? "Reserved" : isOutOfStock ? "Sold out" : cartJustAdded ? "Added" : "Add"}
                </span>
                <span className="hidden whitespace-nowrap sm:inline">
                  {cartBusy
                    ? "Adding..."
                    : reachedCartLimit
                      ? "Max reached"
                      : isCheckoutReserved
                        ? "Reserved"
                      : isOutOfStock
                        ? "Out of stock"
                        : cartJustAdded
                          ? "Added to cart"
                          : "Add to cart"}
                </span>
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
        <AppSnackbar
          notice={
            cartBlockedNotice
              ? {
                  tone: isOutOfStock || isCheckoutReserved ? "error" : "info",
                  message: cartBlockedNotice,
                }
              : null
          }
          onClose={() => setCartBlockedNotice(null)}
        />
      </>
    );
  }

  return (
    <div ref={impressionRef as any} className="h-full">
      <article
        role="link"
        tabIndex={0}
        onClick={openCardIfAllowed}
        onMouseEnter={handleCardMouseEnter}
        onTouchStart={handleCardTouchStart}
        onFocus={handleCardFocus}
        onKeyDown={onCardKeyDown}
        data-clickable-container="true"
        className="flex h-full flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_8px_20px_rgba(20,24,27,0.06)]"
      >
        <div className="flex h-full flex-col">
          <div className="relative aspect-[1/1] overflow-hidden bg-[#fafafa]">
            {imageBadges}
            <div
              className="h-full w-full"
              onMouseMove={handleImagePointerMove}
              onMouseLeave={handleImagePointerLeave}
            >
              <BlurhashImage
                src={image?.imageUrl ?? ""}
                blurHash={image?.blurHashUrl ?? ""}
                alt={titleText}
                sizes={PRODUCT_CARD_GRID_IMAGE_SIZES}
                className="h-full w-full"
                imageClassName="object-cover"
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col space-y-1.5 px-3 py-3 sm:px-4 sm:py-4">
            <h2 title={titleText} style={titleClampStyle} className="text-[12px] font-normal leading-[1.2] text-[#202020] sm:text-[15px]">
              {titleText}
            </h2>

            {selectedVariantLabel ? (
              <p className="text-[10px] font-medium leading-none text-[#8b94a3] sm:text-[11px]">{selectedVariantLabel}</p>
            ) : null}
            {selectedVariantMeta.length ? (
              <p className="text-[10px] leading-[1.4] text-[#57636c] sm:text-[11px]">{selectedVariantMeta.join(" • ")}</p>
            ) : null}

            {resolvedBrandLabel || resolvedVendorLabel ? (
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-normal leading-none sm:text-[11px]">
                {resolvedBrandLabel ? (
                  renderBrandLink ? (
                    <Link
                      href={resolvedBrandHref}
                      target={linkTarget}
                      rel={linkRel}
                      scroll={false}
                      onClick={(event) => event.stopPropagation()}
                      className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                    >
                      {resolvedBrandLabel}
                    </Link>
                  ) : (
                    <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">{resolvedBrandLabel}</span>
                  )
                ) : null}
                {resolvedBrandLabel && resolvedVendorLabel ? <span className="text-[#d6d6d6]">•</span> : null}
                {resolvedVendorLabel ? (
                  renderVendorLink ? (
                    <Link
                      href={resolvedVendorHref}
                      target={linkTarget}
                      rel={linkRel}
                      scroll={false}
                      onClick={(event) => event.stopPropagation()}
                      className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                    >
                      {resolvedVendorLabel}
                    </Link>
                  ) : (
                    <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">{resolvedVendorLabel}</span>
                  )
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] sm:gap-2 sm:text-[10px]">
              {stockState.label ? (
                <span
                  className={
                    stockState.tone === "success"
                      ? "text-[#1a8553]"
                      : stockState.tone === "danger"
                        ? "text-[#b91c1c]"
                        : stockState.tone === "warning"
                          ? "text-[#b45309]"
                          : "text-[#57636c]"
                  }
                >
                  {stockState.label}
                </span>
              ) : null}
              {stockState.label && (typeof variantCount === "number" || (sellerOfferCount ?? 0) > 1) ? <span className="text-[#d6d6d6]">•</span> : null}
              {typeof variantCount === "number" ? <span>{variantCount} variants</span> : null}
              {typeof variantCount === "number" && (sellerOfferCount ?? 0) > 1 ? <span className="text-[#d6d6d6]">•</span> : null}
              {(sellerOfferCount ?? 0) > 1 ? <span>{sellerOfferCount} sellers</span> : null}
              {reviewMeta ? (
                <>
                  {(stockState.label || typeof variantCount === "number" || (sellerOfferCount ?? 0) > 1) ? <span className="text-[#d6d6d6]">•</span> : null}
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

            {deliveryLabel ? (
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold normal-case tracking-normal sm:text-[11px]">
                <span className={deliveryPillClass}>
                  {deliveryLabel}
                </span>
                {deliveryCutoffText ? <span className="text-[#8b94a3]">{deliveryCutoffText}</span> : null}
              </div>
            ) : null}

            {soldCountLabel ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold normal-case tracking-normal sm:text-[11px]">
                <span className={showHotSales ? "inline-flex items-center gap-1 text-[#f97316]" : "text-[#57636c]"}>
                  {showHotSales ? <FlameIcon /> : null}
                  {soldCountLabel}
                </span>
              </div>
            ) : null}

            {salePrice ? (
              <div className="mt-auto flex flex-wrap items-end gap-2 pt-2">
                <StorefrontPrice valueExVat={displayPriceValue} tone={saleActive ? "sale" : "default"} size="md" />
                {saleActive && compareAtPrice ? (
                  <p className="text-[11px] font-medium leading-none text-[#8b94a3] line-through">
                    {compareAtPrice}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-auto pt-2 text-[12px] text-[#8b94a3]">Price unavailable</p>
            )}

            <div className="mt-2.5 flex items-stretch gap-2 sm:mt-3">
              <button
                type="button"
                data-ignore-card-open="true"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleAddDefaultVariantToCart}
                disabled={cartBusy}
                className={`relative inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[8px] border px-4 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                  cartJustAdded
                    ? "border-[#1a8553] bg-[#1a8553] text-white shadow-[0_10px_24px_rgba(26,133,83,0.18)]"
                    : !canAddDefaultVariantToCart
                      ? "border-black/10 bg-[#f5f5f5] text-[#7d7d7d]"
                      : "border-black/20 bg-transparent text-[#202020] hover:border-[#cbb26b] hover:text-[#cbb26b]"
                }`}
                aria-label="Add default variant to cart"
                aria-disabled={!canAddDefaultVariantToCart}
                title={
                  reachedCartLimit
                    ? `Maximum available quantity already in cart${typeof availableQuantity === "number" ? ` (${availableQuantity})` : ""}.`
                    : isCheckoutReserved
                      ? "This item is currently reserved in another shopper's checkout."
                      : isOutOfStock
                      ? "This item is out of stock."
                      : undefined
                }
              >
                <CartPlusIcon />
                <span className="whitespace-nowrap sm:hidden">
                  {cartBusy ? "Adding" : reachedCartLimit ? "Max" : isCheckoutReserved ? "Reserved" : isOutOfStock ? "Sold out" : cartJustAdded ? "Added" : "Add"}
                </span>
                <span className="hidden whitespace-nowrap sm:inline">
                  {cartBusy
                    ? "Adding..."
                    : reachedCartLimit
                      ? "Max reached"
                      : isCheckoutReserved
                        ? "Reserved"
                      : isOutOfStock
                        ? "Out of stock"
                        : cartJustAdded
                          ? "Added to cart"
                          : "Add to cart"}
                </span>
                {cartCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-black/20 bg-white px-1 text-[10px] font-semibold leading-none text-[#202020]">
                    {cartCount}
                  </span>
                ) : null}
                {cartBurstKey ? (
                  <span className="absolute -top-3 right-2 animate-bevgo-pop text-[10px] font-semibold text-[#cbb26b]">
                    +1
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </article>
      <AppSnackbar
        notice={
          cartBlockedNotice
            ? {
                tone: isOutOfStock || isCheckoutReserved ? "error" : "info",
                message: cartBlockedNotice,
              }
            : null
        }
        onClose={() => setCartBlockedNotice(null)}
      />
    </div>
  );
}

export function ProductsResults({
  initialItems,
  currentSort,
  currentView,
  openInNewTab,
  searchParams,
  totalCount,
  sponsoredPlacement,
  sponsoredContext,
}: {
  initialItems: ProductItem[];
  currentSort: string;
  currentView: "grid" | "list";
  openInNewTab: boolean;
  searchParams: Record<string, SearchParamValue>;
  totalCount: number;
  sponsoredPlacement?: string;
  sponsoredContext?: { category?: string; subCategory?: string; search?: string };
}) {
  const router = useRouter();
  const [items, setItems] = useState(() => initialItems.filter(hasShopperFacingProductImage));
  const [sponsoredItems, setSponsoredItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [priceRange, setPriceRange] = useState<{ min: number; max: number } | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [cartPreview, setCartPreview] = useState<CartPreview | null>(null);
  const [cartToastVisible, setCartToastVisible] = useState(false);
  const [cartBurstKey, setCartBurstKey] = useState<number>(0);
  const [shopperArea, setShopperArea] = useState<ShopperDeliveryArea | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { uid, cartOwnerId, isAuthenticated, favoriteCount, refreshProfile, refreshCart, openAuthModal, syncCartState } = useAuth();
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
  const activeAttributeFilters = ATTRIBUTE_FILTER_KEYS.reduce<Record<string, string>>((acc, key) => {
    const value = String(filterParams.get(key) || "").trim();
    if (value) acc[key] = value;
    return acc;
  }, {});

  useEffect(() => {
    setShopperArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea(setShopperArea);
  }, []);

  const shopperAreaKey = useMemo(
    () =>
      JSON.stringify({
        country: shopperArea?.country || "",
        city: shopperArea?.city || "",
        province: shopperArea?.province || "",
        suburb: shopperArea?.suburb || "",
        postalCode: shopperArea?.postalCode || "",
        latitude: shopperArea?.latitude ?? null,
        longitude: shopperArea?.longitude ?? null,
      }),
    [
      shopperArea?.city,
      shopperArea?.country,
      shopperArea?.latitude,
      shopperArea?.longitude,
      shopperArea?.postalCode,
      shopperArea?.province,
      shopperArea?.suburb,
    ],
  );

  useEffect(() => {
    setItems(initialItems.filter(hasShopperFacingProductImage));
  }, [initialItems]);

  useEffect(() => {
    let cancelled = false;

    async function loadSponsoredItems() {
      if (!sponsoredPlacement || !items.length) {
        setSponsoredItems([]);
        return;
      }

      try {
        const response = await fetch("/api/client/v1/campaigns/serve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placement: sponsoredPlacement,
            items,
            context: sponsoredContext ?? {},
            limit: 2,
            sessionId: getCampaignSessionId(uid),
            userId: uid || null,
          }),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || payload?.ok === false) return;
        setSponsoredItems(Array.isArray(payload?.data?.items) ? payload.data.items : []);
      } catch {
        if (!cancelled) {
          setSponsoredItems([]);
        }
      }
    }

    void loadSponsoredItems();

    return () => {
      cancelled = true;
    };
  }, [items, sponsoredContext, sponsoredPlacement]);

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
    () =>
      filterByPriceRange(
        filterByMinRating(items, minRating).filter((item) =>
          isProductEligibleForShopperCountry(item, shopperArea?.country || "") &&
          Object.entries(activeAttributeFilters).every(([key, value]) =>
            itemMatchesAttributeFilter(item, key as AttributeFilterKey, value),
          ),
        ),
        priceRange?.min,
        priceRange?.max,
      ),
    [activeAttributeFilters, items, minRating, priceRange?.min, priceRange?.max, shopperArea?.country, shopperAreaKey],
  );
  const displayItems = useMemo(() => {
    if (!filteredItems.length || !sponsoredItems.length || !sponsoredPlacement) return filteredItems;
    const sponsoredIds = new Set(
      sponsoredItems
        .map((item) => String(item?.id ?? item?.data?.docId ?? item?.data?.product?.unique_id ?? "").trim())
        .filter(Boolean),
    );
    const organic = filteredItems.filter(
      (item) => !sponsoredIds.has(String(item?.id ?? item?.data?.docId ?? item?.data?.product?.unique_id ?? "").trim()),
    );
    const next = [...organic];
    const slots = sponsoredPlacement === "search_results" ? [1, 6] : [3, 10];
    sponsoredItems.forEach((item, index) => {
      const slot = Math.min(slots[index] ?? next.length, next.length);
      next.splice(slot, 0, item);
    });
    return next;
  }, [filteredItems, sponsoredItems, sponsoredPlacement]);
  const shopperCountryLabel = String(shopperArea?.country || "").trim();
  const showingCountryFilter = Boolean(shopperCountryLabel);
  const sortedItems = useMemo(() => sortProducts(displayItems, currentSort), [displayItems, currentSort]);
  const clearCatalogFilters = {
    id: undefined,
    unique_id: undefined,
    category: undefined,
    subCategory: undefined,
    brand: undefined,
    vendor: undefined,
    kind: undefined,
    packUnit: undefined,
    ...Object.fromEntries(ATTRIBUTE_FILTER_KEYS.map((key) => [key, undefined])),
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

      const response = await fetch(buildProductsApiUrl(params));
      const payload = (await response.json()) as { items?: ProductItem[]; groups?: Array<{ items?: ProductItem[] }>; count?: number; total?: number };
      const raw = (payload.items ?? payload.groups?.flatMap((group) => group.items ?? []) ?? []).filter(
        hasShopperFacingProductImage,
      );
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
    const nextCart = (cart ?? null) as CartPreview | null;
    setCartPreview(nextCart);
    setCartDrawerOpen(true);
    setCartToastVisible(true);
    setCartBurstKey(Date.now());
    window.setTimeout(() => setCartToastVisible(false), 1600);
    void refreshCart();
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
      router.push("/products");
    } catch {
      openAuthModal("We could not clear your favourites right now.");
    }
  };

  if (sortedItems.length === 0) {
    const hasFavorites = favoriteCount > 0;
    return (
      <div className="space-y-4">
        {showingCountryFilter ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-black/6 bg-[#fffdfa] px-4 py-3 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
              <p>
              Showing products deliverable to <span className="font-semibold text-[#202020]">{shopperCountryLabel}</span>.
              </p>
            <button
              type="button"
              onClick={() => {
                saveShopperDeliveryArea(null);
                setShopperArea(null);
              }}
              className="text-[12px] font-semibold text-[#145af2]"
            >
              Change country in header
            </button>
          </div>
        ) : null}
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
      </div>
    );
  }

  return (
      <div className="space-y-4">
          {showingCountryFilter ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-black/6 bg-[#fffdfa] px-4 py-3 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
              <p>
                Showing products deliverable to <span className="font-semibold text-[#202020]">{shopperCountryLabel}</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  saveShopperDeliveryArea(null);
                  setShopperArea(null);
                }}
                className="text-[12px] font-semibold text-[#145af2]"
              >
                Change country in header
              </button>
            </div>
          ) : null}
          {currentView === "list" ? (
        <div className="space-y-4">
          {sortedItems.map((item, index) => (
          <DeferredProductCard
                key={item.id ?? item.data?.docId}
                eager={index < DEFERRED_CARD_EAGER_COUNT_LIST}
                minHeight={248}
              >
          <BrowseProductCard
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
                shopperArea={shopperArea}
              />
              </DeferredProductCard>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {sortedItems.map((item, index) => (
            <DeferredProductCard
              key={item.id ?? item.data?.docId}
              eager={index < DEFERRED_CARD_EAGER_COUNT_GRID}
              minHeight={460}
            >
            <BrowseProductCard
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
              shopperArea={shopperArea}
            />
            </DeferredProductCard>
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

      <AppSnackbar notice={cartToastVisible ? { tone: "success", message: "Added to cart" } : null} />

      <CartDrawer open={cartDrawerOpen} cart={cartPreview} onClose={() => setCartDrawerOpen(false)} />
    </div>
  );
}
