"use client";

import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import type { ProductItem } from "@/components/products/browse-product-card";
import type { ShopperDeliveryArea } from "@/components/products/delivery-area-gate";

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

  return (
    <section className={`rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${className}`.trim()}>
      <ProductRailCarousel
        title={title}
        subtitle={subtitle}
        products={products.slice(0, 8)}
        emptyMessage="No recommendations available right now."
        mobileLeadingSpacer={false}
        viewAllHref={viewAllHref}
        shopperArea={shopperArea}
      />
    </section>
  );
}
