"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CartActionStack } from "@/components/cart/cart-actions";
import { CartItemCard } from "@/components/cart/cart-item-card";
import { DisplayCurrencySelector, useDisplayCurrency } from "@/components/currency/display-currency-provider";
import {
  readShopperDeliveryArea,
  saveShopperDeliveryArea,
  subscribeToShopperDeliveryArea,
  type ShopperDeliveryArea,
} from "@/components/products/delivery-area-gate";
import { GooglePlacePickerModal, reverseGeocodeCoordinates } from "@/components/shared/google-place-picker-modal";

const CATEGORIES_ENDPOINT = "/api/catalogue/v1/categories/list";
const SUBCATEGORIES_ENDPOINT = "/api/catalogue/v1/subCategories/list";
const BRANDS_ENDPOINT = "/api/catalogue/v1/brands/get";
const PRODUCTS_ENDPOINT = "/api/catalogue/v1/products/product/get";
const PRODUCTS_PAGE = "/products";
const MENU_HEIGHT = 430;
const DELIVERY_PROMPT_DISMISSED_KEY = "piessang-delivery-prompt-dismissed";

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
  productCountsBySubCategory: Record<string, number>;
  setHoveredSlug: (slug: string) => void;
  hoveredSubcategorySlug: string;
  setHoveredSubcategorySlug: (slug: string) => void;
};

type ProductAvailabilitySummary = {
  categoryCounts: Record<string, number>;
  subCategoryCounts: Record<string, number>;
};

function formatDeliveryAreaLabel(area: ShopperDeliveryArea | null) {
  if (!area) return "Set delivery location";
  return [area.suburb, area.city, area.province, area.country].filter(Boolean)[0] || "Delivery location";
}

function HeaderDeliveryLocationControl({
  triggerId,
  className = "",
}: {
  triggerId?: string;
  className?: string;
}) {
  const { isAuthenticated } = useAuth();
  const [area, setArea] = useState<ShopperDeliveryArea | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    setArea(readShopperDeliveryArea());
    return subscribeToShopperDeliveryArea(setArea);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (area) return;

    if (isAuthenticated) {
      const dismissed = window.sessionStorage.getItem(DELIVERY_PROMPT_DISMISSED_KEY) === "1";
      if (!dismissed) {
        setPickerOpen(true);
        window.sessionStorage.setItem(DELIVERY_PROMPT_DISMISSED_KEY, "1");
      }
      return;
    }

    if (!navigator.geolocation) return;

    let cancelled = false;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (cancelled) return;
        try {
          const place = await reverseGeocodeCoordinates(position.coords.latitude, position.coords.longitude);
          if (cancelled) return;
          const nextArea = {
            city: String(place.city || "").trim(),
            province: String(place.region || "").trim(),
            suburb: String(place.suburb || "").trim(),
            postalCode: String(place.postalCode || "").trim(),
            country: String(place.country || "").trim(),
            latitude: typeof place.latitude === "number" ? place.latitude : null,
            longitude: typeof place.longitude === "number" ? place.longitude : null,
          };
          if (nextArea.city || nextArea.province) {
            saveShopperDeliveryArea(nextArea);
            setArea(nextArea);
          }
        } catch (error) {
          if (!cancelled) {
            setGeoError(error instanceof Error ? error.message : "Unable to detect your location.");
            setPickerOpen(true);
          }
        } finally {
          if (!cancelled) setGeoLoading(false);
        }
      },
      (error) => {
        if (cancelled) return;
        setGeoLoading(false);
        if (error?.code !== error.PERMISSION_DENIED) {
          setGeoError("Unable to detect your location right now.");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [area, isAuthenticated]);

  return (
    <>
      <button
        id={triggerId}
        type="button"
        onClick={() => setPickerOpen(true)}
        className={`inline-flex items-center gap-2 border-r border-black/10 px-5 text-[12px] font-semibold text-[#4b5563] hover:text-[#2f343b] ${className}`}
        title={area ? `${area.city}${area.province ? `, ${area.province}` : ""}` : "Set your delivery location"}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
          <path d="M10 1.5a5.5 5.5 0 0 0-5.5 5.5c0 4.5 5.5 11.5 5.5 11.5S15.5 11.5 15.5 7A5.5 5.5 0 0 0 10 1.5Zm0 7.75A2.25 2.25 0 1 1 10 4.75a2.25 2.25 0 0 1 0 4.5Z" />
        </svg>
        <span>{geoLoading ? "Checking location..." : formatDeliveryAreaLabel(area)}</span>
      </button>
      {geoError ? <span className="hidden text-[11px] text-[#8b94a3] lg:inline">{geoError}</span> : null}
      <GooglePlacePickerModal
        open={pickerOpen}
        title="Choose your delivery location"
        initialValue={
          area
            ? {
                city: area.city,
                region: area.province,
                suburb: area.suburb,
                postalCode: area.postalCode,
                country: area.country,
                latitude: area.latitude,
                longitude: area.longitude,
              }
            : null
        }
        onClose={() => setPickerOpen(false)}
        onSelect={(value) => {
          const nextArea = {
            city: String(value.city || "").trim(),
            province: String(value.region || "").trim(),
            suburb: String(value.suburb || "").trim(),
            postalCode: String(value.postalCode || "").trim(),
            country: String(value.country || "").trim(),
            latitude: typeof value.latitude === "number" ? value.latitude : null,
            longitude: typeof value.longitude === "number" ? value.longitude : null,
          };
          saveShopperDeliveryArea(nextArea);
          setArea(nextArea);
          setPickerOpen(false);
        }}
      />
    </>
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

    const payload = (await response.json()) as { items?: Array<{ data?: { grouping?: { category?: string; subCategory?: string } } }> };
    const categoryCounts: Record<string, number> = {};
    const subCategoryCounts: Record<string, number> = {};

    for (const item of payload.items ?? []) {
      const category = item?.data?.grouping?.category?.trim();
      const subCategory = item?.data?.grouping?.subCategory?.trim();
      if (category) {
        categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      }
      if (category && subCategory) {
        const key = `${category}::${subCategory}`;
        subCategoryCounts[key] = (subCategoryCounts[key] ?? 0) + 1;
      }
    }

    return { categoryCounts, subCategoryCounts };
  } catch {
    return { categoryCounts: {}, subCategoryCounts: {} };
  }
}

