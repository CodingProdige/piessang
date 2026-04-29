"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DisplayCurrencySelector } from "@/components/currency/display-currency-provider";
import { PageBody } from "@/components/layout/page-body";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import {
  formatPreciseShopperDeliveryArea,
  hasPreciseShopperDeliveryArea,
  readShopperDeliveryArea,
  saveShopperDeliveryArea,
  SHOPPER_COUNTRY_OPTIONS,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";
import { appendShopperAreaSearchParams } from "@/lib/shipping/shopper-country";

const CATEGORIES_ENDPOINT = "/api/catalogue/v1/categories/list";
const SUBCATEGORIES_ENDPOINT = "/api/catalogue/v1/subCategories/list";
const BRANDS_ENDPOINT = "/api/catalogue/v1/brands/get";
const PRODUCTS_PAGE = "/products";
const MENU_HEIGHT = 430;
const LANDING_PAGE_ENDPOINT = "/api/client/v1/landing-page/get";
const MEGA_MENU_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const departmentCache = new Map<string, Department[]>();
const subcategoryCache = new Map<string, SubCategory[]>();
const brandCache = new Map<string, Brand[]>();
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
  setHoveredSlug: (slug: string) => void;
  hoveredSubcategorySlug: string;
  setHoveredSubcategorySlug: (slug: string) => void;
};

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
  if (!area) return "Set delivery address";
  return formatPreciseShopperDeliveryArea(area) || area.country || "Set delivery address";
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
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const stored = readShopperDeliveryArea();
    setArea(stored);
    return subscribeToShopperDeliveryArea(setArea);
  }, []);

  const preciseLabel = formatPreciseShopperDeliveryArea(area);
  const hasPreciseArea = hasPreciseShopperDeliveryArea(area);

  return (
    <div className={`relative inline-flex min-w-0 items-center gap-2 border-r border-black/10 px-2 text-[12px] font-semibold text-[#4b5563] sm:px-5 ${className}`}>
      <span className="inline-flex shrink-0 items-center gap-2">
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M10 1.5a5.5 5.5 0 0 0-5.5 5.5c0 4.5 5.5 11.5 5.5 11.5S15.5 11.5 15.5 7A5.5 5.5 0 0 0 10 1.5Zm0 7.75A2.25 2.25 0 1 1 10 4.75a2.25 2.25 0 0 1 0 4.5Z" />
        </svg>
        <span className="hidden lg:inline">Deliver to</span>
      </span>
      <button
        id={triggerId}
        type="button"
        onClick={() => setPickerOpen(true)}
        className="inline-flex min-w-0 max-w-[240px] items-center gap-2 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-left text-[12px] font-semibold text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.04)] hover:border-black/15"
        aria-label={hasPreciseArea ? "Update delivery address" : "Set delivery address"}
      >
        <span className="truncate">{formatDeliveryAreaLabel(area)}</span>
        <svg viewBox="0 0 20 20" className="ml-auto h-4 w-4 shrink-0 fill-current text-[#6b7280]" aria-hidden="true">
          <path d="M5.5 7.5 10 12l4.5-4.5" />
        </svg>
      </button>
      <GooglePlacePickerModal
        open={pickerOpen}
        title="Where should we deliver?"
        initialValue={
          area
            ? {
                formattedAddress: preciseLabel || area.country || undefined,
                streetAddress: area.addressLine1 || undefined,
                country: area.country || undefined,
                region: area.province || undefined,
                city: area.city || undefined,
                suburb: area.suburb || undefined,
                postalCode: area.postalCode || undefined,
                latitude: area.latitude ?? undefined,
                longitude: area.longitude ?? undefined,
              }
            : null
        }
        onClose={() => setPickerOpen(false)}
        onSelect={(value) => {
          const nextArea: ShopperDeliveryArea = {
            countryCode:
              SHOPPER_COUNTRY_OPTIONS.find((entry) => entry.label === String(value.country || "").trim())?.code || null,
            province: String(value.region || "").trim() || null,
            city: String(value.city || "").trim() || null,
            suburb: String(value.suburb || "").trim() || null,
            postalCode: String(value.postalCode || "").trim() || null,
            addressLine1: String(value.streetAddress || value.formattedAddress || "").trim() || null,
            lat: typeof value.latitude === "number" ? value.latitude : null,
            lng: typeof value.longitude === "number" ? value.longitude : null,
            source: "google_places",
            precision:
              typeof value.latitude === "number" && typeof value.longitude === "number" ? "coordinates" : "address",
            country: String(value.country || "").trim() || null,
            latitude: typeof value.latitude === "number" ? value.latitude : null,
            longitude: typeof value.longitude === "number" ? value.longitude : null,
          };
          saveShopperDeliveryArea(nextArea);
          setArea(nextArea);
          setPickerOpen(false);
          router.refresh();
        }}
      />
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

function getShopperAreaCacheKey(area: ShopperDeliveryArea | null) {
  if (!area) return "none";
  const lat = typeof area.latitude === "number" ? area.latitude.toFixed(2) : "";
  const lng = typeof area.longitude === "number" ? area.longitude.toFixed(2) : "";
  return [
    area.countryCode || area.country || "",
    area.province || "",
    area.city || "",
    area.suburb || "",
    area.postalCode || "",
    lat,
    lng,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("::");
}

function readMenuCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; value?: T };
    if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

function writeMenuCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        expiresAt: Date.now() + MEGA_MENU_CACHE_TTL_MS,
        value,
      }),
    );
  } catch {
  }
}

