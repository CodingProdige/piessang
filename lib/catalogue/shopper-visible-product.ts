import { buildShopperVisibleProductCard, type ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";
import {
  productHasListableAvailability,
  variantCanContinueSellingOutOfStock,
  variantIsListable,
  variantTotalInStockItemsAvailable,
} from "@/lib/catalogue/availability";
import { normalizeCategorySlug } from "@/lib/catalogue/category-normalize";
import { pickPrimaryOfferVariant } from "@/lib/catalogue/offer-group";
import {
  buildShippingEligibilityProductInputFromRawItem,
  buildShippingEligibilitySellerInputFromRawItem,
} from "@/lib/catalogue/shipping-eligibility-adapters";
import {
  resolveProductShippingEligibility,
  type ShippingEligibilityContext,
  type ShippingEligibilityProductInput,
  type ShippingEligibilitySellerInput,
} from "@/lib/catalogue/shipping-eligibility";
import { normalizeShopperLocation, type ShopperLocation } from "@/lib/shopper/location";

export type ShopperVisibleProductCandidate = {
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

function buildSellerInput(candidate: ShopperVisibleProductCandidate): ShippingEligibilitySellerInput {
  return buildShippingEligibilitySellerInputFromRawItem(candidate);
}

function buildProductInput(candidate: ShopperVisibleProductCandidate): ShippingEligibilityProductInput {
  return buildShippingEligibilityProductInputFromRawItem(candidate);
}

function hasPreciseDestination(location: ShopperLocation | null | undefined): boolean {
  if (!location?.countryCode) return false;
  return Boolean(location.postalCode || location.province || location.city || location.suburb);
}

function buildCardSource(candidate: ShopperVisibleProductCandidate): Record<string, unknown> {
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
  const listableVariants = variants.filter((variant) => variantIsListable(variant));
  const primaryVariant = pickPrimaryOfferVariant(listableVariants) || listableVariants[0] || pickPrimaryOfferVariant(variants) || defaultVariant;
  const productImages =
    data.media && typeof data.media === "object" && Array.isArray((data.media as any).images)
      ? ((data.media as any).images as Array<Record<string, unknown>>)
      : [];
  const productVideos =
    data.media && typeof data.media === "object" && Array.isArray((data.media as any).videos)
      ? ((data.media as any).videos as Array<Record<string, unknown>>)
          .filter((entry) => toText(entry?.previewUrl ?? entry?.videoUrl ?? entry?.url ?? entry?.sourceUrl))
          .sort((a, b) => (Number((a as any)?.position) || 0) - (Number((b as any)?.position) || 0))
      : [];
  const variantImages =
    primaryVariant?.media && typeof primaryVariant.media === "object" && Array.isArray((primaryVariant.media as any).images)
      ? ((primaryVariant.media as any).images as Array<Record<string, unknown>>)
      : [];
  const primaryImage = productImages.find((entry) => toText(entry?.imageUrl)) || variantImages.find((entry) => toText(entry?.imageUrl)) || null;
  const cardImages = [...productImages, ...variantImages].filter((entry) => toText(entry?.imageUrl));

  const saleActive = primaryVariant?.sale && typeof primaryVariant.sale === "object" && (primaryVariant.sale as any).is_on_sale === true;
  const amountIncl = toNumber(
    saleActive
      ? (primaryVariant as any)?.sale?.sale_price_incl ?? (primaryVariant as any)?.sale?.sale_price_excl
      : (primaryVariant as any)?.pricing?.selling_price_incl ?? (primaryVariant as any)?.pricing?.selling_price_excl,
  );
  const compareAtIncl = saleActive
    ? toNumber((primaryVariant as any)?.pricing?.selling_price_incl ?? (primaryVariant as any)?.pricing?.selling_price_excl)
    : null;
  const primaryVariantAvailableQty =
    primaryVariant && typeof primaryVariant === "object"
      ? toNumber((primaryVariant as any)?.total_in_stock_items_available) ?? variantTotalInStockItemsAvailable(primaryVariant)
      : null;
  const primaryVariantCanContinueSellingOutOfStock =
    primaryVariant && typeof primaryVariant === "object"
      ? variantCanContinueSellingOutOfStock(primaryVariant)
      : false;

  return {
    id: candidate.id,
    slug:
      toText((product as any).titleSlug) ||
      toText(product.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""),
    title: toText(product.title),
    subtitle: toText(primaryVariant?.label),
    brandLabel: toText((brand as any).title || (product as any).brandTitle || (product as any).brand),
    brandHref: toText((brand as any).slug) ? `/products?brand=${encodeURIComponent(toText((brand as any).slug))}` : null,
    vendorLabel: toText((vendor as any).title || (product as any).vendorName || (seller as any).vendorName),
    vendorHref: toText((seller as any).sellerSlug || (product as any).sellerSlug)
      ? `/vendors/${encodeURIComponent(toText((seller as any).sellerSlug || (product as any).sellerSlug))}`
      : null,
    categorySlug: normalizeCategorySlug((grouping as any).category),
    subCategorySlug: normalizeCategorySlug((grouping as any).subCategory),
    image: {
      imageUrl: toText(primaryImage?.imageUrl) || null,
      blurHashUrl: toText(primaryImage?.blurHashUrl) || null,
      imageCount: productImages.filter((entry) => toText(entry?.imageUrl)).length + variantImages.filter((entry) => toText(entry?.imageUrl)).length,
      videoUrl: toText(productVideos[0]?.previewUrl ?? productVideos[0]?.videoUrl ?? productVideos[0]?.url ?? productVideos[0]?.sourceUrl ?? (data.media as any)?.video) || null,
      images: cardImages.map((entry) => ({
        imageUrl: toText(entry?.imageUrl) || null,
        blurHashUrl: toText(entry?.blurHashUrl) || null,
      })),
    },
    price: {
      amountIncl,
      compareAtIncl,
      currencyCode: "ZAR",
    },
    defaultVariantId: toText((primaryVariant as any)?.variant_id) || null,
    availableQty: primaryVariantAvailableQty,
    continueSellingOutOfStock: primaryVariantCanContinueSellingOutOfStock,
    review: {
      average: toNumber((ratings as any).average),
      count: toNumber((ratings as any).count) || 0,
      label: null,
    },
    merchandising: {
      isPreLoved: (data as any).is_pre_loved === true || normalizeCategorySlug((grouping as any).category) === "pre-loved",
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

export async function resolveShopperVisibleProductCard({
  candidate,
  shopperLocation,
  getCourierContext,
}: {
  candidate: ShopperVisibleProductCandidate;
  shopperLocation: ShopperLocation | null | undefined;
  getCourierContext?: (input: {
    candidate: ShopperVisibleProductCandidate;
    seller: ShippingEligibilitySellerInput;
    product: ShippingEligibilityProductInput;
    shopperLocation: ShopperLocation;
  }) => ShippingEligibilityContext | Promise<ShippingEligibilityContext>;
}): Promise<ShopperVisibleProductCard | null> {
  if (!productHasListableAvailability(candidate.data)) return null;

  const normalizedShopperLocation = normalizeShopperLocation(shopperLocation);
  const seller = buildSellerInput(candidate);
  const product = buildProductInput(candidate);
  const eligibility = await resolveProductShippingEligibility({
    product,
    seller,
    shopperLocation: normalizedShopperLocation,
    context:
      (await getCourierContext?.({
        candidate,
        seller,
        product,
        shopperLocation: normalizedShopperLocation,
      })) || { destinationKnown: hasPreciseDestination(normalizedShopperLocation) },
  });

  if (!eligibility.isVisible) return null;

  return buildShopperVisibleProductCard({
    product: buildCardSource(candidate),
    eligibility,
  });
}