function useCatalogueMenu(): MenuState {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hoveredSlug, setHoveredSlug] = useState("");
  const [hoveredSubcategorySlug, setHoveredSubcategorySlug] = useState("");
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<Record<string, SubCategory[]>>(
    {},
  );
  const [brandsByKey, setBrandsByKey] = useState<Record<string, Brand[]>>({});
  const [productCountsBySubCategory, setProductCountsBySubCategory] = useState<Record<string, number>>({});
  const subcategoryRequestId = useRef(0);
  const brandRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([fetchDepartments(), fetchProductAvailabilitySummary()]).then(([items, summary]) => {
      if (cancelled) return;
      setDepartments(items.filter((item) => (summary.categoryCounts[item.slug] ?? 0) > 0));
      setProductCountsBySubCategory(summary.subCategoryCounts);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hoveredSlug) return;
    if (departments.some((department) => department.slug === hoveredSlug)) return;
    setHoveredSlug("");
    setHoveredSubcategorySlug("");
  }, [departments, hoveredSlug]);

  useEffect(() => {
    const categorySlug = hoveredSlug;
    if (!categorySlug) return;

    const requestId = ++subcategoryRequestId.current;

    void fetchSubcategories(categorySlug).then((items) => {
      if (subcategoryRequestId.current !== requestId) return;
      setSubcategoriesByCategory((current) => ({
        ...current,
        [categorySlug]: items.filter((item) => {
          const key = `${categorySlug}::${item.slug}`;
          return (productCountsBySubCategory[key] ?? 0) > 0;
        }),
      }));
    });
  }, [hoveredSlug, productCountsBySubCategory]);

  const displayCategorySlug = hoveredSlug;
  const activeSubcategories = displayCategorySlug ? subcategoriesByCategory[displayCategorySlug] ?? [] : [];
  const displaySubcategorySlug = hoveredSubcategorySlug || "";

  useEffect(() => {
    if (!displayCategorySlug) return;
    if (!displaySubcategorySlug) return;
    if (activeSubcategories.some((item) => item.slug === displaySubcategorySlug)) return;
    setHoveredSubcategorySlug("");
  }, [activeSubcategories, displayCategorySlug, displaySubcategorySlug]);

  useEffect(() => {
    if (!displayCategorySlug) return;

    const key = `${displayCategorySlug}::${displaySubcategorySlug || "*"}`;
    if (brandsByKey[key]) return;

    const requestId = ++brandRequestId.current;
    void fetchBrands(displayCategorySlug, displaySubcategorySlug || undefined).then((items) => {
      if (brandRequestId.current !== requestId) return;
      setBrandsByKey((current) => ({ ...current, [key]: items }));
    });
  }, [displayCategorySlug, displaySubcategorySlug, brandsByKey]);

  const activeBrands = displayCategorySlug
    ? brandsByKey[`${displayCategorySlug}::${displaySubcategorySlug || "*"}`] ?? []
    : [];

  return {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands: activeBrands,
    productCountsBySubCategory,
    setHoveredSlug,
    setHoveredSubcategorySlug,
    hoveredSubcategorySlug,
  };
}

