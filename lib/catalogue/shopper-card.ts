import type { ProductShippingEligibilityResult } from "@/lib/catalogue/shipping-eligibility";

export type ShopperVisibleProductCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  brandLabel: string | null;
  brandHref: string | null;
  vendorLabel: string | null;
  vendorHref: string | null;
  categorySlug: string | null;
  subCategorySlug: string | null;
  image: {
    imageUrl: string | null;
    blurHashUrl: string | null;
    imageCount: number;
    videoUrl?: string | null;
    images?: Array<{
      imageUrl: string | null;
      blurHashUrl: string | null;
    }>;
  };
  price: {
    amountIncl: number | null;
    compareAtIncl: number | null;
    onSale: boolean;
    salePercent: number | null;
    currencyCode: string;
  };
  purchase: {
    defaultVariantId: string | null;
  };
  stock: {
    state: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
    label: string;
    availableQty: number | null;
  };
  review: {
    average: number | null;
    count: number;
    label: string | null;
  };
  merchandising: {
    isPreLoved: boolean;
    isNewArrival: boolean;
    isSponsored: boolean;
  };
  // Badges are non-blocking in Phase 1. If upstream payloads do not already include
  // cheap badge data, the card remains renderable with badge omitted.
  badge?: {
    label: string;
    iconKey: string | null;
    iconUrl: string | null;
    backgroundColor: string | null;
    foregroundColor: string | null;
  } | null;
  shipping: ProductShippingEligibilityResult;
};

function toText(value: unknown): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toStockState(availableQty: number | null, continueSellingOutOfStock = false): ShopperVisibleProductCard["stock"]["state"] {
  if (continueSellingOutOfStock) return "in_stock";
  if (availableQty == null) return "unknown";
  if (availableQty <= 0) return "out_of_stock";
  if (availableQty <= 2) return "low_stock";
  return "in_stock";
}

function buildStockLabel(state: ShopperVisibleProductCard["stock"]["state"], availableQty: number | null): string {
  if (state === "out_of_stock") return "Out of stock";
  if (state === "low_stock") return `Only ${availableQty} left`;
  if (state === "in_stock") return "In stock";
  return "Stock unknown";
}

export function buildShopperVisibleProductCard({
  product,
  eligibility,
}: {
  product: Record<string, unknown>;
  eligibility: ProductShippingEligibilityResult;
}): ShopperVisibleProductCard {
  const image = product.image && typeof product.image === "object" ? (product.image as Record<string, unknown>) : {};
  const images = Array.isArray((image as any).images) ? ((image as any).images as Array<Record<string, unknown>>) : [];
  const price = product.price && typeof product.price === "object" ? (product.price as Record<string, unknown>) : {};
  const review = product.review && typeof product.review === "object" ? (product.review as Record<string, unknown>) : {};
  const merchandising =
    product.merchandising && typeof product.merchandising === "object"
      ? (product.merchandising as Record<string, unknown>)
      : {};
  const badge = product.badge && typeof product.badge === "object" ? (product.badge as Record<string, unknown>) : null;

  const availableQty = toNumber(
    product.availableQty ??
      product.availableQuantity ??
      (product.stock && typeof product.stock === "object" ? (product.stock as Record<string, unknown>).availableQty : null),
  );
  const continueSellingOutOfStock =
    product.continueSellingOutOfStock === true ||
    product.continue_selling_out_of_stock === true ||
    (product.stock && typeof product.stock === "object"
      ? (product.stock as Record<string, unknown>).continueSellingOutOfStock === true ||
        (product.stock as Record<string, unknown>).continue_selling_out_of_stock === true
      : false);
  const shopperAvailableQty = continueSellingOutOfStock ? null : availableQty;
  const stockState = toStockState(shopperAvailableQty, continueSellingOutOfStock);
  const amountIncl = toNumber(price.amountIncl ?? price.amount_incl ?? product.amountIncl);
  const compareAtIncl = toNumber(price.compareAtIncl ?? price.compare_at_incl ?? product.compareAtIncl);
  const onSale = amountIncl != null && compareAtIncl != null && compareAtIncl > amountIncl;
  const salePercent =
    onSale && amountIncl != null && compareAtIncl != null && compareAtIncl > 0
      ? Math.round(((compareAtIncl - amountIncl) / compareAtIncl) * 100)
      : null;

  return {
    id: String(product.id ?? product.unique_id ?? product.productId ?? ""),
    slug: String(product.slug ?? product.handle ?? product.urlSlug ?? ""),
    title: String(product.title ?? product.productTitle ?? ""),
    subtitle: toText(product.subtitle ?? product.variantLabel),
    brandLabel: toText(product.brandLabel ?? product.brand),
    brandHref: toText(product.brandHref),
    vendorLabel: toText(product.vendorLabel ?? product.sellerName),
    vendorHref: toText(product.vendorHref),
    categorySlug: toText(product.categorySlug ?? product.category),
    subCategorySlug: toText(product.subCategorySlug ?? product.subCategory),
    image: {
      imageUrl: toText(image.imageUrl ?? image.url ?? product.imageUrl),
      blurHashUrl: toText(image.blurHashUrl ?? image.blurHash ?? product.blurHashUrl),
      imageCount: Math.max(0, Number(image.imageCount ?? product.imageCount ?? 0) || 0),
      videoUrl: toText(image.previewUrl ?? image.videoUrl ?? image.video ?? product.previewUrl ?? product.videoUrl ?? product.video),
      images: images
        .map((entry) => ({
          imageUrl: toText(entry.imageUrl ?? entry.url),
          blurHashUrl: toText(entry.blurHashUrl ?? entry.blurHash),
        }))
        .filter((entry) => Boolean(entry.imageUrl)),
    },
    price: {
      amountIncl,
      compareAtIncl,
      onSale,
      salePercent,
      currencyCode: String(price.currencyCode ?? price.currency ?? product.currencyCode ?? "ZAR"),
    },
    purchase: {
      defaultVariantId: toText(product.defaultVariantId ?? product.variantId),
    },
    stock: {
      state: stockState,
      label: buildStockLabel(stockState, shopperAvailableQty),
      availableQty: shopperAvailableQty,
    },
    review: {
      average: toNumber(review.average ?? review.averageRating),
      count: Math.max(0, Number(review.count ?? review.reviewCount ?? 0) || 0),
      label: toText(review.label),
    },
    merchandising: {
      isPreLoved: merchandising.isPreLoved === true || merchandising.preLoved === true,
      isNewArrival: merchandising.isNewArrival === true || merchandising.newArrival === true,
      isSponsored: merchandising.isSponsored === true || merchandising.sponsored === true,
    },
    badge: badge
      ? {
          label: String(badge.label ?? ""),
          iconKey: toText(badge.iconKey),
          iconUrl: toText(badge.iconUrl),
          backgroundColor: toText(badge.backgroundColor),
          foregroundColor: toText(badge.foregroundColor),
        }
      : null,
    shipping: eligibility,
  };
}