async function fetchDepartments(shopperArea: ShopperDeliveryArea | null = null): Promise<Department[]> {
  try {
    const cacheKey = getShopperAreaCacheKey(shopperArea);
    const cached = departmentCache.get(cacheKey);
    if (cached) return cached;
    const persistedCacheKey = `piessang:mega-menu:departments:${cacheKey}`;
    const persisted = readMenuCache<Department[]>(persistedCacheKey);
    if (persisted) {
      departmentCache.set(cacheKey, persisted);
      return persisted;
    }
    const url = new URL(CATEGORIES_ENDPOINT, window.location.origin);
    appendShopperAreaSearchParams(url.searchParams, shopperArea);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Unable to load categories");

    const payload = (await response.json()) as { items?: CatalogueCategory[] };

    const departments = (payload.items ?? [])
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
    departmentCache.set(cacheKey, departments);
    writeMenuCache(persistedCacheKey, departments);
    return departments;
  } catch {
    return [];
  }
}

async function fetchSubcategories(categorySlug: string, shopperArea: ShopperDeliveryArea | null = null): Promise<SubCategory[]> {
  try {
    const cacheKey = `${categorySlug}::${getShopperAreaCacheKey(shopperArea)}`;
    const cached = subcategoryCache.get(cacheKey);
    if (cached) return cached;
    const persistedCacheKey = `piessang:mega-menu:subcategories:${cacheKey}`;
    const persisted = readMenuCache<SubCategory[]>(persistedCacheKey);
    if (persisted) {
      subcategoryCache.set(cacheKey, persisted);
      return persisted;
    }
    const url = new URL(SUBCATEGORIES_ENDPOINT, window.location.origin);
    url.searchParams.set("category", categorySlug);
    appendShopperAreaSearchParams(url.searchParams, shopperArea);
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

    const subcategories = [...unique.values()].sort((a, b) => a.position - b.position);
    subcategoryCache.set(cacheKey, subcategories);
    writeMenuCache(persistedCacheKey, subcategories);
    return subcategories;
  } catch {
    return [];
  }
}

async function fetchBrands(
  categorySlug: string,
  subCategorySlug?: string,
  shopperArea: ShopperDeliveryArea | null = null,
): Promise<Brand[]> {
  try {
    const cacheKey = `${categorySlug}::${subCategorySlug || "*"}::${getShopperAreaCacheKey(shopperArea)}`;
    const cached = brandCache.get(cacheKey);
    if (cached) return cached;
    const persistedCacheKey = `piessang:mega-menu:brands:${cacheKey}`;
    const persisted = readMenuCache<Brand[]>(persistedCacheKey);
    if (persisted) {
      brandCache.set(cacheKey, persisted);
      return persisted;
    }
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

    const brands = [...unique.values()].sort((a, b) => a.position - b.position);
    brandCache.set(cacheKey, brands);
    writeMenuCache(persistedCacheKey, brands);
    return brands;
  } catch {
    return [];
  }
}

