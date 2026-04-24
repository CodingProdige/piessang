"use client";

import { ProductsResults, type SearchParamValue } from "@/components/products/products-results";
import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";

export function CanonicalProductsResults(props: {
  initialItems: ShopperVisibleProductCard[];
  currentSort: string;
  currentView: "grid" | "list";
  openInNewTab: boolean;
  searchParams: Record<string, SearchParamValue>;
  totalCount: number;
  sponsoredPlacement?: string;
  sponsoredContext?: { category?: string; subCategory?: string; search?: string };
}) {
  return <ProductsResults {...props} />;
}

