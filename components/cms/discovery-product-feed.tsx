"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "@/components/products/product-card";
import {
  type ProductRailItem,
  rawProductToShopperCard,
} from "@/components/cms/product-rail-carousel";
import type { ShopperVisibleProductCard } from "@/lib/catalogue/shopper-card";
import {
  readShopperDeliveryArea,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";

const DISCOVERY_SEED_KEY = "piessang_discovery_seed_v1";
const DISCOVERY_AFFINITY_KEY = "piessang_discovery_affinity_v1";

type DiscoveryAffinity = {
  categories: Record<string, number>;
  subCategories: Record<string, number>;
  brands: Record<string, number>;
  products: Record<string, number>;
  updatedAt: number;
};

const EMPTY_AFFINITY: DiscoveryAffinity = {
  categories: {},
  subCategories: {},
  brands: {},
  products: {},
  updatedAt: 0,
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashToUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function createSessionSeed() {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(DISCOVERY_SEED_KEY);
    if (existing) return existing;
    const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(DISCOVERY_SEED_KEY, next);
    return next;
  } catch {
    return "fallback";
  }
}

function readAffinity(): DiscoveryAffinity {
  if (typeof window === "undefined") return EMPTY_AFFINITY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISCOVERY_AFFINITY_KEY) || "{}");
    return {
      categories: parsed?.categories && typeof parsed.categories === "object" ? parsed.categories : {},
      subCategories: parsed?.subCategories && typeof parsed.subCategories === "object" ? parsed.subCategories : {},
      brands: parsed?.brands && typeof parsed.brands === "object" ? parsed.brands : {},
      products: parsed?.products && typeof parsed.products === "object" ? parsed.products : {},
      updatedAt: Number(parsed?.updatedAt || 0) || 0,
    };
  } catch {
    return EMPTY_AFFINITY;
  }
}

function pruneWeights(weights: Record<string, number>, limit = 80) {
  return Object.fromEntries(
    Object.entries(weights)
      .filter(([key, value]) => key && Number.isFinite(value) && value > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  );
}

function writeAffinity(next: DiscoveryAffinity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISCOVERY_AFFINITY_KEY,
      JSON.stringify({
        categories: pruneWeights(next.categories),
        subCategories: pruneWeights(next.subCategories),
        brands: pruneWeights(next.brands),
        products: pruneWeights(next.products, 160),
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Browsing should never break because localStorage is unavailable.
  }
}

function addWeight(weights: Record<string, number>, key: unknown, amount: number) {
  const normalized = toStr(key);
  if (!normalized) return weights;
  return {
    ...weights,
    [normalized]: clamp((Number(weights[normalized] || 0) || 0) + amount, 0, 100),
  };
}

function recordDiscoverySignal(product: ShopperVisibleProductCard, signal: "hover" | "focus" | "click" | "action") {
  const amount = signal === "click" ? 8 : signal === "action" ? 12 : 1;
  const current = readAffinity();
  writeAffinity({
    categories: addWeight(current.categories, product.categorySlug, amount),
    subCategories: addWeight(current.subCategories, product.subCategorySlug, amount),
    brands: addWeight(current.brands, product.brandLabel, amount * 0.6),
    products: addWeight(current.products, product.id, amount),
    updatedAt: Date.now(),
  });
}

function isResolvedProduct(item: ProductRailItem): item is ShopperVisibleProductCard {
  return !("data" in item);
}

function getProductScore(product: ShopperVisibleProductCard, affinity: DiscoveryAffinity, seed: string, personalize: boolean, explorationRatio: number) {
  const randomScore = hashToUnit(`${seed}:${product.id}`);
  if (!personalize) return randomScore;
  const affinityRaw =
    Number(affinity.categories[toStr(product.categorySlug)] || 0) +
    Number(affinity.subCategories[toStr(product.subCategorySlug)] || 0) * 1.25 +
    Number(affinity.brands[toStr(product.brandLabel)] || 0) * 0.65;
  const affinityScore = clamp(affinityRaw / 28, 0, 1);
  const exploration = clamp(explorationRatio, 10, 95) / 100;
  return randomScore * exploration + affinityScore * (1 - exploration) + hashToUnit(`tie:${seed}:${product.id}`) * 0.01;
}

function normalizeProducts(products: ProductRailItem[], shopperArea: ShopperDeliveryArea | null, preview: boolean) {
  const deduped = new Map<string, ShopperVisibleProductCard>();
  products.forEach((product) => {
    const normalized = isResolvedProduct(product) ? product : preview ? rawProductToShopperCard(product, shopperArea) : null;
    const id = toStr(normalized?.id);
    if (!normalized || !id || deduped.has(id)) return;
    if (normalized.stock?.state === "out_of_stock") return;
    if (!normalized.image?.imageUrl) return;
    deduped.set(id, normalized);
  });
  return Array.from(deduped.values());
}

function DiscoverySkeletonGrid() {
  return (
    <div className="columns-2 gap-1.5 sm:gap-2 lg:grid lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={`discovery-skeleton-${index}`} className="mb-2 w-full break-inside-avoid animate-pulse">
          <div className={`${index % 3 === 1 ? "aspect-[1/1.14]" : "aspect-square"} w-full bg-[#eef1f4] lg:aspect-square`} />
          <div className="mt-2 h-3 w-[86%] rounded-full bg-[#e4e8ee]" />
          <div className="mt-2 h-5 w-[48%] rounded-full bg-[#dce2e9]" />
          <div className="mt-2 h-3 w-[36%] rounded-full bg-[#edf0f4]" />
        </div>
      ))}
    </div>
  );
}

