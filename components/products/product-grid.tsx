"use client";

import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";
import { ProductCard } from "@/components/products/product-card";

const DEFERRED_CARD_EAGER_COUNT_GRID = 8;
function DeferredProductCard({
  eager = false,
  minHeight,
  children,
}: {
  eager?: boolean;
  minHeight: number;
  children: React.ReactNode;
}) {
  void eager;
  void minHeight;
  return <div className="mb-2 w-full break-inside-avoid">{children}</div>;
}

export function ProductGrid({
  products,
  openInNewTab,
  currentUrl,
  makeBrandHref,
  makeVendorHref,
  onAddToCartSuccess,
  cartBurstKey,
}: {
  products: ShopperVisibleProductCard[];
  openInNewTab: boolean;
  currentUrl?: string;
  makeBrandHref?: (item: ShopperVisibleProductCard) => string;
  makeVendorHref?: (item: ShopperVisibleProductCard) => string;
  onAddToCartSuccess?: (cart: any) => void;
  cartBurstKey?: number;
}) {
  return (
    <div className="columns-2 gap-1.5 sm:gap-2 lg:grid lg:grid-cols-3 xl:grid-cols-5">
      {products.map((item, index) => (
        <DeferredProductCard key={item.id} eager={index < DEFERRED_CARD_EAGER_COUNT_GRID} minHeight={460}>
          <ProductCard
            item={item}
            view="grid"
            openInNewTab={openInNewTab}
            brandHref={makeBrandHref?.(item)}
            vendorHref={makeVendorHref?.(item)}
            currentUrl={currentUrl}
            onAddToCartSuccess={onAddToCartSuccess}
            cartBurstKey={cartBurstKey}
          />
        </DeferredProductCard>
      ))}
    </div>
  );
}
