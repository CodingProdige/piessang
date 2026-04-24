import { buildShopperVisibleProductCard, type ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";
import {
  buildShippingEligibilityProductInputFromRawItem,
  buildShippingEligibilitySellerInputFromRawItem,
} from "@/lib/catalogue/shipping-eligibility-adapters";
import {
  resolveProductShippingEligibility,
  type ProductShippingEligibilityResult,
  type ShippingEligibilityContext,
  type ShippingEligibilityProductInput,
  type ShippingEligibilitySellerInput,
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

function toSlug(value: unknown): string {
  return toText(value).toLowerCase();
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sortCountItems<T extends { count: number; title: string }>(items: T[]) {
  return items.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  });
}

function buildSellerInput(candidate: ShopperListingCandidate): ShippingEligibilitySellerInput {
  return buildShippingEligibilitySellerInputFromRawItem(candidate);
}

function buildProductInput(candidate: ShopperListingCandidate): ShippingEligibilityProductInput {
  return buildShippingEligibilityProductInputFromRawItem(candidate);
}

function buildCardSource(candidate: ShopperListingCandidate): Record<string, unknown> {
  const data = candidate.data || {};
  const product = data.product && typeof data.product === "object" ? (data.product as Record<string, unknown>) : {};
  const grouping = data.grouping && typeof data.grouping === "object" ? (data.grouping as Record<string, unknown>) : {};
  const brand = data.brand && typeof data.brand === "object" ? (data.brand as Record<string, unknown>) : {};
  const vendor = data.vendor && typeof data.vendor === "object" ? (data.vendor as Record<string, unknown>) : {};
  const seller = data.seller && typeof data.seller === "object" ? (data.seller as Record<string, unknown>) : {};
  const ratings = data.ratings && typeof data.ratings === "object" ? (data.ratings as Record<string, unknown>) : {};
  const analytics = data.analytics && typeof data.analytics === "object" ? (data.analytics as Record<string, unknown>) : {};
  const variants = Array.isArray((data as any).variants) ? ((data as any).variants as Array<Record<string, unknown>>) : [];
  const defaultVariant =
    variants.find((variant) => variant?.placement && typeof variant.placement === "object" && (variant.placement as any).is_default === true) ||
    variants[0] ||
    null;
  const productImages =
    data.media && typeof data.media === "object" && Array.isArray((data.media as any).images)
      ? ((data.media as any).images as Array<Record<string, unknown>>)
      : [];
  const variantImages =
    defaultVariant?.media && typeof defaultVariant.media === "object" && Array.isArray((defaultVariant.media as any).images)
      ? ((defaultVariant.media as any).images as Array<Record<string, unknown>>)
      : [];
  const primaryImage = productImages.find((entry) => toText(entry?.imageUrl)) || variantImages.find((entry) => toText(entry?.imageUrl)) || null;

  const saleActive = defaultVariant?.sale && typeof defaultVariant.sale === "object" && (defaultVariant.sale as any).is_on_sale === true;
  const amountIncl = toNumber(
    saleActive
      ? (defaultVariant as any)?.sale?.sale_price_incl ?? (defaultVariant as any)?.sale?.sale_price_excl
      : (defaultVariant as any)?.pricing?.selling_price_incl ?? (defaultVariant as any)?.pricing?.selling_price_excl,
  );
  const compareAtIncl = saleActive
    ? toNumber((defaultVariant as any)?.pricing?.selling_price_incl ?? (defaultVariant as any)?.pricing?.selling_price_excl)
    : null;

  return {
    id: candidate.id,
    slug:
      toText((product as any).titleSlug) ||
      toText(product.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""),
    title: toText(product.title),
    subtitle: toText(defaultVariant?.label),
    brandLabel: toText((brand as any).title || (product as any).brandTitle || (product as any).brand),
    brandHref: toText((brand as any).slug) ? `/products?brand=${encodeURIComponent(toText((brand as any).slug))}` : null,
    vendorLabel: toText((vendor as any).title || (product as any).vendorName || (seller as any).vendorName),
    vendorHref: toText((seller as any).sellerSlug || (product as any).sellerSlug)
      ? `/vendors/${encodeURIComponent(toText((seller as any).sellerSlug || (product as any).sellerSlug))}`
      : null,
    categorySlug: toText((grouping as any).category),
    subCategorySlug: toText((grouping as any).subCategory),
    image: {
      imageUrl: toText(primaryImage?.imageUrl) || null,
      blurHashUrl: toText(primaryImage?.blurHashUrl) || null,
      imageCount: productImages.filter((entry) => toText(entry?.imageUrl)).length + variantImages.filter((entry) => toText(entry?.imageUrl)).length,
    },
    price: {
      amountIncl,
      compareAtIncl,
      currencyCode: "ZAR",
    },
    availableQty: toNumber((defaultVariant as any)?.total_in_stock_items_available),
    review: {
      average: toNumber((ratings as any).average),
      count: toNumber((ratings as any).count) || 0,
      label: null,
    },
    merchandising: {
      isPreLoved: (data as any).is_pre_loved === true || toSlug((grouping as any).category) === "pre-loved",
      isNewArrival: (data as any).is_new_arrival === true,
      isSponsored: false,
    },
    badge: analytics.badge
      ? {
          label: toText(analytics.badgeLabel || analytics.badge),
          iconKey: toText(analytics.badgeIconKey) || null,
          iconUrl: toText(analytics.badgeIconUrl) || null,
          backgroundColor: toText(analytics.badgeBackgroundColor) || null,
          foregroundColor: toText(analytics.badgeForegroundColor) || null,
        }
      : null,
  };
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

function buildNonSellerTransitionalEligibility(): ProductShippingEligibilityResult {
  return {
    isVisible: true,
    isPurchasable: true,
    localDeliveryEligible: false,
    courierEligible: false,
    collectionEligible: false,
    availableMethods: [],
    fulfillmentType: "none" as const,
    deliveryMessage: "Shipping options confirmed at checkout",
    deliveryTone: "neutral",
    deliveryPromiseLabel: null,
    deliveryCutoffText: null,
    estimatedMinDays: null,
    estimatedMaxDays: null,
    eligibilityReason: "unknown" as const,
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
    const seller = buildSellerInput(candidate);
    const product = buildProductInput(candidate);
    const fulfillmentMode = toText(product.fulfillment?.mode ?? seller.fulfillmentMode).toLowerCase();

    const eligibility =
      fulfillmentMode && fulfillmentMode !== "seller"
        ? buildNonSellerTransitionalEligibility()
        : resolveProductShippingEligibility({
            product,
            seller,
            shopperLocation: normalizedShopperLocation,
            context:
              (await getCourierContext?.({
                candidate,
                seller,
                product,
                shopperLocation: normalizedShopperLocation,
              })) || {},
          });

    if (!eligibility.isVisible) continue;

    visibleItems.push(
      buildShopperVisibleProductCard({
        product: buildCardSource(candidate),
        eligibility,
      }),
    );
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
