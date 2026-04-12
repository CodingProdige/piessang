"use client";

import { useEffect, useState } from "react";
import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import type { ShopperDeliveryArea } from "@/components/products/delivery-area-gate";

type ProductItem = {
  id?: string;
  data?: {
    product?: {
      unique_id?: string | number;
    };
  };
};

type RecommendationSource = "co_purchase" | "catalog_pairing" | "none";

type RecommendationPayload = {
  ok?: boolean;
  items?: ProductItem[];
  source?: RecommendationSource;
  message?: string;
};

function RecommendationSkeleton() {
  return (
    <section className="mt-4">
      <div className="flex gap-4 overflow-hidden pb-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-[360px] min-w-[220px] max-w-[220px] rounded-[8px] bg-[#f3f3f0] animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}

export function ProductRecommendationsRail({
  productId,
  endpoint,
  title,
  className = "",
  fallbackContext = "Suggested combinations update as our catalog grows",
  emptyTitle = "No current product combinations yet.",
  hideWhenEmpty = false,
  desktopOnly = false,
  mobileOnly = false,
  shopperArea = null,
}: {
  productId: string;
  endpoint: "often-bought-together" | "similar";
  title: string;
  className?: string;
  fallbackContext?: string;
  emptyTitle?: string;
  hideWhenEmpty?: boolean;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
  shopperArea?: ShopperDeliveryArea | null;
}) {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [source, setSource] = useState<RecommendationSource>("none");

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendations() {
      if (!productId) return;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/client/v1/products/${endpoint}?productId=${encodeURIComponent(productId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => ({}))) as RecommendationPayload;
        if (!cancelled && response.ok && payload?.ok !== false) {
          setItems(Array.isArray(payload?.items) ? payload.items : []);
          setMessage(typeof payload?.message === "string" ? payload.message : null);
          setSource(
            payload?.source === "co_purchase" || payload?.source === "catalog_pairing"
              ? payload.source
              : "none",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [endpoint, productId]);

  if (!loading && hideWhenEmpty && items.length === 0) {
    return null;
  }

  const visibilityClass = desktopOnly ? "hidden lg:block" : mobileOnly ? "lg:hidden" : "";
  const subtitle =
    endpoint === "similar"
      ? "More from this category"
      : source === "co_purchase"
        ? "Based on previous orders"
        : source === "catalog_pairing"
          ? "Suggested from matching products in our catalog"
          : fallbackContext;
  const viewAllHref =
    endpoint === "similar"
      ? "/products"
      : `/products?recommendation=${encodeURIComponent(source === "co_purchase" ? "often-bought-together" : "catalog-pairing")}&productId=${encodeURIComponent(productId)}`;

  return (
    <section className={`rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${visibilityClass} ${className}`.trim()}>
      {loading ? (
        <RecommendationSkeleton />
      ) : items.length > 0 ? (
        <ProductRailCarousel
          title={title}
          subtitle={subtitle}
          products={items as any}
          emptyMessage={emptyTitle}
          mobileLeadingSpacer={false}
          viewAllHref={viewAllHref}
          shopperArea={shopperArea}
        />
      ) : (
        <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5">
          <p className="text-[14px] font-semibold text-[#202020]">{emptyTitle}</p>
          <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
            {message || "We do not have a strong suggestion for this item right now."}
          </p>
        </div>
      )}
    </section>
  );
}