function useCatalogueMenu(enabled = true): MenuState {
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [shopperArea, setShopperArea] = useState<ShopperDeliveryArea | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState("");
  const [hoveredSubcategorySlug, setHoveredSubcategorySlug] = useState("");
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<Record<string, SubCategory[]>>(
    {},
  );
  const [brandsByKey, setBrandsByKey] = useState<Record<string, Brand[]>>({});
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const subcategoryRequestId = useRef(0);
  const brandRequestId = useRef(0);

  useEffect(() => {
    setShopperArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea((area) => {
      setShopperArea(area);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void fetchDepartments(shopperArea).then((items) => {
      if (cancelled) return;
      setAllDepartments(items);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, shopperArea]);

  const departments = allDepartments;

  useEffect(() => {
    if (!enabled) return;
    if (!departments.length) return;
    departments.slice(0, 4).forEach((department) => {
      void fetchSubcategories(department.slug, shopperArea).then((items) => {
        setSubcategoriesByCategory((current) =>
          current[department.slug] ? current : { ...current, [department.slug]: items },
        );
      });
    });
  }, [departments, enabled, shopperArea]);

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
    if (subcategoriesByCategory[categorySlug]) {
      setSubcategoriesLoading(false);
      return;
    }

    const requestId = ++subcategoryRequestId.current;
    setSubcategoriesLoading(true);

    void fetchSubcategories(categorySlug, shopperArea).then((items) => {
      if (subcategoryRequestId.current !== requestId) return;
      setSubcategoriesByCategory((current) => ({
        ...current,
        [categorySlug]: items,
      }));
      setSubcategoriesLoading(false);
    });
  }, [hoveredSlug, enabled, shopperArea, subcategoriesByCategory]);

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
    void fetchBrands(displayCategorySlug, displaySubcategorySlug || undefined, shopperArea).then((items) => {
      if (brandRequestId.current !== requestId) return;
      setBrandsByKey((current) => ({ ...current, [key]: items }));
      setBrandsLoading(false);
    });
  }, [displayCategorySlug, displaySubcategorySlug, brandsByKey, enabled, shopperArea]);

  const activeBrands = displayCategorySlug
    ? (brandsByKey[`${displayCategorySlug}::${displaySubcategorySlug || "*"}`] ?? [])
    : [];

  return {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands: activeBrands,
    subcategoriesLoading,
    brandsLoading,
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
        src="/logo/Piessang Logo Full - Clipped.png"
        alt="Piessang"
        width={220}
        height={52}
        priority
        className="h-8 w-auto sm:h-9 lg:h-10"
      />
    </Link>
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
  canAccessCart,
  cartItemCount,
  cartPulseKey,
  onOpenCartPreview,
}: {
  canAccessCart: boolean;
  cartItemCount: number;
  cartPulseKey: number;
  onOpenCartPreview: () => void;
}) {
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (!cartPulseKey) return undefined;
    setIsPulsing(true);
    const timeout = window.setTimeout(() => setIsPulsing(false), 520);
    return () => window.clearTimeout(timeout);
  }, [cartPulseKey]);

  const badgeClassName = `inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold leading-none text-[#4a4545] transition-transform duration-300 ${
    isPulsing ? "scale-[1.18]" : "scale-100"
  }`;
  const buttonClassName = `ml-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#4a4545] px-3 text-white shadow-[0_8px_18px_rgba(74,69,69,0.16)] transition-transform duration-300 ${
    isPulsing ? "scale-[1.03]" : "scale-100"
  }`;

  return (
    <button
      type="button"
      onClick={canAccessCart ? onOpenCartPreview : () => {}}
      className={buttonClassName}
      aria-label="Cart"
    >
      <CartIcon />
      <span className={badgeClassName}>
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

function useHeaderAuthControlsState() {
  const router = useRouter();
  const {
    authReady,
    isAuthenticated,
    uid,
    isSeller,
    favoriteCount,
    cartItemCount,
    cartOwnerId,
    cartPulseKey,
    profile,
    openAuthModal,
    refreshProfile,
    signOut,
  } = useAuth();
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const authSettled = authReady || isAuthenticated;
  const showAuthenticatedActions = isAuthenticated;
  const showGuestActions = authReady && !isAuthenticated;
  const accountEmail = String(profile?.email || "").trim();
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

  const handleClearFavorites = useCallback(async () => {
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
  }, [openAuthModal, refreshProfile, router, showAuthenticatedActions, uid]);

  return {
    authSettled,
    showAuthenticatedActions,
    showGuestActions,
    isSeller,
    favoriteCount,
    cartItemCount,
    cartOwnerId,
    cartPulseKey,
    accountEmail,
    notificationUnreadCount,
    favoritesHref,
    notificationsHref,
    openAuthModal,
    signOut,
    handleClearFavorites,
  };
}

type HeaderAuthControlsState = ReturnType<typeof useHeaderAuthControlsState>;

function DesktopHeaderAuthControls({
  authState,
  onOpenCartPreview,
}: {
  authState: HeaderAuthControlsState;
  onOpenCartPreview: () => void;
}) {
  const {
    showAuthenticatedActions,
    showGuestActions,
    isSeller,
    favoriteCount,
    cartItemCount,
    cartOwnerId,
    cartPulseKey,
    accountEmail,
    notificationUnreadCount,
    favoritesHref,
    notificationsHref,
    openAuthModal,
    signOut,
    handleClearFavorites,
  } = authState;

  return (
    <div className="hidden items-center gap-0 lg:flex">
      {showAuthenticatedActions ? (
        <>
          <Link
            href="/account"
            className="flex min-w-0 flex-col justify-center border-r border-black/10 px-5 text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
          >
            <span className="text-[12px] font-semibold leading-tight">My Account</span>
            {accountEmail ? (
              <span className="mt-0.5 max-w-[180px] truncate text-[10px] font-medium leading-tight text-[#8b94a3]">
                {accountEmail}
              </span>
            ) : null}
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
        canAccessCart={Boolean(cartOwnerId)}
        cartItemCount={cartItemCount}
        cartPulseKey={cartPulseKey}
        onOpenCartPreview={onOpenCartPreview}
      />
    </div>
  );
}

function DesktopHeaderSupportLinks({ isSeller }: { isSeller: boolean }) {

  return (
    <div className="hidden items-center gap-0 lg:flex">
      {[
        { label: "Help Centre", href: "/account?section=support" },
        !isSeller ? { label: "Sell on Piessang", href: "/sell-on-piessang" } : null,
      ].map((item) =>
        item ? (
          <Link
            key={item.label}
            href={item.href}
            className="border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] last:border-r-0 hover:text-[#2f343b]"
          >
            {item.label}
          </Link>
        ) : null,
      )}
    </div>
  );
}

function MobileHeaderAuthActions({
  authState,
  onOpenCartPreview,
}: {
  authState: HeaderAuthControlsState;
  onOpenCartPreview: () => void;
}) {
  const router = useRouter();
  const {
    showAuthenticatedActions,
    cartItemCount,
    cartOwnerId,
    cartPulseKey,
    notificationUnreadCount,
    notificationsHref,
    openAuthModal,
  } = authState;
  const [isCartPulsing, setIsCartPulsing] = useState(false);

  useEffect(() => {
    if (!cartPulseKey) return undefined;
    setIsCartPulsing(true);
    const timeout = window.setTimeout(() => setIsCartPulsing(false), 520);
    return () => window.clearTimeout(timeout);
  }, [cartPulseKey]);

  return (
    <>
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
        onClick={cartOwnerId ? onOpenCartPreview : () => {}}
        className="relative inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
        aria-label="Cart"
      >
        <CartIcon />
        {cartItemCount > 0 ? (
          <span
            className={`absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4a4545] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_6px_12px_rgba(20,24,27,0.16)] transition-transform duration-300 ${
              isCartPulsing ? "scale-[1.16]" : "scale-100"
            }`}
          >
            {cartItemCount}
          </span>
        ) : null}
      </button>
    </>
  );
}

function HeaderCartPreviewBridge({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { uid, cartOwnerId, syncCartState } = useAuth();

  if (!open) return null;

  return (
    <CartPreviewDrawer
      open={open}
      onClose={onClose}
      cartOwnerId={cartOwnerId || uid}
      onCartChange={syncCartState}
    />
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
          <div className="mt-4 flex-1 min-h-0 space-y-2 overflow-y-auto pr-2">
            {subcategories.map((subcategory) => (
              <Link
                key={subcategory.id}
                href={buildProductsHref({
                  category: department.slug,
                  subCategory: subcategory.slug,
                })}
                className={
                  subcategory.slug === hoveredSubcategorySlug
                    ? "block w-full rounded-[8px] bg-[rgba(203,178,107,0.22)] px-2 py-0.5 text-left text-[#4a4545] transition-colors"
                    : "block w-full rounded-[8px] px-2 py-0.5 text-left text-[#4f5965] transition-colors hover:bg-[rgba(203,178,107,0.22)] hover:text-[#4a4545]"
                }
                onMouseEnter={() => setHoveredSubcategorySlug(subcategory.slug)}
                onMouseLeave={() => setHoveredSubcategorySlug("")}
              >
                <span className="block truncate text-[12px] font-semibold">{subcategory.title}</span>
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
                  className="flex w-full items-center gap-3 rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-1.5 text-left shadow-[0_4px_12px_rgba(20,24,27,0.04)] transition-colors hover:bg-[rgba(203,178,107,0.18)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[#202020]">
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
  authState,
  onOpenCartPreview,
}: {
  open: boolean;
  onClose: () => void;
  departments: Department[];
  authState: HeaderAuthControlsState;
  onOpenCartPreview: () => void;
}) {
  const {
    authSettled: authReady,
    showAuthenticatedActions: isAuthenticated,
    isSeller,
    accountEmail,
    favoriteCount,
    cartItemCount,
    favoritesHref,
    openAuthModal,
    signOut,
  } = authState;
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
    setMobileSubcategories(items);
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
            <PiessangLogo />
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

        {isAuthenticated && accountEmail ? (
          <div className="mx-3 mt-3 rounded-[14px] border border-black/5 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(20,24,27,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Signed in as</p>
            <p className="mt-1 truncate text-[13px] font-semibold text-[#4b5563]">{accountEmail}</p>
          </div>
        ) : null}

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
                  className="mx-3 mb-2 flex min-h-[64px] w-auto items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 py-2 text-left text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-medium">{department.title}</span>
                  </span>
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
                    className="mx-3 mb-2 flex min-h-[64px] items-center justify-between rounded-[14px] border border-black/5 bg-white px-4 py-2 text-[#4b5563] shadow-[0_6px_18px_rgba(20,24,27,0.04)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-medium">{subCategory.title}</span>
                    </span>
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
                  else openAuthModal("Sign in to manage your cart and favourites.");
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
                  openAuthModal("Sign in to manage your cart and favourites.");
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
              <button type="button" onClick={() => void signOut()} className="text-[15px] font-semibold text-[#0f80c3]">
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const [fixedHeroConfig, setFixedHeroConfig] = useState<FixedHeroConfig | null>(null);
  const authState = useHeaderAuthControlsState();
  const catalogueMenuEnabled = showMegaMenu || mobileOpen;
  const {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands,
    subcategoriesLoading,
    brandsLoading,
    hoveredSubcategorySlug,
    setHoveredSlug,
    setHoveredSubcategorySlug,
  } = useCatalogueMenu(catalogueMenuEnabled);
  const activeDepartment = useMemo(
    () => departments.find((department) => department.slug === hoveredSlug) ?? departments[0],
    [hoveredSlug, departments],
  );

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
              <PiessangLogo />
            </div>
            <DesktopHeaderSupportLinks isSeller={authState.isSeller} />
          </div>

          <DesktopHeaderAuthControls authState={authState} onOpenCartPreview={() => setCartPreviewOpen(true)} />
        </div>
        </PageBody>

        <div className="flex w-full items-center px-3 py-4 lg:hidden lg:px-4">
          <div className="grid w-full grid-cols-[40px_minmax(0,1fr)_88px] items-start gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
              aria-label="Open menu"
              onClick={() => setMobileOpen((open) => !open)}
            >
              <MenuIcon />
            </button>

            <div className="flex min-w-0 flex-col items-center gap-0.5 pt-0.5">
              <Link href="/">
                <Image
                  src="/logo/Piessang Logo Full - Clipped.png"
                  alt="Piessang"
                  width={164}
                  height={40}
                  priority
                  className="h-8 w-auto max-w-full"
                />
              </Link>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[#4b5563]"
                aria-label="Search"
                onClick={() => setMobileSearchOpen(true)}
              >
                <SearchIcon />
              </button>
              <MobileHeaderAuthActions authState={authState} onOpenCartPreview={() => setCartPreviewOpen(true)} />
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
                  <div className="flex h-[38px] items-center justify-between bg-[#4a4545] px-3 text-[13px] font-semibold text-white">
                    <span>Shop by Category</span>
                    <span aria-hidden="true">⌄</span>
                  </div>

                  <div className="flex h-[calc(100%-38px)] flex-col">
                    <div className="flex-1 overflow-y-auto">
                      {departments.length ? (
                        departments.map((department) => (
                          <Link
                            key={department.id}
                            href={buildProductsHref({ category: department.slug })}
                            className={
                              department.slug === hoveredSlug
                                ? "flex min-h-[36px] w-full items-center justify-between bg-[rgba(203,178,107,0.22)] px-3 py-1 text-[#4a4545] transition-colors"
                                : "flex min-h-[36px] w-full items-center justify-between bg-white px-3 py-1 text-[#4f5965] transition-colors hover:bg-[rgba(203,178,107,0.22)] hover:text-[#4a4545] focus:bg-[rgba(203,178,107,0.22)] focus:text-[#4a4545]"
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
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-semibold">{department.title}</span>
                            </span>
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

      <HeaderCartPreviewBridge open={cartPreviewOpen} onClose={() => setCartPreviewOpen(false)} />

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        departments={departments}
        authState={authState}
        onOpenCartPreview={() => setCartPreviewOpen(true)}
      />
    </header>
  );
}