function SearchBar() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<
    Array<{
      id: string;
      title: string;
      href: string;
      brand: string;
      imageUrl: string;
    }>
  >([]);
  const hasTypedQuery = query.trim().length >= 2;
  const searchHistoryKey = "piessang_search_history_v1";

  const pageSuggestions = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    if (queryText.length < 2) return [];

    const pages = [
      { title: "All products", description: "Browse the full catalogue", href: "/products", keywords: ["products", "shop", "browse", "catalogue", "catalog"] },
      { title: "Categories", description: "Browse product categories", href: "/categories", keywords: ["categories", "category", "departments"] },
      { title: "New arrivals", description: "See what just landed on Piessang", href: "/products?newArrivals=true", keywords: ["new", "new arrivals", "latest", "fresh"] },
      { title: "Deals", description: "View products currently on sale", href: "/products?onSale=true", keywords: ["deals", "sale", "discount", "offers"] },
      { title: "My account", description: "Manage your account and preferences", href: "/account", keywords: ["account", "profile", "settings"] },
      { title: "Orders", description: "Track your orders and returns", href: "/account?section=orders", keywords: ["orders", "purchases", "returns"] },
      { title: "Support tickets", description: "Open or manage your support requests", href: "/support/tickets", keywords: ["support", "ticket", "tickets", "help"] },
      { title: "Contact us", description: "Get help from Piessang support", href: "/contact", keywords: ["contact", "support", "email", "help"] },
      { title: "Delivery", description: "Read delivery information and policies", href: "/delivery", keywords: ["delivery", "shipping", "courier"] },
      { title: "Returns", description: "Read the returns and refunds policy", href: "/returns", keywords: ["returns", "refunds", "refund"] },
      { title: "Privacy policy", description: "Read how Piessang handles your data", href: "/privacy", keywords: ["privacy", "data", "policy"] },
      { title: "Terms", description: "Read the marketplace terms and rules", href: "/terms", keywords: ["terms", "legal", "policy"] },
    ];

    return pages
      .filter((page) => {
        const haystack = [page.title, page.description, ...page.keywords].join(" ").toLowerCase();
        return haystack.includes(queryText);
      })
      .slice(0, 4);
  }, [query]);

  const filteredRecentSearches = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    if (!queryText) return recentSearches.slice(0, 6);
    return recentSearches.filter((item) => item.toLowerCase().includes(queryText)).slice(0, 6);
  }, [query, recentSearches]);

  const filteredTrendingSearches = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    const withoutRecent = trendingSearches.filter(
      (item) => !recentSearches.some((recent) => recent.toLowerCase() === item.toLowerCase()),
    );
    if (!queryText) return withoutRecent.slice(0, 6);
    return withoutRecent.filter((item) => item.toLowerCase().includes(queryText)).slice(0, 6);
  }, [query, recentSearches, trendingSearches]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(searchHistoryKey);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return;
      setRecentSearches(
        parsed
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .slice(0, 6),
      );
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTrendingSearches() {
      try {
        const response = await fetch("/api/client/v1/search/queries", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || payload?.ok === false) return;
        const items = Array.isArray(payload?.data?.items)
          ? payload.data.items
          : Array.isArray(payload?.items)
            ? payload.items
            : [];
        if (cancelled) return;
        setTrendingSearches(
          items
            .map((item: any) => String(item?.query || "").trim())
            .filter(Boolean)
            .slice(0, 6),
        );
      } catch {}
    }

    loadTrendingSearches();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          search: trimmed,
          limit: "6",
          isActive: "true",
        });
        const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || payload?.ok === false) {
          if (!cancelled) setSuggestions([]);
          return;
        }

        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (cancelled) return;
        setSuggestions(
          items
            .map((item: any) => {
              const slug = String(
                item?.data?.product?.slug ||
                item?.data?.product?.handle ||
                item?.data?.docId ||
                item?.data?.product?.unique_id ||
                item?.id ||
                "",
              ).trim();
              const title = String(item?.data?.product?.title || "").trim();
              if (!slug || !title) return null;
              return {
                id: String(item?.id || item?.data?.docId || slug),
                title,
                href: `/products/${encodeURIComponent(slug)}`,
                brand: String(item?.data?.brand?.title || item?.data?.grouping?.brand || "").trim(),
                imageUrl: String(item?.data?.media?.images?.[0]?.imageUrl || "").trim(),
              };
            })
            .filter(Boolean),
        );
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function persistRecentSearch(search: string) {
    const normalized = search.trim();
    if (!normalized || typeof window === "undefined") return;
    const next = [normalized, ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 6);
    setRecentSearches(next);
    try {
      window.localStorage.setItem(searchHistoryKey, JSON.stringify(next));
    } catch {}
  }

  async function trackSearch(search: string) {
    try {
      await fetch("/api/client/v1/search/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: search }),
      });
    } catch {}
  }

  function submitSearch(nextQuery?: string) {
    const search = String(nextQuery ?? query).trim();
    if (!search) return;
    persistRecentSearch(search);
    void trackSearch(search);
    setOpen(false);
    router.push(`/products?search=${encodeURIComponent(search)}`);
  }

  const shouldShowDropdown =
    open &&
    (hasTypedQuery ||
      filteredRecentSearches.length > 0 ||
      filteredTrendingSearches.length > 0 ||
      loading);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1">
      <form
        action="/products"
        className="flex min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
      >
      <label className="flex min-w-0 flex-1 items-center rounded-l-[4px] bg-white px-4 py-1.5 shadow-[0_4px_14px_rgba(20,24,27,0.08)]">
        <input
          type="search"
          name="search"
          value={query}
          placeholder="Search for products, brands..."
          className="w-full bg-transparent text-[15px] text-[#4b5563] outline-none placeholder:text-[#8a94a3]"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </label>
      <button
        type="submit"
        className="inline-flex h-[36px] w-[46px] items-center justify-center rounded-r-[4px] bg-[#4a4545] text-white shadow-[0_4px_14px_rgba(20,24,27,0.12)]"
        aria-label="Search"
      >
        ⌕
      </button>
      </form>

      {shouldShowDropdown ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] overflow-hidden rounded-[10px] border border-black/5 bg-white shadow-[0_18px_40px_rgba(20,24,27,0.16)]">
          {hasTypedQuery ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => submitSearch()}
              className="flex w-full items-center justify-between border-b border-black/5 px-4 py-3 text-left hover:bg-[#faf7ef]"
            >
              <span>
                <span className="block text-[13px] font-semibold text-[#202020]">Search for "{query.trim()}"</span>
                <span className="mt-0.5 block text-[12px] text-[#57636c]">View all matching products</span>
              </span>
              <span className="text-[16px] text-[#b8b8b8]">→</span>
            </button>
          ) : null}

          {filteredRecentSearches.length ? (
            <div className="border-b border-black/5">
              <div className="bg-[#fcfbf7] px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Recent searches</p>
              </div>
              <div>
                {filteredRecentSearches.map((item) => (
                  <button
                    key={`recent-${item}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitSearch(item)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#202020]">{item}</span>
                      <span className="mt-0.5 block text-[12px] text-[#57636c]">Search again</span>
                    </span>
                    <span className="text-[16px] text-[#b8b8b8]">↺</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {filteredTrendingSearches.length ? (
            <div className="border-b border-black/5">
              <div className="bg-[#fcfbf7] px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Popular searches</p>
              </div>
              <div>
                {filteredTrendingSearches.map((item) => (
                  <button
                    key={`trending-${item}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitSearch(item)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#202020]">{item}</span>
                      <span className="mt-0.5 block text-[12px] text-[#57636c]">Popular on Piessang</span>
                    </span>
                    <span className="text-[16px] text-[#b8b8b8]">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {pageSuggestions.length ? (
            <div className="border-b border-black/5">
              <div className="bg-[#fcfbf7] px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Suggested pages</p>
              </div>
              <div>
                {pageSuggestions.map((page) => (
                  <button
                    key={page.href}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      router.push(page.href);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#202020]">{page.title}</span>
                      <span className="mt-0.5 block text-[12px] text-[#57636c]">{page.description}</span>
                    </span>
                    <span className="text-[16px] text-[#b8b8b8]">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {suggestions.length ? (
            <div className="border-y border-black/5 bg-[#fcfbf7] px-4 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Matching products</p>
            </div>
          ) : null}

          {loading ? (
            <div className="px-4 py-3 text-[12px] text-[#57636c]">Searching…</div>
          ) : suggestions.length ? (
            <div className="max-h-[360px] overflow-y-auto">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fafafa]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[#f5f5f5]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Item</span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[#202020]">{item.title}</span>
                    {item.brand ? (
                      <span className="mt-0.5 block truncate text-[12px] text-[#57636c]">{item.brand}</span>
                    ) : null}
                  </span>
                  <span className="text-[16px] text-[#b8b8b8]">→</span>
                </button>
              ))}
            </div>
          ) : !pageSuggestions.length && !filteredRecentSearches.length && !filteredTrendingSearches.length && hasTypedQuery ? (
            <div className="px-4 py-3 text-[12px] text-[#57636c]">No matching products found yet.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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

function CartPreviewDrawer({
  open,
  onClose,
  uid,
  onCartChange,
}: {
  open: boolean;
  onClose: () => void;
  uid: string | null;
  onCartChange?: (cart: unknown) => void;
}) {
  const { formatMoney } = useDisplayCurrency();
  type CartPreviewItem = {
    cart_item_key?: string;
    product_unique_id?: string;
    qty?: number;
    quantity?: number;
    sale_qty?: number;
    regular_qty?: number;
    line_totals?: {
      final_incl?: number;
      final_excl?: number;
    };
    product_snapshot?: {
      product?: {
        unique_id?: string | number | null;
        title?: string | null;
        vendorName?: string | null;
      };
      seller?: {
        vendorName?: string | null;
      };
      fulfillment?: {
        mode?: string | null;
      };
      media?: {
        images?: Array<{ imageUrl?: string | null }>;
      };
    };
    selected_variant_snapshot?: {
      variant_id?: string | number | null;
      label?: string | null;
      pricing?: {
        selling_price_excl?: number;
        selling_price_incl?: number;
        sale_price_incl?: number;
        sale_price_excl?: number;
      };
      sale?: {
        is_on_sale?: boolean;
        sale_price_incl?: number;
        sale_price_excl?: number;
        qty_available?: number;
      };
    };
  };

  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [cart, setCart] = useState<{
    items?: CartPreviewItem[];
    totals?: { final_payable_incl?: number; final_incl?: number };
    cart?: { item_count?: number };
  } | null>(null);

  useEffect(() => {
    if (!open || !uid) return;

    let mounted = true;
    setLoading(true);
    fetch("/api/client/v1/carts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!mounted) return;
        const nextCart = (payload?.data?.cart ?? null) as typeof cart;
        setCart(nextCart);
        onCartChange?.(nextCart);
        setHasLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setCart(null);
        setHasLoaded(true);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [onCartChange, open, uid]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const totalIncl = cart?.totals?.final_payable_incl ?? cart?.totals?.final_incl ?? 0;
  const showDrawerLoading = loading && !hasLoaded;
  const sellerGroups = items.reduce<Array<{ seller: string; items: CartPreviewItem[] }>>((groups, item) => {
    const seller =
      item?.product_snapshot?.seller?.vendorName?.trim() ||
      item?.product_snapshot?.product?.vendorName?.trim() ||
      "Piessang seller";
    const existing = groups.find((group) => group.seller === seller);
    if (existing) existing.items.push(item);
    else groups.push({ seller, items: [item] });
    return groups;
  }, []);

  const updateLine = async (
    item: CartPreviewItem,
    action: "increment" | "decrement" | "remove",
  ) => {
    if (!uid) return;
    const productId =
      String(item?.product_snapshot?.product?.unique_id || "") ||
      String(item?.product_unique_id || "");
    const variantId = String(item?.selected_variant_snapshot?.variant_id || "");
    if (!productId || !variantId) return;

    const busyKey = String(item?.cart_item_key || `${productId}::${variantId}`);
    setLineBusyKey(busyKey);
    try {
      const endpoint = action === "remove" ? "/api/client/v1/carts/removeItem" : "/api/client/v1/carts/update";
      const payload =
        action === "remove"
          ? { uid, unique_id: productId, variant_id: variantId }
          : { uid, productId, variantId, mode: "change", qty: action === "increment" ? 1 : -1 };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || "Unable to update cart.");
      const nextCart = (json?.data?.cart ?? null) as typeof cart;
      setCart(nextCart);
      onCartChange?.(nextCart);
      setSnackbarMessage(action === "remove" ? "Item removed from your cart." : "Cart quantity updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update your cart.";
      setSnackbarMessage(message);
    } finally {
      setLineBusyKey(null);
    }
  };

  useEffect(() => {
    if (!snackbarMessage) return undefined;
    const timer = window.setTimeout(() => setSnackbarMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [snackbarMessage]);

  return (
    <div className={`fixed inset-0 z-[68] ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close cart preview backdrop"
        className={`absolute inset-0 bg-black/35 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-[92vw] max-w-[420px] overflow-y-auto bg-white shadow-[0_20px_48px_rgba(20,24,27,0.22)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart preview</p>
            {showDrawerLoading ? (
              <div className="mt-2 h-6 w-24 animate-pulse rounded bg-[#ece8df]" />
            ) : (
              <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{itemCount} items</h3>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c] transition-colors hover:bg-[#ededed]"
            aria-label="Close cart"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-[8px] bg-[#fafafa] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Estimated total</p>
            {showDrawerLoading ? (
              <div className="mt-2 h-8 w-32 animate-pulse rounded bg-[#ece8df]" />
            ) : (
              <p className="mt-1 text-[22px] font-semibold text-[#202020]">{formatMoney(totalIncl)}</p>
            )}
          </div>

          {showDrawerLoading ? (
            <div className="space-y-3">
              {[0, 1].map((index) => (
                <div key={index} className="rounded-[8px] border border-black/5 bg-white p-3 shadow-[0_6px_18px_rgba(20,24,27,0.05)]">
                  <div className="flex gap-3">
                    <div className="h-14 w-14 animate-pulse rounded-[8px] bg-[#f1ede4]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-[#f1ede4]" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-[#f5f1e8]" />
                      <div className="h-3 w-2/5 animate-pulse rounded bg-[#f5f1e8]" />
                      <div className="h-3.5 w-24 animate-pulse rounded bg-[#f1ede4]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!showDrawerLoading && items.length ? (
            <div className="space-y-3">
              {sellerGroups.map((group) => (
                <section key={group.seller} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{group.seller}</p>
                    <p className="text-[10px] text-[#8b94a3]">
                      {group.items.some((item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase() === "bevgo")
                        ? "Piessang delivery available"
                        : "Seller delivery"}
                    </p>
                  </div>
                  {group.items.map((item, index) => {
                    const productId =
                      String(item?.product_snapshot?.product?.unique_id || "") ||
                      String(item?.product_unique_id || "");
                    const variantId = String(item?.selected_variant_snapshot?.variant_id || "");
                    const busyKey = String(item?.cart_item_key || `${productId}::${variantId}`);
                    return (
                      <CartItemCard
                        key={`${group.seller}-${item.product_snapshot?.product?.title ?? "item"}-${index}`}
                        item={item}
                        compact
                        onIncrement={() => void updateLine(item, "increment")}
                        onDecrement={() => void updateLine(item, "decrement")}
                        onRemove={() => void updateLine(item, "remove")}
                        busy={lineBusyKey === busyKey}
                      />
                    );
                  })}
                </section>
              ))}
            </div>
          ) : !showDrawerLoading ? (
            <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
              Your cart is empty right now.
            </div>
          ) : null}

          <CartActionStack onNavigate={onClose} compact />
        </div>

        {snackbarMessage ? (
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-[#202020] px-4 py-2 text-[12px] font-medium text-white shadow-[0_14px_30px_rgba(20,24,27,0.24)]">
            {snackbarMessage}
          </div>
        ) : null}
      </aside>
    </div>
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
  const showBadge = isAuthenticated && favoriteCount > 0;

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

function DesktopHero() {
  return (
    <div className="h-full overflow-hidden bg-[linear-gradient(135deg,#081a4f_0%,#0e2a7a_48%,#1f1146_100%)] p-6 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-[8px] bg-[rgba(255,255,255,0.12)] px-4 py-2 text-[12px] font-semibold">
          Static hero
        </div>
        <div className="text-right text-[13px] font-semibold text-white/80">Featured brands</div>
      </div>

      <div className="max-w-[320px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#cbb26b]">
          Piessang marketplace
        </p>
        <h2 className="mt-3 text-[34px] font-semibold leading-[0.95]">
          Clean, fixed hero panel.
        </h2>
        <p className="mt-4 text-[14px] leading-[1.7] text-white/84">
          The hero stays fixed while the category menu opens a side panel with sub categories.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {["CresHia", "IMOU", "EZVIZ", "SAMSUNG"].map((brand) => (
          <div
            key={brand}
            className="rounded-[4px] bg-white/10 px-3 py-2 text-center text-[12px] font-semibold text-white/90 backdrop-blur-sm"
          >
            {brand}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryFlyout({
  department,
  subcategories,
  brands,
  hoveredSubcategorySlug,
  setHoveredSubcategorySlug,
}: {
  department?: Department;
  subcategories: SubCategory[];
  brands: Brand[];
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
            {!subcategories.length ? (
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
  isAuthenticated,
  isSeller,
  favoriteCount,
  cartItemCount,
  favoritesHref,
  onRequireAuth,
  onOpenCartPreview,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  departments: Department[];
  productCountsBySubCategory: Record<string, number>;
  isAuthenticated: boolean;
  isSeller: boolean;
  favoriteCount: number;
  cartItemCount: number;
  favoritesHref: string;
  onRequireAuth: () => void;
  onOpenCartPreview: () => void;
  onSignOut: () => void;
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
    ...(isAuthenticated ? [{ title: "My Account", href: "/account" }] : [{ title: "Login", href: "/" }, { title: "Register", href: "/" }]),
    ...(isSeller ? [{ title: "Seller dashboard", href: "/seller/dashboard" }] : []),
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
          <div className="rounded-[14px] border border-black/5 bg-[linear-gradient(135deg,#081a4f_0%,#0e2a7a_55%,#1f1146_100%)] px-4 py-3 text-white shadow-[0_10px_24px_rgba(20,24,27,0.14)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d8c793]">
              Browse Piessang
            </p>
            <p className="mt-1 text-[14px] leading-6 text-white/84">
              Shop categories, manage your account, and jump back into your cart without leaving this menu.
            </p>
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
            ) : (
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
            )}
          </div>

          <div className="mt-auto flex items-center justify-center gap-6 border-t border-black/5 bg-[#fafafa] px-5 py-5 text-center">
            {isAuthenticated ? (
              <button type="button" onClick={onSignOut} className="text-[15px] font-semibold text-[#0f80c3]">
                Logout
              </button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PiessangHeader({ showMegaMenu = true }: { showMegaMenu?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const {
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
  const {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands,
    productCountsBySubCategory,
    hoveredSubcategorySlug,
    setHoveredSlug,
    setHoveredSubcategorySlug,
  } = useCatalogueMenu();
  const activeDepartment = useMemo(
    () => departments.find((department) => department.slug === hoveredSlug) ?? departments[0],
    [hoveredSlug, departments],
  );
  const favoritesHref = useMemo(() => {
    if (!isAuthenticated || !uid) return "/products";
    const params = new URLSearchParams({
      favoritesOnly: "true",
      userId: uid,
    });
    return `/products?${params.toString()}`;
  }, [isAuthenticated, uid]);
  const handleClearFavorites = async () => {
    if (!isAuthenticated || !uid) {
      openAuthModal("Sign in to manage your favourites.");
      return;
    }

    await fetch("/api/client/v1/accounts/favorites/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    });
    await refreshProfile();
    window.location.assign("/products");
  };

  return (
    <header id="bevgo-site-header" className="bg-white shadow-[0_2px_16px_rgba(20,24,27,0.08)]">
      <div className="relative overflow-hidden border-b border-black/5 bg-white">
        <div
          className="pointer-events-none absolute inset-0 bg-center bg-cover bg-no-repeat opacity-[0.13]"
          style={{ backgroundImage: "url('/backgrounds/piessang-repeat-background.png')" }}
        />
        <div className="relative flex h-11 w-full items-center justify-end px-3 lg:px-4">
          <div className="flex h-full items-center justify-end gap-4">
            <div className="flex h-full shrink-0 items-center">
              <HeaderDeliveryLocationControl className="h-full border-r-0 px-0 text-[11px]" />
            </div>
            <div className="flex h-full shrink-0 items-center">
              <DisplayCurrencySelector className="text-[11px]" />
            </div>
          </div>
        </div>
      </div>
      <div className="border-b border-black/5 bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-3 py-4 lg:px-4">
          <div className="flex items-center gap-4 lg:gap-8">
            <div className="hidden lg:flex">
              <PiessangLogo />
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
            {isAuthenticated ? (
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
            ) : (
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
            )}
            <HeartButton
              isAuthenticated={isAuthenticated}
              favoriteCount={favoriteCount}
              favoritesHref={favoritesHref}
              onRequireAuth={() => openAuthModal("Sign in to save favourites.")}
              onClearFavorites={() => void handleClearFavorites()}
            />
              <CartButton
                isAuthenticated={isAuthenticated}
                cartItemCount={cartItemCount}
                onRequireAuth={() => openAuthModal("Sign in to manage your cart.")}
                onOpenCartPreview={() => setCartPreviewOpen(true)}
              />
          </div>
        </div>

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

            <Link href="/" className="absolute left-1/2 -translate-x-1/2">
              <Image
                src="/logo/Piessang%20Logo.png"
                alt="Piessang"
                width={132}
                height={34}
                priority
                className="h-8 w-auto"
              />
            </Link>

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
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center text-[#4b5563]" aria-label="Search">
                <SearchIcon />
              </button>
              <button
                type="button"
                onClick={
                  isAuthenticated
                    ? () => setCartPreviewOpen(true)
                    : () => openAuthModal("Sign in to manage your cart.")
                }
                className="relative inline-flex h-10 w-10 items-center justify-center text-[#4b5563]"
                aria-label="Cart"
              >
                <CartIcon />
                {isAuthenticated && cartItemCount > 0 ? (
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

      <div className="hidden bg-[linear-gradient(90deg,#fdf070_0%,#e4c62d_34%,#e3c52f_68%,#cba726_100%)] lg:block">
        <div className="mx-auto w-full max-w-[1180px] px-3 py-2 lg:px-4">
          <SearchBar />
        </div>
      </div>

      {showMegaMenu ? (
        <div className="hidden border-b border-black/5 bg-white lg:block">
          <div className="mx-auto w-full max-w-[1180px] px-3 py-4 lg:px-4">
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
                  <div className="flex h-[48px] items-center justify-between bg-[linear-gradient(90deg,#e4c62d_0%,#e3c52f_45%,#cba726_100%)] px-5 text-[16px] font-semibold text-[#5a4916]">
                    <span>Shop by Category</span>
                    <span aria-hidden="true">⌄</span>
                  </div>

                  <div className="flex h-[calc(100%-48px)] flex-col">
                    <div className="flex-1 overflow-hidden">
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
                <DesktopHero />
              </div>

              {flyoutOpen ? (
                <CategoryFlyout
                  department={activeDepartment}
                  subcategories={activeSubcategories}
                  brands={brands}
                  hoveredSubcategorySlug={hoveredSubcategorySlug}
                  setHoveredSubcategorySlug={setHoveredSubcategorySlug}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <CartPreviewDrawer
        open={cartPreviewOpen}
        onClose={() => setCartPreviewOpen(false)}
        uid={uid}
        onCartChange={syncCartState}
      />

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        departments={departments}
        productCountsBySubCategory={productCountsBySubCategory}
        isAuthenticated={isAuthenticated}
        isSeller={isSeller}
        favoriteCount={favoriteCount}
        cartItemCount={cartItemCount}
        favoritesHref={favoritesHref}
        onRequireAuth={() => openAuthModal("Sign in to manage your cart and favourites.")}
        onOpenCartPreview={() => setCartPreviewOpen(true)}
        onSignOut={() => void signOut()}
      />
    </header>
  );
}
