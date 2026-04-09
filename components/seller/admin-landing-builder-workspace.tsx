"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { LandingPageLivePreview } from "@/components/cms/landing-page-live-preview";
import type { LandingFixedHero, LandingPageSeo, LandingSection, LandingSectionType } from "@/lib/cms/landing-page-schema";
import { prepareImageAsset } from "@/lib/client/image-prep";
import { getDefaultLandingPageState } from "@/lib/cms/landing-page-schema";
import type { ProductItem } from "@/components/products/products-results";

type ProductOption = { id: string; title: string; slug?: string; imageUrl?: string };
type CategoryOption = { id: string; slug: string; title: string };
type PreviewProduct = ProductItem;
type PreviewViewport = "desktop" | "tablet" | "mobile";
type CategorySelectorOption = CategoryOption & { productCount: number };
type BuilderPayload = {
  page?: {
    seo?: LandingPageSeo;
    fixedHero?: LandingFixedHero;
    draftSections?: LandingSection[];
    publishedSections?: LandingSection[];
    draftUpdatedAt?: string | null;
    publishedAt?: string | null;
  };
  versions?: Array<{ id?: string; status?: string; savedAt?: string; publishedAt?: string; note?: string | null }>;
  options?: {
    products?: ProductOption[];
    previewProducts?: PreviewProduct[];
    categories?: CategoryOption[];
  };
};

const SECTION_TYPES: LandingSectionType[] = [
  "hero_banner",
  "split_banner",
  "seller_spotlight",
  "countdown_promo",
  "deal_strip_banner",
  "compact_promo_grid",
  "category_chip_rail",
  "featured_duo",
  "brand_logo_rail",
  "category_mosaic",
  "editorial_collection",
  "product_rail",
  "recommended_for_you",
  "recently_viewed_rail",
  "search_history_rail",
  "category_rail",
  "promo_tiles",
  "text_block",
];

const FIXED_HERO_BLOCK_ID = "__fixed_header_hero__";

const SECTION_GROUPS: Array<{
  title: string;
  types: LandingSectionType[];
}> = [
  {
    title: "Hero & storytelling",
    types: ["hero_banner", "split_banner", "seller_spotlight", "countdown_promo", "deal_strip_banner", "editorial_collection", "text_block"],
  },
  {
    title: "Product discovery",
    types: ["product_rail", "featured_duo", "recommended_for_you", "recently_viewed_rail", "search_history_rail"],
  },
  {
    title: "Navigation & promos",
    types: ["category_chip_rail", "category_rail", "category_mosaic", "compact_promo_grid", "promo_tiles", "brand_logo_rail"],
  },
];

function labelForSectionType(type: LandingSectionType) {
  return type.replace(/_/g, " ");
}

function iconForSectionType(type: LandingSectionType) {
  switch (type) {
    case "hero_banner":
      return "◫";
    case "split_banner":
      return "▣";
    case "seller_spotlight":
      return "◉";
    case "countdown_promo":
      return "◔";
    case "deal_strip_banner":
      return "▬";
    case "compact_promo_grid":
      return "▩";
    case "category_chip_rail":
      return "◌";
    case "featured_duo":
      return "▣";
    case "brand_logo_rail":
      return "◎";
    case "category_mosaic":
      return "▦";
    case "editorial_collection":
      return "≡";
    case "product_rail":
      return "⇄";
    case "recommended_for_you":
      return "★";
    case "recently_viewed_rail":
      return "↺";
    case "search_history_rail":
      return "⌕";
    case "category_rail":
      return "▤";
    case "promo_tiles":
      return "▥";
    case "text_block":
      return "¶";
    default:
      return "+";
  }
}

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeFixedHeroEntry(entry: unknown) {
  if (typeof entry === "string") {
    const imageUrl = toStr(entry);
    return imageUrl ? { imageUrl, href: "", blurHashUrl: "" } : null;
  }
  if (entry && typeof entry === "object") {
    const imageUrl = toStr((entry as any)?.imageUrl);
    const href = toStr((entry as any)?.href);
    const blurHashUrl = toStr((entry as any)?.blurHashUrl);
    return imageUrl ? { imageUrl, href, blurHashUrl } : null;
  }
  return null;
}

function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSection(type: LandingSectionType): LandingSection {
  if (type === "hero_banner") {
    return {
      id: nextId("hero"),
      type,
      props: {
        eyebrow: "Homepage hero",
        headline: "Lead with what matters most right now",
        subheadline: "Swap this without waiting for deploy caches to clear.",
        ctaLabel: "Shop now",
        ctaHref: "/products",
        imageUrl: "",
      },
    };
  }
  if (type === "split_banner") {
    return {
      id: nextId("split"),
      type,
      props: {
        eyebrow: "Featured collection",
        title: "Build rich editorial moments between rails",
        body: "Use split banners for launches, category spotlights, and premium campaign storytelling.",
        ctaLabel: "Explore now",
        ctaHref: "/products",
        imageUrl: "",
      },
    };
  }
  if (type === "seller_spotlight") {
    return {
      id: nextId("spotlight"),
      type,
      props: {
        eyebrow: "Seller spotlight",
        title: "Meet a standout seller",
        subtitle: "Use this section to spotlight a seller, campaign, or curated collection destination.",
        sellerName: "Featured seller",
        href: "/vendors",
        imageUrl: "",
      },
    };
  }
  if (type === "countdown_promo") {
    return {
      id: nextId("countdown"),
      type,
      props: {
        eyebrow: "Limited-time campaign",
        title: "Count down to the next launch",
        subtitle: "Add urgency to promotions, restocks, or seasonal pushes.",
        ctaLabel: "Shop the campaign",
        ctaHref: "/products",
        imageUrl: "",
        endsAt: "",
      },
    };
  }
  if (type === "deal_strip_banner") {
    return {
      id: nextId("deal-strip"),
      type,
      props: {
        title: "Deals worth opening",
        subtitle: "Flash promos, bundles, and seasonal offers in one quick strip.",
        ctaLabel: "View deals",
        ctaHref: "/products",
      },
    };
  }
  if (type === "compact_promo_grid") {
    return {
      id: nextId("compact-promo"),
      type,
      props: {
        title: "Curated highlights",
        subtitle: "Smaller promos that keep the homepage moving.",
        tiles: [
          { id: nextId("tile"), title: "Weekend specials", subtitle: "Fast-moving deals in a tighter grid.", href: "/products", imageUrl: "" },
          { id: nextId("tile"), title: "Popular right now", subtitle: "Products shoppers are opening most.", href: "/products", imageUrl: "" },
          { id: nextId("tile"), title: "New in store", subtitle: "Fresh catalogue worth browsing first.", href: "/products", imageUrl: "" },
          { id: nextId("tile"), title: "Shop by mood", subtitle: "Lighter editorial merchandising moments.", href: "/products", imageUrl: "" },
        ],
      },
    };
  }
  if (type === "category_chip_rail") {
    return {
      id: nextId("chips"),
      type,
      props: {
        title: "Quick shop",
        subtitle: "Jump straight into the categories shoppers browse most.",
        categorySlugs: [],
      },
    };
  }
  if (type === "featured_duo") {
    return {
      id: nextId("duo"),
      type,
      props: {
        title: "Featured picks",
        subtitle: "A tighter two-up product feature for mobile-first merchandising.",
        productIds: [],
      },
    };
  }
  if (type === "brand_logo_rail") {
    return {
      id: nextId("logos"),
      type,
      props: {
        title: "Trusted brands",
        subtitle: "Clean logo-style brand chips to break up the page.",
        brands: ["CresHia", "IMOU", "EZVIZ", "SAMSUNG"],
      },
    };
  }
  if (type === "category_mosaic") {
    return {
      id: nextId("mosaic"),
      type,
      props: {
        title: "Category mosaic",
        subtitle: "Mix category entry points into a more editorial block.",
        categorySlugs: [],
      },
    };
  }
  if (type === "editorial_collection") {
    return {
      id: nextId("editorial"),
      type,
      props: {
        eyebrow: "Editorial collection",
        title: "Build a richer homepage story",
        body: "Pair a campaign headline with a few supporting highlights and a clear next action.",
        points: [
          "Launches and seasonal campaigns",
          "Seller or brand storytelling",
          "Category-led merchandising moments",
        ],
        ctaLabel: "Explore now",
        ctaHref: "/products",
      },
    };
  }
  if (type === "product_rail") {
    return {
      id: nextId("products"),
      type,
      props: {
        title: "Featured products",
        subtitle: "Choose products manually, or build a rail from categories and merchandising rules.",
        source: "manual",
        productIds: [],
        categorySlugs: [],
        prioritizeCampaigns: true,
        randomize: false,
        desktopLimit: 8,
        mobileLimit: 4,
        limit: 8,
      },
    };
  }
  if (type === "recommended_for_you") {
    return {
      id: nextId("recommended"),
      type,
      props: { title: "Recommended for you", subtitle: "A personalized rail based on shopper browsing and search signals.", limit: 8 },
    };
  }
  if (type === "recently_viewed_rail") {
    return {
      id: nextId("viewed"),
      type,
      props: { title: "Continue browsing", subtitle: "Recently viewed products for returning shoppers.", limit: 8 },
    };
  }
  if (type === "search_history_rail") {
    return {
      id: nextId("search"),
      type,
      props: { title: "Inspired by your searches", subtitle: "Products related to recent shopper search history.", limit: 8 },
    };
  }
  if (type === "category_rail") {
    return {
      id: nextId("categories"),
      type,
      props: { title: "Shop by category", subtitle: "Select categories to feature.", categorySlugs: [] },
    };
  }
  if (type === "promo_tiles") {
    return {
      id: nextId("promo"),
      type,
      props: {
        title: "Promo tiles",
        subtitle: "Use this for hand-picked campaigns and featured destinations.",
        tiles: [
          { id: nextId("tile"), title: "Promo one", subtitle: "Add supporting copy here.", href: "/products", imageUrl: "" },
          { id: nextId("tile"), title: "Promo two", subtitle: "Add supporting copy here.", href: "/products", imageUrl: "" },
        ],
      },
    };
  }
  return {
    id: nextId("text"),
    type: "text_block",
    props: {
      eyebrow: "Text block",
      title: "Tell shoppers what matters",
      body: "Use editorial sections to support launches, category moments, and seasonal messaging.",
      ctaLabel: "Explore",
      ctaHref: "/products",
    },
  };
}

