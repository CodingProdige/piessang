"use client";

import { useEffect, useState } from "react";
import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";

const RECENTLY_VIEWED_STORAGE_KEY = "piessang_recently_viewed_products_v1";
const SEARCH_HISTORY_STORAGE_KEY = "piessang_search_history_v1";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isShopperVisibleProductCard(item: unknown): item is ShopperVisibleProductCard {
  return item != null && typeof item === "object" && !("data" in item) && typeof (item as { title?: unknown }).title === "string";
}

function withAnalyticsMeta(
  products: ShopperVisibleProductCard[],
  analyticsById: Map<string, { clicks: number; productViews: number; hasHighClicks: boolean; metric: string }>,
) {
  return products.map((product) => {
    const productId = toStr(product?.id);
    const analytics = analyticsById.get(productId);
    if (!analytics) return product;
    return {
      ...product,
      badge: product.badge,
    };
  });
}

async function loadProductsBySearchTerms(searchTerms: string[], limit: number): Promise<ShopperVisibleProductCard[]> {
  const queries = searchTerms.slice(0, 3);
  const results = await Promise.all(
    queries.map(async (term) => {
      const params = new URLSearchParams({
        search: term,
        limit: String(Math.max(limit, 8)),
        isActive: "true",
      });
      const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      return Array.isArray(payload?.items) ? payload.items : [];
    }),
  );
  const deduped = new Map<string, ShopperVisibleProductCard>();
  results.flat().forEach((item) => {
    const mapped =
      item && typeof item === "object" && !("data" in item) && typeof item?.title === "string"
        ? (item as ShopperVisibleProductCard)
        : null;
    const mappedId = toStr(mapped?.id);
    if (mapped && mappedId && !deduped.has(mappedId)) deduped.set(mappedId, mapped);
  });
  return Array.from(deduped.values()).slice(0, limit);
}

async function loadProductsByIds(ids: string[]): Promise<ShopperVisibleProductCard[]> {
  const params = new URLSearchParams({
    ids: ids.join(","),
    isActive: "true",
  });
  const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.filter(isShopperVisibleProductCard);
}

function PersonalizedRailShell({
  title,
  subtitle,
  products,
  emptyMessage,
  preview = false,
  mobileLeadingSpacer = false,
  viewAllHref,
}: {
  title: string;
  subtitle: string;
  products: ShopperVisibleProductCard[];
  emptyMessage: string;
  preview?: boolean;
  mobileLeadingSpacer?: boolean;
  viewAllHref?: string;
}) {
  return (
    <ProductRailCarousel
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage={emptyMessage}
      hideWhenEmpty
      skeletonWhenEmpty={preview}
      mobileLeadingSpacer={mobileLeadingSpacer}
      viewAllHref={viewAllHref}
    />
  );
}

export function RecentlyViewedRail({
  title,
  subtitle,
  limit = 8,
  preview = false,
}: {
  title: string;
  subtitle: string;
  limit?: number;
  preview?: boolean;
}) {
  const [products, setProducts] = useState<ShopperVisibleProductCard[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
        const parsed = Array.isArray(JSON.parse(raw || "[]")) ? JSON.parse(raw || "[]") : [];
        const ids = parsed.map((item: any) => toStr(item?.id)).filter(Boolean).slice(0, limit);
        if (!ids.length || cancelled) {
          if (!cancelled) setReady(true);
          return;
        }
        const items = await loadProductsByIds(ids);
        if (!cancelled) setProducts(items.slice(0, limit));
      } catch {
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (ready && !preview && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will populate after shoppers browse products."
      preview={preview}
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=recently-viewed`
          : "/products?personalized=recently-viewed"
      }
    />
  );
}

export function SearchHistoryRail({
  title,
  subtitle,
  limit = 8,
  preview = false,
}: {
  title: string;
  subtitle: string;
  limit?: number;
  preview?: boolean;
}) {
  const [products, setProducts] = useState<ShopperVisibleProductCard[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
        const parsed = Array.isArray(JSON.parse(raw || "[]")) ? JSON.parse(raw || "[]") : [];
        const searchTerms = parsed.map((item: any) => toStr(item)).filter(Boolean);
        if (!searchTerms.length || cancelled) {
          if (!cancelled) setReady(true);
          return;
        }
        const items = await loadProductsBySearchTerms(searchTerms, limit);
        if (!cancelled) setProducts(items.slice(0, limit));
      } catch {
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (ready && !preview && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will populate after shoppers start searching."
      preview={preview}
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=search-history`
          : "/products?personalized=search-history"
      }
    />
  );
}

