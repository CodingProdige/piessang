"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrowseProductCard, type ProductItem } from "@/components/products/browse-product-card";
import { ProductCard } from "@/components/products/product-card";
import { hasShopperFacingProductImage } from "@/components/products/products-results";
import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";
import { resolveRawItemShippingEligibility } from "@/lib/catalogue/shipping-eligibility-adapters";
import {
  readShopperDeliveryArea,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";

export type ProductRailItem = ProductItem | ShopperVisibleProductCard;

function isResolvedRailProduct(item: ProductRailItem): item is ShopperVisibleProductCard {
  return !("data" in item);
}

export function ProductRailCarousel({
  title,
  subtitle,
  products,
  emptyMessage,
  hideWhenEmpty = false,
  mobileLeadingSpacer = true,
  viewAllHref = "/products",
  shopperArea: shopperAreaProp = null,
  mode = "shopper",
}: {
  title: string;
  subtitle?: string;
  products: ProductRailItem[];
  emptyMessage: string;
  hideWhenEmpty?: boolean;
  mobileLeadingSpacer?: boolean;
  viewAllHref?: string;
  shopperArea?: ShopperDeliveryArea | null;
  mode?: "shopper" | "admin-preview";
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [shopperArea, setShopperArea] = useState<ShopperDeliveryArea | null>(null);
  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      if (!hasShopperFacingProductImage(product)) return false;
      if (!("data" in product)) return true;
      if (mode !== "admin-preview") return false;
      const eligibility = resolveRawItemShippingEligibility(product, shopperArea);
      return eligibility.isVisible;
    });
  }, [mode, products, shopperArea]);

  useEffect(() => {
    if (shopperAreaProp) {
      setShopperArea(shopperAreaProp);
      return () => {};
    }
    setShopperArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea(setShopperArea);
  }, [shopperAreaProp]);

  const showControls = useMemo(() => visibleProducts.length > 1, [visibleProducts.length]);

  if (hideWhenEmpty && visibleProducts.length === 0) {
    return null;
  }

  function scrollByCard(direction: -1 | 1) {
    const node = trackRef.current;
    if (!node) return;
    const firstCard = node.querySelector<HTMLElement>("[data-rail-card='true']");
    const cardWidth = firstCard?.offsetWidth || 240;
    node.scrollBy({ left: direction * (cardWidth + 16), behavior: "smooth" });
  }

  return (
    <section className="w-full">
      <div className="border-b border-[#e5e7eb] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{title}</p>
            {subtitle ? <p className="mt-2 max-w-[56ch] text-[13px] leading-[1.55] text-[#57636c] sm:text-[14px]">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-start pt-1">
            <Link
              href={viewAllHref}
              className="inline-flex items-center text-[13px] font-semibold text-[#145af2] transition-colors hover:text-[#0f49c7] sm:text-[14px]"
            >
              <span>View all</span>
            </Link>
          </div>
        </div>
      </div>

      {visibleProducts.length ? (
        <div className="relative mt-4 sm:mt-5">
          {showControls ? (
            <>
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                className="absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/8 bg-white text-[#202020] shadow-[0_10px_24px_rgba(20,24,27,0.12)] transition-all duration-150 hover:border-black/12 hover:shadow-[0_14px_30px_rgba(20,24,27,0.16)] active:scale-[0.94] active:bg-[#f5f6f7] active:shadow-[0_6px_14px_rgba(20,24,27,0.14)] md:inline-flex"
                aria-label="Scroll products left"
              >
                <ArrowLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                className="absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/8 bg-white text-[#202020] shadow-[0_10px_24px_rgba(20,24,27,0.12)] transition-all duration-150 hover:border-black/12 hover:shadow-[0_14px_30px_rgba(20,24,27,0.16)] active:scale-[0.94] active:bg-[#f5f6f7] active:shadow-[0_6px_14px_rgba(20,24,27,0.14)] md:inline-flex"
                aria-label="Scroll products right"
              >
                <ArrowRightIcon />
              </button>
            </>
          ) : null}
          <div
            ref={trackRef}
            className={[
              "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 [scrollbar-width:none] after:block after:h-px after:w-4 after:flex-none [&::-webkit-scrollbar]:hidden",
              mobileLeadingSpacer ? "before:block before:h-px before:w-4 before:flex-none" : "before:hidden",
            ].join(" ")}
          >
            {visibleProducts.map((product, index) => {
              const data = isResolvedRailProduct(product) ? null : product?.data || {};
              const brandSlug = isResolvedRailProduct(product)
                ? decodeURIComponent((product.brandHref || "").split("brand=")[1] || "").trim()
                : String(data?.brand?.slug || "").trim();
              const brandHref = isResolvedRailProduct(product)
                ? product.brandHref || "/products"
                : brandSlug
                  ? `/products?brand=${encodeURIComponent(brandSlug)}`
                  : "/products";
              const sellerIdentifier = isResolvedRailProduct(product)
                ? String((product.vendorHref || "").split("/vendors/")[1] || "").trim()
                : String(
                    data?.seller?.sellerCode || data?.product?.sellerCode || data?.seller?.sellerSlug || data?.product?.sellerSlug || "",
                  ).trim();
              const vendorHref = isResolvedRailProduct(product)
                ? product.vendorHref || "/products"
                : sellerIdentifier
                  ? `/vendors/${encodeURIComponent(sellerIdentifier)}`
                  : "/products";
              const brandLabel = isResolvedRailProduct(product)
                ? String(product.brandLabel || "").trim()
                : String(
                    data?.brand?.title || data?.product?.brandTitle || data?.product?.brand || data?.grouping?.brand || "",
                  ).trim();
              const vendorLabel = isResolvedRailProduct(product)
                ? String(product.vendorLabel || "").trim()
                : String(data?.seller?.vendorName || data?.product?.vendorName || "").trim();

              return (
                <div
                  key={String(product?.id || data?.docId || data?.product?.unique_id || index)}
                  data-rail-card="true"
                  className="w-[42vw] max-w-[172px] min-w-[42vw] snap-start sm:w-[190px] sm:min-w-[190px] lg:w-[220px] lg:min-w-[220px]"
                >
                  {isResolvedRailProduct(product) ? (
                    <ProductCard
                      item={product}
                      view="grid"
                      openInNewTab={true}
                      brandHref={brandHref}
                      vendorHref={vendorHref}
                      brandLabel={brandLabel || undefined}
                      vendorLabel={vendorLabel || undefined}
                      currentUrl=""
                      onAddToCartSuccess={() => {}}
                      cartBurstKey={0}
                    />
                  ) : mode === "admin-preview" ? (
                    <BrowseProductCard
                      item={product}
                      view="grid"
                      openInNewTab={true}
                      brandHref={brandHref}
                      vendorHref={vendorHref}
                      brandLabel={brandLabel || undefined}
                      vendorLabel={vendorLabel || undefined}
                      currentUrl=""
                      onAddToCartSuccess={() => {}}
                      cartBurstKey={0}
                      shopperArea={shopperArea}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[8px] border border-dashed border-black/10 px-4 py-10 text-[14px] text-[#7a8594]">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path
        d="M11.75 4.75 6.5 10l5.25 5.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path
        d="M8.25 4.75 13.5 10l-5.25 5.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default ProductRailCarousel;
