"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CartActionStack } from "@/components/cart/cart-actions";
import { CartItemCard } from "@/components/cart/cart-item-card";

const CATEGORIES_ENDPOINT = "/api/catalogue/v1/categories/list";
const SUBCATEGORIES_ENDPOINT = "/api/catalogue/subcategories";
const BRANDS_ENDPOINT = "/api/catalogue/brands";
const PRODUCTS_ENDPOINT = "/api/catalogue/v1/products/product/get";
const PRODUCTS_PAGE = "/products";
const MENU_HEIGHT = 430;

type CatalogueCategory = {
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
  setHoveredSlug: (slug: string) => void;
  hoveredSubcategorySlug: string;
  setHoveredSubcategorySlug: (slug: string) => void;
};

type ProductAvailabilitySummary = {
  categoryCounts: Record<string, number>;
  subCategoryCounts: Record<string, number>;
};

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
        const slug = item.data?.category?.slug?.trim();
        const title = item.data?.category?.title?.trim();

        if (!slug || !title) return null;

        return {
          id: item.id ?? item.data?.docId ?? slug,
          slug,
          title,
          description: item.data?.category?.description?.trim() ?? "",
          position: item.data?.placement?.position ?? Number.MAX_SAFE_INTEGER,
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
        const slug = item.data?.subCategory?.slug?.trim();
        const title = item.data?.subCategory?.title?.trim();
        const groupedCategory = item.data?.grouping?.category?.trim();

        if (!slug || !title || (groupedCategory && groupedCategory !== categorySlug)) return null;
        if (item.data?.placement?.isActive === false) return null;

        return {
          id: item.id ?? item.data?.docId ?? slug,
          slug,
          title,
          description: item.data?.subCategory?.description?.trim() ?? "",
          position: item.data?.placement?.position ?? Number.MAX_SAFE_INTEGER,
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
      setHoveredSlug,
      setHoveredSubcategorySlug,
      hoveredSubcategorySlug,
    };
  }