export function TrendingProductsRail({
  title,
  subtitle,
  limit = 8,
  days = 30,
  mode = "blended",
  preview = false,
}: {
  title: string;
  subtitle: string;
  limit?: number;
  days?: number;
  mode?: "blended" | "clicked" | "viewed" | "searched";
  preview?: boolean;
}) {
  const [products, setProducts] = useState<ShopperVisibleProductCard[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (mode === "searched") {
          const searchResponse = await fetch("/api/client/v1/search/queries", { cache: "no-store" });
          const searchPayload = await searchResponse.json().catch(() => ({}));
          const searchTerms = (
            Array.isArray(searchPayload?.data?.items)
              ? searchPayload.data.items
              : Array.isArray(searchPayload?.items)
                ? searchPayload.items
                : []
          )
            .map((item: any) => toStr(item?.query))
            .filter(Boolean)
            .slice(0, 3);
          const searchedProducts = searchTerms.length ? await loadProductsBySearchTerms(searchTerms, limit) : [];
          if (!cancelled) setProducts(searchedProducts.slice(0, limit));
          return;
        }

        const [engagementPayload, searchPayload] = await Promise.all([
          fetch(
            `/api/client/v1/analytics/product-engagement/top-products?limit=${encodeURIComponent(String(limit))}&days=${encodeURIComponent(String(days))}&metric=${encodeURIComponent(mode)}`,
            { cache: "no-store" },
          ).then((response) => response.json().catch(() => ({}))),
          mode === "blended"
            ? fetch("/api/client/v1/search/queries", { cache: "no-store" }).then((response) => response.json().catch(() => ({})))
            : Promise.resolve({}),
        ]);
        const engagementItems = (
          Array.isArray(engagementPayload?.data?.items)
            ? engagementPayload.data.items
            : Array.isArray(engagementPayload?.items)
              ? engagementPayload.items
              : []
        ).slice(0, limit);
        const engagementIds = engagementItems.map((item: any) => toStr(item?.productId)).filter(Boolean);
        const engagementProducts = engagementIds.length ? await loadProductsByIds(engagementIds) : [];
        const analyticsById = new Map<string, { clicks: number; productViews: number; hasHighClicks: boolean; metric: string }>(
          engagementItems.map((item: any) => [
            toStr(item?.productId),
            {
              clicks: Number(item?.clicks || 0),
              productViews: Number(item?.productViews || 0),
              hasHighClicks: Boolean(item?.hasHighClicks),
              metric: mode,
            },
          ]),
        );

        let nextProducts = withAnalyticsMeta(engagementProducts, analyticsById);

        const searchTerms =
          mode === "blended"
            ? (
                Array.isArray(searchPayload?.data?.items)
                  ? searchPayload.data.items
                  : Array.isArray(searchPayload?.items)
                    ? searchPayload.items
                    : []
              )
                .map((item: any) => toStr(item?.query))
                .filter(Boolean)
                .slice(0, 3)
            : [];

        if (mode === "blended" && nextProducts.length < limit && searchTerms.length) {
          const searchedProducts = await loadProductsBySearchTerms(searchTerms, limit);
          const existing = new Set(nextProducts.map((item) => item.id));
          searchedProducts.forEach((item) => {
            if (!existing.has(item.id) && nextProducts.length < limit) nextProducts.push(item);
          });
        }

        if (!cancelled) setProducts(nextProducts.slice(0, limit));
      } catch {
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [days, limit, mode]);

  if (ready && !preview && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will populate as shoppers search, click, and view products."
      preview={preview}
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=${encodeURIComponent(mode)}`
          : `/products?personalized=${encodeURIComponent(mode)}`
      }
    />
  );
}

export function RecommendedForYouRail({
  title,
  subtitle,
  limit = 8,
  preview = false,
}: {
  title: string;
  subtitle: string;
  limit?: number;
  preview?: boolean;
}) {
  const [products, setProducts] = useState<ShopperVisibleProductCard[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const recentSearchRaw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
        const parsedSearch = Array.isArray(JSON.parse(recentSearchRaw || "[]")) ? JSON.parse(recentSearchRaw || "[]") : [];
        const recentSearches = parsedSearch.map((item: any) => toStr(item)).filter(Boolean).slice(0, 3);
        const recentViewedRaw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
        const parsed = Array.isArray(JSON.parse(recentViewedRaw || "[]")) ? JSON.parse(recentViewedRaw || "[]") : [];
        const recentIds = parsed.map((item: any) => toStr(item?.id)).filter(Boolean).slice(0, 6);

        let items: ShopperVisibleProductCard[] = [];
        if (recentSearches.length) {
          items = await loadProductsBySearchTerms(recentSearches, limit);
        }

        if (recentIds.length && items.length < limit) {
          const viewedItems = await loadProductsByIds(recentIds);
          const existing = new Set(items.map((item) => item.id));
          viewedItems.forEach((item) => {
            if (!existing.has(item.id) && items.length < limit) items.push(item);
          });
        }

        if (!cancelled) setProducts(items.slice(0, limit));
      } catch {
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (ready && !preview && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will learn from shopper browsing and search history."
      preview={preview}
      mobileLeadingSpacer={false}
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=recommended`
          : "/products?personalized=recommended"
      }
    />
  );
}
