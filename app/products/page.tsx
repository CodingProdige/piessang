import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { PageBody } from "@/components/layout/page-body";
import { FilterSnackbar } from "@/components/products/filter-snackbar";
import { ProductsToolbar } from "@/components/products/products-toolbar";
import { MobileProductFilters } from "@/components/products/mobile-filters";
import { PriceRangeFilter } from "@/components/products/price-range-filter";
import { ProductsResults } from "@/components/products/products-results";
import {
  PRODUCT_CARD_GRID_IMAGE_SIZES,
  PRODUCT_CARD_LIST_IMAGE_SIZES,
} from "@/components/products/products-results";
import { ResultsCount } from "@/components/products/results-count";
import { SingleProductView } from "@/components/products/single-product-view";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;
type SearchParamsInput = Record<string, SearchParamValue> | Promise<Record<string, SearchParamValue>>;

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
  };
  placement?: {
    is_default?: boolean;
  };
  inventory?: Array<{
    location_id?: string;
    in_stock_qty?: number;
    in_stock?: boolean;
  }>;
  total_in_stock_items_available?: number;
};

type ProductItem = {
  id?: string;
  data?: {
    docId?: string;
    product?: {
      unique_id?: string | number;
      title?: string | null;
      titleSlug?: string | null;
      overview?: string | null;
      description?: string | null;
      keywords?: string[];
    };
    seller?: {
      vendorName?: string | null;
      vendorDescription?: string | null;
      branding?: {
        bannerImageUrl?: string | null;
        logoImageUrl?: string | null;
      };
    };
    brand?: {
      title?: string | null;
      slug?: string | null;
      description?: string | null;
      media?: {
        images?: Array<{
          imageUrl?: string | null;
          blurHashUrl?: string | null;
        }>;
      };
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
    selected_variant?: {
      pricing?: {
        selling_price_incl?: number;
      };
    };
    selected_variant_snapshot?: {
      pricing?: {
        selling_price_incl?: number;
      };
      media?: {
        images?: Array<{
          imageUrl?: string | null;
          blurHashUrl?: string | null;
        }>;
      };
    };
    placement?: {
      isFeatured?: boolean;
      isActive?: boolean;
      position?: number;
    };
    variants?: ProductVariant[];
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
    seller_unavailable?: boolean;
    seller_unavailable_reason_code?: string | null;
    seller_unavailable_reason_message?: string | null;
    seller_account_status?: string | null;
  };
  ad?: {
    sponsored?: boolean;
    campaignId?: string | null;
    placement?: string | null;
    sellerCode?: string | null;
    sellerSlug?: string | null;
    label?: string | null;
  };
};

type BrandBanner = {
  title: string;
  description?: string | null;
  productCount: number;
  imageUrl?: string | null;
  blurHashUrl?: string | null;
};

type FilterCountMap = Record<string, number>;
type AttributeFilterConfig = {
  key: string;
  title: string;
  variantKey: keyof ProductVariant;
};

type ProductsPayload = {
  ok?: boolean;
  total?: number;
  count?: number;
  items?: ProductItem[];
  id?: string;
  data?: ProductItem["data"];
  groups?: Array<{
    brand?: string;
    items?: ProductItem[];
  }>;
  options?: {
    brands?: string[];
    categories?: string[];
    subCategories?: string[];
    kinds?: string[];
    onSale?: boolean;
    isRental?: boolean;
    isFeatured?: boolean;
    inStock?: boolean;
    packUnits?: string[];
    packUnitCounts?: number[];
    packUnitVolumes?: number[];
    attributeFilters?: Array<{
      key: string;
      title: string;
      items: string[];
    }>;
    priceRange?: {
      min?: number;
      max?: number;
    };
  };
  message?: string;
};

type RecommendationPayload = {
  ok?: boolean;
  items?: ProductItem[];
  source?: "co_purchase" | "catalog_pairing" | "none";
  message?: string;
};

type CatalogueBrandItem = {
  id?: string;
  data?: {
    brand?: {
      title?: string | null;
      slug?: string | null;
      description?: string | null;
    };
      media?: {
        images?: Array<{
          imageUrl?: string | null;
          blurHashUrl?: string | null;
        }>;
      };
    placement?: {
      isActive?: boolean;
      isFeatured?: boolean;
      position?: number;
    };
  };
};

const VAT_MULTIPLIER = 1.15;
const VAT_DIVISOR = 1.15;
const ATTRIBUTE_FILTERS: AttributeFilterConfig[] = [
  { key: "size", title: "Size", variantKey: "size" },
  { key: "color", title: "Color", variantKey: "color" },
  { key: "material", title: "Material", variantKey: "material" },
  { key: "shade", title: "Shade", variantKey: "shade" },
  { key: "scent", title: "Scent", variantKey: "scent" },
  { key: "skinType", title: "Skin type", variantKey: "skinType" },
  { key: "hairType", title: "Hair type", variantKey: "hairType" },
  { key: "flavor", title: "Flavour", variantKey: "flavor" },
  { key: "abv", title: "ABV", variantKey: "abv" },
  { key: "containerType", title: "Container", variantKey: "containerType" },
  { key: "storageCapacity", title: "Storage", variantKey: "storageCapacity" },
  { key: "memoryRam", title: "Memory", variantKey: "memoryRam" },
  { key: "connectivity", title: "Connectivity", variantKey: "connectivity" },
  { key: "compatibility", title: "Compatibility", variantKey: "compatibility" },
  { key: "ringSize", title: "Ring size", variantKey: "ringSize" },
  { key: "strapLength", title: "Strap length", variantKey: "strapLength" },
  { key: "bookFormat", title: "Format", variantKey: "bookFormat" },
  { key: "language", title: "Language", variantKey: "language" },
  { key: "ageRange", title: "Age range", variantKey: "ageRange" },
  { key: "modelFitment", title: "Fitment", variantKey: "modelFitment" },
];

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeFilterValue(value: unknown) {
  return String(value ?? "").trim();
}

function sortFilterValues(values: string[]) {
  return [...values].sort((left, right) =>
    left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }),
  );
}

