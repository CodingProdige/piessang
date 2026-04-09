"use client";

import { useEffect, useState } from "react";
import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import type { ProductItem } from "@/components/products/products-results";

const RECENTLY_VIEWED_STORAGE_KEY = "piessang_recently_viewed_products_v1";
const SEARCH_HISTORY_STORAGE_KEY = "piessang_search_history_v1";

type ProductGetItem = any;

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function mapProduct(item: ProductGetItem): ProductItem | null {
  const data = item?.data || item || {};
  const id = toStr(item?.id || data?.docId || data?.product?.unique_id);
  const title = toStr(data?.product?.title);
  if (!id || !title) return null;
  return {
    id,
    data,
  };
}

async function loadProductsBySearchTerms(searchTerms: string[], limit: number) {
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
  const deduped = new Map<string, ProductItem>();
  results.flat().forEach((item) => {
    const mapped = mapProduct(item);
    const mappedId = toStr(mapped?.id);
    if (mapped && mappedId && !deduped.has(mappedId)) deduped.set(mappedId, mapped);
  });
  return Array.from(deduped.values()).slice(0, limit);
}

async function loadProductsByIds(ids: string[]) {
  const params = new URLSearchParams({
    ids: ids.join(","),
    isActive: "true",
  });
  const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map(mapProduct).filter(Boolean) as ProductItem[];
}

function PersonalizedRailShell({
  title,
  subtitle,
  products,
  emptyMessage,
  mobileLeadingSpacer = true,
  viewAllHref,
}: {
  title: string;
  subtitle: string;
  products: ProductItem[];
  emptyMessage: string;
  mobileLeadingSpacer?: boolean;
  viewAllHref?: string;
}) {
  return (
    <ProductRailCarousel
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage={emptyMessage}
      mobileLeadingSpacer={mobileLeadingSpacer}
      viewAllHref={viewAllHref}
    />
  );
}

export function RecentlyViewedRail({
  title,
  subtitle,
  limit = 8,
}: {
  title: string;
  subtitle: string;
  limit?: number;
}) {
  const [products, setProducts] = useState<ProductItem[]>([]);
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

  if (ready && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will populate after shoppers browse products."
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=recently-viewed`
          : "/products"
      }
    />
  );
}

export function SearchHistoryRail({
  title,
  subtitle,
  limit = 8,
}: {
  title: string;
  subtitle: string;
  limit?: number;
}) {
  const [products, setProducts] = useState<ProductItem[]>([]);
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
        if (!cancelled) setProducts(items);
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

  if (ready && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will populate after shoppers start searching."
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=search-history`
          : "/products"
      }
    />
  );
}

export function RecommendedForYouRail({
  title,
  subtitle,
  limit = 8,
}: {
  title: string;
  subtitle: string;
  limit?: number;
}) {
  const [products, setProducts] = useState<ProductItem[]>([]);
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

        let items: ProductItem[] = [];
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

  if (ready && !products.length) return null;

  return (
    <PersonalizedRailShell
      title={title}
      subtitle={subtitle}
      products={products}
      emptyMessage="This rail will learn from shopper browsing and search history."
      mobileLeadingSpacer={false}
      viewAllHref={
        products.length
          ? `/products?ids=${encodeURIComponent(products.map((item) => item.id).filter(Boolean).join(","))}&personalized=recommended`
          : "/products"
      }
    />
  );
}
