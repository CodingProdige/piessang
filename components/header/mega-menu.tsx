"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DisplayCurrencySelector } from "@/components/currency/display-currency-provider";
import { PageBody } from "@/components/layout/page-body";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import {
  detectShopperCountryFromBrowser,
  DeliveryAreaGate,
  formatPreciseShopperDeliveryArea,
  hasPreciseShopperDeliveryArea,
  readShopperDeliveryArea,
  saveShopperDeliveryArea,
  SHOPPER_COUNTRY_OPTIONS,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";

const CATEGORIES_ENDPOINT = "/api/catalogue/v1/categories/list";
const SUBCATEGORIES_ENDPOINT = "/api/catalogue/v1/subCategories/list";
const BRANDS_ENDPOINT = "/api/catalogue/v1/brands/get";
const PRODUCTS_ENDPOINT = "/api/catalogue/v1/products/product/get";
const PRODUCTS_PAGE = "/products";
const MENU_HEIGHT = 430;
const LANDING_PAGE_ENDPOINT = "/api/client/v1/landing-page/get";
const SearchBar = dynamic(() => import("@/components/header/header-search").then((mod) => mod.HeaderSearch), {
  ssr: false,
  loading: () => <HeaderSearchSkeleton />,
});
const CartPreviewDrawer = dynamic(
  () => import("@/components/header/cart-preview-drawer").then((mod) => mod.CartPreviewDrawer),
  { ssr: false },
);

type CatalogueCategory = {
  slug?: string;
  title?: string;
  description?: string | null;
  position?: number;
  id?: string;
  data?: {
    docId?: string;
    category?: {
      slug?: string;
      title?: string;
      description?: string | null;
    };
    placement?: {
      position?: number;
      isActive?: boolean;
    };
  };
};

type CatalogueSubCategory = {
  slug?: string;
  kind?: string | null;
  title?: string;
  description?: string | null;
  position?: number;
  id?: string;
  data?: {
    docId?: string;
    grouping?: {
      category?: string;
    };
    subCategory?: {
      slug?: string;
      title?: string;
      description?: string | null;
    };
    placement?: {
      position?: number;
      isActive?: boolean;
    };
  };
};

type CatalogueBrand = {
  id?: string;
  data?: {
    docId?: string;
    grouping?: {
      category?: string;
      subCategories?: string[];
    };
    brand?: {
      slug?: string;
      title?: string;
      description?: string | null;
    };
    placement?: {
      position?: number;
      isActive?: boolean;
      isFeatured?: boolean;
    };
    media?: {
      images?: Array<{
        imageUrl?: string;
        blurHashUrl?: string;
        position?: number;
      }>;
    };
  };
};

type Department = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
};

type SubCategory = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
};

type Brand = {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  imageUrl: string;
  isFeatured: boolean;
};

type MenuState = {
  departments: Department[];
  hoveredSlug: string;
  activeSubcategories: SubCategory[];
  brands: Brand[];
  subcategoriesLoading: boolean;
  brandsLoading: boolean;
  productCountsBySubCategory: Record<string, number>;
  productCountsByBrand: Record<string, number>;
  setHoveredSlug: (slug: string) => void;
  hoveredSubcategorySlug: string;
  setHoveredSubcategorySlug: (slug: string) => void;
};

type ProductAvailabilitySummary = {
  categoryCounts: Record<string, number>;
  subCategoryCounts: Record<string, number>;
  brandCounts: Record<string, number>;
};

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

type FixedHeroConfig = {
  locked?: boolean;
  rotationSeconds?: number;
  images?: Array<{
    imageUrl?: string;
    href?: string;
    blurHashUrl?: string;
  }>;
};

function formatDeliveryAreaLabel(area: ShopperDeliveryArea | null) {
  if (!area?.country) return "All delivery countries";
  return area.country;
}

