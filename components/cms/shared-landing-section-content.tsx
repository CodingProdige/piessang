import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { LandingSection } from "@/lib/cms/landing-page-schema";
import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import type { ProductItem } from "@/components/products/products-results";

export type SharedLandingProduct = ProductItem & {
  title?: string;
  category?: string;
  categorySlug?: string;
  hasActiveCampaign?: boolean;
};

export type SharedLandingCategory = {
  id: string;
  slug: string;
  title: string;
  productCount?: number;
};

export type SharedLandingSectionMode = "desktop" | "tablet" | "mobile";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = toStr(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function toExternalHref(value: unknown) {
  const href = toStr(value);
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return `https://${href.replace(/^\/+/, "")}`;
}

function slugify(value: unknown) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCategoryIconKey(category: { slug?: string; title?: string }) {
  const source = `${toStr(category?.slug)} ${toStr(category?.title)}`.toLowerCase();
  if (source.includes("beverage") || source.includes("drink")) return "beverages";
  if (source.includes("water")) return "water";
  if (source.includes("snack")) return "snacks";
  if (source.includes("sweet") || source.includes("candy") || source.includes("chocolate")) return "sweets";
  if (source.includes("coffee") || source.includes("tea")) return "coffee";
  if (source.includes("clean")) return "cleaning";
  if (source.includes("health") || source.includes("beauty")) return "health";
  if (source.includes("baby")) return "baby";
  if (source.includes("pet")) return "pet";
  if (source.includes("home")) return "home";
  return "default";
}

function CategoryChipIcon({ category }: { category: { slug?: string; title?: string } }) {
  const key = resolveCategoryIconKey(category);
  const common = "h-4 w-4";
  switch (key) {
    case "beverages":
      return <span className={common}>🥤</span>;
    case "water":
      return <span className={common}>💧</span>;
    case "snacks":
      return <span className={common}>🍿</span>;
    case "sweets":
      return <span className={common}>🍬</span>;
    case "coffee":
      return <span className={common}>☕</span>;
    case "cleaning":
      return <span className={common}>🧼</span>;
    case "health":
      return <span className={common}>🩺</span>;
    case "baby":
      return <span className={common}>🍼</span>;
    case "pet":
      return <span className={common}>🐾</span>;
    case "home":
      return <span className={common}>🏠</span>;
    default:
      return <span className={common}>🛍️</span>;
  }
}

function getCategoryChipImageUrl(section: LandingSection, categorySlug: string) {
  const categoryImages =
    section?.props?.categoryImages && typeof section.props.categoryImages === "object"
      ? section.props.categoryImages
      : {};
  return toStr(categoryImages?.[categorySlug]);
}

function CategoryChipVisual({
  section,
  category,
}: {
  section: LandingSection;
  category: { slug?: string; title?: string };
}) {
  const imageUrl = getCategoryChipImageUrl(section, toStr(category.slug));
  if (imageUrl) {
    return (
      <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full border border-black/8 bg-[#f3f4f6] shadow-[0_8px_20px_rgba(20,24,27,0.08)] sm:h-[78px] sm:w-[78px]">
        <Image src={imageUrl} alt={toStr(category.title, "Category")} fill sizes="78px" className="object-cover" />
      </div>
    );
  }

  return (
    <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-black/8 bg-[#fbfbfb] text-[28px] shadow-[0_8px_20px_rgba(20,24,27,0.05)] sm:h-[78px] sm:w-[78px]">
      <CategoryChipIcon category={category} />
    </div>
  );
}

function sortProductsForRail(items: SharedLandingProduct[], prioritizeCampaigns: boolean, randomize: boolean) {
  const sorted = [...items];
  if (randomize) sorted.sort(() => Math.random() - 0.5);
  if (prioritizeCampaigns) {
    sorted.sort((a, b) => Number(Boolean(b?.hasActiveCampaign)) - Number(Boolean(a?.hasActiveCampaign)));
  }
  return sorted;
}

function resolveRailLimit(sectionProps: any, mode: SharedLandingSectionMode = "desktop") {
  const legacyLimit = Math.max(1, toNum(sectionProps?.limit) || 8);
  if (mode === "mobile") {
    return Math.max(1, toNum(sectionProps?.mobileLimit) || Math.min(legacyLimit, 4));
  }
  return Math.max(1, toNum(sectionProps?.desktopLimit) || legacyLimit);
}

export function SharedSectionShell({ children }: { children: ReactNode }) {
  return <section className="w-full max-w-full rounded-[8px] border border-black/6 bg-white p-4 shadow-[0_10px_24px_rgba(20,24,27,0.04)] sm:p-5 sm:shadow-[0_12px_30px_rgba(20,24,27,0.05)]">{children}</section>;
}

export function renderSharedLandingSectionContent({
  section,
  products,
  categories,
  mode = "desktop",
  isPreview = false,
}: {
  section: LandingSection;
  products: SharedLandingProduct[];
  categories: SharedLandingCategory[];
  mode?: SharedLandingSectionMode;
  isPreview?: boolean;
}): ReactNode | null {
  const isDesktop = mode === "desktop";
  const isTablet = mode === "tablet";
  const isMobile = mode === "mobile";

  if (section.type === "product_rail") {
    const source = toStr(section.props?.source, "new_arrivals");
    const selectedCategorySlugs = (Array.isArray(section.props?.categorySlugs) ? section.props.categorySlugs : [])
      .map((entry: unknown) => slugify(entry))
      .filter(Boolean);
    const prioritizeCampaigns = toBool(section.props?.prioritizeCampaigns) || toBool(section.props?.prioritizeFeatured);
    const randomize = toBool(section.props?.randomize);
    const selectedProducts =
      source === "manual"
        ? products.filter((product) => (Array.isArray(section.props?.productIds) ? section.props.productIds : []).includes(product.id))
        : source === "category_match"
          ? products.filter((product) => {
              if (!selectedCategorySlugs.length) return true;
              return selectedCategorySlugs.includes(slugify(product.categorySlug || product.category));
            })
          : products.slice().reverse();
    const items = sortProductsForRail(selectedProducts, prioritizeCampaigns, randomize).slice(0, resolveRailLimit(section.props, mode));
    return (
      <ProductRailCarousel
        title={toStr(section.props?.title, "Product rail")}
        subtitle={toStr(section.props?.subtitle)}
        products={items}
        emptyMessage="No products available for this rail yet."
      />
    );
  }

  if (section.type === "featured_duo") {
    const selected = products
      .filter((product) => (Array.isArray(section.props?.productIds) ? section.props.productIds : []).includes(product.id))
      .slice(0, 2);
    return (
      <ProductRailCarousel
        title={toStr(section.props?.title, "Featured picks")}
        subtitle={toStr(section.props?.subtitle)}
        products={selected}
        emptyMessage="Select up to two products for this feature."
      />
    );
  }

  if (section.type === "category_chip_rail") {
    const selectedCategorySlugs = Array.isArray(section.props?.categorySlugs)
      ? section.props.categorySlugs.map((slug: unknown) => toStr(slug)).filter(Boolean)
      : [];
    const selected = (selectedCategorySlugs.length
      ? categories.filter((category) => selectedCategorySlugs.includes(category.slug))
      : categories
    ).filter((category) => Number(category.productCount || 0) > 0);
    return (
      <SharedSectionShell>
        <div>
          <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Quick shop")}</p>
          <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
        </div>
        <div className="mt-5 flex flex-nowrap gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6">
          {selected.map((category) => {
            const content = (
              <>
                <CategoryChipVisual section={section} category={category} />
                <span className="mt-2 line-clamp-2">{category.title}</span>
              </>
            );
            return isPreview ? (
              <div key={category.id} className="flex w-[84px] shrink-0 flex-col items-center text-center text-[13px] font-medium leading-[1.3] text-[#202020] sm:w-[96px]">
                {content}
              </div>
            ) : (
              <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`} className="flex w-[84px] shrink-0 flex-col items-center text-center text-[13px] font-medium leading-[1.3] text-[#202020] sm:w-[96px]">
                {content}
              </Link>
            );
          })}
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "category_rail") {
    const selected = Array.isArray(section.props?.categorySlugs) && section.props.categorySlugs.length
      ? categories.filter((category) => section.props.categorySlugs.includes(category.slug))
      : categories.slice(0, 8);
    return (
      <SharedSectionShell>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[22px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[28px]">{toStr(section.props?.title, "Categories")}</p>
            <p className="mt-2 text-[13px] text-[#57636c] sm:text-[15px]">{toStr(section.props?.subtitle)}</p>
          </div>
          <Link href="/categories" className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3.5 text-[12px] font-semibold text-[#202020] sm:h-10 sm:px-4 sm:text-[13px]">
            Browse categories
          </Link>
        </div>
        <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] sm:mt-5 sm:gap-4 [&::-webkit-scrollbar]:hidden">
          {selected.map((category, index) => (
            <Link
              key={category.id}
              href={`/products?category=${encodeURIComponent(category.slug)}`}
              className={`min-w-[220px] snap-start rounded-[8px] border border-black/6 p-4 shadow-[0_8px_22px_rgba(20,24,27,0.04)] sm:min-w-[240px] sm:p-5 sm:shadow-[0_10px_26px_rgba(20,24,27,0.04)] ${
                index === 0 ? "bg-[linear-gradient(135deg,#fff8e8,#ffffff)]" : "bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]"
              }`}
            >
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Category</p>
              <p className="mt-3 text-[18px] font-semibold tracking-[-0.03em] text-[#202020] sm:text-[22px]">{category.title}</p>
              <p className="mt-2 text-[13px] text-[#7a8594]">{category.slug}</p>
            </Link>
          ))}
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "brand_logo_rail") {
    const brands = (Array.isArray(section.props?.brands) ? section.props.brands : []).map((brand: unknown) => toStr(brand)).filter(Boolean);
    return (
      <SharedSectionShell>
        <div>
          <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Trusted brands")}</p>
          <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {brands.map((brand, index) => (
            <div key={`${section.id}-brand-${index}`} className="inline-flex min-h-11 items-center rounded-[8px] border border-black/8 bg-[#fbfbfb] px-4 text-[13px] font-semibold tracking-[0.02em] text-[#202020]">
              {brand}
            </div>
          ))}
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "facebook_rail") {
    const href = toExternalHref(section.props?.pageLink);
    const posts = (Array.isArray(section.props?.posts) ? section.props.posts : []).slice(0, 8);
    return (
      <SharedSectionShell>
        <div className="overflow-hidden rounded-[18px] border border-[#d6e4ff] bg-[linear-gradient(135deg,#eef4ff,#ffffff_58%,#f5f8ff)] p-5 shadow-[0_12px_28px_rgba(24,119,242,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#1877f2]">Social</p>
              <p className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[30px]">{toStr(section.props?.title, "Follow us on Facebook")}</p>
              <p className="mt-3 max-w-[52ch] text-[14px] leading-[1.7] text-[#57636c] sm:text-[15px]">{toStr(section.props?.subtitle)}</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[#1877f2] text-[34px] font-semibold text-white shadow-[0_12px_26px_rgba(24,119,242,0.25)] sm:h-20 sm:w-20 sm:text-[40px]">
              f
            </div>
          </div>
          {href ? (
            isPreview ? (
              <div className="mt-5 inline-flex h-11 items-center rounded-[12px] bg-[#1877f2] px-4 text-[14px] font-semibold text-white shadow-[0_10px_22px_rgba(24,119,242,0.22)]">
                {toStr(section.props?.ctaLabel, "Open Facebook")}
              </div>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className="mt-5 inline-flex h-11 items-center rounded-[12px] bg-[#1877f2] px-4 text-[14px] font-semibold text-white shadow-[0_10px_22px_rgba(24,119,242,0.22)]">
                {toStr(section.props?.ctaLabel, "Open Facebook")}
              </a>
            )
          ) : null}
          {posts.length ? (
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4">
              {posts.map((post: any, index: number) => {
                const postHref = toExternalHref(post?.href);
                const card = (
                  <div className="flex h-full w-[240px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-[#cfe0ff] bg-white shadow-[0_8px_22px_rgba(24,119,242,0.08)] sm:w-[280px]">
                    <div className="relative aspect-[1.3/1] bg-[#edf3ff]">
                      {toStr(post?.imageUrl) ? (
                        <Image src={toStr(post?.imageUrl)} alt={toStr(post?.title, "Facebook post")} fill sizes="280px" className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[28px] font-semibold text-[#1877f2]">f</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-[15px] font-semibold leading-[1.35] text-[#202020]">{toStr(post?.title, "Recent Facebook post")}</p>
                      <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">{toStr(post?.subtitle)}</p>
                      <div className="mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#1877f2]">View post</div>
                    </div>
                  </div>
                );
                return isPreview || !postHref ? (
                  <div key={toStr(post?.id, `facebook-post-${index}`)}>{card}</div>
                ) : (
                  <a key={toStr(post?.id, `facebook-post-${index}`)} href={postHref} target="_blank" rel="noreferrer noopener" className="block">
                    {card}
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "category_mosaic") {
    const selected = Array.isArray(section.props?.categorySlugs) && section.props.categorySlugs.length
      ? categories.filter((category) => section.props.categorySlugs.includes(category.slug)).slice(0, 5)
      : categories.slice(0, 5);
    return (
      <SharedSectionShell>
        <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Category mosaic")}</p>
        <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
        <div className={`mt-5 grid gap-4 ${isPreview ? (isDesktop ? "lg:grid-cols-[1.2fr_0.8fr]" : "") : "lg:grid-cols-[1.2fr_0.8fr]"}`}>
          <Link href={`/products?category=${encodeURIComponent(selected[0]?.slug || "")}`} className="rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fff8e8,#ffffff)] p-6 shadow-[0_12px_28px_rgba(20,24,27,0.05)]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">Featured category</p>
            <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(selected[0]?.title, "Category")}</p>
            <p className="mt-3 text-[14px] text-[#57636c]">Lead shoppers into the strongest category moment right now.</p>
          </Link>
          <div className={`grid gap-4 ${isPreview ? (isMobile ? "grid-cols-1" : "sm:grid-cols-2") : "sm:grid-cols-2"}`}>
            {selected.slice(1).map((category) => (
              <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`} className="rounded-[8px] border border-black/6 bg-[#fbfbfb] p-5">
                <p className="text-[18px] font-semibold text-[#202020]">{category.title}</p>
                <p className="mt-2 text-[13px] text-[#7a8594]">{category.slug}</p>
              </Link>
            ))}
          </div>
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "compact_promo_grid") {
    const tiles = (Array.isArray(section.props?.tiles) ? section.props.tiles : []).slice(0, 4);
    return (
      <SharedSectionShell>
        <div>
          <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Curated highlights")}</p>
          <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {tiles.map((tile: any, index: number) => {
            const content = (
              <>
                <div className="relative aspect-[1/1] bg-[#fafafa]">
                  {toStr(tile?.imageUrl) ? (
                    <Image src={toStr(tile?.imageUrl)} alt={toStr(tile?.title, "Promo tile")} fill sizes="(max-width: 640px) 50vw, 280px" className="object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="text-[14px] font-semibold leading-[1.25] text-[#202020]">{toStr(tile?.title, "Promo tile")}</p>
                  <p className="mt-1 text-[11px] leading-[1.5] text-[#7a8594]">{toStr(tile?.subtitle)}</p>
                </div>
              </>
            );
            return isPreview ? (
              <div key={toStr(tile?.id, `compact-preview-${index}`)} className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]">
                {content}
              </div>
            ) : (
              <Link key={toStr(tile?.id, `compact-tile-${index}`)} href={toStr(tile?.href, "/products")} className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]">
                {content}
              </Link>
            );
          })}
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "promo_tiles") {
    const tiles = Array.isArray(section.props?.tiles) ? section.props.tiles : [];
    return (
      <SharedSectionShell>
        <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Promo tiles")}</p>
        <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
        <div className={`mt-5 grid gap-4 ${isPreview ? (isDesktop || isTablet ? "lg:grid-cols-2" : "") : "lg:grid-cols-2"}`}>
          {tiles.map((tile: any, index: number) => (
            <Link key={toStr(tile?.id, `tile-${index}`)} href={toStr(tile?.href, "/products")} className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#ffffff,#f9fafb)] shadow-[0_12px_28px_rgba(20,24,27,0.05)]">
              <div className={`grid min-h-[220px] gap-4 ${isPreview ? (isDesktop ? "md:grid-cols-[minmax(0,1fr)_180px]" : "") : "md:grid-cols-[minmax(0,1fr)_180px]"}`}>
                <div className="p-5">
                  <p className="text-[24px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(tile?.title, "Promo tile")}</p>
                  <p className="mt-3 text-[15px] leading-[1.7] text-[#57636c]">{toStr(tile?.subtitle)}</p>
                </div>
                <div className="relative bg-[#fafafa]">
                  {toStr(tile?.imageUrl) ? (
                    <Image src={toStr(tile?.imageUrl)} alt={toStr(tile?.title, "Promo image")} fill sizes="180px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[13px] font-semibold text-[#9aa2af]">Add image</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SharedSectionShell>
    );
  }

  if (section.type === "text_block") {
    return (
      <SharedSectionShell>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8f7531]">{toStr(section.props?.eyebrow, "Piessang")}</p>
        <p className="mt-3 text-[32px] font-semibold tracking-[-0.05em] text-[#202020]">{toStr(section.props?.title, "Editorial block")}</p>
        <p className="mt-4 max-w-[70ch] text-[16px] leading-[1.8] text-[#57636c]">{toStr(section.props?.body)}</p>
        {toStr(section.props?.ctaLabel) ? (
          <div className="mt-6">
            <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-11 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
              {toStr(section.props?.ctaLabel)}
            </Link>
          </div>
        ) : null}
      </SharedSectionShell>
    );
  }

  if (section.type === "editorial_collection") {
    const points = (Array.isArray(section.props?.points) ? section.props.points : []).map((point: unknown) => toStr(point)).filter(Boolean);
    return (
      <SharedSectionShell>
        <div className={`grid gap-6 ${isPreview ? (isDesktop ? "lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" : "") : "lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"}`}>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8f7531]">{toStr(section.props?.eyebrow, "Editorial collection")}</p>
            <p className="mt-3 text-[32px] font-semibold tracking-[-0.05em] text-[#202020]">{toStr(section.props?.title, "Editorial collection")}</p>
            <p className="mt-4 max-w-[70ch] text-[16px] leading-[1.8] text-[#57636c]">{toStr(section.props?.body)}</p>
            {toStr(section.props?.ctaLabel) ? (
              <div className="mt-6">
                <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-11 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
                  {toStr(section.props?.ctaLabel)}
                </Link>
              </div>
            ) : null}
          </div>
          <div className="rounded-[8px] border border-black/6 bg-[#fbfbfb] p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Highlights</p>
            <div className="mt-4 space-y-3">
              {points.length ? points.map((point, index) => (
                <div key={`${section.id}-point-${index}`} className="rounded-[8px] border border-black/6 bg-white px-4 py-3 text-[14px] font-medium text-[#202020]">
                  {point}
                </div>
              )) : (
                <div className="rounded-[8px] border border-dashed border-black/10 px-4 py-5 text-[13px] text-[#7a8594]">
                  Add editorial highlights in the builder.
                </div>
              )}
            </div>
          </div>
        </div>
      </SharedSectionShell>
    );
  }

  return null;
}