export function DiscoveryProductFeed({
  products,
  title = "Discover more",
  subtitle = "",
  showHeading = false,
  initialLimit = 24,
  batchSize = 24,
  maxItems = 160,
  personalize = true,
  explorationRatio = 70,
  preview = false,
}: {
  products: ProductRailItem[];
  title?: string;
  subtitle?: string;
  showHeading?: boolean;
  initialLimit?: number;
  batchSize?: number;
  maxItems?: number;
  personalize?: boolean;
  explorationRatio?: number;
  preview?: boolean;
}) {
  const [seed, setSeed] = useState("server");
  const [shopperArea, setShopperArea] = useState<ShopperDeliveryArea | null>(null);
  const [affinity, setAffinity] = useState<DiscoveryAffinity>(EMPTY_AFFINITY);
  const [visibleCount, setVisibleCount] = useState(() => clamp(toNum(initialLimit, 24), 4, 80));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hoveredProductIds = useRef<Set<string>>(new Set());

  const normalizedProducts = useMemo(() => normalizeProducts(products, shopperArea, preview), [preview, products, shopperArea]);
  const orderedProducts = useMemo(() => {
    return normalizedProducts
      .map((product) => ({
        product,
        score: getProductScore(product, affinity, seed, Boolean(personalize), toNum(explorationRatio, 70)),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.product)
      .slice(0, clamp(toNum(maxItems, 160), 8, 500));
  }, [affinity, explorationRatio, maxItems, normalizedProducts, personalize, seed]);

  const safeBatchSize = clamp(toNum(batchSize, 24), 4, 80);
  const visibleProducts = orderedProducts.slice(0, visibleCount);
  const canLoadMore = visibleCount < orderedProducts.length;

  useEffect(() => {
    setSeed(createSessionSeed());
    setAffinity(readAffinity());
  }, []);

  useEffect(() => {
    setVisibleCount(clamp(toNum(initialLimit, 24), 4, 80));
  }, [initialLimit, orderedProducts.length]);

  useEffect(() => {
    setShopperArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea(setShopperArea);
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canLoadMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + safeBatchSize, orderedProducts.length));
      },
      { rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, orderedProducts.length, safeBatchSize]);

  if (!orderedProducts.length) {
    return preview ? (
      <section className="w-full">
        {showHeading ? (
          <div className="mb-4">
            <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{title}</p>
            {subtitle ? <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{subtitle}</p> : null}
          </div>
        ) : null}
        <DiscoverySkeletonGrid />
      </section>
    ) : null;
  }

  return (
    <section className="w-full">
      {showHeading ? (
        <div className="mb-4 border-b border-[#e5e7eb] pb-3">
          <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{title}</p>
          {subtitle ? <p className="mt-2 max-w-[56ch] text-[13px] leading-[1.55] text-[#57636c] sm:text-[14px]">{subtitle}</p> : null}
        </div>
      ) : null}
      <div className="columns-2 gap-1.5 sm:gap-2 lg:grid lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {visibleProducts.map((product) => (
          <div
            key={product.id}
            className="mb-2 w-full break-inside-avoid"
            onPointerEnter={() => {
              if (hoveredProductIds.current.has(product.id)) return;
              hoveredProductIds.current.add(product.id);
              recordDiscoverySignal(product, "hover");
            }}
            onFocusCapture={() => recordDiscoverySignal(product, "focus")}
            onClickCapture={(event) => {
              const target = event.target instanceof HTMLElement ? event.target : null;
              recordDiscoverySignal(product, target?.closest("[data-ignore-card-open]") ? "action" : "click");
            }}
          >
            <ProductCard
              item={product}
              openInNewTab={false}
              currentUrl=""
              onAddToCartSuccess={() => {}}
              cartBurstKey={0}
            />
          </div>
        ))}
      </div>
      {canLoadMore ? (
        <div ref={sentinelRef} className="mt-6">
          <DiscoverySkeletonGrid />
        </div>
      ) : (
        <div ref={sentinelRef} className="h-px" />
      )}
    </section>
  );
}

export default DiscoveryProductFeed;