function SearchBar() {
  return (
    <form action="/" className="flex min-w-0 flex-1">
      <label className="flex min-w-0 flex-1 items-center rounded-l-[4px] bg-white px-4 py-1.5 shadow-[0_4px_14px_rgba(20,24,27,0.08)]">
        <input
          type="search"
          name="q"
          placeholder="Search for products, brands..."
          className="w-full bg-transparent text-[15px] text-[#4b5563] outline-none placeholder:text-[#8a94a3]"
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
}: {
  open: boolean;
  onClose: () => void;
  uid: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<{
    items?: Array<{
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
          title?: string | null;
        };
        media?: {
          images?: Array<{ imageUrl?: string | null }>;
        };
      };
      selected_variant_snapshot?: {
        label?: string | null;
        pricing?: {
          selling_price_excl?: number;
        };
        sale?: {
          is_on_sale?: boolean;
          sale_price_excl?: number;
          qty_available?: number;
        };
      };
    }>;
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
        setCart((payload?.data?.cart ?? null) as typeof cart);
      })
      .catch(() => {
        if (!mounted) return;
        setCart(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, uid]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const totalIncl = cart?.totals?.final_payable_incl ?? cart?.totals?.final_incl ?? 0;

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
            <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{itemCount} items</h3>
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
            <p className="mt-1 text-[22px] font-semibold text-[#202020]">
              {`R ${new Intl.NumberFormat("en-ZA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(typeof totalIncl === "number" && Number.isFinite(totalIncl) ? totalIncl : 0)}`}
            </p>
          </div>

          {loading ? (
            <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
              Loading cart...
            </div>
          ) : null}

          {items.length ? (
            <div className="space-y-3">
              {items.map((item, index) => (
                <CartItemCard key={`${item.product_snapshot?.product?.title ?? "item"}-${index}`} item={item} compact />
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
              Your cart is empty right now.
            </div>
          )}

          <CartActionStack onNavigate={onClose} compact />
        </div>
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
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white">
                    {brand.imageUrl ? (
                      <Image
                        src={brand.imageUrl}
                        alt={brand.title}
                        width={40}
                        height={40}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-[#4f5965]">Brand</span>
                    )}
                  </span>
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
}: {
  open: boolean;
  onClose: () => void;
  departments: Department[];
}) {
  const { isAuthenticated, profile, signOut, openAuthModal, favoriteCount } = useAuth();
  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close menu backdrop"
        className={`absolute inset-0 bg-black/35 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative h-full w-[84vw] max-w-[360px] overflow-y-auto bg-white shadow-[0_16px_40px_rgba(0,0,0,0.24)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-4">
          <PiessangLogo />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center text-[28px] leading-none text-[#4b5563]"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col py-2">
          {[
            { title: "Home", href: "/" },
            { title: "Shop by Category", href: PRODUCTS_PAGE, chevron: true, active: true },
            { title: "Deals", href: "/products?onSale=true" },
            { title: "Orders", href: "/account?section=orders" },
            { title: isAuthenticated ? "My Account" : "Login", href: isAuthenticated ? "/account" : "/", dot: isAuthenticated, chevron: true },
            { title: "Help Centre", href: "/account?section=support" },
          ].map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex h-[58px] items-center justify-between border-b border-black/5 px-5 text-[17px] font-medium text-[#4b5563] first:border-t first:border-t-black/5"
              onClick={(event) => {
                if (!isAuthenticated && item.title === "Login") {
                  event.preventDefault();
                  onClose();
                  openAuthModal("Sign in to access your account and favourites.");
                }
              }}
            >
              <span className="flex items-center gap-3">
                <span>{item.title}</span>
                {item.dot ? <span className="h-3 w-3 rounded-full bg-[#f66b77]" /> : null}
              </span>
              {item.chevron ? <span className="text-[#b8b8b8]">→</span> : null}
            </Link>
          ))}

          <div className="border-b border-black/5 px-5 py-3">
            <div className="flex items-center justify-between rounded-[8px] border border-black/10 px-4 py-2.5">
              <span className="flex items-center gap-3 text-[16px] font-medium text-[#202020]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#249689] text-white">
                  <CartIcon />
                </span>
                Cart
              </span>
              <span className="text-[14px] text-[#8b94a3]">0 Items</span>
            </div>
          </div>

          <div className="border-b border-black/5 px-5 py-3">
            <div className="flex items-center justify-between rounded-[8px] border border-black/10 px-4 py-2.5">
              <span className="flex items-center gap-3 text-[16px] font-medium text-[#202020]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f46c7b] text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M12 21s-7-4.35-9.5-8.7C.3 9.1 1.8 5.8 5.4 5.1c2-.4 4 .5 5.2 2 1.2-1.5 3.2-2.4 5.2-2 3.6.7 5.1 4 2.9 7.2C19 16.65 12 21 12 21Z" />
                  </svg>
                </span>
                Lists
              </span>
              <span className="text-[14px] text-[#8b94a3]">
                {isAuthenticated ? `${favoriteCount} Items` : "0 Items"}
              </span>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-black/5 bg-[#fafafa] px-5 py-4">
            <Link
              href={isAuthenticated ? "/account" : "/"}
              className="inline-flex items-center gap-3 rounded-[8px] border border-black/10 bg-white px-4 py-2 text-[15px] font-semibold text-[#0f80c3] shadow-[0_4px_12px_rgba(20,24,27,0.06)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f80c3] text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2.2-8 5v1h16v-1c0-2.8-4-5-8-5Z" />
                </svg>
              </span>
              {isAuthenticated ? "My Account" : "Login"}
            </Link>
            {isAuthenticated ? (
              <button type="button" onClick={() => void signOut()} className="text-[15px] font-semibold text-[#0f80c3]">
                Logout
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal("Create your Piessang account to continue.")}
                className="text-[15px] font-semibold text-[#0f80c3]"
              >
                Register
              </button>
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
    signOut,
  } = useAuth();
  const {
    departments,
    hoveredSlug,
    activeSubcategories,
    brands,
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
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0f80c3] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_6px_12px_rgba(20,24,27,0.16)]">
                    {cartItemCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden bg-[rgba(203,178,107,0.18)] lg:block">
        <div className="w-full px-3 py-2 lg:px-4">
          <SearchBar />
        </div>
      </div>

      {showMegaMenu ? (
        <div className="hidden border-b border-black/5 bg-white lg:block">
          <div className="w-full px-3 py-4 lg:px-4">
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
      />

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        departments={departments}
      />
    </header>
  );
}