function HeaderDeliveryLocationControl({
  triggerId,
  className = "",
}: {
  triggerId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [area, setArea] = useState<ShopperDeliveryArea | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const stored = readShopperDeliveryArea();
    if (stored?.country) {
      setArea(stored);
    } else {
      const detectedCountry = detectShopperCountryFromBrowser();
      if (detectedCountry) {
        const nextArea = {
          city: "",
          province: "",
          suburb: "",
          postalCode: "",
          country: detectedCountry,
          latitude: null,
          longitude: null,
        };
        saveShopperDeliveryArea(nextArea);
        setArea(nextArea);
      } else {
        setArea(stored);
      }
    }
    return subscribeToShopperDeliveryArea(setArea);
  }, []);

  const preciseLabel = formatPreciseShopperDeliveryArea(area);
  const hasPreciseArea = hasPreciseShopperDeliveryArea(area);

  return (
    <div className={`relative inline-flex min-w-0 items-center gap-1.5 border-r border-black/10 px-2 text-[12px] font-semibold text-[#4b5563] sm:gap-2 sm:px-5 ${className}`}>
      <span className="inline-flex shrink-0 items-center gap-2">
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M10 1.5a5.5 5.5 0 0 0-5.5 5.5c0 4.5 5.5 11.5 5.5 11.5S15.5 11.5 15.5 7A5.5 5.5 0 0 0 10 1.5Zm0 7.75A2.25 2.25 0 1 1 10 4.75a2.25 2.25 0 0 1 0 4.5Z" />
        </svg>
        <span className="hidden lg:inline">Deliver to</span>
      </span>
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <div className="relative min-w-0">
          <select
            id={triggerId}
            value={area?.country || ""}
            onChange={(event) => {
              const nextCountry = String(event.target.value || "").trim();
              if (!nextCountry) {
                saveShopperDeliveryArea(null);
                setArea(null);
                return;
              }
              const nextArea = {
                city: area?.city || "",
                province: area?.province || "",
                suburb: area?.suburb || "",
                postalCode: area?.postalCode || "",
                country: nextCountry,
                latitude: area?.latitude ?? null,
                longitude: area?.longitude ?? null,
              };
              saveShopperDeliveryArea(nextArea);
              setArea(nextArea);
            }}
            className="max-w-[120px] appearance-none rounded-[8px] border border-black/10 bg-white py-2 pl-2 pr-7 text-[11px] font-semibold text-[#202020] outline-none sm:max-w-none sm:pl-3 sm:pr-8 sm:text-[12px]"
            aria-label="Choose delivery country"
            title={formatDeliveryAreaLabel(area)}
          >
            <option value="">All delivery countries</option>
            {SHOPPER_COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.label}>
                {country.displayLabel}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#6b7280]" aria-hidden="true">
            <path d="M5.5 7.5 10 12l4.5-4.5" />
          </svg>
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="inline-flex shrink-0 items-center rounded-[8px] border border-black/10 bg-white px-2.5 py-2 text-[10px] font-semibold text-[#4b5563] hover:text-[#202020] sm:px-3 sm:text-[11px]"
          aria-label={hasPreciseArea ? "Update delivery location" : "Improve delivery accuracy"}
        >
          <span className="hidden sm:inline">{hasPreciseArea ? "Update location" : "Improve accuracy"}</span>
          <span className="sm:hidden">{hasPreciseArea ? "Update" : "Locate"}</span>
        </button>
      </div>
      {detailsOpen ? (
        <div className="fixed inset-x-3 top-[56px] z-40 md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+10px)] md:w-[min(92vw,440px)]">
          <div className="max-h-[calc(100vh-88px)] overflow-y-auto rounded-[12px] border border-black/10 bg-white p-4 shadow-[0_18px_50px_rgba(20,24,27,0.16)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Improve delivery accuracy</p>
                <p className="mt-1 text-[13px] leading-[1.55] text-[#57636c]">
                  Add your suburb or postal code for more accurate delivery availability and ETA before checkout.
                </p>
                {hasPreciseArea && preciseLabel ? (
                  <p className="mt-2 text-[12px] font-semibold text-[#202020]">{preciseLabel}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="text-[12px] font-semibold text-[#57636c]"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <DeliveryAreaGate
                compact
                onChange={(nextArea) => {
                  setArea(nextArea);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildProductsHref(params: {
  category?: string;
  subCategory?: string;
  brand?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.category) searchParams.set("category", params.category);
  if (params.subCategory) searchParams.set("subCategory", params.subCategory);
  if (params.brand) searchParams.set("brand", params.brand);
  const query = searchParams.toString();
  return query ? `${PRODUCTS_PAGE}?${query}` : PRODUCTS_PAGE;
}

async function fetchDepartments(): Promise<Department[]> {
  try {
    const response = await fetch(CATEGORIES_ENDPOINT);
    if (!response.ok) throw new Error("Unable to load categories");

    const payload = (await response.json()) as { items?: CatalogueCategory[] };

    return (payload.items ?? [])
      .map((item) => {
        const slug = item.slug?.trim() || item.data?.category?.slug?.trim();
        const title = item.title?.trim() || item.data?.category?.title?.trim();

        if (!slug || !title) return null;

        return {
          id: item.id ?? item.data?.docId ?? slug,
          slug,
          title,
          description: item.description?.trim() ?? item.data?.category?.description?.trim() ?? "",
          position: item.position ?? item.data?.placement?.position ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .filter((item): item is Department => Boolean(item))
      .sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

async function fetchSubcategories(categorySlug: string): Promise<SubCategory[]> {
  try {
    const url = new URL(SUBCATEGORIES_ENDPOINT, window.location.origin);
    url.searchParams.set("category", categorySlug);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Unable to load subcategories");

    const payload = (await response.json()) as {
      items?: CatalogueSubCategory[];
      related_sub_categories?: CatalogueSubCategory[];
    };
    const list = [...(payload.items ?? []), ...(payload.related_sub_categories ?? [])];
    const unique = new Map<string, SubCategory>();

    list
      .map((item) => {
        const slug = item.slug?.trim() || item.data?.subCategory?.slug?.trim();
        const title = item.title?.trim() || item.data?.subCategory?.title?.trim();
        const groupedCategory = item.data?.grouping?.category?.trim();

        if (!slug || !title || (groupedCategory && groupedCategory !== categorySlug)) return null;
        if (item.data?.placement?.isActive === false) return null;

        return {
          id: item.id ?? item.data?.docId ?? slug,
          slug,
          title,
          description: item.description?.trim() ?? item.data?.subCategory?.description?.trim() ?? "",
          position: item.position ?? item.data?.placement?.position ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .forEach((item) => {
        if (!item) return;
        const current = unique.get(item.slug);
        if (!current || item.position < current.position) {
          unique.set(item.slug, item);
        }
      });

    return [...unique.values()].sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

async function fetchBrands(categorySlug: string, subCategorySlug?: string): Promise<Brand[]> {
  try {
    const url = new URL(BRANDS_ENDPOINT, window.location.origin);
    url.searchParams.set("category", categorySlug);
    url.searchParams.set("isActive", "true");
    if (subCategorySlug) {
      url.searchParams.set("subCategory", subCategorySlug);
    }

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Unable to load brands");

    const payload = (await response.json()) as {
      items?: CatalogueBrand[];
      related_brands?: CatalogueBrand[];
    };
    const list = [...(payload.items ?? []), ...(payload.related_brands ?? [])];
    const unique = new Map<string, Brand>();

    list
      .map((item) => {
        const slug = item.data?.brand?.slug?.trim();
        const title = item.data?.brand?.title?.trim();
        if (!slug || !title) return null;
        if (item.data?.placement?.isActive === false) return null;
        const groupedCategory = item.data?.grouping?.category?.trim();
        const groupedSubCategories = Array.isArray(item.data?.grouping?.subCategories)
          ? item.data.grouping.subCategories.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        if (groupedCategory && groupedCategory !== categorySlug) return null;
        if (subCategorySlug && groupedSubCategories.length && !groupedSubCategories.includes(subCategorySlug)) return null;
        const imageUrl = item.data?.media?.images?.[0]?.imageUrl?.trim() ?? "";

        return {
          id: item.id ?? item.data?.docId ?? slug,
          slug,
          title,
          description: item.data?.brand?.description?.trim() ?? "",
          position: item.data?.placement?.position ?? Number.MAX_SAFE_INTEGER,
          imageUrl,
          isFeatured: Boolean(item.data?.placement?.isFeatured),
        };
      })
      .forEach((item) => {
        if (!item) return;
        const current = unique.get(item.slug);
        if (!current || item.position < current.position) {
          unique.set(item.slug, item);
        }
      });

    return [...unique.values()].sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

async function fetchProductAvailabilitySummary(): Promise<ProductAvailabilitySummary> {
  try {
    const url = new URL(PRODUCTS_ENDPOINT, window.location.origin);
    url.searchParams.set("limit", "all");

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Unable to load product availability");

    const payload = (await response.json()) as {
      items?: Array<{
        data?: {
          grouping?: { category?: string; subCategory?: string; brand?: string };
          brand?: { slug?: string; title?: string };
        };
      }>;
    };
    const categoryCounts: Record<string, number> = {};
    const subCategoryCounts: Record<string, number> = {};
    const brandCounts: Record<string, number> = {};

    for (const item of payload.items ?? []) {
      const category = item?.data?.grouping?.category?.trim();
      const subCategory = item?.data?.grouping?.subCategory?.trim();
      const brandKeys = [
        normalizeKey(item?.data?.brand?.slug),
        normalizeKey(item?.data?.brand?.title),
        normalizeKey(item?.data?.grouping?.brand),
      ].filter(Boolean);
      const uniqueBrandKeys = [...new Set(brandKeys)];
      if (category) {
        categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      }
      if (category && subCategory) {
        const key = `${category}::${subCategory}`;
        subCategoryCounts[key] = (subCategoryCounts[key] ?? 0) + 1;
      }
      if (category && uniqueBrandKeys.length) {
        for (const brandKey of uniqueBrandKeys) {
          const categoryBrandKey = `${category}::${brandKey}`;
          brandCounts[categoryBrandKey] = (brandCounts[categoryBrandKey] ?? 0) + 1;
          if (subCategory) {
            const subCategoryBrandKey = `${category}::${subCategory}::${brandKey}`;
            brandCounts[subCategoryBrandKey] = (brandCounts[subCategoryBrandKey] ?? 0) + 1;
          }
        }
      }
    }

    return { categoryCounts, subCategoryCounts, brandCounts };
  } catch {
    return { categoryCounts: {}, subCategoryCounts: {}, brandCounts: {} };
  }
}

function useCatalogueMenu(enabled = true): MenuState {
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [hoveredSlug, setHoveredSlug] = useState("");
  const [hoveredSubcategorySlug, setHoveredSubcategorySlug] = useState("");
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<Record<string, SubCategory[]>>(
    {},
  );
  const [brandsByKey, setBrandsByKey] = useState<Record<string, Brand[]>>({});
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [productCountsByCategory, setProductCountsByCategory] = useState<Record<string, number>>({});
  const [productCountsBySubCategory, setProductCountsBySubCategory] = useState<Record<string, number>>({});
  const [productCountsByBrand, setProductCountsByBrand] = useState<Record<string, number>>({});
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const subcategoryRequestId = useRef(0);
  const brandRequestId = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void fetchDepartments().then((items) => {
      if (cancelled) return;
      setAllDepartments(items);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadAvailability = () => {
      void fetchProductAvailabilitySummary().then((summary) => {
        if (cancelled) return;
        setProductCountsByCategory(summary.categoryCounts);
        setProductCountsBySubCategory(summary.subCategoryCounts);
        setProductCountsByBrand(summary.brandCounts);
        setAvailabilityReady(true);
      });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => loadAvailability(), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(loadAvailability, 350);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [enabled]);

  const departments = availabilityReady
    ? allDepartments.filter((item) => (productCountsByCategory[item.slug] ?? 0) > 0)
    : [];

  useEffect(() => {
    if (!enabled) return;
    if (!hoveredSlug) return;
    if (departments.some((department) => department.slug === hoveredSlug)) return;
    setHoveredSlug("");
    setHoveredSubcategorySlug("");
  }, [departments, hoveredSlug, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const categorySlug = hoveredSlug;
    if (!categorySlug) return;

    const requestId = ++subcategoryRequestId.current;
    setSubcategoriesLoading(true);

    void fetchSubcategories(categorySlug).then((items) => {
      if (subcategoryRequestId.current !== requestId) return;
      setSubcategoriesByCategory((current) => ({
        ...current,
        [categorySlug]: availabilityReady
          ? items.filter((item) => {
              const key = `${categorySlug}::${item.slug}`;
              return (productCountsBySubCategory[key] ?? 0) > 0;
            })
          : items,
      }));
      setSubcategoriesLoading(false);
    });
  }, [availabilityReady, hoveredSlug, productCountsBySubCategory, enabled]);

  const displayCategorySlug = hoveredSlug;
  const activeSubcategories = displayCategorySlug ? subcategoriesByCategory[displayCategorySlug] ?? [] : [];
  const displaySubcategorySlug = hoveredSubcategorySlug || "";

  useEffect(() => {
    if (!enabled) return;
    if (!displayCategorySlug) return;
    if (!displaySubcategorySlug) return;
    if (activeSubcategories.some((item) => item.slug === displaySubcategorySlug)) return;
    setHoveredSubcategorySlug("");
  }, [activeSubcategories, displayCategorySlug, displaySubcategorySlug, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!displayCategorySlug) return;

    const key = `${displayCategorySlug}::${displaySubcategorySlug || "*"}`;
    if (brandsByKey[key]) return;

    const requestId = ++brandRequestId.current;
    setBrandsLoading(true);
    void fetchBrands(displayCategorySlug, displaySubcategorySlug || undefined).then((items) => {
      if (brandRequestId.current !== requestId) return;
      setBrandsByKey((current) => ({ ...current, [key]: items }));
      setBrandsLoading(false);
    });
  }, [displayCategorySlug, displaySubcategorySlug, brandsByKey, enabled]);

  const activeBrands = displayCategorySlug
    ? (brandsByKey[`${displayCategorySlug}::${displaySubcategorySlug || "*"}`] ?? []).filter((brand) => {
        if (!availabilityReady) return true;
        const brandKeys = [normalizeKey(brand.slug), normalizeKey(brand.title)].filter(Boolean);
        return brandKeys.some((brandKey) => {
          const availabilityKey = displaySubcategorySlug
            ? `${displayCategorySlug}::${displaySubcategorySlug}::${brandKey}`
            : `${displayCategorySlug}::${brandKey}`;
          return (productCountsByBrand[availabilityKey] ?? 0) > 0;
        });
      })
    : [];

  return {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands: activeBrands,
    subcategoriesLoading,
    brandsLoading,
    productCountsBySubCategory,
    productCountsByBrand,
    setHoveredSlug,
    setHoveredSubcategorySlug,
    hoveredSubcategorySlug,
  };
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HeaderSearchSkeleton() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex h-[36px] min-w-0 flex-1 items-center rounded-l-[4px] bg-white px-4 shadow-[0_4px_14px_rgba(20,24,27,0.08)]">
        <div className="h-3.5 w-40 animate-pulse rounded-full bg-[#ece6d9]" />
      </div>
      <div className="h-[36px] w-[44px] border-l border-black/8 bg-white shadow-[0_4px_14px_rgba(20,24,27,0.08)]" />
      <div className="h-[36px] w-[46px] rounded-r-[4px] bg-[#4a4545] shadow-[0_4px_14px_rgba(20,24,27,0.12)]" />
    </div>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.5 6h13l-1.5 7.6c-.2 1-1 1.7-2 1.7H9.1c-1 0-1.8-.7-2-1.6L5.4 3.5H2V2h4.6L7.5 6Zm0 0 .8 4h11.6L21 7.2H8.1"
      />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.5a4.8 4.8 0 0 0-4.8 4.8v2.4c0 .9-.2 1.8-.7 2.6L5 16h14l-1.5-2.7c-.5-.8-.7-1.7-.7-2.6V8.3A4.8 4.8 0 0 0 12 3.5Zm-2.2 14.8a2.2 2.2 0 0 0 4.4 0Z"
      />
    </svg>
  );
}

function PiessangLogo() {
  return (
    <Link href="/" className="flex items-center">
      <Image
        src="/logo/Piessang%20Logo.png"
        alt="Piessang"
        width={180}
        height={44}
        priority
        className="h-8 w-auto sm:h-9 lg:h-10"
      />
    </Link>
  );
}

function LogoMeaningLink({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center text-center font-semibold text-[#6a7280] transition-colors hover:text-[#202020]",
        compact ? "text-[10px]" : "text-[11px]",
      ].join(" ")}
      aria-label="What does Piessang mean?"
    >
      What is Piessang?
    </button>
  );
}

function LogoMeaningModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.62)] px-4" onClick={onClose}>
      <div
        className="relative w-auto max-w-[min(92vw,840px)] overflow-hidden rounded-[16px] bg-white shadow-[0_20px_60px_rgba(20,24,27,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-[28px] leading-none text-[#4b5563] shadow-[0_8px_18px_rgba(20,24,27,0.14)]"
          aria-label="Close meaning modal"
        >
          ×
        </button>
        <div className="relative max-h-[86vh] w-[min(92vw,840px)] bg-[#f8f5ee]">
          <Image
            src="/misc/piessang-meaning.png"
            alt="What Piessang means"
            width={1200}
            height={1600}
            sizes="(max-width: 768px) 100vw, 720px"
            className="h-auto max-h-[86vh] w-full object-contain"
            priority
          />
        </div>
      </div>
    </div>
  );
}

function HeaderTextPlaceholder({ widthClass }: { widthClass: string }) {
  return <span className={`inline-block h-3.5 animate-pulse rounded-full bg-[#ece6d9] ${widthClass}`} aria-hidden="true" />;
}

function NotificationsButton({
  isAuthenticated,
  unreadCount,
  notificationsHref,
  onRequireAuth,
}: {
  isAuthenticated: boolean;
  unreadCount: number;
  notificationsHref: string;
  onRequireAuth: () => void;
}) {
  const safeUnreadCount = Math.max(0, Number(unreadCount || 0));

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onRequireAuth}
        className="relative ml-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#4a4545] shadow-[0_8px_18px_rgba(20,24,27,0.08)]"
        aria-label="Notifications"
      >
        <BellIcon />
      </button>
    );
  }

  return (
    <Link
      href={notificationsHref}
      className="relative ml-4 inline-flex h-9 items-center gap-2 rounded-full bg-white px-3 text-[#4a4545] shadow-[0_8px_18px_rgba(20,24,27,0.08)]"
      aria-label="Notifications"
    >
      <BellIcon />
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4a4545] px-1.5 text-[10px] font-semibold leading-none text-white shadow-[0_6px_12px_rgba(20,24,27,0.16)]">
        {safeUnreadCount}
      </span>
    </Link>
  );
}

function CartButton({
  isAuthenticated,
  cartItemCount,
  onRequireAuth,
  onOpenCartPreview,
}: {
  isAuthenticated: boolean;
  cartItemCount: number;
  onRequireAuth: () => void;
  onOpenCartPreview: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onRequireAuth}
        className="ml-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#4a4545] px-3 text-white shadow-[0_8px_18px_rgba(74,69,69,0.16)]"
        aria-label="Cart"
      >
        <CartIcon />
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold leading-none text-[#4a4545]">
          {cartItemCount}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenCartPreview}
      className="ml-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#4a4545] px-3 text-white shadow-[0_8px_18px_rgba(74,69,69,0.16)]"
      aria-label="Cart"
    >
      <CartIcon />
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold leading-none text-[#4a4545]">
        {cartItemCount}
      </span>
    </button>
  );
}

function HeartButton({
  isAuthenticated,
  favoriteCount,
  favoritesHref,
  onRequireAuth,
  onClearFavorites,
}: {
  isAuthenticated: boolean;
  favoriteCount: number;
  favoritesHref: string;
  onRequireAuth: () => void;
  onClearFavorites: () => void;
}) {
  const showBadge = isAuthenticated;

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onRequireAuth}
        className="relative ml-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f66b77] text-white shadow-[0_8px_18px_rgba(246,107,119,0.2)]"
        aria-label="Lists"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M12 20.2c-.2 0-.4-.1-.6-.2-2.8-1.7-8.4-5.8-9.2-10.7C1.6 6 3.5 3.7 6 3.2c1.9-.4 3.8.3 5.2 1.7 1.4-1.4 3.3-2.1 5.2-1.7 2.5.5 4.4 2.8 3.8 6.1-.8 4.9-6.4 9-9.2 10.7-.2.1-.4.2-.6.2Z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="group relative ml-4">
      <Link
        href={favoritesHref}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-[#f66b77] px-3 text-white shadow-[0_8px_18px_rgba(246,107,119,0.2)]"
        aria-label="Lists"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M12 20.2c-.2 0-.4-.1-.6-.2-2.8-1.7-8.4-5.8-9.2-10.7C1.6 6 3.5 3.7 6 3.2c1.9-.4 3.8.3 5.2 1.7 1.4-1.4 3.3-2.1 5.2-1.7 2.5.5 4.4 2.8 3.8 6.1-.8 4.9-6.4 9-9.2 10.7-.2.1-.4.2-.6.2Z" />
        </svg>
        {showBadge ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-semibold leading-none text-[#f66b77] shadow-[0_6px_12px_rgba(20,24,27,0.16)]">
            {favoriteCount}
          </span>
        ) : null}
      </Link>

      <div className="pointer-events-none absolute right-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <div className="w-56 rounded-[8px] border border-black/5 bg-white p-2 shadow-[0_16px_34px_rgba(20,24,27,0.14)]">
          <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
            {favoriteCount} favourites
          </p>
          <Link
            href={favoritesHref}
            className="flex items-center justify-between rounded-[8px] px-2.5 py-2 text-[12px] font-semibold text-[#202020] transition-colors hover:bg-[#fafafa]"
          >
            <span>View all favourites</span>
            <span aria-hidden="true">→</span>
          </Link>
          <button
            type="button"
            onClick={onClearFavorites}
            className="mt-1 flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-[12px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fff7f7]"
          >
            <span>Clear all favourites</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DesktopHero({ hero }: { hero?: FixedHeroConfig | null }) {
  const images = Array.isArray(hero?.images)
    ? hero.images
        .map((entry) => {
          if (typeof entry === "string") {
            const imageUrl = String(entry || "").trim();
            return imageUrl ? { imageUrl, href: "", blurHashUrl: "" } : null;
          }
          const imageUrl = String(entry?.imageUrl || "").trim();
          const href = String(entry?.href || "").trim();
          const blurHashUrl = String(entry?.blurHashUrl || "").trim();
          return imageUrl ? { imageUrl, href, blurHashUrl } : null;
        })
        .filter(Boolean) as Array<{ imageUrl: string; href: string; blurHashUrl?: string }>
    : [];
  const rotationMs = Math.max(2000, Number(hero?.rotationSeconds || 4) * 1000);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, rotationMs);
    return () => window.clearInterval(timer);
  }, [images.length, rotationMs]);

  return (
    <div className="relative h-full overflow-hidden rounded-[4px] bg-transparent">
      {images.length ? (
        <div className="relative h-full w-full bg-[rgba(255,255,255,0.02)]">
          {images.map((image, index) => (
            <div
              key={`${image.imageUrl}-${index}`}
              className={`absolute inset-0 transition-opacity duration-700 ${index === activeIndex ? "opacity-100" : "opacity-0"}`}
            >
              <div className="pointer-events-none absolute inset-0 scale-[1.18]">
                <Image
                  src={image.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-center opacity-75 blur-3xl saturate-[1.35]"
                  priority={index === 0}
                  aria-hidden="true"
                />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_58%)]" />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] bg-[linear-gradient(90deg,rgba(8,26,79,0.42),transparent)]" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-[18%] bg-[linear-gradient(270deg,rgba(31,17,70,0.42),transparent)]" />
              {image.href ? (
                <Link href={image.href} className="block h-full w-full" aria-label={`Open header hero ${index + 1}`}>
                  <BlurhashImage
                    src={image.imageUrl}
                    blurHash={image.blurHashUrl}
                    alt={`Header hero ${index + 1}`}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="h-full w-full"
                    imageClassName="object-contain object-center"
                    priority={index === 0}
                  />
                </Link>
              ) : (
                <BlurhashImage
                  src={image.imageUrl}
                  blurHash={image.blurHashUrl}
                  alt={`Header hero ${index + 1}`}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="h-full w-full"
                  imageClassName="object-contain object-center"
                  priority={index === 0}
                />
              )}
            </div>
          ))}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,18,55,0.18)_0%,rgba(6,18,55,0.05)_45%,rgba(6,18,55,0.24)_100%)]" />
          {images.length > 1 ? (
            <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
              {images.map((_, index) => (
                <span
                  key={`hero-dot-${index}`}
                  className={`h-2 w-2 rounded-full transition ${index === activeIndex ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden rounded-[4px] bg-[#f1f3f5]"
        >
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(225,229,234,0.92))]" />
          <div className="absolute inset-y-0 left-[-35%] w-[35%] animate-[piessang-image-shimmer_1.25s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.82),transparent)]" />
        </div>
      )}
    </div>
  );
}

function CategoryFlyout({
  department,
  subcategories,
  brands,
  subcategoriesLoading,
  brandsLoading,
  hoveredSubcategorySlug,
  setHoveredSubcategorySlug,
}: {
  department?: Department;
  subcategories: SubCategory[];
  brands: Brand[];
  subcategoriesLoading: boolean;
  brandsLoading: boolean;
  hoveredSubcategorySlug: string;
  setHoveredSubcategorySlug: (slug: string) => void;
}) {
  if (!department) {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute left-[300px] top-0 z-40 h-[430px] w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_12px_30px_rgba(20,24,27,0.18)]">
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex h-full min-h-0 flex-col border-r border-black/5 bg-white px-6 py-5">
          <p className="text-[16px] font-semibold text-[#202020]">{department.title}</p>
          <div className="mt-4 flex-1 min-h-0 space-y-3 overflow-y-auto pr-2">
            {subcategories.map((subcategory) => (
              <Link
                key={subcategory.id}
                href={buildProductsHref({
                  category: department.slug,
                  subCategory: subcategory.slug,
                })}
                className={
                  subcategory.slug === hoveredSubcategorySlug
                    ? "block w-full rounded-[8px] bg-[rgba(203,178,107,0.22)] px-2 py-1 text-left text-[14px] font-bold text-[#4a4545] transition-colors"
                    : "block w-full rounded-[8px] px-2 py-1 text-left text-[14px] font-medium text-[#4f5965] transition-colors hover:bg-[rgba(203,178,107,0.22)] hover:text-[#4a4545]"
                }
                onMouseEnter={() => setHoveredSubcategorySlug(subcategory.slug)}
                onMouseLeave={() => setHoveredSubcategorySlug("")}
              >
                {subcategory.title}
              </Link>
            ))}
            {subcategoriesLoading ? (
              <div className="rounded-[8px] bg-[#fafafa] px-3 py-2 text-[13px] text-[#57636c]">
                Loading sub categories...
              </div>
            ) : !subcategories.length ? (
              <div className="text-[13px] text-[#57636c]">
                Hover a category to load sub categories.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col bg-white px-4 py-5">
          <p className="text-[16px] font-semibold text-[#202020]">Brands</p>
          <div className="mt-4 flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
            {brands.length ? (
              brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={buildProductsHref({
                    category: department.slug,
                    subCategory: hoveredSubcategorySlug || undefined,
                    brand: brand.slug,
                  })}
                  className="flex w-full items-center gap-3 rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-left shadow-[0_4px_12px_rgba(20,24,27,0.04)] transition-colors hover:bg-[rgba(203,178,107,0.18)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-[#202020]">
                      {brand.title}
                    </span>
                    {brand.isFeatured ? (
                      <span className="block truncate text-[11px] text-[#cbb26b]">Featured</span>
                    ) : null}
                  </span>
                </Link>
              ))
            ) : brandsLoading ? (
              <div className="rounded-[8px] bg-[#fafafa] px-3 py-2 text-[13px] text-[#57636c]">
                Loading brands...
              </div>
            ) : (
              <div className="rounded-[8px] bg-[#fafafa] px-3 py-2 text-[13px] text-[#57636c]">
                Hover a sub category to load brands.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileDrawer({
  open,
  onClose,
  departments,
  productCountsBySubCategory,
  authReady,
  isAuthenticated,
  isSeller,
  favoriteCount,
  cartItemCount,
  favoritesHref,
  onRequireAuth,
  onOpenCartPreview,
  onSignOut,
  onOpenLogoMeaning,
}: {
  open: boolean;
  onClose: () => void;
  departments: Department[];
  productCountsBySubCategory: Record<string, number>;
  authReady: boolean;
  isAuthenticated: boolean;
  isSeller: boolean;
  favoriteCount: number;
  cartItemCount: number;
  favoritesHref: string;
  onRequireAuth: () => void;
  onOpenCartPreview: () => void;
  onSignOut: () => void;
  onOpenLogoMeaning: () => void;
}) {
  const { openAuthModal } = useAuth();
  const [view, setView] = useState<"root" | "categories" | "subcategories">("root");
  const [activeDepartment, setActiveDepartment] = useState<Department | null>(null);
  const [mobileSubcategories, setMobileSubcategories] = useState<SubCategory[]>([]);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("root");
      setActiveDepartment(null);
      setMobileSubcategories([]);
      setSubcategoriesLoading(false);
    }
  }, [open]);

  async function openDepartment(department: Department) {
    setActiveDepartment(department);
    setView("subcategories");
    setSubcategoriesLoading(true);
    const items = await fetchSubcategories(department.slug);
    setMobileSubcategories(
      items.filter((item) => {
        const key = `${department.slug}::${item.slug}`;
        return (productCountsBySubCategory[key] ?? 0) > 0;
      }),
    );
    setSubcategoriesLoading(false);
  }

  const rootItems: Array<{
    title: string;
    href: string;
    chevron?: boolean;
    active?: boolean;
    dot?: boolean;
    onClick?: () => void;
  }> = [
    { title: "Home", href: "/" },
    { title: "Shop by Category", href: PRODUCTS_PAGE, chevron: true, active: true, onClick: () => setView("categories") },
    { title: "Deals", href: "/products?onSale=true" },
    { title: "Orders", href: "/account?section=orders" },
    ...(isAuthenticated ? [{ title: "My Account", href: "/account" }] : authReady ? [{ title: "Login", href: "/" }, { title: "Register", href: "/" }] : []),
    { title: "Help Centre", href: "/account?section=support" },
  ] as const;

  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close menu backdrop"
        className={`absolute inset-0 bg-black/35 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative h-full w-[84vw] max-w-[360px] overflow-y-auto bg-[#fcfbf7] shadow-[0_16px_40px_rgba(0,0,0,0.24)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-black/5 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex flex-col items-start gap-1">
              <PiessangLogo />
              <LogoMeaningLink onClick={onOpenLogoMeaning} compact />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[28px] leading-none text-[#4b5563]"
              aria-label="Close menu"
            >
              ×
            </button>
          </div>
          <div className="flex items-center justify-end text-[13px] font-semibold">
            <Link
              href={isSeller ? "/seller/dashboard" : "/sell-on-piessang"}
              className="group inline-flex items-center gap-2 text-[#2563eb] transition-colors hover:text-[#1d4ed8]"
              onClick={onClose}
            >
              {isSeller ? "Open seller dashboard" : "Sell on Piessang"}
              <span
                aria-hidden="true"
                className="text-[16px] leading-none transition-transform duration-200 group-hover:translate-x-[1px]"
              >
                →
              </span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col py-3">
          {view === "root"
            ? rootItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="mx-3 mb-2 flex min-h-[58px] items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 text-[16px] font-medium text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
                  onClick={(event) => {
                    if (item.title === "Shop by Category" && item.onClick) {
                      event.preventDefault();
                      item.onClick();
                      return;
                    }
                    if (!isAuthenticated && item.title === "Login") {
                      event.preventDefault();
                      onClose();
                      openAuthModal("Sign in to access your account and favourites.");
                      return;
                    }
                    if (!isAuthenticated && item.title === "Register") {
                      event.preventDefault();
                      onClose();
                      openAuthModal("Create your Piessang account to continue.");
                      return;
                    }
                    onClose();
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span>{item.title}</span>
                  </span>
                  {item.chevron ? <span className="text-[#b8b8b8]">→</span> : null}
                </Link>
              ))
            : null}
          {view === "root" && !authReady ? (
            <>
              {["auth-loading-1", "auth-loading-2"].map((key) => (
                <div
                  key={key}
                  className="mx-3 mb-2 flex min-h-[58px] items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
                >
                  <HeaderTextPlaceholder widthClass="w-20" />
                  <HeaderTextPlaceholder widthClass="w-4" />
                </div>
              ))}
            </>
          ) : null}

          {view === "categories" ? (
            <>
              <button
                type="button"
                onClick={() => setView("root")}
                className="mx-3 mb-2 flex min-h-[58px] w-auto items-center gap-3 rounded-[14px] border border-black/5 bg-white px-4 text-left text-[16px] font-medium text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
              >
                <span className="text-[#b8b8b8]">←</span>
                <span>All menu items</span>
              </button>
              <Link
                href={PRODUCTS_PAGE}
                onClick={onClose}
                className="mx-3 mb-2 flex min-h-[58px] items-center justify-between rounded-[14px] border border-black/5 bg-[rgba(203,178,107,0.14)] px-4 text-[16px] font-semibold text-[#202020]"
              >
                <span>Browse all products</span>
                <span className="text-[#b8b8b8]">→</span>
              </Link>
              {departments.map((department) => (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => void openDepartment(department)}
                  className="mx-3 mb-2 flex min-h-[58px] w-auto items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 text-left text-[16px] font-medium text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
                >
                  <span>{department.title}</span>
                  <span className="text-[#b8b8b8]">→</span>
                </button>
              ))}
            </>
          ) : null}

          {view === "subcategories" ? (
            <>
              <button
                type="button"
                onClick={() => setView("categories")}
                className="mx-3 mb-2 flex min-h-[58px] w-auto items-center gap-3 rounded-[14px] border border-black/5 bg-white px-4 text-left text-[16px] font-medium text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
              >
                <span className="text-[#b8b8b8]">←</span>
                <span>{activeDepartment?.title || "Categories"}</span>
              </button>
              {activeDepartment ? (
                <Link
                  href={buildProductsHref({ category: activeDepartment.slug })}
                  onClick={onClose}
                  className="mx-3 mb-2 flex min-h-[58px] items-center justify-between rounded-[14px] border border-black/5 bg-[rgba(203,178,107,0.14)] px-4 text-[16px] font-semibold text-[#202020]"
                >
                  <span>View all {activeDepartment.title}</span>
                  <span className="text-[#b8b8b8]">→</span>
                </Link>
              ) : null}
              {subcategoriesLoading ? (
                <div className="mx-3 rounded-[14px] border border-black/5 bg-white px-4 py-5 text-[14px] text-[#6b7280] shadow-[0_6px_18px_rgba(20,24,27,0.04)]">Loading categories...</div>
              ) : mobileSubcategories.length ? (
                mobileSubcategories.map((subCategory) => (
                  <Link
                    key={subCategory.id}
                    href={buildProductsHref({ category: activeDepartment?.slug, subCategory: subCategory.slug })}
                    onClick={onClose}
                    className="mx-3 mb-2 flex min-h-[58px] items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 text-[16px] font-medium text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
                  >
                    <span>{subCategory.title}</span>
                    <span className="text-[#b8b8b8]">→</span>
                  </Link>
                ))
              ) : (
                <div className="mx-3 rounded-[14px] border border-black/5 bg-white px-4 py-5 text-[14px] text-[#6b7280] shadow-[0_6px_18px_rgba(20,24,27,0.04)]">No categories available here yet.</div>
              )}
            </>
          ) : null}

          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (isAuthenticated) onOpenCartPreview();
                else onRequireAuth();
              }}
              className="flex w-full items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 py-3 text-left shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
            >
              <span className="flex items-center gap-3 text-[16px] font-medium text-[#202020]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#249689] text-white">
                  <CartIcon />
                </span>
                Cart
              </span>
              <span className="text-[14px] text-[#8b94a3]">{cartItemCount} Items</span>
            </button>
          </div>

          <div className="px-3 py-2">
            {isAuthenticated ? (
              <Link
                href={favoritesHref}
                onClick={onClose}
                className="flex items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
              >
                <span className="flex items-center gap-3 text-[16px] font-medium text-[#202020]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f46c7b] text-white">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                      <path d="M12 21s-7-4.35-9.5-8.7C.3 9.1 1.8 5.8 5.4 5.1c2-.4 4 .5 5.2 2 1.2-1.5 3.2-2.4 5.2-2 3.6.7 5.1 4 2.9 7.2C19 16.65 12 21 12 21Z" />
                    </svg>
                  </span>
                  Lists
                </span>
                <span className="text-[14px] text-[#8b94a3]">{favoriteCount} Items</span>
              </Link>
            ) : authReady ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireAuth();
                }}
                className="flex w-full items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 py-3 text-left shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
              >
                <span className="flex items-center gap-3 text-[16px] font-medium text-[#202020]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f46c7b] text-white">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                      <path d="M12 21s-7-4.35-9.5-8.7C.3 9.1 1.8 5.8 5.4 5.1c2-.4 4 .5 5.2 2 1.2-1.5 3.2-2.4 5.2-2 3.6.7 5.1 4 2.9 7.2C19 16.65 12 21 12 21Z" />
                    </svg>
                  </span>
                  Lists
                </span>
                <span className="text-[14px] text-[#8b94a3]">0 Items</span>
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(20,24,27,0.04)]">
                <HeaderTextPlaceholder widthClass="w-14" />
                <HeaderTextPlaceholder widthClass="w-12" />
              </div>
            )}
          </div>

          <div className="mt-auto flex items-center justify-center gap-6 border-t border-black/5 bg-[#fafafa] px-5 py-5 text-center">
            {isAuthenticated ? (
              <button type="button" onClick={onSignOut} className="text-[15px] font-semibold text-[#0f80c3]">
                Logout
              </button>
            ) : authReady ? (
              <>
                <button
                  type="button"
                  onClick={() => openAuthModal("Sign in to access your account and favourites.")}
                  className="text-[15px] font-semibold text-[#0f80c3]"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal("Create your Piessang account to continue.")}
                  className="text-[15px] font-semibold text-[#0f80c3]"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <HeaderTextPlaceholder widthClass="w-12" />
                <HeaderTextPlaceholder widthClass="w-16" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PiessangHeader({ showMegaMenu = true }: { showMegaMenu?: boolean }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [logoMeaningOpen, setLogoMeaningOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [fixedHeroConfig, setFixedHeroConfig] = useState<FixedHeroConfig | null>(null);
  const {
    authReady,
    isAuthenticated,
    profile,
    uid,
    isSeller,
    favoriteCount,
    cartItemCount,
    openAuthModal,
    refreshProfile,
    syncCartState,
    signOut,
  } = useAuth();
  const authSettled = authReady || isAuthenticated;
  const showAuthenticatedActions = isAuthenticated;
  const showGuestActions = authReady && !isAuthenticated;
  const catalogueMenuEnabled = showMegaMenu || mobileOpen;
  const {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands,
    subcategoriesLoading,
    brandsLoading,
    productCountsBySubCategory,
    hoveredSubcategorySlug,
    setHoveredSlug,
    setHoveredSubcategorySlug,
  } = useCatalogueMenu(catalogueMenuEnabled);
  const activeDepartment = useMemo(
    () => departments.find((department) => department.slug === hoveredSlug) ?? departments[0],
    [hoveredSlug, departments],
  );
  const favoritesHref = useMemo(() => {
    if (!showAuthenticatedActions || !uid) return "/products";
    const params = new URLSearchParams({
      favoritesOnly: "true",
      userId: uid,
    });
    return `/products?${params.toString()}`;
  }, [showAuthenticatedActions, uid]);
  const notificationsHref = "/account/notifications";

  useEffect(() => {
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const prefetchCommonRoutes = () => {
      void router.prefetch("/");
      void router.prefetch("/products");
      void router.prefetch("/account");
      if (isSeller) {
        void router.prefetch("/seller/dashboard");
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => prefetchCommonRoutes(), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(prefetchCommonRoutes, 300);
    }

    return () => {
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [isSeller, router]);

  useEffect(() => {
    let cancelled = false;
    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    async function loadNotificationCount() {
      if (!showAuthenticatedActions) {
        if (!cancelled) setNotificationUnreadCount(0);
        return;
      }
      const run = async () => {
      try {
        const response = await fetch("/api/client/v1/accounts/notifications", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) return;
        if (!cancelled) {
          setNotificationUnreadCount(Number(payload?.unreadCount || 0));
        }
      } catch {
        if (!cancelled) setNotificationUnreadCount(0);
      }
      };
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(() => {
          void run();
        });
        return;
      }
      timeoutId = setTimeout(() => {
        void run();
      }, 350);
    }
    void loadNotificationCount();
    return () => {
      cancelled = true;
      if (idleCallbackId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [showAuthenticatedActions]);

  useEffect(() => {
    if (!showMegaMenu) return;
    let cancelled = false;
    async function loadFixedHero() {
      try {
        const response = await fetch(LANDING_PAGE_ENDPOINT, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) return;
        if (!cancelled) setFixedHeroConfig(payload?.data?.page?.fixedHero || null);
      } catch {
      }
    }
    void loadFixedHero();
    return () => {
      cancelled = true;
    };
  }, [showMegaMenu]);

  const handleClearFavorites = async () => {
    if (!showAuthenticatedActions || !uid) {
      openAuthModal("Sign in to manage your favourites.");
      return;
    }

    await fetch("/api/client/v1/accounts/favorites/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    });
    await refreshProfile();
    router.push("/products");
  };

  return (
    <header id="bevgo-site-header" className="bg-white shadow-[0_2px_16px_rgba(20,24,27,0.08)]">
      <div className="relative overflow-visible border-b border-black/5 bg-white">
        <div
          className="pointer-events-none absolute inset-0 bg-center bg-cover bg-no-repeat opacity-[0.13]"
          style={{ backgroundImage: "url('/backgrounds/piessang-repeat-background.png')" }}
        />
        <PageBody as="div" className="relative flex h-11 items-center justify-end">
          <div className="flex h-full items-center justify-end gap-4">
            <div className="flex h-full shrink-0 items-center">
              <HeaderDeliveryLocationControl className="h-full border-r-0 px-0 text-[11px]" />
            </div>
            <div className="flex h-full shrink-0 items-center">
              <DisplayCurrencySelector className="text-[11px]" />
            </div>
          </div>
        </PageBody>
      </div>
      <div className="border-b border-black/5 bg-white">
        <PageBody as="div" className="py-4">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-8">
            <div className="hidden lg:flex">
              <div className="flex flex-col items-center gap-1">
                <PiessangLogo />
                <LogoMeaningLink onClick={() => setLogoMeaningOpen(true)} />
              </div>
            </div>
          <div className="hidden items-center gap-0 lg:flex">
              {[
                { label: "Help Centre", href: "/account?section=support" },
                !isSeller ? { label: "Sell on Piessang", href: "/sell-on-piessang" } : null,
              ].map((item) => (
                item ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
                >
                  {item.label}
                </Link>
                ) : null
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-0 lg:flex">
            {showAuthenticatedActions ? (
              <>
                <Link
                  href="/account"
                  className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
                >
                  My Account
                </Link>
                {isSeller ? (
                  <Link
                    href="/seller/dashboard"
                    className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
                  >
                    Seller dashboard
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
                >
                  Logout
                </button>
              </>
            ) : showGuestActions ? (
              <>
                <button
                  type="button"
                  onClick={() => openAuthModal("Sign in to access your account and favourites.")}
                  className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal("Create your Piessang account to continue.")}
                  className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <span className="border-r border-black/10 px-5 last:border-r-0">
                  <HeaderTextPlaceholder widthClass="w-12" />
                </span>
                <span className="border-r border-black/10 px-5 last:border-r-0">
                  <HeaderTextPlaceholder widthClass="w-14" />
                </span>
              </>
            )}
            <NotificationsButton
              isAuthenticated={showAuthenticatedActions}
              unreadCount={notificationUnreadCount}
              notificationsHref={notificationsHref}
              onRequireAuth={() => openAuthModal("Sign in to view your notifications.")}
            />
            <HeartButton
              isAuthenticated={showAuthenticatedActions}
              favoriteCount={favoriteCount}
              favoritesHref={favoritesHref}
              onRequireAuth={() => openAuthModal("Sign in to save favourites.")}
              onClearFavorites={() => void handleClearFavorites()}
            />
              <CartButton
                isAuthenticated={showAuthenticatedActions}
                cartItemCount={cartItemCount}
                onRequireAuth={() => openAuthModal("Sign in to manage your cart.")}
                onOpenCartPreview={() => setCartPreviewOpen(true)}
              />
          </div>
        </div>
        </PageBody>

        <div className="flex w-full items-center justify-between px-3 py-4 lg:hidden lg:px-4">
          <div className="relative flex w-full items-center justify-between">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
              aria-label="Open menu"
              onClick={() => setMobileOpen((open) => !open)}
            >
              <MenuIcon />
            </button>

            <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5">
              <Link href="/">
                <Image
                  src="/logo/Piessang%20Logo.png"
                  alt="Piessang"
                  width={132}
                  height={34}
                  priority
                  className="h-8 w-auto"
                />
              </Link>
              <LogoMeaningLink onClick={() => setLogoMeaningOpen(true)} compact />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const trigger = document.getElementById("piessang-mobile-delivery-trigger");
                  trigger?.click();
                }}
                className="inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
                aria-label="Choose delivery location"
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M10 1.5a5.5 5.5 0 0 0-5.5 5.5c0 4.5 5.5 11.5 5.5 11.5S15.5 11.5 15.5 7A5.5 5.5 0 0 0 10 1.5Zm0 7.75A2.25 2.25 0 1 1 10 4.75a2.25 2.25 0 0 1 0 4.5Z" />
                </svg>
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
                aria-label="Search"
                onClick={() => setMobileSearchOpen(true)}
              >
                <SearchIcon />
              </button>
              <button
                type="button"
                onClick={
                  showAuthenticatedActions
                    ? () => {
                        router.push(notificationsHref);
                      }
                    : () => openAuthModal("Sign in to view your notifications.")
                }
                className="relative inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
                aria-label="Notifications"
              >
                <BellIcon />
                {showAuthenticatedActions && notificationUnreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4a4545] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_6px_12px_rgba(20,24,27,0.16)]">
                    {notificationUnreadCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={
                  showAuthenticatedActions
                    ? () => setCartPreviewOpen(true)
                    : () => openAuthModal("Sign in to manage your cart.")
                }
                className="relative inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
                aria-label="Cart"
              >
                <CartIcon />
                {showAuthenticatedActions && cartItemCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4a4545] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_6px_12px_rgba(20,24,27,0.16)]">
                    {cartItemCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="sr-only lg:hidden">
        <div id="piessang-mobile-delivery-trigger-wrapper">
          <HeaderDeliveryLocationControl triggerId="piessang-mobile-delivery-trigger" className="border-r-0 px-0" />
        </div>
      </div>

      <div className={`fixed inset-0 z-[90] lg:hidden ${mobileSearchOpen ? "" : "pointer-events-none"}`}>
        <button
          type="button"
          aria-label="Close mobile search backdrop"
          className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${mobileSearchOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMobileSearchOpen(false)}
        />
        <aside
          className={`absolute right-0 top-0 flex h-full w-[92vw] max-w-[420px] flex-col overflow-hidden bg-white shadow-[0_20px_48px_rgba(20,24,27,0.22)] transition-transform duration-300 ease-out ${
            mobileSearchOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="border-b border-black/5 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Search Piessang</p>
                <p className="mt-1 text-[14px] text-[#57636c]">Search products, brands, or use image search.</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[28px] leading-none text-[#4b5563]"
                aria-label="Close search"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <SearchBar mobile onNavigate={() => setMobileSearchOpen(false)} />
            </div>
          </div>
        </aside>
      </div>

      <div className="hidden bg-[linear-gradient(90deg,#fdf070_0%,#e4c62d_34%,#e3c52f_68%,#cba726_100%)] lg:block">
        <PageBody as="div" className="py-2">
          <SearchBar />
        </PageBody>
      </div>

      {showMegaMenu ? (
        <div className="border-b border-black/5 bg-transparent lg:hidden">
          <PageBody as="div" className="py-3">
            <div className="h-[180px] overflow-hidden rounded-[16px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] sm:h-[220px]">
              <DesktopHero hero={fixedHeroConfig} />
            </div>
          </PageBody>
        </div>
      ) : null}

      {showMegaMenu ? (
        <div className="hidden border-b border-black/5 bg-transparent lg:block">
          <PageBody as="div" className="py-4">
            <div
              className="relative flex gap-4"
              onMouseLeave={() => {
                setFlyoutOpen(false);
                setHoveredSlug("");
                setHoveredSubcategorySlug("");
              }}
            >
              <div className="relative w-[300px] shrink-0" style={{ height: MENU_HEIGHT }}>
                <aside className="relative h-full overflow-hidden rounded-[4px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
                  <div className="flex h-[48px] items-center justify-between bg-[#4a4545] px-5 text-[16px] font-semibold text-white">
                    <span>Shop by Category</span>
                    <span aria-hidden="true">⌄</span>
                  </div>

                  <div className="flex h-[calc(100%-48px)] flex-col">
                    <div className="flex-1 overflow-y-auto">
                      {departments.length ? (
                        departments.map((department) => (
                          <Link
                            key={department.id}
                            href={buildProductsHref({ category: department.slug })}
                            className={
                              department.slug === hoveredSlug
                                ? "flex h-[40px] w-full items-center justify-between bg-[rgba(203,178,107,0.22)] px-5 text-[14px] font-bold text-[#4a4545] transition-colors"
                                : "flex h-[40px] w-full items-center justify-between bg-white px-5 text-[14px] font-bold text-[#4f5965] transition-colors hover:bg-[rgba(203,178,107,0.22)] hover:text-[#4a4545] focus:bg-[rgba(203,178,107,0.22)] focus:text-[#4a4545]"
                            }
                            onMouseEnter={() => {
                              setHoveredSlug(department.slug);
                              setFlyoutOpen(true);
                              setHoveredSubcategorySlug("");
                            }}
                            onFocus={() => {
                              setHoveredSlug(department.slug);
                              setFlyoutOpen(true);
                              setHoveredSubcategorySlug("");
                            }}
                          >
                            <span>{department.title}</span>
                            <span aria-hidden="true">›</span>
                          </Link>
                        ))
                      ) : (
                        <div className="px-5 py-4 text-[14px] text-[#6b7280]">Loading categories...</div>
                      )}
                    </div>
                  </div>
                </aside>

              </div>

              <div className="hidden h-[430px] flex-1 overflow-hidden rounded-[4px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] lg:block">
                <DesktopHero hero={fixedHeroConfig} />
              </div>

              {flyoutOpen ? (
                <CategoryFlyout
                  department={activeDepartment}
                  subcategories={activeSubcategories}
                  brands={brands}
                  subcategoriesLoading={subcategoriesLoading}
                  brandsLoading={brandsLoading}
                  hoveredSubcategorySlug={hoveredSubcategorySlug}
                  setHoveredSubcategorySlug={setHoveredSubcategorySlug}
                />
              ) : null}
            </div>
          </PageBody>
        </div>
      ) : null}

      {cartPreviewOpen ? (
        <CartPreviewDrawer
          open={cartPreviewOpen}
          onClose={() => setCartPreviewOpen(false)}
          uid={uid}
          onCartChange={syncCartState}
        />
      ) : null}

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        departments={departments}
        productCountsBySubCategory={productCountsBySubCategory}
        authReady={authSettled}
        isAuthenticated={showAuthenticatedActions}
        isSeller={isSeller}
        favoriteCount={favoriteCount}
        cartItemCount={cartItemCount}
        favoritesHref={favoritesHref}
        onRequireAuth={() => openAuthModal("Sign in to manage your cart and favourites.")}
        onOpenCartPreview={() => setCartPreviewOpen(true)}
        onSignOut={() => void signOut()}
        onOpenLogoMeaning={() => setLogoMeaningOpen(true)}
      />

      <LogoMeaningModal open={logoMeaningOpen} onClose={() => setLogoMeaningOpen(false)} />
    </header>
  );
}
