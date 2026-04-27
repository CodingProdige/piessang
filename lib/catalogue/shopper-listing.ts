import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";
import { resolveShopperVisibleProductCard } from "@/lib/catalogue/shopper-visible-product";
import type {
  ShippingEligibilityContext,
  ShippingEligibilityProductInput,
  ShippingEligibilitySellerInput,
} from "@/lib/catalogue/shipping-eligibility";
import { normalizeShopperLocation, type ShopperLocation } from "@/lib/shopper/location";

export type ShopperListingResponse = {
  items: ShopperVisibleProductCard[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  filters: {
    categories: Array<{ slug: string; title: string; count: number }>;
    subCategories: Array<{ slug: string; title: string; categorySlug: string; count: number }>;
    brands: Array<{ slug: string; title: string; count: number }>;
    priceRange: { min: number; max: number };
  };
};

export type ShopperListingCandidate = {
  id: string;
  data: Record<string, unknown>;
};

function toText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasPreciseDestination(location: ShopperLocation | null | undefined): boolean {
  if (!location?.countryCode) return false;
  return Boolean(location.postalCode || location.province || location.city || location.suburb);
}

function sortCountItems<T extends { count: number; title: string }>(items: T[]) {
  return items.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  });
}

function buildFilters(items: ShopperVisibleProductCard[]): ShopperListingResponse["filters"] {
  const categoryMap = new Map<string, { slug: string; title: string; count: number }>();
  const subCategoryMap = new Map<string, { slug: string; title: string; categorySlug: string; count: number }>();
  const brandMap = new Map<string, { slug: string; title: string; count: number }>();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    if (item.categorySlug) {
      const existing = categoryMap.get(item.categorySlug) || {
        slug: item.categorySlug,
        title: item.categorySlug.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        count: 0,
      };
      existing.count += 1;
      categoryMap.set(item.categorySlug, existing);
    }

    if (item.subCategorySlug) {
      const existing = subCategoryMap.get(item.subCategorySlug) || {
        slug: item.subCategorySlug,
        title: item.subCategorySlug.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        categorySlug: item.categorySlug || "",
        count: 0,
      };
      existing.count += 1;
      subCategoryMap.set(item.subCategorySlug, existing);
    }

    if (item.brandLabel) {
      const slug = item.brandHref ? decodeURIComponent(item.brandHref.split("brand=")[1] || item.brandLabel) : item.brandLabel;
      const existing = brandMap.get(slug) || {
        slug,
        title: item.brandLabel,
        count: 0,
      };
      existing.count += 1;
      brandMap.set(slug, existing);
    }

    if (typeof item.price.amountIncl === "number" && Number.isFinite(item.price.amountIncl)) {
      min = Math.min(min, item.price.amountIncl);
      max = Math.max(max, item.price.amountIncl);
    }
  }

  return {
    categories: sortCountItems(Array.from(categoryMap.values())),
    subCategories: sortCountItems(Array.from(subCategoryMap.values())),
    brands: sortCountItems(Array.from(brandMap.values())),
    priceRange: {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
    },
  };
}

export async function resolveShopperVisibleProducts({
  items,
  shopperLocation,
  page = 1,
  pageSize = items.length || 0,
  getCourierContext,
}: {
  items: ShopperListingCandidate[];
  shopperLocation: ShopperLocation | null | undefined;
  page?: number;
  pageSize?: number;
  getCourierContext?: (input: {
    candidate: ShopperListingCandidate;
    seller: ShippingEligibilitySellerInput;
    product: ShippingEligibilityProductInput;
    shopperLocation: ShopperLocation;
  }) => ShippingEligibilityContext | Promise<ShippingEligibilityContext>;
}): Promise<ShopperListingResponse> {
  const normalizedShopperLocation = normalizeShopperLocation(shopperLocation);
  const visibleItems: ShopperVisibleProductCard[] = [];

  for (const candidate of Array.isArray(items) ? items : []) {
    const visibleCard = await resolveShopperVisibleProductCard({
      candidate,
      shopperLocation: normalizedShopperLocation,
      getCourierContext,
    });
    if (visibleCard) visibleItems.push(visibleCard);
  }

  const total = visibleItems.length;
  const start = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, pageSize));
  const end = pageSize > 0 ? start + pageSize : undefined;
  const pagedItems = end == null ? visibleItems : visibleItems.slice(start, end);

  return {
    items: pagedItems,
    total,
    page: Math.max(1, page),
    pageSize: Math.max(0, pageSize),
    hasMore: end != null ? end < total : false,
    filters: buildFilters(visibleItems),
  };
}