function SectionTypeSkeletonPreview({ type }: { type: LandingSectionType }) {
  if (type === "hero_banner" || type === "split_banner" || type === "seller_spotlight" || type === "countdown_promo") {
    return (
      <div className="grid min-h-[180px] gap-3 rounded-[18px] border border-black/6 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_48%,#eef6ff_100%)] p-4 md:grid-cols-[minmax(0,1fr)_140px]">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-[#ead7a4]" />
          <div className="h-8 w-3/4 rounded-[10px] bg-[#e9edf3]" />
          <div className="h-3 w-full rounded-full bg-[#eef2f7]" />
          <div className="h-3 w-5/6 rounded-full bg-[#eef2f7]" />
          <div className="h-10 w-32 rounded-[12px] bg-[#202020]" />
        </div>
        <div className="rounded-[16px] border border-white/60 bg-white/80" />
      </div>
    );
  }

  if (type === "product_rail" || type === "recommended_for_you" || type === "recently_viewed_rail" || type === "search_history_rail") {
    return (
      <div className="rounded-[18px] border border-black/6 bg-white p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-[10px] bg-[#e9edf3]" />
            <div className="h-3 w-56 rounded-full bg-[#eef2f7]" />
          </div>
          <div className="h-9 w-24 rounded-[12px] bg-[#f3f4f6]" />
        </div>
        <div className="mt-4 flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`${type}-card-${index}`} className="w-[150px] min-w-[150px] rounded-[18px] border border-black/6 bg-[#fbfbfb] p-3">
              <div className="h-24 rounded-[14px] bg-white" />
              <div className="mt-3 h-4 w-5/6 rounded-full bg-[#e9edf3]" />
              <div className="mt-2 h-3 w-2/3 rounded-full bg-[#eef2f7]" />
              <div className="mt-4 h-4 w-20 rounded-full bg-[#e9edf3]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "category_rail" || type === "category_mosaic") {
    return (
      <div className="rounded-[18px] border border-black/6 bg-white p-4">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-[10px] bg-[#e9edf3]" />
          <div className="h-3 w-52 rounded-full bg-[#eef2f7]" />
        </div>
        <div className={`mt-4 grid gap-3 ${type === "category_mosaic" ? "md:grid-cols-[1.2fr_0.8fr]" : "grid-cols-2"}`}>
          <div className="rounded-[18px] bg-[linear-gradient(135deg,#fff8e8,#ffffff)] p-4">
            <div className="h-3 w-20 rounded-full bg-[#ead7a4]" />
            <div className="mt-3 h-6 w-2/3 rounded-[10px] bg-[#e9edf3]" />
          </div>
          <div className="grid gap-3 grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`${type}-tile-${index}`} className="rounded-[16px] bg-[#fbfbfb] p-3">
                <div className="h-4 w-3/4 rounded-full bg-[#e9edf3]" />
                <div className="mt-2 h-3 w-1/2 rounded-full bg-[#eef2f7]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === "category_chip_rail" || type === "brand_logo_rail") {
    return (
      <div className="rounded-[18px] border border-black/6 bg-white p-4">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-[10px] bg-[#e9edf3]" />
          <div className="h-3 w-44 rounded-full bg-[#eef2f7]" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`${type}-chip-${index}`} className="rounded-full border border-black/8 bg-[#fbfbfb] px-4 py-2.5">
              <div className="h-3.5 w-16 rounded-full bg-[#e9edf3]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "featured_duo") {
    return (
      <div className="rounded-[18px] border border-black/6 bg-white p-4">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-[10px] bg-[#e9edf3]" />
          <div className="h-3 w-48 rounded-full bg-[#eef2f7]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={`${type}-product-${index}`} className="rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
              <div className="aspect-square rounded-[12px] bg-white" />
              <div className="mt-3 h-4 w-5/6 rounded-full bg-[#e9edf3]" />
              <div className="mt-2 h-3 w-2/3 rounded-full bg-[#eef2f7]" />
              <div className="mt-3 h-4 w-16 rounded-full bg-[#e9edf3]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "deal_strip_banner") {
    return (
      <div className="rounded-[18px] border border-black/6 bg-[linear-gradient(135deg,#202020_0%,#2f3945_55%,#d6a91c_140%)] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded-full bg-white/25" />
            <div className="h-6 w-44 rounded-[10px] bg-white/20" />
          </div>
          <div className="h-9 w-24 rounded-[12px] bg-white/18" />
        </div>
      </div>
    );
  }

  if (type === "promo_tiles") {
    return (
      <div className="grid gap-3 rounded-[18px] border border-black/6 bg-white p-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`${type}-promo-${index}`} className="overflow-hidden rounded-[18px] border border-black/6 bg-[#fbfbfb]">
            <div className="grid min-h-[120px] md:grid-cols-[minmax(0,1fr)_100px]">
              <div className="p-4">
                <div className="h-5 w-2/3 rounded-full bg-[#e9edf3]" />
                <div className="mt-3 h-3 w-full rounded-full bg-[#eef2f7]" />
                <div className="mt-2 h-3 w-4/5 rounded-full bg-[#eef2f7]" />
              </div>
              <div className="bg-white" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-black/6 bg-white p-4">
      <div className="h-3 w-20 rounded-full bg-[#ead7a4]" />
      <div className="mt-3 h-7 w-48 rounded-[10px] bg-[#e9edf3]" />
      <div className="mt-3 h-3 w-full rounded-full bg-[#eef2f7]" />
      <div className="mt-2 h-3 w-5/6 rounded-full bg-[#eef2f7]" />
      <div className="mt-5 h-10 w-28 rounded-[12px] bg-[#f3f4f6]" />
    </div>
  );
}

export function SellerAdminLandingBuilderWorkspace() {
  const defaults = getDefaultLandingPageState();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sections, setSections] = useState<LandingSection[]>(defaults.draftSections);
  const [seo, setSeo] = useState<LandingPageSeo>(defaults.seo);
  const [fixedHero, setFixedHero] = useState<LandingFixedHero>(defaults.fixedHero);
  const [selectedId, setSelectedId] = useState<string>(defaults.draftSections[0]?.id || "");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [previewProducts, setPreviewProducts] = useState<PreviewProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>("desktop");
  const [versions, setVersions] = useState<BuilderPayload["versions"]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [assetTarget, setAssetTarget] = useState<{ sectionId: string; tileId?: string | null } | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [hoveredSectionType, setHoveredSectionType] = useState<LandingSectionType | null>(null);
  const [sectionLibraryQuery, setSectionLibraryQuery] = useState("");
  const [expandedSectionGroups, setExpandedSectionGroups] = useState<Record<string, boolean>>({
    "Hero & storytelling": true,
    "Product discovery": true,
    "Navigation & promos": true,
  });
  const [expandedTreeGroups, setExpandedTreeGroups] = useState<Record<string, boolean>>({
    Header: true,
    Template: true,
    Footer: true,
  });
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; tone: "info" | "success" | "error" }>({
    open: false,
    message: "",
    tone: "info",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/client/v1/admin/landing-page", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load the landing page builder.");
        if (cancelled) return;
        const data = (payload?.data || {}) as BuilderPayload;
        const draftSections = Array.isArray(data?.page?.draftSections) && data.page?.draftSections?.length ? data.page.draftSections : defaults.draftSections;
        setSections(draftSections);
        setSeo(data?.page?.seo || defaults.seo);
        setFixedHero(data?.page?.fixedHero || defaults.fixedHero);
        setProducts(Array.isArray(data?.options?.products) ? data.options.products : []);
        setPreviewProducts(Array.isArray(data?.options?.previewProducts) ? data.options.previewProducts : []);
        setCategories(Array.isArray(data?.options?.categories) ? data.options.categories : []);
        setVersions(Array.isArray(data?.versions) ? data.versions : []);
        setSelectedId(draftSections[0]?.id || "");
      } catch (error) {
        if (!cancelled) {
          setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to load the landing page builder." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const fixedHeroSelected = selectedId === FIXED_HERO_BLOCK_ID;
  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedId) || null,
    [sections, selectedId],
  );
  const mediaOptions = useMemo(
    () => products.filter((product) => toStr(product.imageUrl)).slice(0, 24),
    [products],
  );
  const categoriesWithProducts = useMemo<CategorySelectorOption[]>(() => {
    const counts = new Map<string, number>();
    for (const product of previewProducts) {
      const categorySlug = toStr((product as any)?.data?.grouping?.category || (product as any)?.data?.product?.grouping?.category).toLowerCase();
      if (!categorySlug) continue;
      counts.set(categorySlug, (counts.get(categorySlug) || 0) + 1);
    }

    return categories
      .map((category) => ({
        ...category,
        productCount: counts.get(toStr(category.slug).toLowerCase()) || 0,
      }))
      .filter((category) => category.productCount > 0)
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [categories, previewProducts]);

  const normalizedSectionQuery = sectionLibraryQuery.trim().toLowerCase();
  const filteredSectionGroups = useMemo(
    () =>
      SECTION_GROUPS.map((group) => ({
        ...group,
        types: group.types.filter((type) => {
          if (!normalizedSectionQuery) return true;
          return labelForSectionType(type).toLowerCase().includes(normalizedSectionQuery);
        }),
      })).filter((group) => group.types.length),
    [normalizedSectionQuery],
  );

  function addSection(type: LandingSectionType) {
    const next = createSection(type);
    setSections((current) => {
      if (!insertAfterId) return [...current, next];
      const targetIndex = current.findIndex((section) => section.id === insertAfterId);
      if (targetIndex < 0) return [...current, next];
      const updated = [...current];
      updated.splice(targetIndex + 1, 0, next);
      return updated;
    });
    setSelectedId(next.id);
    setInsertAfterId(null);
    setShowAddSectionModal(false);
  }

  function updateSection(nextSection: LandingSection) {
    setSections((current) => current.map((section) => (section.id === nextSection.id ? nextSection : section)));
  }

  function toggleSectionCategory(section: LandingSection, slug: string) {
    const currentSlugs = Array.isArray(section.props?.categorySlugs) ? section.props.categorySlugs.map((item: unknown) => toStr(item)).filter(Boolean) : [];
    const nextSlugs = currentSlugs.includes(slug)
      ? currentSlugs.filter((item) => item !== slug)
      : [...currentSlugs, slug];

    updateSection({
      ...section,
      props: {
        ...section.props,
        categorySlugs: nextSlugs,
      },
    });
  }

  function duplicateSection(sectionId: string) {
    setSections((current) => {
      const index = current.findIndex((section) => section.id === sectionId);
      if (index < 0) return current;
      const source = current[index];
      const clone: LandingSection = {
        ...source,
        id: nextId(source.type.replace(/_/g, "-")),
        props: JSON.parse(JSON.stringify(source.props || {})),
      };
      const next = [...current];
      next.splice(index + 1, 0, clone);
      setSelectedId(clone.id);
      return next;
    });
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    setSections((current) => {
      const index = current.findIndex((section) => section.id === sectionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function deleteSection(sectionId: string) {
    setSections((current) => {
      const next = current.filter((section) => section.id !== sectionId);
      setSelectedId((currentSelected) => {
        if (currentSelected !== sectionId) return currentSelected;
        return next[0]?.id || "";
      });
      return next;
    });
  }

  function reorderSection(sectionId: string, targetId: string) {
    if (!sectionId || !targetId || sectionId === targetId) return;
    setSections((current) => {
      const fromIndex = current.findIndex((section) => section.id === sectionId);
      const toIndex = current.findIndex((section) => section.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  function insertSectionAt(sectionId: string, targetIndex: number) {
    if (!sectionId) return;
    setSections((current) => {
      const fromIndex = current.findIndex((section) => section.id === sectionId);
      if (fromIndex < 0) return current;
      const boundedIndex = Math.max(0, Math.min(targetIndex, current.length));
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      const insertionIndex = fromIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
      next.splice(insertionIndex, 0, item);
      return next;
    });
  }

  function assignImageToTarget(imageUrl: string) {
    if (!assetTarget?.sectionId || !imageUrl) return;
    const section = sections.find((item) => item.id === assetTarget.sectionId);
    if (!section) return;
    if (assetTarget.tileId && section.type === "promo_tiles") {
      const tiles = Array.isArray(section.props?.tiles) ? section.props.tiles : [];
      updateSection({
        ...section,
        props: {
          ...section.props,
          tiles: tiles.map((tile: any) =>
            toStr(tile?.id) === assetTarget.tileId ? { ...tile, imageUrl } : tile,
          ),
        },
      });
    } else {
      updateSection({ ...section, props: { ...section.props, imageUrl } });
    }
    setAssetTarget(null);
  }

  async function uploadLandingAsset(file: File, folder = "general") {
    const prepared = await prepareImageAsset(file, {
      maxDimension: folder === "fixed-hero" ? 2600 : 2200,
      quality: folder === "fixed-hero" ? 0.84 : 0.86,
    });
    const formData = new FormData();
    formData.append("action", "upload-asset");
    formData.append("folder", folder);
    formData.append("file", prepared.file);
    formData.append("blurHashUrl", prepared.blurHashUrl);
    const response = await fetch("/api/client/v1/admin/landing-page", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message || "Unable to upload this asset.");
    }
    return {
      url: toStr(payload?.data?.uploaded?.url),
      blurHashUrl: toStr(payload?.data?.uploaded?.blurHashUrl || prepared.blurHashUrl),
    };
  }

  async function uploadAssetFile(file: File) {
    if (!assetTarget?.sectionId) return;
    setUploadingAsset(true);
    setSnackbar({ open: true, tone: "info", message: "Uploading asset..." });
    try {
      const uploaded = await uploadLandingAsset(file, assetTarget?.tileId ? "promo-tiles" : "general");
      assignImageToTarget(uploaded.url);
      setSnackbar({ open: true, tone: "success", message: "Asset uploaded." });
    } catch (error) {
      setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to upload this asset." });
    } finally {
      setUploadingAsset(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    setSnackbar({ open: true, tone: "info", message: "Saving draft..." });
    try {
      const response = await fetch("/api/client/v1/admin/landing-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-draft", sections, seo, fixedHero, note: versionNote }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save the landing page draft.");
      setSnackbar({ open: true, tone: "success", message: "Draft saved." });
    } catch (error) {
      setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to save the landing page draft." });
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    setPublishing(true);
    setSnackbar({ open: true, tone: "info", message: "Publishing homepage..." });
    try {
      const response = await fetch("/api/client/v1/admin/landing-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", note: versionNote }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to publish the homepage.");
      setSnackbar({ open: true, tone: "success", message: "Homepage published." });
      setVersionNote("");
    } catch (error) {
      setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to publish the homepage." });
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="rounded-[18px] border border-black/6 bg-white px-5 py-10 text-[14px] text-[#57636c]">Loading landing page builder...</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] border border-black/6 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Landing page builder</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">Build the Piessang homepage without a deploy</h2>
              <p className="mt-2 max-w-[72ch] text-[14px] leading-[1.7] text-[#57636c]">
                Compose reusable homepage sections, arrange them in order, preview the page canvas, then save a draft or publish it live.
              </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={versionNote}
              onChange={(event) => setVersionNote(event.target.value)}
              placeholder="Add a publish note"
              className="h-11 min-w-[220px] rounded-[14px] border border-black/10 bg-white px-4 text-[13px] font-medium text-[#202020] outline-none"
            />
            <a
              href="/?preview=draft"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
            >
              Preview draft
            </a>
            <button type="button" onClick={saveDraft} disabled={saving} className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60">
              Save draft
            </button>
            <button type="button" onClick={() => setShowVersionHistory(true)} className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
              Publish history
            </button>
            <button type="button" onClick={publishDraft} disabled={publishing} className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60">
              Publish homepage
            </button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[22px] border border-black/6 bg-white shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
          <div className="border-b border-black/6 px-4 py-4">
            <p className="text-[13px] font-semibold text-[#202020]">Home page</p>
          </div>
          <div className="max-h-[78vh] overflow-y-auto px-3 py-3">
            <div className="space-y-2">
              <div className="rounded-[14px] border border-black/6 bg-[#fafafa] px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpandedTreeGroups((current) => ({ ...current, Header: !current.Header }))}
                  className="flex w-full items-center justify-between text-left"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Header</p>
                  <span className="text-[13px] text-[#8b94a3]">{expandedTreeGroups.Header ? "−" : "+"}</span>
                </button>
                {expandedTreeGroups.Header ? (
                  <div className="mt-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(FIXED_HERO_BLOCK_ID);
                      }}
                      className={`flex w-full items-center rounded-[10px] px-2 py-2 text-left text-[13px] font-medium text-[#202020] ${
                        fixedHeroSelected ? "bg-[#f4f6f8]" : "bg-white"
                      }`}
                    >
                      Fixed header hero
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="rounded-[14px] border border-black/6 bg-[#fafafa] px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedTreeGroups((current) => ({ ...current, Template: !current.Template }))}
                    className="flex flex-1 items-center justify-between text-left"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Template</p>
                    <span className="text-[13px] text-[#8b94a3]">{expandedTreeGroups.Template ? "−" : "+"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInsertAfterId(null);
                      setShowAddSectionModal(true);
                    }}
                    className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                  >
                    Add section
                  </button>
                </div>
                {expandedTreeGroups.Template ? (
                  <div className="mt-2 space-y-1">
                    {sections.map((section, index) => (
                      <div key={section.id} className="space-y-1">
                        <div
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDropIndex(index);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggingId) insertSectionAt(draggingId, index);
                            setDraggingId(null);
                            setDragOverId(null);
                            setDropIndex(null);
                          }}
                          className={`h-1.5 rounded-full transition ${dropIndex === index && draggingId ? "bg-[#0049ff]/25 ring-2 ring-[#0049ff]/15" : "bg-transparent"}`}
                        />
                        <div
                          draggable
                          onDragStart={() => {
                            setDraggingId(section.id);
                            setDragOverId(section.id);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (dragOverId !== section.id) setDragOverId(section.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggingId) reorderSection(draggingId, section.id);
                            setDraggingId(null);
                            setDragOverId(null);
                            setDropIndex(null);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverId(null);
                            setDropIndex(null);
                          }}
                          className={`rounded-[12px] border px-2 py-2 transition ${
                            selectedId === section.id ? "border-[#202020] bg-[#f4f6f8]" : "border-transparent bg-white"
                          } ${dragOverId === section.id && draggingId && draggingId !== section.id ? "ring-2 ring-[#0049ff]/15" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedId(section.id)}
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[#202020]">
                                {toStr(section.props?.title || section.props?.headline || "Section")}
                              </p>
                              <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-[#8b94a3]">
                                {section.type.replace(/_/g, " ")}
                              </p>
                            </div>
                            <span className="text-[14px] text-[#8b94a3]">::</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropIndex(sections.length);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggingId) insertSectionAt(draggingId, sections.length);
                        setDraggingId(null);
                        setDragOverId(null);
                        setDropIndex(null);
                      }}
                      className={`h-1.5 rounded-full transition ${dropIndex === sections.length && draggingId ? "bg-[#0049ff]/25 ring-2 ring-[#0049ff]/15" : "bg-transparent"}`}
                    />
                  </div>
                ) : null}
              </div>
              <div className="rounded-[14px] border border-black/6 bg-[#fafafa] px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpandedTreeGroups((current) => ({ ...current, Footer: !current.Footer }))}
                  className="flex w-full items-center justify-between text-left"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Footer</p>
                  <span className="text-[13px] text-[#8b94a3]">{expandedTreeGroups.Footer ? "−" : "+"}</span>
                </button>
                {expandedTreeGroups.Footer ? (
                  <div className="mt-2 space-y-1">
                    <div className="rounded-[10px] bg-white px-2 py-2 text-[13px] font-medium text-[#202020]">Footer</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <section className="rounded-[22px] border border-black/6 bg-[#f6f7f8] p-4 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Homepage preview</p>
              <p className="mt-1 text-[14px] text-[#57636c]">One continuous storefront preview, like a real theme editor.</p>
            </div>
            <div className="inline-flex rounded-[14px] border border-black/10 bg-white p-1">
              {(["desktop", "tablet", "mobile"] as PreviewViewport[]).map((viewport) => (
                <button
                  key={viewport}
                  type="button"
                  onClick={() => setPreviewViewport(viewport)}
                  className={`inline-flex h-9 items-center rounded-[10px] px-3 text-[12px] font-semibold capitalize ${
                    previewViewport === viewport ? "bg-[#202020] text-white" : "text-[#202020]"
                  }`}
                >
                  {viewport}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-black/6 bg-[linear-gradient(180deg,#f8fafc_0%,#f4f6f8_100%)] p-3 sm:p-4">
            <div className="overflow-hidden rounded-[28px] border border-black/8 bg-white shadow-[0_24px_60px_rgba(20,24,27,0.12)]">
              <div className="flex items-center justify-between border-b border-black/6 bg-[#fbfbfb] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">
                  {previewViewport === "desktop" ? "Desktop preview" : previewViewport === "tablet" ? "Tablet preview" : "Mobile preview"}
                </p>
              </div>
              <div className="max-h-[78vh] overflow-y-auto bg-white p-4">
                <div
                  className={`mx-auto transition-all ${
                    previewViewport === "desktop"
                      ? "w-full"
                      : previewViewport === "tablet"
                        ? "max-w-[860px]"
                        : "max-w-[430px]"
                  }`}
                >
                  <LandingPageLivePreview
                    sections={sections}
                    products={previewProducts}
                    categories={categories}
                    fixedHero={fixedHero}
                    mode={previewViewport}
                    selectedBlockId={selectedId}
                    onSelectBlock={(blockId) => setSelectedId(blockId)}
                    editorCanvas
                    renderBlockControls={(blockId) => (
                      <div
                        className="flex items-center gap-2 rounded-[14px] border border-black/10 bg-white/96 p-2 shadow-[0_14px_28px_rgba(20,24,27,0.12)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setInsertAfterId(blockId || null);
                            setShowAddSectionModal(true);
                          }}
                          className="inline-flex h-9 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                        >
                          Add below
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedId(blockId)}
                          className="inline-flex h-9 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateSection(blockId)}
                          className="inline-flex h-9 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(blockId, -1)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[15px] font-semibold text-[#202020]"
                          aria-label="Move section up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(blockId, 1)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[15px] font-semibold text-[#202020]"
                          aria-label="Move section down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSection(blockId)}
                          className="inline-flex h-9 items-center rounded-[10px] border border-[#ef4444]/20 bg-[#fff5f5] px-3 text-[12px] font-semibold text-[#d14343]"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-[22px] border border-black/6 bg-white p-4 shadow-[0_12px_30px_rgba(20,24,27,0.05)] xl:col-start-1 xl:row-start-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Selected block</p>
          {fixedHeroSelected ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">Fixed header hero</p>
                    <p className="mt-1 text-[12px] text-[#7a8594]">This controls the permanent desktop mega-menu hero panel.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFixedHero((current) => ({ ...current, locked: !current.locked }))}
                    className={`inline-flex h-9 items-center rounded-[11px] border px-3 text-[12px] font-semibold ${
                      fixedHero.locked
                        ? "border-[#202020] bg-[#202020] text-white"
                        : "border-black/10 bg-white text-[#202020]"
                    }`}
                  >
                    {fixedHero.locked ? "Unlock" : "Lock"}
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Rotation speed</span>
                    <input
                      type="number"
                      min={2}
                      max={30}
                      value={String(Number(fixedHero.rotationSeconds || 4))}
                      disabled={fixedHero.locked}
                      onChange={(event) =>
                        setFixedHero((current) => ({
                          ...current,
                          rotationSeconds: Math.max(2, Math.min(30, Number(event.target.value || 4))),
                        }))
                      }
                      className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:opacity-60"
                    />
                    <span className="mt-1 block text-[11px] text-[#8b94a3]">Seconds before the next hero image appears.</span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Hero images</span>
                    <div className="space-y-3">
                      {(Array.isArray(fixedHero.images) ? fixedHero.images : []).map((entry, index) => {
                          const normalized = normalizeFixedHeroEntry(entry) || { imageUrl: "", href: "", blurHashUrl: "" };
                        return (
                          <div key={`fixed-hero-image-${index}`} className="rounded-[12px] border border-black/8 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="text-[12px] font-semibold text-[#202020]">Image {index + 1}</span>
                              <button
                                type="button"
                                disabled={fixedHero.locked}
                                onClick={() =>
                                  setFixedHero((current) => ({
                                    ...current,
                                    images: (Array.isArray(current.images) ? current.images : []).filter((_, itemIndex) => itemIndex !== index),
                                  }))
                                }
                                className="text-[12px] font-semibold text-[#d14343] disabled:opacity-60"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={normalized.imageUrl}
                                disabled={fixedHero.locked}
                                onChange={(event) =>
                                  setFixedHero((current) => ({
                                    ...current,
                                    images: (Array.isArray(current.images) ? current.images : []).map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            imageUrl: event.target.value.trim(),
                                            href: typeof item === "string" ? "" : toStr((item as any)?.href),
                                            blurHashUrl: typeof item === "string" ? "" : toStr((item as any)?.blurHashUrl),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                                placeholder="Image URL"
                                className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:opacity-60"
                              />
                              <input
                                type="text"
                                value={normalized.href}
                                disabled={fixedHero.locked}
                                onChange={(event) =>
                                  setFixedHero((current) => ({
                                    ...current,
                                    images: (Array.isArray(current.images) ? current.images : []).map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            imageUrl: typeof item === "string" ? toStr(item) : toStr((item as any)?.imageUrl),
                                            href: event.target.value.trim(),
                                            blurHashUrl: typeof item === "string" ? "" : toStr((item as any)?.blurHashUrl),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                                placeholder="Optional link, e.g. /products or https://..."
                                className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:opacity-60"
                              />
                            </div>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        disabled={fixedHero.locked}
                        onClick={() =>
                          setFixedHero((current) => ({
                            ...current,
                            images: [...(Array.isArray(current.images) ? current.images : []), { imageUrl: "", href: "", blurHashUrl: "" }],
                          }))
                        }
                        className="inline-flex h-10 items-center rounded-[11px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020] disabled:opacity-60"
                      >
                        Add image row
                      </button>
                    </div>
                    <span className="mt-1 block text-[11px] text-[#8b94a3]">Set rotation order here. Each image can optionally open its own link.</span>
                  </label>
                  <label className="mt-1 flex cursor-pointer items-center justify-center rounded-[12px] border border-dashed border-black/12 bg-white px-4 py-3 text-[12px] font-semibold text-[#202020]">
                    {uploadingAsset ? "Uploading..." : "Upload hero image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={fixedHero.locked}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file || fixedHero.locked) return;
                        setUploadingAsset(true);
                        setSnackbar({ open: true, tone: "info", message: "Uploading hero image..." });
                        try {
                          const uploaded = await uploadLandingAsset(file, "fixed-hero");
                          setFixedHero((current) => ({
                            ...current,
                            images: [...(Array.isArray(current.images) ? current.images : []), { imageUrl: uploaded.url, href: "", blurHashUrl: uploaded.blurHashUrl }],
                          }));
                          setSnackbar({ open: true, tone: "success", message: "Hero image uploaded." });
                        } catch (error) {
                          setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to upload this hero image." });
                        } finally {
                          setUploadingAsset(false);
                          event.currentTarget.value = "";
                        }
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Quick pick from library</span>
                    <div className="grid grid-cols-2 gap-3">
                      {mediaOptions.slice(0, 6).map((product) => (
                        <button
                          key={`fixed-hero-asset-${product.id}`}
                          type="button"
                          disabled={fixedHero.locked}
                          onClick={() =>
                            setFixedHero((current) => ({
                              ...current,
                              images: [...(Array.isArray(current.images) ? current.images : []), { imageUrl: toStr(product.imageUrl), href: "", blurHashUrl: "" }],
                            }))
                          }
                          className="overflow-hidden rounded-[14px] border border-black/8 bg-white text-left disabled:opacity-60"
                        >
                          <div className="relative h-24 bg-[#fafafa]">
                            <Image src={toStr(product.imageUrl)} alt={product.title} fill sizes="160px" className="object-contain p-2" />
                          </div>
                          <div className="p-2">
                            <p className="line-clamp-2 text-[11px] font-semibold text-[#202020]">{product.title}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <span className="mt-1 block text-[11px] text-[#8b94a3]">Tap items to append them to the hero rotation.</span>
                  </label>
                  <p className="text-[11px] text-[#8b94a3]">This hero is fixed in the desktop header and not part of the reorderable page canvas.</p>
                </div>
              </div>
            </div>
          ) : selectedSection ? (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Section title</span>
                <input
                  value={toStr(selectedSection.props?.title || selectedSection.props?.headline)}
                  onChange={(event) =>
                    updateSection({
                      ...selectedSection,
                      props:
                        selectedSection.type === "hero_banner"
                          ? { ...selectedSection.props, headline: event.target.value }
                          : { ...selectedSection.props, title: event.target.value },
                    })
                  }
                  className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                />
              </label>

              {selectedSection.type === "hero_banner" || selectedSection.type === "split_banner" || selectedSection.type === "seller_spotlight" || selectedSection.type === "countdown_promo" ? (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Eyebrow</span>
                    <input
                      value={toStr(selectedSection.props?.eyebrow)}
                      onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, eyebrow: event.target.value } })}
                      className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                    />
                  </label>
                  {selectedSection.type === "split_banner" ? (
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Body</span>
                      <textarea
                        value={toStr(selectedSection.props?.body)}
                        onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, body: event.target.value } })}
                        className="min-h-[90px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                      />
                    </label>
                  ) : selectedSection.type === "seller_spotlight" ? (
                    <>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Subtitle</span>
                        <textarea
                          value={toStr(selectedSection.props?.subtitle)}
                          onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, subtitle: event.target.value } })}
                          className="min-h-[90px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Seller name</span>
                        <input
                          value={toStr(selectedSection.props?.sellerName)}
                          onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, sellerName: event.target.value } })}
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                      </label>
                    </>
                  ) : selectedSection.type === "countdown_promo" ? (
                    <>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Subtitle</span>
                        <textarea
                          value={toStr(selectedSection.props?.subtitle)}
                          onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, subtitle: event.target.value } })}
                          className="min-h-[90px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Ends at</span>
                        <input
                          type="datetime-local"
                          value={toStr(selectedSection.props?.endsAt)}
                          onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, endsAt: event.target.value } })}
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                      </label>
                    </>
                  ) : (
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Subheadline</span>
                    <textarea
                      value={toStr(selectedSection.props?.subheadline)}
                      onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, subheadline: event.target.value } })}
                      className="min-h-[90px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                    />
                  </label>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">CTA label</span>
                      <input
                        value={toStr(selectedSection.props?.ctaLabel)}
                        onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, ctaLabel: event.target.value } })}
                        className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">CTA link</span>
                      <input
                        value={toStr(selectedSection.props?.ctaHref)}
                        onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, ctaHref: event.target.value } })}
                        className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Image URL</span>
                    <input
                      value={toStr(selectedSection.props?.imageUrl)}
                      onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, imageUrl: event.target.value } })}
                      className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setAssetTarget({ sectionId: selectedSection.id })}
                    className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-[#fafafa] px-4 text-[13px] font-semibold text-[#202020]"
                  >
                    Choose image from library
                  </button>
                </>
              ) : null}

              {selectedSection.type === "product_rail" || selectedSection.type === "featured_duo" ? (
                <>
                  {selectedSection.type === "product_rail" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Desktop max products</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={String(Number(selectedSection.props?.desktopLimit || selectedSection.props?.limit || 8))}
                          onChange={(event) =>
                            updateSection({
                              ...selectedSection,
                              props: {
                                ...selectedSection.props,
                                desktopLimit: Math.max(1, Math.min(20, Number(event.target.value || 8))),
                                limit: Math.max(1, Math.min(20, Number(event.target.value || 8))),
                              },
                            })
                          }
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Mobile max products</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={String(Number(selectedSection.props?.mobileLimit || Math.min(Number(selectedSection.props?.desktopLimit || selectedSection.props?.limit || 8), 4)))}
                          onChange={(event) =>
                            updateSection({
                              ...selectedSection,
                              props: {
                                ...selectedSection.props,
                                mobileLimit: Math.max(1, Math.min(20, Number(event.target.value || 4))),
                              },
                            })
                          }
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                      </label>
                    </div>
                  ) : null}
                  {selectedSection.type === "product_rail" ? (
                    <>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Source</span>
                        <select
                          value={toStr(selectedSection.props?.source, "manual")}
                          onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, source: event.target.value } })}
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        >
                          <option value="manual">Manual selection</option>
                          <option value="new_arrivals">Newest live products</option>
                          <option value="category_match">Categories with merchandising rules</option>
                        </select>
                      </label>
                      {toStr(selectedSection.props?.source, "manual") === "category_match" ? (
                        <>
                          <label className="block">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Categories</span>
                            <select
                              multiple
                              value={Array.isArray(selectedSection.props?.categorySlugs) ? selectedSection.props.categorySlugs : []}
                              onChange={(event) =>
                                updateSection({
                                  ...selectedSection,
                                  props: {
                                    ...selectedSection.props,
                                    categorySlugs: Array.from(event.target.selectedOptions).map((option) => option.value),
                                  },
                                })
                              }
                              className="min-h-[150px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                            >
                              {categories.map((category) => (
                                <option key={category.id} value={category.slug}>
                                  {category.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex items-center gap-3 rounded-[12px] border border-black/10 bg-[#fafafa] px-3 py-3 text-[13px] text-[#202020]">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedSection.props?.prioritizeCampaigns ?? selectedSection.props?.prioritizeFeatured)}
                                onChange={(event) =>
                                  updateSection({
                                    ...selectedSection,
                                    props: {
                                      ...selectedSection.props,
                                      prioritizeCampaigns: event.target.checked,
                                      prioritizeFeatured: undefined,
                                    },
                                  })
                                }
                              />
                              <span>
                                <span className="block font-semibold">Prioritize active campaign products</span>
                                <span className="mt-0.5 block text-[12px] text-[#7a8594]">Products in live seller campaigns rise to the top first.</span>
                              </span>
                            </label>
                            <label className="flex items-center gap-3 rounded-[12px] border border-black/10 bg-[#fafafa] px-3 py-3 text-[13px] text-[#202020]">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedSection.props?.randomize)}
                                onChange={(event) =>
                                  updateSection({
                                    ...selectedSection,
                                    props: { ...selectedSection.props, randomize: event.target.checked },
                                  })
                                }
                              />
                              <span>
                                <span className="block font-semibold">Randomize order</span>
                                <span className="mt-0.5 block text-[12px] text-[#7a8594]">Shuffle matching products each time the rail renders.</span>
                              </span>
                            </label>
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {selectedSection.type === "featured_duo" || toStr(selectedSection.props?.source, "manual") === "manual" ? (
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Products</span>
                      <select
                        multiple
                        value={Array.isArray(selectedSection.props?.productIds) ? selectedSection.props.productIds : []}
                        onChange={(event) =>
                          updateSection({
                            ...selectedSection,
                            props: {
                              ...selectedSection.props,
                              productIds: Array.from(event.target.selectedOptions).map((option) => option.value),
                            },
                          })
                        }
                        className="min-h-[180px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                      >
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}

              {selectedSection.type === "recommended_for_you" || selectedSection.type === "recently_viewed_rail" || selectedSection.type === "search_history_rail" ? (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Products to show</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={String(Number(selectedSection.props?.limit || 8))}
                    onChange={(event) =>
                      updateSection({
                        ...selectedSection,
                        props: { ...selectedSection.props, limit: Math.max(1, Math.min(12, Number(event.target.value || 8))) },
                      })
                    }
                    className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                  />
                </label>
              ) : null}

              {selectedSection.type === "category_rail" || selectedSection.type === "category_chip_rail" ? (
                <div className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Categories with products</span>
                  <details className="rounded-[12px] border border-black/10 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[13px] font-medium text-[#202020]">
                      <span>
                        {Array.isArray(selectedSection.props?.categorySlugs) && selectedSection.props.categorySlugs.length
                          ? `${selectedSection.props.categorySlugs.length} categor${selectedSection.props.categorySlugs.length === 1 ? "y" : "ies"} selected`
                          : "Choose categories to show"}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[#8b94a3]">Dropdown</span>
                    </summary>
                    <div className="max-h-[240px] space-y-2 overflow-y-auto border-t border-black/6 px-3 py-3">
                      {categoriesWithProducts.length ? categoriesWithProducts.map((category) => {
                        const isSelected = Array.isArray(selectedSection.props?.categorySlugs)
                          ? selectedSection.props.categorySlugs.includes(category.slug)
                          : false;
                        return (
                          <label key={category.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-black/6 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[#202020]">{category.title}</p>
                              <p className="mt-0.5 text-[11px] text-[#8b94a3]">{category.productCount} product{category.productCount === 1 ? "" : "s"}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSectionCategory(selectedSection, category.slug)}
                              className="h-4 w-4 rounded border-black/20"
                            />
                          </label>
                        );
                      }) : (
                        <div className="rounded-[10px] border border-dashed border-black/10 px-3 py-4 text-[12px] text-[#7a8594]">
                          No live categories with products are available yet.
                        </div>
                      )}
                    </div>
                  </details>
                  <span className="mt-1.5 block text-[11px] text-[#8b94a3]">
                    This list only includes categories that currently contain live products.
                  </span>
                </div>
              ) : null}

              {selectedSection.type === "category_mosaic" ? (
                <div className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Categories with products</span>
                  <details className="rounded-[12px] border border-black/10 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[13px] font-medium text-[#202020]">
                      <span>
                        {Array.isArray(selectedSection.props?.categorySlugs) && selectedSection.props.categorySlugs.length
                          ? `${selectedSection.props.categorySlugs.length} categor${selectedSection.props.categorySlugs.length === 1 ? "y" : "ies"} selected`
                          : "Choose categories to feature"}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[#8b94a3]">Dropdown</span>
                    </summary>
                    <div className="max-h-[240px] space-y-2 overflow-y-auto border-t border-black/6 px-3 py-3">
                      {categoriesWithProducts.length ? categoriesWithProducts.map((category) => {
                        const isSelected = Array.isArray(selectedSection.props?.categorySlugs)
                          ? selectedSection.props.categorySlugs.includes(category.slug)
                          : false;
                        return (
                          <label key={category.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-black/6 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[#202020]">{category.title}</p>
                              <p className="mt-0.5 text-[11px] text-[#8b94a3]">{category.productCount} product{category.productCount === 1 ? "" : "s"}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSectionCategory(selectedSection, category.slug)}
                              className="h-4 w-4 rounded border-black/20"
                            />
                          </label>
                        );
                      }) : (
                        <div className="rounded-[10px] border border-dashed border-black/10 px-3 py-4 text-[12px] text-[#7a8594]">
                          No live categories with products are available yet.
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              ) : null}

              {selectedSection.type === "editorial_collection" ? (
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Editorial highlights</p>
                    <button
                      type="button"
                      onClick={() =>
                        updateSection({
                          ...selectedSection,
                          props: {
                            ...selectedSection.props,
                            points: [...(Array.isArray(selectedSection.props?.points) ? selectedSection.props.points : []), "New highlight"],
                          },
                        })
                      }
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                    >
                      Add point
                    </button>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Eyebrow</span>
                    <input
                      value={toStr(selectedSection.props?.eyebrow)}
                      onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, eyebrow: event.target.value } })}
                      className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Body</span>
                    <textarea
                      value={toStr(selectedSection.props?.body)}
                      onChange={(event) => updateSection({ ...selectedSection, props: { ...selectedSection.props, body: event.target.value } })}
                      className="min-h-[90px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                    />
                  </label>
                  <div className="mt-3 space-y-2">
                    {(Array.isArray(selectedSection.props?.points) ? selectedSection.props.points : []).map((point: any, index: number) => (
                      <div key={`${selectedSection.id}-point-${index}`} className="flex items-center gap-2">
                        <input
                          value={toStr(point)}
                          onChange={(event) =>
                            updateSection({
                              ...selectedSection,
                              props: {
                                ...selectedSection.props,
                                points: (selectedSection.props.points || []).map((entry: any, entryIndex: number) => (entryIndex === index ? event.target.value : entry)),
                              },
                            })
                          }
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateSection({
                              ...selectedSection,
                              props: {
                                ...selectedSection.props,
                                points: (selectedSection.props.points || []).filter((_: any, entryIndex: number) => entryIndex !== index),
                              },
                            })
                          }
                          className="inline-flex h-10 items-center rounded-[12px] border border-[#f2c7c7] bg-[#fff7f7] px-3 text-[12px] font-semibold text-[#b91c1c]"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedSection.type === "promo_tiles" || selectedSection.type === "compact_promo_grid" ? (
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Promo tiles</p>
                    <button
                      type="button"
                      onClick={() =>
                        updateSection({
                          ...selectedSection,
                          props: {
                            ...selectedSection.props,
                            tiles: [
                              ...(Array.isArray(selectedSection.props?.tiles) ? selectedSection.props.tiles : []),
                              { id: nextId("tile"), title: "New tile", subtitle: "Add supporting copy here.", href: "/products", imageUrl: "" },
                            ],
                          },
                        })
                      }
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                    >
                      Add tile
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(Array.isArray(selectedSection.props?.tiles) ? selectedSection.props.tiles : []).map((tile: any, index: number) => (
                      <div key={toStr(tile?.id, `tile-${index}`)} className="rounded-[14px] border border-black/6 bg-white p-3">
                        <div className="grid gap-3">
                          <input
                            value={toStr(tile?.title)}
                            onChange={(event) =>
                              updateSection({
                                ...selectedSection,
                                props: {
                                  ...selectedSection.props,
                                  tiles: selectedSection.props.tiles.map((item: any) =>
                                    toStr(item?.id) === toStr(tile?.id) ? { ...item, title: event.target.value } : item,
                                  ),
                                },
                              })
                            }
                            placeholder="Tile title"
                            className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                          />
                          <textarea
                            value={toStr(tile?.subtitle)}
                            onChange={(event) =>
                              updateSection({
                                ...selectedSection,
                                props: {
                                  ...selectedSection.props,
                                  tiles: selectedSection.props.tiles.map((item: any) =>
                                    toStr(item?.id) === toStr(tile?.id) ? { ...item, subtitle: event.target.value } : item,
                                  ),
                                },
                              })
                            }
                            placeholder="Tile subtitle"
                            className="min-h-[72px] w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                          />
                          <input
                            value={toStr(tile?.href)}
                            onChange={(event) =>
                              updateSection({
                                ...selectedSection,
                                props: {
                                  ...selectedSection.props,
                                  tiles: selectedSection.props.tiles.map((item: any) =>
                                    toStr(item?.id) === toStr(tile?.id) ? { ...item, href: event.target.value } : item,
                                  ),
                                },
                              })
                            }
                            placeholder="/products"
                            className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                          />
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                            <input
                              value={toStr(tile?.imageUrl)}
                              onChange={(event) =>
                                updateSection({
                                  ...selectedSection,
                                  props: {
                                    ...selectedSection.props,
                                    tiles: selectedSection.props.tiles.map((item: any) =>
                                      toStr(item?.id) === toStr(tile?.id) ? { ...item, imageUrl: event.target.value } : item,
                                    ),
                                  },
                                })
                              }
                              placeholder="Image URL"
                              className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setAssetTarget({ sectionId: selectedSection.id, tileId: toStr(tile?.id) })}
                              className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-[#fafafa] px-4 text-[12px] font-semibold text-[#202020]"
                            >
                              Library
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSection({
                                  ...selectedSection,
                                  props: {
                                    ...selectedSection.props,
                                    tiles: selectedSection.props.tiles.filter((item: any) => toStr(item?.id) !== toStr(tile?.id)),
                                  },
                                })
                              }
                              className="inline-flex h-10 items-center rounded-[12px] border border-[#f2c7c7] bg-[#fff7f7] px-4 text-[12px] font-semibold text-[#b91c1c]"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedSection.type === "brand_logo_rail" ? (
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Brand items</p>
                    <button
                      type="button"
                      onClick={() =>
                        updateSection({
                          ...selectedSection,
                          props: {
                            ...selectedSection.props,
                            brands: [...(Array.isArray(selectedSection.props?.brands) ? selectedSection.props.brands : []), "New brand"],
                          },
                        })
                      }
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                    >
                      Add brand
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(Array.isArray(selectedSection.props?.brands) ? selectedSection.props.brands : []).map((brand: any, index: number) => (
                      <div key={`${selectedSection.id}-brand-${index}`} className="flex items-center gap-2">
                        <input
                          value={toStr(brand)}
                          onChange={(event) =>
                            updateSection({
                              ...selectedSection,
                              props: {
                                ...selectedSection.props,
                                brands: (selectedSection.props.brands || []).map((entry: any, entryIndex: number) => (entryIndex === index ? event.target.value : entry)),
                              },
                            })
                          }
                          className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateSection({
                              ...selectedSection,
                              props: {
                                ...selectedSection.props,
                                brands: (selectedSection.props.brands || []).filter((_: any, entryIndex: number) => entryIndex !== index),
                              },
                            })
                          }
                          className="inline-flex h-10 items-center rounded-[12px] border border-[#f2c7c7] bg-[#fff7f7] px-3 text-[12px] font-semibold text-[#b91c1c]"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {assetTarget?.sectionId === selectedSection.id ? (
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Image library</p>
                    <button
                      type="button"
                      onClick={() => setAssetTarget(null)}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {mediaOptions.map((product) => (
                      <button
                        key={`asset-${product.id}`}
                        type="button"
                        onClick={() => assignImageToTarget(toStr(product.imageUrl))}
                        className="overflow-hidden rounded-[14px] border border-black/8 bg-white text-left"
                      >
                        <div className="relative h-24 bg-[#fafafa]">
                          <Image src={toStr(product.imageUrl)} alt={product.title} fill sizes="160px" className="object-contain p-2" />
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-2 text-[11px] font-semibold text-[#202020]">{product.title}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center justify-center rounded-[12px] border border-dashed border-black/12 bg-white px-4 py-3 text-[12px] font-semibold text-[#202020]">
                    {uploadingAsset ? "Uploading..." : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadAssetFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {versions?.length ? (
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Recent versions</p>
                    <button
                      type="button"
                      onClick={() => setShowVersionHistory(true)}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                    >
                      View all
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {versions.slice(0, 6).map((version, index) => (
                      <div key={`${version?.id || "version"}-${index}`} className="rounded-[12px] border border-black/6 bg-white px-3 py-2 text-[12px] text-[#57636c]">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-[#202020]">{toStr(version?.status, "draft") === "published" ? "Published version" : "Draft snapshot"}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${toStr(version?.status) === "published" ? "bg-[rgba(26,133,83,0.12)] text-[#1a8553]" : "bg-[rgba(59,130,246,0.12)] text-[#2563eb]"}`}>
                            {toStr(version?.status, "draft")}
                          </span>
                        </div>
                        <p className="mt-1">{toStr(version?.publishedAt || version?.savedAt, "No timestamp yet")}</p>
                        {toStr((version as any)?.note) ? <p className="mt-1 text-[#7a8594]">{toStr((version as any)?.note)}</p> : null}
                        {toStr(version?.id) ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setSnackbar({ open: true, tone: "info", message: "Restoring version..." });
                              try {
                                const response = await fetch("/api/client/v1/admin/landing-page", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "restore-version", versionId: version?.id }),
                                });
                                const payload = await response.json().catch(() => ({}));
                                if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to restore this version.");
                                const refreshed = await fetch("/api/client/v1/admin/landing-page", { cache: "no-store" });
                                const refreshedPayload = await refreshed.json().catch(() => ({}));
                                const data = (refreshedPayload?.data || {}) as BuilderPayload;
                                const draftSections =
                                  Array.isArray(data?.page?.draftSections) && data.page?.draftSections?.length
                                    ? data.page.draftSections
                                    : defaults.draftSections;
                                setSections(draftSections);
                                setSeo(data?.page?.seo || defaults.seo);
                                setFixedHero(data?.page?.fixedHero || defaults.fixedHero);
                                setProducts(Array.isArray(data?.options?.products) ? data.options.products : []);
                                setPreviewProducts(Array.isArray(data?.options?.previewProducts) ? data.options.previewProducts : []);
                                setCategories(Array.isArray(data?.options?.categories) ? data.options.categories : []);
                                setVersions(Array.isArray(data?.versions) ? data.versions : []);
                                setSelectedId(draftSections[0]?.id || "");
                                setSnackbar({ open: true, tone: "success", message: "Draft restored from version." });
                              } catch (error) {
                                setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to restore this version." });
                              }
                            }}
                            className="mt-2 inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-[#fafafa] px-3 text-[12px] font-semibold text-[#202020]"
                          >
                            Restore draft
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-[16px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-8 text-[13px] text-[#57636c]">
              Select a homepage block to edit its settings.
            </div>
          )}
        </aside>
      </div>

      <AppSnackbar
        notice={snackbar.open ? { message: snackbar.message, tone: snackbar.tone } : null}
        onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
      />
      {showVersionHistory ? (
        <div className="fixed inset-0 z-[220]">
          <button type="button" aria-label="Close publish history" className="absolute inset-0 bg-black/35" onClick={() => setShowVersionHistory(false)} />
          <aside className="fixed inset-y-0 right-0 flex w-[92vw] max-w-[520px] flex-col overflow-hidden bg-[#f7f7f7] shadow-[0_20px_48px_rgba(20,24,27,0.22)]">
            <div className="sticky top-0 z-10 border-b border-black/8 bg-white px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">Publish history</p>
                  <p className="mt-2 text-[14px] text-[#57636c]">Review past homepage snapshots, notes, and restore points.</p>
                </div>
                <button type="button" onClick={() => setShowVersionHistory(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-[20px] text-[#57636c]">×</button>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {versions?.length ? versions.map((version, index) => (
                <div key={`${version?.id || "version"}-${index}`} className="rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_10px_24px_rgba(20,24,27,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-[#202020]">{toStr(version?.status, "draft") === "published" ? "Published homepage" : "Draft snapshot"}</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">{toStr(version?.publishedAt || version?.savedAt, "No timestamp yet")}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${toStr(version?.status) === "published" ? "bg-[rgba(26,133,83,0.12)] text-[#1a8553]" : "bg-[rgba(59,130,246,0.12)] text-[#2563eb]"}`}>
                      {toStr(version?.status, "draft")}
                    </span>
                  </div>
                  {toStr(version?.note) ? (
                    <div className="mt-3 rounded-[12px] border border-black/6 bg-[#fafafa] px-3 py-2 text-[13px] text-[#57636c]">
                      {toStr(version?.note)}
                    </div>
                  ) : null}
                  {toStr(version?.id) ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setSnackbar({ open: true, tone: "info", message: "Restoring version..." });
                        try {
                          const response = await fetch("/api/client/v1/admin/landing-page", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "restore-version", versionId: version?.id }),
                          });
                          const payload = await response.json().catch(() => ({}));
                          if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to restore this version.");
                          const refreshed = await fetch("/api/client/v1/admin/landing-page", { cache: "no-store" });
                          const refreshedPayload = await refreshed.json().catch(() => ({}));
                          const data = (refreshedPayload?.data || {}) as BuilderPayload;
                          const draftSections =
                            Array.isArray(data?.page?.draftSections) && data.page?.draftSections?.length
                              ? data.page.draftSections
                              : defaults.draftSections;
                          setSections(draftSections);
                          setSeo(data?.page?.seo || defaults.seo);
                          setFixedHero(data?.page?.fixedHero || defaults.fixedHero);
                          setProducts(Array.isArray(data?.options?.products) ? data.options.products : []);
                          setPreviewProducts(Array.isArray(data?.options?.previewProducts) ? data.options.previewProducts : []);
                          setCategories(Array.isArray(data?.options?.categories) ? data.options.categories : []);
                          setVersions(Array.isArray(data?.versions) ? data.versions : []);
                          setSelectedId(draftSections[0]?.id || "");
                          setShowVersionHistory(false);
                          setSnackbar({ open: true, tone: "success", message: "Draft restored from version." });
                        } catch (error) {
                          setSnackbar({ open: true, tone: "error", message: error instanceof Error ? error.message : "Unable to restore this version." });
                        }
                      }}
                      className="mt-3 inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-[#fafafa] px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      Restore draft
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-8 text-[14px] text-[#57636c]">
                  No publish history yet.
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
      {showAddSectionModal ? (
        <div className="fixed inset-0 z-[220]">
          <button type="button" aria-label="Close add section modal" className="absolute inset-0 bg-black/35" onClick={() => setShowAddSectionModal(false)} />
          <div className="fixed inset-x-0 bottom-0 top-auto mx-auto w-full max-w-[920px] rounded-t-[28px] border border-black/8 bg-white p-6 shadow-[0_-20px_48px_rgba(20,24,27,0.18)] md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[80vh] md:w-[92vw] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-hidden md:rounded-[28px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">Add a section</p>
                <p className="mt-2 text-[14px] text-[#57636c]">Choose from reusable homepage components grouped by purpose.</p>
              </div>
              <button type="button" onClick={() => setShowAddSectionModal(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-[20px] text-[#57636c]">×</button>
            </div>
            <div className="mt-6 grid gap-5 md:max-h-[58vh] md:grid-cols-3 md:overflow-hidden">
              <div className="space-y-3 md:col-span-1 md:max-h-[58vh] md:overflow-y-auto md:pr-2">
                <div className="rounded-[18px] border border-black/6 bg-[#fafafa] p-3">
                  <input
                    value={sectionLibraryQuery}
                    onChange={(event) => setSectionLibraryQuery(event.target.value)}
                    placeholder="Search components"
                    className="h-11 w-full rounded-[14px] border border-black/10 bg-white px-4 text-[13px] font-medium text-[#202020] outline-none"
                  />
                </div>
                {filteredSectionGroups.length ? filteredSectionGroups.map((group) => {
                  const expanded = expandedSectionGroups[group.title] !== false;
                  return (
                    <div key={group.title} className="rounded-[18px] border border-black/6 bg-[#fafafa]">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSectionGroups((current) => ({
                            ...current,
                            [group.title]: !expanded,
                          }))
                        }
                        className="flex w-full items-center justify-between px-4 py-4 text-left"
                      >
                        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">{group.title}</span>
                        <span className="text-[18px] leading-none text-[#7a8594]">{expanded ? "−" : "+"}</span>
                      </button>
                      {expanded ? (
                        <div className="space-y-2 border-t border-black/6 px-3 py-3">
                          {group.types.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => addSection(type)}
                              onMouseEnter={() => setHoveredSectionType(type)}
                              onFocus={() => setHoveredSectionType(type)}
                              className={`flex w-full items-center justify-between rounded-[14px] border px-4 py-3 text-left text-[13px] font-semibold ${
                                hoveredSectionType === type
                                  ? "border-[#202020] bg-white text-[#202020]"
                                  : "border-black/8 bg-white text-[#202020]"
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-black/8 bg-[#f7f7f7] text-[14px] text-[#57636c]">
                                  {iconForSectionType(type)}
                                </span>
                                <span>{labelForSectionType(type)}</span>
                              </span>
                              <span className="text-[18px] leading-none text-[#7a8594]">+</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }) : (
                  <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-8 text-[14px] text-[#7a8594]">
                    No components match that search yet.
                  </div>
                )}
              </div>
              <div className="md:col-span-2 md:self-start">
                <div className="rounded-[20px] border border-black/6 bg-[#f7f7f7] p-4 md:sticky md:top-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Component preview</p>
                  <p className="mt-2 text-[14px] text-[#57636c]">
                    {hoveredSectionType ? `Skeleton preview for ${labelForSectionType(hoveredSectionType)}.` : "Hover a component to preview its skeleton layout."}
                  </p>
                  <div className="mt-4">
                    {hoveredSectionType ? (
                      <SectionTypeSkeletonPreview type={hoveredSectionType} />
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-12 text-[14px] text-[#7a8594]">
                        Select a component category, then hover a section to preview its layout.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SellerAdminLandingBuilderWorkspace;