function currentParam(searchParams: Record<string, SearchParamValue>, key: string) {
  const value = searchParams[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function currentNumberParam(searchParams: Record<string, SearchParamValue>, key: string) {
  const value = currentParam(searchParams, key);
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildProductsUrl(searchParams: Record<string, SearchParamValue>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "minPrice" || key === "maxPrice") {
      continue;
    }

    if (typeof value === "string" && value) {
      if (key === "unique_id") {
        params.set("id", value);
      } else if (key === "ids") {
        params.set("ids", value);
      } else if (key === "vendor") {
        params.set("sellerSlug", value);
        params.set("vendor", value);
      } else {
        params.set(key, value);
      }
    } else if (Array.isArray(value) && value[0]) {
      if (key === "unique_id") {
        params.set("id", value[0]);
      } else if (key === "ids") {
        params.set("ids", value[0]);
      } else if (key === "vendor") {
        params.set("sellerSlug", value[0]);
        params.set("vendor", value[0]);
      } else {
        params.set(key, value[0]);
      }
    }
  }

  if (!params.has("isActive")) {
    params.set("isActive", "true");
  }

  return `/api/catalogue/v1/products/product/get?${params.toString()}`;
}

async function fetchProducts(searchParams: Record<string, SearchParamValue>, origin: string) {
  const response = await fetch(new URL(buildProductsUrl(searchParams), origin), { cache: "no-store" });
  return (await response.json()) as ProductsPayload;
}

async function fetchRecommendationRail(
  origin: string,
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
    const response = await fetch(
      new URL(`/api/client/v1/products/${endpoint}?productId=${encodeURIComponent(productId)}`, origin),
      { cache: "no-store" },
    );
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
          new URL(
            `/api/catalogue/v1/products/product/get?ids=${encodeURIComponent(productIds.join(","))}&isActive=true`,
            origin,
          ),
          { cache: "no-store" },
        );
        const hydratePayload = (await hydrateResponse.json().catch(() => ({}))) as ProductsPayload;
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

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(origin: string, value: unknown) {
  const src = String(value ?? "").trim();
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return `${origin}${src}`;
  return src;
}

function getProductShareImage(product: Record<string, any> | null | undefined, origin: string) {
  const selectedVariant =
    product?.selected_variant_snapshot && typeof product.selected_variant_snapshot === "object"
      ? product.selected_variant_snapshot
      : product?.selected_variant && typeof product.selected_variant === "object"
        ? product.selected_variant
        : null;
  const variantImages = Array.isArray(selectedVariant?.media?.images) ? selectedVariant.media.images : [];
  const productImages = Array.isArray(product?.media?.images) ? product.media.images : [];
  const sellerBranding = product?.seller?.branding && typeof product.seller.branding === "object" ? product.seller.branding : null;
  const images = [...variantImages, ...productImages];
  const primary =
    images.find((entry) => entry && typeof entry === "object" && String(entry?.imageUrl || entry?.url || entry?.src || "").trim()) ||
    images[0];
  return (
    toAbsoluteUrl(origin, primary?.imageUrl || primary?.url || primary?.src) ||
    toAbsoluteUrl(origin, sellerBranding?.bannerImageUrl) ||
    toAbsoluteUrl(origin, sellerBranding?.logoImageUrl) ||
    toAbsoluteUrl(origin, "/icon.png")
  );
}

function buildProductMetadataFromPayload(payload: ProductsPayload, origin: string): Metadata {
  if (payload?.data?.seller_unavailable) {
    const title = String(payload?.data?.product?.title ?? "Product").trim();
    return {
      title: `${title} is no longer open on Piessang`,
      robots: { index: false, follow: false },
    };
  }

  const product = payload?.data?.product && typeof payload.data.product === "object" ? payload.data.product : null;
  const seller = payload?.data?.seller && typeof payload.data.seller === "object" ? payload.data.seller : null;
  if (!product?.title) return {};

  const title = String(product.title).trim();
  const description = stripHtml(
    product?.overview ||
      product?.description ||
      seller?.vendorDescription ||
      `Buy ${title} on Piessang.`,
  ).slice(0, 180);
  const image = getProductShareImage(payload?.data, origin);
  const slug = String(product?.titleSlug || title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const canonicalPath = product?.unique_id
    ? `/products/${encodeURIComponent(slug || "product")}?id=${encodeURIComponent(String(product.unique_id))}`
    : undefined;
  const priceValue =
    typeof payload?.data?.selected_variant?.pricing?.selling_price_incl === "number"
      ? payload.data.selected_variant.pricing.selling_price_incl
      : typeof payload?.data?.selected_variant_snapshot?.pricing?.selling_price_incl === "number"
        ? payload.data.selected_variant_snapshot.pricing.selling_price_incl
        : null;

  return {
    title: `${title} | Piessang`,
    description,
    alternates: canonicalPath ? { canonical: canonicalPath } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      url: canonicalPath,
      siteName: "Piessang",
      images: image
        ? [
            {
              url: image,
              alt: title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
    other: priceValue != null ? { "product:price:amount": String(priceValue), "product:price:currency": "ZAR" } : undefined,
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const resolvedSearchParams = await Promise.resolve(searchParams);

  const uniqueId = currentParam(resolvedSearchParams, "unique_id") || currentParam(resolvedSearchParams, "id");
  if (!uniqueId) {
    return buildSeoMetadata("products", {
      title: "Browse Products | Piessang",
      description: "Browse the full Piessang catalogue and discover products from trusted marketplace sellers.",
    });
  }

  try {
    const payload = await fetchProducts(resolvedSearchParams, origin);
    return buildProductMetadataFromPayload(payload, origin);
  } catch {
    // ignore metadata fetch failures and fall back to default indexing
  }

  return {};
}

function buildProductsHref(
  current: Record<string, SearchParamValue>,
  patch: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key] of Object.entries(current)) {
    const value = currentParam(current, key);
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `/products?${query}` : "/products";
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

function pickDisplayVariant(variants?: ProductVariant[]) {
  if (!variants?.length) return null;

  return (
    [...variants]
      .map((variant) => ({
        variant,
        price: getVariantPriceExVat(variant),
      }))
      .filter((entry): entry is { variant: ProductVariant; price: number } => typeof entry.price === "number")
      .sort((a, b) => a.price - b.price)[0]?.variant ?? variants[0]
  );
}

function getBrandLabel(item: ProductItem) {
  return item.data?.brand?.title ?? item.data?.grouping?.brand ?? "Piessang";
}

function getBrandKey(item: ProductItem) {
  return item.data?.brand?.slug ?? item.data?.grouping?.brand ?? "";
}

function getPageTitle(searchParams: Record<string, SearchParamValue>) {
  const personalized = currentParam(searchParams, "personalized");
  const category = currentParam(searchParams, "category");
  const subCategory = currentParam(searchParams, "subCategory");
  const vendor = currentParam(searchParams, "vendor");
  const brand = currentParam(searchParams, "brand");

  if (personalized === "recently-viewed") return "Continue browsing";
  if (personalized === "recommended") return "Recommended for you";
  if (personalized === "search-history") return "Inspired by your searches";
  if (vendor) return humanizeSlug(vendor);
  if (brand) return humanizeSlug(brand);
  if (subCategory) return humanizeSlug(subCategory);
  if (category) return humanizeSlug(category);
  return "All products";
}

function getVariantCount(item: ProductItem) {
  return item.data?.variants?.length ?? 0;
}

function getPackUnit(item: ProductItem) {
  return pickDisplayVariant(item.data?.variants)?.pack?.volume_unit?.toLowerCase() ?? "";
}

function getStockState(variant?: ProductVariant, item?: ProductItem) {
  if (item?.data?.has_in_stock_variants === false) {
    return { label: "Out of stock", tone: "danger" as const };
  }

  const stock = variant?.total_in_stock_items_available;
  if (typeof stock === "number") {
    return stock > 0
      ? { label: `${stock} in stock`, tone: "success" as const }
      : { label: "Out of stock", tone: "danger" as const };
  }

  const firstLocation = variant?.inventory?.[0];
  if (typeof firstLocation?.in_stock_qty === "number") {
    return firstLocation.in_stock_qty > 0
      ? { label: `${firstLocation.in_stock_qty} in stock`, tone: "success" as const }
      : { label: "Out of stock", tone: "danger" as const };
  }

  return { label: "Stock unknown", tone: "neutral" as const };
}

function getReviewState(item: ProductItem) {
  const average = item.data?.ratings?.average;
  const count = item.data?.ratings?.count;
  if (typeof average === "number" && typeof count === "number") {
    return {
      label: `${average.toFixed(1)} (${count} reviews)`,
      count,
    };
  }
  return null;
}

function getRatingAverage(item: ProductItem) {
  return typeof item.data?.ratings?.average === "number" ? item.data.ratings.average : null;
}

function getSortPrice(item: ProductItem) {
  const variant = pickDisplayVariant(item.data?.variants) ?? undefined;
  return getVariantPriceExVat(variant) ?? Number.POSITIVE_INFINITY;
}

function getProductsPriceRange(items: ProductItem[]) {
  const prices = items
    .map((item) => getSortPrice(item))
    .filter((price): price is number => Number.isFinite(price) && price !== Number.POSITIVE_INFINITY);

  if (!prices.length) {
    return null;
  }

  return {
    min: Math.min(...prices) * VAT_MULTIPLIER,
    max: Math.max(...prices) * VAT_MULTIPLIER,
  };
}

type PriceHistogramBucket = {
  min: number;
  max: number;
  count: number;
};

function buildPriceHistogram(items: ProductItem[], min: number, max: number): PriceHistogramBucket[] {
  const step = resolveStep(min, max);
  const uiMin = Math.max(0, Math.floor(min / step) * step);
  const uiMax = Math.max(max, resolveOptionMax(max, step));
  const bucketCount = Math.max(1, Math.ceil((uiMax - uiMin) / step));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketMin = Number((uiMin + index * step).toFixed(2));
    const bucketMax = index === bucketCount - 1 ? Number(uiMax.toFixed(2)) : Number((bucketMin + step).toFixed(2));
    return { min: bucketMin, max: bucketMax, count: 0 };
  });

  for (const item of items) {
    const price = getSortPrice(item);
    if (!Number.isFinite(price)) continue;

    const displayPrice = price * VAT_MULTIPLIER;
    if (displayPrice < uiMin || displayPrice > uiMax) continue;

    const index = Math.min(bucketCount - 1, Math.floor((displayPrice - uiMin) / step));
    const bucket = buckets[index];
    if (bucket) {
      bucket.count += 1;
    }
  }

  return buckets;
}

function toDisplayVat(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value * VAT_MULTIPLIER : undefined;
}

function resolveStep(min: number, max: number) {
  const span = Math.max(0, max - min);
  if (span <= 250) return 25;
  if (span <= 1000) return 50;
  if (span <= 2500) return 100;
  return 250;
}

function resolveOptionMax(max: number, step: number) {
  const epsilon = Math.max(0.0001, step * 0.0001);
  return Math.ceil((max + epsilon) / step) * step;
}

function mergePriceRanges(
  left?: { min: number; max: number } | null,
  right?: { min: number; max: number } | null,
) {
  if (left && right) {
    return {
      min: Math.min(left.min, right.min),
      max: Math.max(left.max, right.max),
    };
  }

  return left ?? right ?? null;
}

function countBy(items: ProductItem[], getter: (item: ProductItem) => string) {
  return items.reduce<FilterCountMap>((acc, item) => {
    const key = getter(item);
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function getVariantAttributeValues(item: ProductItem, key: keyof ProductVariant) {
  const values = Array.isArray(item.data?.variants) ? item.data.variants : [];
  return Array.from(
    new Set(
      values
        .map((variant) => normalizeFilterValue(variant?.[key]))
        .filter(Boolean),
    ),
  );
}

function buildAttributeFilterData(items: ProductItem[]) {
  return ATTRIBUTE_FILTERS
    .map((config) => {
      const counts = items.reduce<FilterCountMap>((acc, item) => {
        for (const value of getVariantAttributeValues(item, config.variantKey)) {
          acc[value] = (acc[value] ?? 0) + 1;
        }
        return acc;
      }, {});
      const entries = sortFilterValues(Object.keys(counts));
      if (!entries.length) return null;
      return {
        ...config,
        items: entries,
        counts,
      };
    })
    .filter(Boolean) as Array<AttributeFilterConfig & { items: string[]; counts: FilterCountMap }>;
}

function countRatings(items: ProductItem[], threshold: number) {
  return items.reduce((acc, item) => acc + ((getRatingAverage(item) ?? 0) >= threshold ? 1 : 0), 0);
}

function getProductHref(item: ProductItem) {
  const uniqueId = item.data?.product?.unique_id ?? item.id ?? item.data?.docId;
  const title = String(item.data?.product?.title ?? "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "product";
  return uniqueId ? `/products/${title}?unique_id=${encodeURIComponent(String(uniqueId))}` : "/products";
}

function getBrandBanner(items: ProductItem[], currentBrand?: string): BrandBanner | null {
  if (!currentBrand) {
    return null;
  }

  const brandItems = items.filter((item) => getBrandKey(item) === currentBrand);
  const match = brandItems[0];
  if (!match) {
    return null;
  }

  return {
    title: match.data?.brand?.title ?? humanizeSlug(currentBrand),
    description: match.data?.brand?.description ?? match.data?.product?.description ?? null,
    productCount: brandItems.length,
    imageUrl: match.data?.brand?.media?.images?.[0]?.imageUrl ?? match.data?.media?.images?.[0]?.imageUrl ?? null,
  };
}

async function fetchBrandBannerImage(currentBrand?: string, origin?: string): Promise<Pick<BrandBanner, "title" | "description" | "imageUrl" | "blurHashUrl"> | null> {
  if (!currentBrand) return null;

  const attempts = [
    (params: URLSearchParams) => params.set("brand", currentBrand),
    (params: URLSearchParams) => params.set("slug", currentBrand),
  ];

  for (const attempt of attempts) {
    try {
      const url = new URL("/api/catalogue/v1/brands/get", origin);
      const params = url.searchParams;
      params.set("isActive", "true");
      params.set("limit", "1");
      attempt(params);

      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        items?: CatalogueBrandItem[];
        related_brands?: CatalogueBrandItem[];
      };
      const list = [...(payload.items ?? []), ...(payload.related_brands ?? [])];
      const match = list.find(
        (item) => item.data?.placement?.isActive !== false && (item.data?.brand?.slug ?? "").trim() === currentBrand,
      ) ?? list[0];

      if (!match) continue;

      return {
        title: match.data?.brand?.title ?? humanizeSlug(currentBrand),
        description: match.data?.brand?.description ?? null,
        imageUrl: match.data?.media?.images?.[0]?.imageUrl ?? null,
        blurHashUrl: match.data?.media?.images?.[0]?.blurHashUrl ?? null,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function sortProducts(items: ProductItem[], sort: string) {
  const copy = [...items];

  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => getSortPrice(a) - getSortPrice(b));
    case "price-desc":
      return copy.sort((a, b) => getSortPrice(b) - getSortPrice(a));
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

function FilterGroup({
  title,
  items,
  currentValue,
  baseParams,
  paramKey,
  counts,
  scroll = false,
  defaultOpen = true,
  formatItemLabel = humanizeSlug,
}: {
  title: string;
  items: string[];
  currentValue?: string;
  baseParams: Record<string, SearchParamValue>;
  paramKey: string;
  counts?: FilterCountMap;
  scroll?: boolean;
  defaultOpen?: boolean;
  formatItemLabel?: (value: string) => string;
}) {
  if (!items.length) return null;

  return (
    <details className="group border-b border-black/5 pb-5 last:border-b-0 last:pb-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">
        <span>{title}</span>
        <span className="grid h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:hidden">
          +
        </span>
        <span className="hidden h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:grid">
          −
        </span>
      </summary>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => {
          const active = currentValue === item;
          return (
            <Link
              key={item}
              href={buildProductsHref(baseParams, { [paramKey]: active ? undefined : item })}
              scroll={scroll}
              className={
                active
                  ? "flex items-center gap-2 rounded-[8px] bg-[rgba(203,178,107,0.12)] px-2.5 py-2 text-[11px] font-medium text-[#202020]"
                  : "flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[11px] font-medium text-[#57636c] transition-colors hover:bg-[#fafafa] hover:text-[#202020]"
              }
            >
              <span
                className={
                  active
                    ? "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#cbb26b] bg-[#cbb26b] text-[8px] leading-none text-white"
                    : "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#b8bec7] bg-white text-[8px] leading-none text-transparent"
                }
              >
                ✓
              </span>
              <span className="truncate">{formatItemLabel(item)}</span>
              <span className="ml-auto text-[10px] font-semibold text-[#8b94a3]">
                {counts?.[item] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function RatingFilterGroup({
  baseParams,
  currentMinRating,
  counts,
  scroll = false,
  defaultOpen = true,
}: {
  baseParams: Record<string, SearchParamValue>;
  currentMinRating?: number;
  counts?: FilterCountMap;
  scroll?: boolean;
  defaultOpen?: boolean;
}) {
  const ratings = [4, 3, 2, 1];

  return (
    <details className="group border-b border-black/5 pb-5 last:border-b-0 last:pb-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">
        <span>Rating</span>
        <span className="grid h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:hidden">
          +
        </span>
        <span className="hidden h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:grid">
          −
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        {ratings.map((rating) => {
          const active = currentMinRating === rating;
          const href = buildProductsHref(baseParams, { minRating: active ? undefined : String(rating) });
          return (
            <Link
              key={rating}
              href={href}
              scroll={scroll}
              className={
                active
                  ? "flex items-center gap-3 rounded-[8px] bg-[rgba(203,178,107,0.12)] px-2.5 py-2 text-[12px] font-medium text-[#202020]"
                  : "flex items-center gap-3 rounded-[8px] px-2.5 py-2 text-[12px] font-medium text-[#57636c] transition-colors hover:bg-[#fafafa] hover:text-[#202020]"
              }
            >
              <span
                className={
                  active
                    ? "inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#cbb26b] bg-[#cbb26b] text-[9px] leading-none text-white"
                    : "inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#b8bec7] bg-white text-[9px] leading-none text-transparent"
                }
              >
                •
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span>{rating}</span>
                <span className="text-[#cbb26b]">★</span>
                <span>and up</span>
              </span>
              <span className="ml-auto text-[11px] font-semibold text-[#8b94a3]">
                {counts?.[String(rating)] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function ToggleFilter({
  title,
  enabled,
  href,
  scroll = false,
}: {
  title: string;
  enabled?: boolean;
  href: string;
  scroll?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      className={
        enabled
          ? "inline-flex items-center gap-2 rounded-[8px] border border-[rgba(203,178,107,0.6)] bg-[rgba(203,178,107,0.12)] px-3 py-1.5 text-[11px] font-semibold text-[#4a4545]"
          : "inline-flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#57636c] transition-colors hover:border-[rgba(203,178,107,0.6)] hover:bg-[rgba(203,178,107,0.08)] hover:text-[#4a4545]"
      }
    >
      <span
        className={
          enabled
            ? "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#cbb26b] bg-[#cbb26b] text-[8px] leading-none text-white"
            : "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#b8bec7] bg-white text-[8px] leading-none text-transparent"
        }
      >
        {enabled ? "×" : "•"}
      </span>
      {title}
    </Link>
  );
}

function ProductCard({
  item,
  view,
  openInNewTab = true,
}: {
  item: ProductItem;
  view: "grid" | "list";
  openInNewTab?: boolean;
}) {
  const image = item.data?.media?.images?.find((entry) => Boolean(entry?.imageUrl)) ?? null;
  const titleText = item.data?.product?.title ?? "Untitled product";
  const brandText = getBrandLabel(item);
  const defaultVariant = pickDisplayVariant(item.data?.variants) ?? undefined;
  const price = formatCurrencyInclVat(getVariantPriceExVat(defaultVariant) ?? undefined);
  const stockState = getStockState(defaultVariant, item);
  const reviewState = getReviewState(item);
  const variantCount = getVariantCount(item);
  const saleActive = Boolean(
    item.data?.has_sale_variant ||
      defaultVariant?.sale?.is_on_sale ||
      defaultVariant?.pricing?.sale_price_excl,
  );
  const href = getProductHref(item);
  const linkTarget = openInNewTab ? "_blank" : undefined;
  const linkRel = openInNewTab ? "noreferrer noopener" : undefined;

  if (view === "list") {
    return (
      <Link
        href={href}
        target={linkTarget}
        rel={linkRel}
        scroll={false}
        data-clickable-container="true"
        className="block overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <div className="relative h-[160px] w-full shrink-0 overflow-hidden rounded-[8px] bg-white sm:w-[180px]">
            <BlurhashImage
              src={image?.imageUrl ?? ""}
              blurHash={image?.blurHashUrl ?? ""}
              alt={titleText}
              sizes={PRODUCT_CARD_LIST_IMAGE_SIZES}
              className="h-full w-full"
              imageClassName="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
              <span className="text-[#907d4c]">{brandText}</span>
              {saleActive ? (
                <span className="rounded-full bg-[rgba(203,178,107,0.18)] px-2 py-0.5 text-[#4a4545]">
                  On sale
                </span>
              ) : null}
              <span
                className={
                  stockState.tone === "success"
                    ? "rounded-full bg-[rgba(26,133,83,0.12)] px-2 py-0.5 text-[#1a8553]"
                    : stockState.tone === "danger"
                      ? "rounded-full bg-[rgba(220,38,38,0.08)] px-2 py-0.5 text-[#b91c1c]"
                      : "rounded-full bg-[#f7f7f7] px-2 py-0.5 text-[#57636c]"
                }
              >
                {stockState.label}
              </span>
            </div>

            <h2 className="text-[17px] font-semibold leading-[1.18] text-[#202020] sm:text-[18px]">
              {titleText}
            </h2>

            <div className="flex flex-wrap items-center gap-2 text-[11px] leading-none text-[#57636c]">
              <span>{variantCount} variants available</span>
              {reviewState ? (
                <>
                  <span>•</span>
                  <span className="text-[#4a4545]">{reviewState.label}</span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {price ? (
                <p className="text-[22px] font-semibold leading-none tracking-tight text-[#4a4545]">
                  {price}
                </p>
              ) : (
                <p className="text-[12px] text-[#8b94a3]">Price unavailable</p>
              )}
              {item.data?.is_favorite ? (
                <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1.5 text-[11px] font-semibold text-[#4a4545]">
                  In wishlist
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      target={linkTarget}
      rel={linkRel}
      scroll={false}
      data-clickable-container="true"
      className="block overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]"
    >
      <div className="relative aspect-[1/1] overflow-hidden bg-white">
        <BlurhashImage
          src={image?.imageUrl ?? ""}
          blurHash={image?.blurHashUrl ?? ""}
          alt={titleText}
          sizes={PRODUCT_CARD_GRID_IMAGE_SIZES}
          className="h-full w-full"
          imageClassName="object-cover"
        />
      </div>

      <div className="space-y-2 px-4 py-4 sm:px-4 sm:py-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
          <span className="text-[#907d4c]">{brandText}</span>
          {saleActive ? (
            <span className="rounded-full bg-[rgba(203,178,107,0.18)] px-2 py-0.5 text-[#4a4545]">
              On sale
            </span>
          ) : null}
        </div>

        <h2 className="text-[15px] font-semibold leading-[1.18] text-[#202020] sm:text-[16px]">
          {titleText}
        </h2>

        <div className="flex flex-wrap items-center gap-2 text-[11px] leading-none text-[#57636c]">
          <span>{variantCount} variants</span>
          <span>•</span>
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
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] leading-none text-[#57636c]">
          {reviewState ? (
            <span className="inline-flex items-center gap-1 text-[#4a4545]">
              <span className="text-[#cbb26b]">★</span>
              {reviewState.label}
            </span>
          ) : (
            <span>No reviews yet</span>
          )}
        </div>

        {price ? (
          <p className="pt-1 text-[20px] font-semibold leading-none tracking-tight text-[#4a4545]">
            {price}
          </p>
        ) : (
          <p className="pt-1 text-[12px] text-[#8b94a3]">Price unavailable</p>
        )}
      </div>
    </Link>
  );
}

export async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const resolvedSearchParams = await Promise.resolve(searchParams);
  const requestedUniqueId = currentParam(resolvedSearchParams, "unique_id") || currentParam(resolvedSearchParams, "id");
  if (requestedUniqueId) {
    const payload = await fetchProducts(resolvedSearchParams, origin);
    const singleItem = payload.data ? { id: payload.id, data: payload.data } : null;

    if (singleItem) {
      const currentVariantId = currentParam(resolvedSearchParams, "variant_id");
      const singleProductBackHref = buildProductsHref(resolvedSearchParams, { id: undefined, unique_id: undefined });
      const sellerUnavailable = Boolean(singleItem.data?.seller_unavailable);

      if (sellerUnavailable) {
        const unavailableMessage =
          singleItem.data?.seller_unavailable_reason_message ||
          "This seller is no longer open for business on our marketplace.";

        return (
          <PageBody className="px-3 py-4 text-[#202020] lg:px-4 lg:py-6">
            <section className="rounded-[8px] bg-white p-6 text-center shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Seller unavailable</p>
              <h1 className="mt-2 text-[28px] font-semibold leading-tight text-[#202020]">
                This seller is no longer open for business on our marketplace.
              </h1>
              <p className="mt-2 text-[13px] leading-[1.7] text-[#57636c]">{unavailableMessage}</p>
              <div className="mt-4 flex justify-center">
                <Link
                  href="/products"
                  scroll={false}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
                >
                  Back to products
                </Link>
              </div>
            </section>
          </PageBody>
        );
      }

      const productId = String(singleItem.data?.product?.unique_id ?? singleItem.id ?? "").trim();
      const [oftenBoughtRail, similarRail] = await Promise.all([
        fetchRecommendationRail(origin, "often-bought-together", productId),
        fetchRecommendationRail(origin, "similar", productId),
      ]);

      return (
        <PageBody className="px-3 py-4 text-[#202020] lg:px-4 lg:py-6">
          <SingleProductView
            item={singleItem}
            backHref={singleProductBackHref}
            selectedVariantId={currentVariantId}
            recommendationRails={{
              oftenBought: oftenBoughtRail,
              similar: similarRail,
            }}
          />
        </PageBody>
      );
    }
  }

  const [payload, catalogPayload] = await Promise.all([
    fetchProducts(resolvedSearchParams, origin),
    fetchProducts({ isActive: "true", limit: "9999" }, origin),
  ]);
  const rawItems = payload.items ?? payload.groups?.flatMap((group) => group.items ?? []) ?? [];

  const catalogItems = catalogPayload.items ?? catalogPayload.groups?.flatMap((group) => group.items ?? []) ?? [];
  const items = rawItems.filter((item): item is ProductItem => Boolean(item?.data));
  const placement = currentParam(resolvedSearchParams, "search") ? "search_results" : "category_grid";
  const displayItems = items;
  const countItems = catalogItems.filter((item): item is ProductItem => Boolean(item?.data));
  const options = payload.options ?? {};
  const title = payload.data?.product?.title ?? getPageTitle(resolvedSearchParams);
  const totalCount = payload.total ?? displayItems.length;
  const count = payload.count ?? displayItems.length;
  const derivedPriceRange = getProductsPriceRange(displayItems);
  const categoryCounts = countBy(countItems, (item) => item.data?.grouping?.category ?? "");
  const subCategoryCounts = countBy(countItems, (item) => item.data?.grouping?.subCategory ?? "");
  const brandCounts = countBy(countItems, (item) => item.data?.grouping?.brand ?? item.data?.brand?.slug ?? "");
  const kindCounts = countBy(countItems, (item) => item.data?.grouping?.kind ?? "");
  const packUnitCounts = countBy(countItems, (item) => getPackUnit(item));
  const attributeFilters = buildAttributeFilterData(countItems);
  const ratingCounts: FilterCountMap = {
    4: countRatings(countItems, 4),
    3: countRatings(countItems, 3),
    2: countRatings(countItems, 2),
    1: countRatings(countItems, 1),
  };

  const currentCategory = currentParam(resolvedSearchParams, "category");
  const currentSubCategory = currentParam(resolvedSearchParams, "subCategory");
  const currentBrand = currentParam(resolvedSearchParams, "brand");
  const currentKind = currentParam(resolvedSearchParams, "kind");
  const currentPackUnit = currentParam(resolvedSearchParams, "packUnit");
  const currentAttributeFilters = Object.fromEntries(
    ATTRIBUTE_FILTERS.map((config) => [config.key, currentParam(resolvedSearchParams, config.key) ?? ""]),
  ) as Record<string, string>;
  const currentInStock = currentParam(resolvedSearchParams, "inStock") === "true";
  const currentOnSale = currentParam(resolvedSearchParams, "onSale") === "true";
  const currentNewArrivals = currentParam(resolvedSearchParams, "newArrivals") === "true";
  const currentFeatured = currentParam(resolvedSearchParams, "isFeatured") === "true";
  const currentMinRating = currentNumberParam(resolvedSearchParams, "minRating");
  const currentView = currentParam(resolvedSearchParams, "view") === "list" ? "list" : "grid";
  const currentSort = currentParam(resolvedSearchParams, "sort") ?? "relevance";
  const personalizedMode = currentParam(resolvedSearchParams, "personalized");
  const imageSearchActive = currentParam(resolvedSearchParams, "imageSearch") === "true";
  const imageSearchLabel = currentParam(resolvedSearchParams, "imageLabel");
  const currentBrandCount = currentBrand ? brandCounts[currentBrand] ?? 0 : 0;
  const baseParams = resolvedSearchParams;
  const optionPriceRange =
    options.priceRange?.min != null && options.priceRange?.max != null
      ? {
          min: toDisplayVat(options.priceRange.min) ?? options.priceRange.min,
          max: toDisplayVat(options.priceRange.max) ?? options.priceRange.max,
        }
      : undefined;
  const priceRange = mergePriceRanges(derivedPriceRange, optionPriceRange);
  const activePriceRange = priceRange ?? derivedPriceRange;
  const priceHistogram = activePriceRange
    ? buildPriceHistogram(displayItems, activePriceRange.min, activePriceRange.max)
    : [];
  const filterOptions = { ...options, attributeFilters, priceRange: activePriceRange ?? undefined };
  const brandBannerBase = getBrandBanner(countItems, currentBrand ?? undefined);
  const brandBannerRemote = await fetchBrandBannerImage(currentBrand ?? undefined, origin);
  const brandBanner = brandBannerBase
    ? {
        ...brandBannerBase,
        ...brandBannerRemote,
        imageUrl: brandBannerRemote?.imageUrl ?? brandBannerBase.imageUrl ?? null,
        blurHashUrl: brandBannerRemote?.blurHashUrl ?? brandBannerBase.blurHashUrl ?? null,
      }
      : brandBannerRemote
      ? {
          title: brandBannerRemote.title ?? humanizeSlug(currentBrand ?? ""),
          description: brandBannerRemote.description ?? null,
          productCount: currentBrandCount,
          imageUrl: brandBannerRemote.imageUrl ?? null,
          blurHashUrl: brandBannerRemote.blurHashUrl ?? null,
        }
      : null;
  const hasActiveFilters =
    Boolean(currentCategory) ||
    Boolean(currentSubCategory) ||
    Boolean(currentBrand) ||
    Boolean(currentKind) ||
    Boolean(currentPackUnit) ||
    attributeFilters.some((config) => Boolean(currentAttributeFilters[config.key])) ||
    currentInStock ||
    currentOnSale ||
    currentNewArrivals ||
    currentFeatured ||
    currentMinRating != null;

  const clearHref = "/products";
  const openInNewTab = currentParam(resolvedSearchParams, "openInNewTab") !== "false";

  return (
    <PageBody className="px-3 py-4 text-[#202020] lg:px-4 lg:py-6">
      <section className="rounded-[8px] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Browse products</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight text-[#202020]">{title}</h1>
            <ResultsCount
              initialCount={count}
              totalCount={totalCount}
              mode="sentence"
              className="mt-2 text-[14px] text-[#57636c]"
            />
          </div>
          {hasActiveFilters ? (
            <Link
              href={clearHref}
              scroll={false}
              className="rounded-full bg-[#f7f7f7] px-3 py-2 text-[12px] font-semibold text-[#57636c] transition-colors hover:text-[#202020]"
            >
              Clear all
            </Link>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {imageSearchActive ? (
            <ToggleFilter
              title={imageSearchLabel ? `Image match: ${imageSearchLabel}` : "Image search"}
              enabled
              href={buildProductsHref(baseParams, { imageSearch: undefined, imageLabel: undefined })}
              scroll={false}
            />
          ) : null}
          {currentCategory ? (
            <ToggleFilter
              title={humanizeSlug(currentCategory)}
              enabled
              href={buildProductsHref(baseParams, { category: undefined })}
              scroll={false}
            />
          ) : null}
          {currentSubCategory ? (
            <ToggleFilter
              title={humanizeSlug(currentSubCategory)}
              enabled
              href={buildProductsHref(baseParams, { subCategory: undefined })}
              scroll={false}
            />
          ) : null}
          {currentBrand ? (
            <ToggleFilter
              title={humanizeSlug(currentBrand)}
              enabled
              href={buildProductsHref(baseParams, { brand: undefined })}
              scroll={false}
            />
          ) : null}
          {currentKind ? (
            <ToggleFilter
              title={humanizeSlug(currentKind)}
              enabled
              href={buildProductsHref(baseParams, { kind: undefined })}
              scroll={false}
            />
          ) : null}
          {currentPackUnit ? (
            <ToggleFilter
              title={currentPackUnit}
              enabled
              href={buildProductsHref(baseParams, { packUnit: undefined })}
              scroll={false}
            />
          ) : null}
          {attributeFilters.map((config) => {
            const activeValue = currentAttributeFilters[config.key];
            return activeValue ? (
              <ToggleFilter
                key={`active-${config.key}`}
                title={activeValue}
                enabled
                href={buildProductsHref(baseParams, { [config.key]: undefined })}
                scroll={false}
              />
            ) : null;
          })}
          {currentMinRating != null ? (
            <ToggleFilter
              title={`${currentMinRating} ★ and up`}
              enabled
              href={buildProductsHref(baseParams, { minRating: undefined })}
              scroll={false}
            />
          ) : null}
          {currentNewArrivals ? (
            <ToggleFilter
              title="New arrivals"
              enabled
              href={buildProductsHref(baseParams, { newArrivals: undefined })}
              scroll={false}
            />
          ) : null}
        </div>

        {imageSearchActive ? (
          <div className="mt-4 rounded-[16px] border border-[#e5dcc1] bg-[#fcfbf7] px-4 py-3 text-[13px] text-[#5f5a4a]">
            Showing visual matches{imageSearchLabel ? ` for "${imageSearchLabel}"` : ""}. Refine the results with filters if you want to narrow the match.
          </div>
        ) : null}
        {!imageSearchActive && personalizedMode === "recently-viewed" ? (
          <div className="mt-4 rounded-[16px] border border-[#e7e1d3] bg-[#faf8f3] px-4 py-3 text-[13px] text-[#5f5a4a]">
            Showing the products you recently viewed.
          </div>
        ) : null}
        {!imageSearchActive && personalizedMode === "recommended" ? (
          <div className="mt-4 rounded-[16px] border border-[#e7e1d3] bg-[#faf8f3] px-4 py-3 text-[13px] text-[#5f5a4a]">
            Showing products based on your recent browsing and search history.
          </div>
        ) : null}
        {!imageSearchActive && personalizedMode === "search-history" ? (
          <div className="mt-4 rounded-[16px] border border-[#e7e1d3] bg-[#faf8f3] px-4 py-3 text-[13px] text-[#5f5a4a]">
            Showing products related to your recent searches.
          </div>
        ) : null}
      </section>

      <section className="mt-5 overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <ProductsToolbar
          resultsCount={count}
          currentView={currentView}
          currentSort={currentSort}
          openInNewTab={openInNewTab}
        />
      </section>

      <MobileProductFilters
        options={filterOptions}
        currentCategory={currentCategory ?? ""}
        currentSubCategory={currentSubCategory ?? ""}
        currentBrand={currentBrand ?? ""}
        currentKind={currentKind ?? ""}
        currentPackUnit={currentPackUnit ?? ""}
        currentAttributeFilters={currentAttributeFilters}
        currentMinRating={currentMinRating}
        currentInStock={currentInStock}
        currentOnSale={currentOnSale}
        currentNewArrivals={currentNewArrivals}
        currentFeatured={currentFeatured}
        currentMinPrice={activePriceRange?.min ?? 0}
        currentMaxPrice={activePriceRange?.max ?? 0}
        histogram={priceHistogram}
        counts={{
          categories: categoryCounts,
          subCategories: subCategoryCounts,
          brands: brandCounts,
          kinds: kindCounts,
          packUnits: packUnitCounts,
          attributes: Object.fromEntries(attributeFilters.map((config) => [config.key, config.counts])),
          ratings: ratingCounts,
        }}
      />

      <section className="mt-5 grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden h-fit self-start rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)] lg:block">
          <div className="flex items-center justify-between border-b border-black/5 pb-4">
            <h2 className="text-[16px] font-semibold text-[#202020]">Filters</h2>
        <Link href={clearHref} scroll={false} className="text-[12px] font-semibold text-[#907d4c]">
            Reset
          </Link>
          </div>

          <div className="mt-5 space-y-5">
            <FilterGroup
              title="Category"
              items={options.categories ?? []}
              currentValue={currentCategory}
              baseParams={baseParams}
              paramKey="category"
              counts={categoryCounts}
            />
            <FilterGroup
              title="Sub category"
              items={options.subCategories ?? []}
              currentValue={currentSubCategory}
              baseParams={baseParams}
              paramKey="subCategory"
              counts={subCategoryCounts}
            />
            <FilterGroup
              title="Brand"
              items={options.brands ?? []}
              currentValue={currentBrand}
              baseParams={baseParams}
              paramKey="brand"
              counts={brandCounts}
            />
            <FilterGroup
              title="Type"
              items={options.kinds ?? []}
              currentValue={currentKind}
              baseParams={baseParams}
              paramKey="kind"
              counts={kindCounts}
            />
            <FilterGroup
              title="Pack unit"
              items={options.packUnits ?? []}
              currentValue={currentPackUnit}
              baseParams={baseParams}
              paramKey="packUnit"
              counts={packUnitCounts}
              formatItemLabel={(value) => value}
            />
            {attributeFilters.map((config) => (
              <FilterGroup
                key={config.key}
                title={config.title}
                items={config.items}
                currentValue={currentAttributeFilters[config.key]}
                baseParams={baseParams}
                paramKey={config.key}
                counts={config.counts}
                formatItemLabel={(value) => value}
              />
            ))}
            <RatingFilterGroup
              baseParams={baseParams}
              currentMinRating={currentMinRating}
              counts={ratingCounts}
            />

            <section className="border-b border-black/5 pb-5">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">
                Availability
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <ToggleFilter
                  title="In stock"
                  enabled={currentInStock}
                  href={buildProductsHref(baseParams, { inStock: currentInStock ? undefined : "true" })}
                  scroll={false}
                />
                <ToggleFilter
                  title="On sale"
                  enabled={currentOnSale}
                  href={buildProductsHref(baseParams, { onSale: currentOnSale ? undefined : "true" })}
                  scroll={false}
                />
                <ToggleFilter
                  title="New arrivals"
                  enabled={currentNewArrivals}
                  href={buildProductsHref(baseParams, { newArrivals: currentNewArrivals ? undefined : "true" })}
                  scroll={false}
                />
                <ToggleFilter
                  title="Featured"
                  enabled={currentFeatured}
                  href={buildProductsHref(baseParams, { isFeatured: currentFeatured ? undefined : "true" })}
                  scroll={false}
                />
              </div>
            </section>

            {activePriceRange?.min != null && activePriceRange?.max != null ? (
              <section className="border-b border-black/5 pb-5">
                <PriceRangeFilter
                  min={activePriceRange.min}
                  max={activePriceRange.max}
                  currentMin={activePriceRange.min}
                  currentMax={activePriceRange.max}
                  histogram={priceHistogram}
                />
              </section>
            ) : null}
          </div>
        </aside>

        <section className="min-w-0">
        <ProductsResults
          initialItems={displayItems}
          currentSort={currentSort}
          currentView={currentView}
          openInNewTab={openInNewTab}
          searchParams={resolvedSearchParams}
          totalCount={totalCount}
          sponsoredPlacement={placement}
          sponsoredContext={{
            category: currentParam(resolvedSearchParams, "category") || undefined,
            subCategory: currentParam(resolvedSearchParams, "subCategory") || undefined,
            search: currentParam(resolvedSearchParams, "search") || undefined,
          }}
        />
        </section>
      </section>
      <FilterSnackbar />
    </PageBody>
  );
}

export default ProductsPage;
