"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrowseProductCard, type ProductItem } from "@/components/products/browse-product-card";
import type { ShopperDeliveryArea } from "@/components/products/delivery-area-gate";

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProductPageRecommendations({
  title,
  subtitle,
  products,
  viewAllHref = "/products",
  shopperArea = null,
  className = "",
}: {
  title: string;
  subtitle: string;
  products: ProductItem[];
  viewAllHref?: string;
  shopperArea?: ShopperDeliveryArea | null;
  className?: string;
}) {
  if (!products.length) return null;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(products.length > 1);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const updateScrollState = () => {
      const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      setCanScrollLeft(node.scrollLeft > 8);
      setCanScrollRight(node.scrollLeft < maxScrollLeft - 8);
    };

    updateScrollState();
    node.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      node.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [products.length]);

  const scrollByCards = (direction: "left" | "right") => {
    const node = scrollerRef.current;
    if (!node) return;
    const distance = Math.max(node.clientWidth * 0.82, 280);
    node.scrollBy({
      left: direction === "right" ? distance : -distance,
      behavior: "smooth",
    });
  };

  return (
    <section className={`rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${className}`.trim()}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-[1.55] text-[#57636c] sm:text-[14px]">{subtitle}</p>
        </div>
        <Link
          href={viewAllHref}
          className="shrink-0 text-[13px] font-semibold text-[#145af2] transition-colors hover:text-[#0f49c7] sm:text-[14px]"
        >
          View all
        </Link>
      </div>

      <div className="relative mt-5">
        {products.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => scrollByCards("left")}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${title} left`}
              className={`absolute left-2 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-[#202020] shadow-[0_12px_26px_rgba(20,24,27,0.14)] transition md:inline-flex ${
                canScrollLeft ? "opacity-100 hover:border-black/20 hover:bg-[#faf8f2]" : "pointer-events-none opacity-0"
              }`}
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              onClick={() => scrollByCards("right")}
              disabled={!canScrollRight}
              aria-label={`Scroll ${title} right`}
              className={`absolute right-2 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-[#202020] shadow-[0_12px_26px_rgba(20,24,27,0.14)] transition md:inline-flex ${
                canScrollRight ? "opacity-100 hover:border-black/20 hover:bg-[#faf8f2]" : "pointer-events-none opacity-0"
              }`}
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : null}

        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-12"
        >
        {products.slice(0, 8).map((product, index) => {
          const data = product?.data || {};
          const brandSlug = String(data?.brand?.slug || "").trim();
          const brandHref = brandSlug ? `/products?brand=${encodeURIComponent(brandSlug)}` : "/products";
          const sellerIdentifier = String(
            data?.seller?.sellerCode ||
              data?.product?.sellerCode ||
              data?.seller?.sellerSlug ||
              data?.product?.sellerSlug ||
              "",
          ).trim();
          const vendorHref = sellerIdentifier ? `/vendors/${encodeURIComponent(sellerIdentifier)}` : "/products";
          const brandLabel = String(
            data?.brand?.title || data?.product?.brandTitle || data?.product?.brand || data?.grouping?.brand || "",
          ).trim();
          const vendorLabel = String(data?.seller?.vendorName || data?.product?.vendorName || "").trim();

          return (
            <div
              key={String(product?.id || data?.docId || data?.product?.unique_id || index)}
              className="w-[78vw] max-w-[320px] min-w-[78vw] snap-start sm:w-[250px] sm:min-w-[250px] lg:w-[280px] lg:min-w-[280px]"
            >
              <BrowseProductCard
                item={product}
                view="grid"
                openInNewTab={false}
                brandHref={brandHref}
                vendorHref={vendorHref}
                brandLabel={brandLabel || undefined}
                vendorLabel={vendorLabel || undefined}
                currentUrl=""
                onAddToCartSuccess={() => {}}
                cartBurstKey={0}
                shopperArea={shopperArea}
              />
            </div>
          );
        })}
        </div>
      </div>
    </section>
  );
}
