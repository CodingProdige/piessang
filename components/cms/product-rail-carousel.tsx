"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrowseProductCard, type ProductItem } from "@/components/products/products-results";
import {
  readShopperDeliveryArea,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";

export type ProductRailItem = ProductItem;

export function ProductRailCarousel({
  title,
  subtitle,
  products,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  products: ProductRailItem[];
  emptyMessage: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [shopperArea, setShopperArea] = useState<ShopperDeliveryArea | null>(null);

  useEffect(() => {
    setShopperArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea(setShopperArea);
  }, []);

  const showControls = useMemo(() => products.length > 1, [products.length]);

  function scrollByCard(direction: -1 | 1) {
    const node = trackRef.current;
    if (!node) return;
    const firstCard = node.querySelector<HTMLElement>("[data-rail-card='true']");
    const cardWidth = firstCard?.offsetWidth || 240;
    node.scrollBy({ left: direction * (cardWidth + 16), behavior: "smooth" });
  }

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{title}</p>
          <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/products" className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3.5 text-[12px] font-semibold text-[#202020] sm:h-10 sm:px-4 sm:text-[13px]">
            Browse all
          </Link>
          {showControls ? (
            <>
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[16px] text-[#202020] sm:h-10 sm:w-10 sm:text-[18px]"
                aria-label="Scroll products left"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[16px] text-[#202020] sm:h-10 sm:w-10 sm:text-[18px]"
                aria-label="Scroll products right"
              >
                →
              </button>
            </>
          ) : null}
        </div>
      </div>

      {products.length ? (
        <div
          ref={trackRef}
          className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] sm:mt-5 sm:gap-4 [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product, index) => {
            const data = product?.data || {};
            const brandSlug = String(data?.brand?.slug || "").trim();
            const brandHref = brandSlug ? `/products?brand=${encodeURIComponent(brandSlug)}` : "/products";
            const sellerIdentifier = String(
              data?.seller?.sellerCode || data?.product?.sellerCode || data?.seller?.sellerSlug || data?.product?.sellerSlug || "",
            ).trim();
            const vendorHref = sellerIdentifier ? `/vendors/${encodeURIComponent(sellerIdentifier)}` : "/products";
            const brandLabel = String(data?.brand?.title || "Brand").trim();
            const vendorLabel = String(data?.seller?.vendorName || data?.product?.vendorName || "Seller").trim();

            return (
              <div
                key={String(product?.id || data?.docId || data?.product?.unique_id || index)}
                data-rail-card="true"
                className="w-[42vw] max-w-[172px] min-w-[42vw] snap-start sm:w-[190px] sm:min-w-[190px] lg:w-[220px] lg:min-w-[220px]"
              >
                <BrowseProductCard
                  item={product}
                  view="grid"
                  openInNewTab={false}
                  brandHref={brandHref}
                  vendorHref={vendorHref}
                  brandLabel={brandLabel}
                  vendorLabel={vendorLabel}
                  currentUrl=""
                  onAddToCartSuccess={() => {}}
                  cartBurstKey={0}
                  shopperArea={shopperArea}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-[8px] border border-dashed border-black/10 px-4 py-10 text-[14px] text-[#7a8594]">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export default ProductRailCarousel;
