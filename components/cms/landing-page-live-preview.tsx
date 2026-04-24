"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { LandingFixedHero, LandingSection } from "@/lib/cms/landing-page-schema";
import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import type { ProductItem } from "@/components/products/products-results";
import { PiessangHeader } from "@/components/header/mega-menu";
import { PiessangFooter } from "@/components/footer/site-footer";
import {
  RecommendedForYouRail,
  RecentlyViewedRail,
  SearchHistoryRail,
  TrendingProductsRail,
} from "@/components/cms/personalized-landing-sections";
import {
  renderSharedLandingSectionContent,
  type SharedLandingCategory,
  type SharedLandingProduct,
} from "@/components/cms/shared-landing-section-content";

type PreviewProduct = ProductItem & {
  title?: string;
  category?: string;
};

type PreviewCategory = {
  id: string;
  slug: string;
  title: string;
};

export type LandingPreviewMode = "desktop" | "tablet" | "mobile";

const FIXED_HERO_BLOCK_ID = "__fixed_header_hero__";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
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

function toNum(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = toStr(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function slugify(value: unknown) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortProductsForRail(items: PreviewProduct[], prioritizeCampaigns: boolean, randomize: boolean) {
  const sorted = [...items];
  if (randomize) {
    sorted.sort(() => Math.random() - 0.5);
  }
  if (prioritizeCampaigns) {
    sorted.sort((a: any, b: any) => Number(Boolean(b?.hasActiveCampaign)) - Number(Boolean(a?.hasActiveCampaign)));
  }
  return sorted;
}

function resolveRailLimit(sectionProps: any, mode: "desktop" | "tablet" | "mobile" = "desktop") {
  const legacyLimit = Math.max(1, toNum(sectionProps?.limit) || 8);
  if (mode === "mobile") {
    return Math.max(1, toNum(sectionProps?.mobileLimit) || Math.min(legacyLimit, 4));
  }
  return Math.max(1, toNum(sectionProps?.desktopLimit) || legacyLimit);
}

function labelForSection(type: LandingSection["type"]) {
  return String(type).replace(/_/g, " ");
}

function formatCountdown(endDateRaw: unknown) {
  const endTime = new Date(toStr(endDateRaw)).getTime();
  if (!endTime) return null;
  const diff = endTime - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return <section className="rounded-[8px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">{children}</section>;
}

function PreviewSelectableShell({
  blockId,
  label,
  selected,
  onSelect,
  controls,
  children,
}: {
  blockId: string;
  label: string;
  selected?: boolean;
  onSelect?: (blockId: string) => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const isInteractive = typeof onSelect === "function";
  return (
    <div
      data-preview-block-id={blockId}
      className={`group relative scroll-mt-6 rounded-[8px] transition ${
        selected ? "ring-2 ring-[#0b57d0] ring-offset-2 ring-offset-[#f6f7f8]" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect?.(blockId)}
        className={`absolute inset-0 z-[1] rounded-[8px] ${isInteractive ? "cursor-pointer" : "pointer-events-none"}`}
        aria-label={`Select ${label}`}
      />
      <div
        className={`pointer-events-none absolute left-3 top-3 z-[3] inline-flex items-center rounded-[8px] border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
          selected
            ? "border-[#0b57d0] bg-[#0b57d0] text-white"
            : "border-black/10 bg-white/94 text-[#5d6673] opacity-0 shadow-[0_8px_18px_rgba(20,24,27,0.08)] group-hover:opacity-100"
        }`}
      >
        {label}
      </div>
      {controls ? (
        <div className={`absolute right-3 top-3 z-[3] transition ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          {controls}
        </div>
      ) : null}
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}

function PreviewHeader({ mode }: { mode: LandingPreviewMode; fixedHero?: LandingFixedHero | null }) {
  const compact = mode !== "desktop";
  return (
    <header className="border-b border-black/6 bg-white">
      <div className={`w-full px-3 ${compact ? "py-4" : "py-5"}`}>
        <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`${compact ? "h-9 w-9" : "h-10 w-10"} rounded-full bg-[#eceff3]`} />
              <div className="space-y-2">
                <div className={`${compact ? "h-3 w-24" : "h-3 w-32"} rounded-full bg-[#e3e7ee]`} />
                {!compact ? <div className="h-2.5 w-48 rounded-full bg-[#eef1f5]" /> : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`${compact ? "h-9 w-9" : "h-10 w-10"} rounded-full bg-[#eceff3]`} />
              <div className={`${compact ? "h-9 w-9" : "h-10 w-10"} rounded-full bg-[#eceff3]`} />
            </div>
          </div>
          <div className={`mt-4 rounded-[8px] bg-[#eef1f5] ${compact ? "h-11" : "h-12"}`} />
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">
            Header skeleton preview only
          </div>
        </div>
      </div>
    </header>
  );
}

function PreviewFooter() {
  return (
    <footer className="mt-10 border-t border-black/6 bg-white">
      <div className="w-full px-3 py-8">
        <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] p-5">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`footer-skeleton-${index}`} className="space-y-3">
                <div className="h-3 w-16 rounded-full bg-[#dde3ea]" />
                <div className="h-2.5 w-24 rounded-full bg-[#edf1f5]" />
                <div className="h-2.5 w-20 rounded-full bg-[#edf1f5]" />
                <div className="h-2.5 w-28 rounded-full bg-[#edf1f5]" />
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">
            Footer skeleton preview only
          </div>
        </div>
      </div>
    </footer>
  );
}

function PreviewFixedHeroBlock({
  fixedHero,
  selected,
  onSelect,
  controls,
}: {
  fixedHero?: LandingFixedHero | null;
  selected?: boolean;
  onSelect?: (blockId: string) => void;
  controls?: ReactNode;
}) {
  const images = Array.isArray(fixedHero?.images)
    ? fixedHero.images
        .map((entry) => {
          if (typeof entry === "string") {
            const imageUrl = toStr(entry);
            return imageUrl ? { imageUrl, href: "" } : null;
          }
          const imageUrl = toStr((entry as any)?.imageUrl);
          const href = toStr((entry as any)?.href);
          return imageUrl ? { imageUrl, href } : null;
        })
        .filter(Boolean) as Array<{ imageUrl: string; href: string }>
    : [];
  const primaryImage = images[0]?.imageUrl || "";
  const primaryHref = images[0]?.href || "";
  const rotationSeconds = Math.max(1, Number(fixedHero?.rotationSeconds || 4));

  return (
    <PreviewSelectableShell
      blockId={FIXED_HERO_BLOCK_ID}
      label="Fixed header hero"
      selected={selected}
      onSelect={onSelect}
      controls={controls}
    >
      <section className="overflow-hidden rounded-[8px] border border-black/6 bg-[#f7f8fa] shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
        <div className="p-4">
          <div className="overflow-hidden rounded-[8px] border border-black/8 bg-[#132c84] shadow-[0_14px_28px_rgba(20,24,27,0.1)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72">
              <span>Fixed hero preview</span>
              <span>Rotates every {rotationSeconds}s</span>
            </div>
            {primaryImage ? (
              <div className="relative h-[320px]">
                <Image
                  src={primaryImage}
                  alt="Fixed header hero preview"
                  fill
                  sizes="(max-width: 1024px) 100vw, 900px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(12,18,46,0.24),rgba(12,18,46,0.06)_42%,rgba(12,18,46,0.36))]" />
                <div className="absolute left-4 top-4 rounded-[8px] bg-white/14 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                  {images.length} image{images.length === 1 ? "" : "s"}
                </div>
                {primaryHref ? (
                  <div className="absolute bottom-4 left-4 rounded-[8px] bg-white/14 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                    Clickthrough enabled
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-[320px] items-center justify-center bg-[linear-gradient(135deg,#15308e,#221257)] px-6 text-center text-[15px] font-semibold text-white/78">
                Add rotating hero images in the builder.
              </div>
            )}
          </div>
        </div>
      </section>
    </PreviewSelectableShell>
  );
}

export function LandingPageLivePreview({
  sections,
  products,
  categories,
  fixedHero,
  mode = "desktop",
  selectedBlockId,
  onSelectBlock,
  renderBlockControls,
  editorCanvas = false,
}: {
  sections: LandingSection[];
  products: PreviewProduct[];
  categories: PreviewCategory[];
  fixedHero?: LandingFixedHero | null;
  mode?: LandingPreviewMode;
  selectedBlockId?: string;
  onSelectBlock?: (blockId: string) => void;
  renderBlockControls?: (blockId: string) => ReactNode;
  editorCanvas?: boolean;
}) {
  const isDesktop = mode === "desktop";
  const isTablet = mode === "tablet";
  const isMobile = mode === "mobile";
  const blocks = sections.map((section) => {
        const label = toStr(section.props?.title || section.props?.headline || labelForSection(section.type), "Section");
        const controls = renderBlockControls?.(section.id);
        const isSelected = selectedBlockId === section.id;
        if (section.type === "hero_banner") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <section
              className={`relative w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_46%,#eef6ff_100%)] shadow-[0_18px_44px_rgba(20,24,27,0.07)] ${isMobile ? "p-5" : isTablet ? "p-6" : "p-8"}`}
            >
              <div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_55%)]" />
              <div className={`grid gap-6 ${isDesktop ? "lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center" : ""}`}>
                <div className="relative z-10">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8f7531]">{toStr(section.props?.eyebrow, "Piessang")}</p>
                  <h1 className={`mt-3 max-w-[12ch] font-semibold tracking-[-0.05em] text-[#202020] ${isMobile ? "text-[30px]" : isTablet ? "text-[38px]" : "text-[48px]"}`}>
                    {toStr(section.props?.headline, "Curated products for repeat buying")}
                  </h1>
                  <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.7] text-[#57636c]">{toStr(section.props?.subheadline)}</p>
                  <div className="mt-6">
                    <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-12 items-center rounded-[8px] bg-[#202020] px-5 text-[14px] font-semibold text-white">
                      {toStr(section.props?.ctaLabel, "Shop now")}
                    </Link>
                  </div>
                </div>
                <div className="relative z-10 overflow-hidden rounded-[8px] border border-white/60 bg-white/70 shadow-[0_16px_36px_rgba(20,24,27,0.08)]">
                  {toStr(section.props?.imageUrl) ? (
                    <div className="relative h-[280px]">
                      <Image src={toStr(section.props?.imageUrl)} alt={toStr(section.props?.headline, "Piessang hero")} fill sizes="(max-width: 1024px) 100vw, 360px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#eef6ff)] text-[14px] font-semibold text-[#7a8594]">
                      Add a hero image in the builder
                    </div>
                  )}
                </div>
              </div>
            </section>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "split_banner") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <section
              className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_52%,#fff8e8_100%)] shadow-[0_18px_44px_rgba(20,24,27,0.07)]"
            >
              <div className={`grid gap-6 ${isMobile ? "p-5" : "p-6"} ${isDesktop ? "lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center" : ""}`}>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8f7531]">{toStr(section.props?.eyebrow, "Featured collection")}</p>
                  <p className={`mt-3 max-w-[14ch] font-semibold tracking-[-0.05em] text-[#202020] ${isMobile ? "text-[28px]" : "text-[36px]"}`}>{toStr(section.props?.title, "Split banner")}</p>
                  <p className="mt-4 max-w-[56ch] text-[16px] leading-[1.8] text-[#57636c]">{toStr(section.props?.body)}</p>
                  <div className="mt-6">
                    <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-5 text-[14px] font-semibold text-white">
                      {toStr(section.props?.ctaLabel, "Explore")}
                    </Link>
                  </div>
                </div>
                <div className="relative min-h-[280px] overflow-hidden rounded-[8px] border border-white/60 bg-white/80">
                  {toStr(section.props?.imageUrl) ? (
                    <Image src={toStr(section.props?.imageUrl)} alt={toStr(section.props?.title, "Split banner")} fill sizes="(max-width: 1024px) 100vw, 420px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#eef6ff)] text-[14px] font-semibold text-[#7a8594]">
                      Add a split-banner image in the builder
                    </div>
                  )}
                </div>
              </div>
            </section>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "seller_spotlight") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <section
              className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fffef8_0%,#ffffff_55%,#f7fbff_100%)] shadow-[0_18px_44px_rgba(20,24,27,0.07)]"
            >
              <div className={`grid gap-6 ${isMobile ? "p-5" : "p-6"} ${isDesktop ? "lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center" : ""}`}>
                <div className="relative min-h-[240px] overflow-hidden rounded-[8px] border border-black/6 bg-white">
                  {toStr(section.props?.imageUrl) ? (
                    <Image src={toStr(section.props?.imageUrl)} alt={toStr(section.props?.sellerName, "Featured seller")} fill sizes="300px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#fff8e8)] text-[14px] font-semibold text-[#7a8594]">
                      Seller image
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8f7531]">{toStr(section.props?.eyebrow, "Seller spotlight")}</p>
                  <p className={`mt-3 font-semibold tracking-[-0.05em] text-[#202020] ${isMobile ? "text-[28px]" : "text-[36px]"}`}>{toStr(section.props?.title, "Meet standout sellers on Piessang")}</p>
                  <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.8] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
                  <div className="mt-6 rounded-[8px] border border-black/6 bg-white/85 px-4 py-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Featured seller</p>
                    <p className="mt-1 text-[22px] font-semibold text-[#202020]">{toStr(section.props?.sellerName, "Featured seller")}</p>
                  </div>
                  <div className="mt-6">
                    <Link href={toStr(section.props?.href, "/vendors")} className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-5 text-[14px] font-semibold text-white">
                      Visit seller
                    </Link>
                  </div>
                </div>
              </div>
            </section>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "countdown_promo") {
          const countdown = formatCountdown(section.props?.endsAt);
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <section
              className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#202020_0%,#2c3744_55%,#3b82f6_140%)] text-white shadow-[0_18px_44px_rgba(20,24,27,0.18)]"
            >
              <div className={`grid gap-6 ${isMobile ? "p-5" : "p-6"} ${isDesktop ? "lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center" : ""}`}>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">{toStr(section.props?.eyebrow, "Limited-time campaign")}</p>
                  <p className={`mt-3 max-w-[14ch] font-semibold tracking-[-0.05em] ${isMobile ? "text-[28px]" : "text-[36px]"}`}>{toStr(section.props?.title, "Countdown to the next launch")}</p>
                  <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.8] text-white/78">{toStr(section.props?.subtitle)}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {countdown ? (
                      <div className="rounded-[8px] border border-white/14 bg-white/10 px-4 py-2 text-[14px] font-semibold">
                        {countdown}
                      </div>
                    ) : null}
                    <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-11 items-center rounded-[8px] bg-white px-5 text-[14px] font-semibold text-[#202020]">
                      {toStr(section.props?.ctaLabel, "Shop now")}
                    </Link>
                  </div>
                </div>
                <div className="relative min-h-[220px] overflow-hidden rounded-[8px] border border-white/14 bg-white/8">
                  {toStr(section.props?.imageUrl) ? (
                    <Image src={toStr(section.props?.imageUrl)} alt={toStr(section.props?.title, "Countdown promo")} fill sizes="260px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[14px] font-semibold text-white/72">Campaign image</div>
                  )}
                </div>
              </div>
            </section>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "deal_strip_banner") {
          return (
            <PreviewSelectableShell key={section.id} blockId={section.id} label={label} selected={isSelected} onSelect={onSelectBlock} controls={controls}>
              <section className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#202020_0%,#2d3743_52%,#d5aa22_150%)] px-4 py-4 text-white shadow-[0_14px_34px_rgba(20,24,27,0.12)] sm:px-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[22px] font-semibold tracking-[-0.04em] sm:text-[26px]">{toStr(section.props?.title, "Deals worth opening")}</p>
                    <p className="mt-1 text-[13px] text-white/75 sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
                  </div>
                  <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-10 items-center rounded-[8px] bg-white px-4 text-[13px] font-semibold text-[#202020]">
                    {toStr(section.props?.ctaLabel, "View deals")}
                  </Link>
                </div>
              </section>
            </PreviewSelectableShell>
          );
        }

        const sharedContent = renderSharedLandingSectionContent({
          section,
          products: products as SharedLandingProduct[],
          categories: categories as SharedLandingCategory[],
          mode,
          isPreview: true,
        });
        if (sharedContent) {
          return (
            <PreviewSelectableShell key={section.id} blockId={section.id} label={label} selected={isSelected} onSelect={onSelectBlock} controls={controls}>
              {sharedContent}
            </PreviewSelectableShell>
          );
        }

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
                ? products.filter((product: any) => {
                    if (!selectedCategorySlugs.length) return true;
                    return selectedCategorySlugs.includes(slugify(product.categorySlug || product.category));
                  })
              : products.slice().reverse();
          const items = sortProductsForRail(selectedProducts, prioritizeCampaigns, randomize).slice(0, resolveRailLimit(section.props, mode));
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
              <ProductRailCarousel
                title={toStr(section.props?.title, "Product rail")}
                subtitle={toStr(section.props?.subtitle)}
                products={items}
                emptyMessage="No products available for this rail yet."
              />
            </PreviewSelectableShell>
          );
        }

        if (section.type === "featured_duo") {
          const selectedProducts = products
            .filter((product) => (Array.isArray(section.props?.productIds) ? section.props.productIds : []).includes(product.id))
            .slice(0, 2);
          return (
            <PreviewSelectableShell key={section.id} blockId={section.id} label={label} selected={isSelected} onSelect={onSelectBlock} controls={controls}>
              <ProductRailCarousel
                title={toStr(section.props?.title, "Featured picks")}
                subtitle={toStr(section.props?.subtitle)}
                products={selectedProducts}
                emptyMessage="Select up to two products for this feature."
              />
            </PreviewSelectableShell>
          );
        }

        if (section.type === "category_chip_rail") {
          const selectedCategorySlugs = Array.isArray(section.props?.categorySlugs)
            ? section.props.categorySlugs.map((slug: unknown) => toStr(slug)).filter(Boolean)
            : [];
          const selectedCategories = (selectedCategorySlugs.length
            ? categories.filter((category: any) => selectedCategorySlugs.includes(category.slug))
            : categories
          ).filter((category: any) => Number(category?.productCount || 0) > 0);
          return (
            <PreviewSelectableShell key={section.id} blockId={section.id} label={label} selected={isSelected} onSelect={onSelectBlock} controls={controls}>
              <SectionShell>
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Quick shop")}</p>
                  <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
                </div>
                <div className="mt-5 flex flex-nowrap gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6">
                  {selectedCategories.map((category) => (
                    <div key={category.id} className="flex w-[84px] shrink-0 flex-col items-center text-center text-[13px] font-medium leading-[1.3] text-[#202020] sm:w-[96px]">
                      <CategoryChipVisual section={section} category={category} />
                      <span className="mt-2 line-clamp-2">{category.title}</span>
                    </div>
                  ))}
                </div>
              </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "category_rail") {
          const selected = Array.isArray(section.props?.categorySlugs) && section.props.categorySlugs.length
            ? categories.filter((category) => section.props.categorySlugs.includes(category.slug))
            : categories.slice(0, 8);
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <SectionShell>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Categories")}</p>
                  <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
                </div>
                <Link href="/categories" className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                  Browse categories
                </Link>
              </div>
              <div className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selected.map((category, index) => (
                  <Link
                    key={category.id}
                    href={`/products?category=${encodeURIComponent(category.slug)}`}
                    className={`min-w-[240px] snap-start rounded-[8px] border border-black/6 p-5 shadow-[0_10px_26px_rgba(20,24,27,0.04)] ${
                      index === 0
                        ? "bg-[linear-gradient(135deg,#fff8e8,#ffffff)]"
                        : "bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]"
                    }`}
                  >
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Category</p>
                    <p className="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-[#202020]">{category.title}</p>
                    <p className="mt-2 text-[13px] text-[#7a8594]">{category.slug}</p>
                  </Link>
                ))}
              </div>
            </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "brand_logo_rail") {
          const brands = (Array.isArray(section.props?.brands) ? section.props.brands : []).map((brand: unknown) => toStr(brand)).filter(Boolean);
          return (
            <PreviewSelectableShell key={section.id} blockId={section.id} label={label} selected={isSelected} onSelect={onSelectBlock} controls={controls}>
              <SectionShell>
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
              </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "category_mosaic") {
          const selected = Array.isArray(section.props?.categorySlugs) && section.props.categorySlugs.length
            ? categories.filter((category) => section.props.categorySlugs.includes(category.slug)).slice(0, 5)
            : categories.slice(0, 5);
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <SectionShell>
              <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Category mosaic")}</p>
              <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
              <div className={`mt-5 grid gap-4 ${isDesktop ? "lg:grid-cols-[1.2fr_0.8fr]" : ""}`}>
                <Link href={`/products?category=${encodeURIComponent(selected[0]?.slug || "")}`} className="rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fff8e8,#ffffff)] p-6 shadow-[0_12px_28px_rgba(20,24,27,0.05)]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">Featured category</p>
                  <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(selected[0]?.title, "Category")}</p>
                  <p className="mt-3 text-[14px] text-[#57636c]">Lead shoppers into the strongest category moment right now.</p>
                </Link>
                <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "sm:grid-cols-2"}`}>
                  {selected.slice(1).map((category) => (
                    <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`} className="rounded-[8px] border border-black/6 bg-[#fbfbfb] p-5">
                      <p className="text-[18px] font-semibold text-[#202020]">{category.title}</p>
                      <p className="mt-2 text-[13px] text-[#7a8594]">{category.slug}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "compact_promo_grid") {
          const tiles = (Array.isArray(section.props?.tiles) ? section.props.tiles : []).slice(0, 4);
          return (
            <PreviewSelectableShell key={section.id} blockId={section.id} label={label} selected={isSelected} onSelect={onSelectBlock} controls={controls}>
              <SectionShell>
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Curated highlights")}</p>
                  <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {tiles.map((tile: any, index: number) => (
                    <div key={toStr(tile?.id, `compact-preview-${index}`)} className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]">
                      <div className="relative aspect-square bg-[#fafafa]">
                        {toStr(tile?.imageUrl) ? (
                          <Image src={toStr(tile?.imageUrl)} alt={toStr(tile?.title, "Promo tile")} fill sizes="(max-width: 640px) 50vw, 280px" className="object-cover" />
                        ) : null}
                      </div>
                      <div className="p-3">
                        <p className="text-[14px] font-semibold leading-[1.25] text-[#202020]">{toStr(tile?.title, "Promo tile")}</p>
                        <p className="mt-1 text-[11px] leading-[1.5] text-[#7a8594]">{toStr(tile?.subtitle)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "promo_tiles") {
          const tiles = Array.isArray(section.props?.tiles) ? section.props.tiles : [];
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <SectionShell>
              <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Promo tiles")}</p>
              <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
              <div className={`mt-5 grid gap-4 ${isDesktop || isTablet ? "lg:grid-cols-2" : ""}`}>
                {tiles.map((tile: any, index: number) => (
                  <Link key={toStr(tile?.id, `tile-${index}`)} href={toStr(tile?.href, "/products")} className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#ffffff,#f9fafb)] shadow-[0_12px_28px_rgba(20,24,27,0.05)]">
                    <div className={`grid min-h-[220px] gap-4 ${isDesktop ? "md:grid-cols-[minmax(0,1fr)_180px]" : ""}`}>
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
            </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "text_block") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <SectionShell>
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
            </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "editorial_collection") {
          const points = (Array.isArray(section.props?.points) ? section.props.points : []).map((point: unknown) => toStr(point)).filter(Boolean);
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
            <SectionShell>
              <div className={`grid gap-6 ${isDesktop ? "lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" : ""}`}>
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
            </SectionShell>
            </PreviewSelectableShell>
          );
        }

        if (section.type === "recently_viewed_rail") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
              <RecentlyViewedRail
                title={toStr(section.props?.title, "Continue browsing")}
                subtitle={toStr(section.props?.subtitle, "Recently viewed products for returning shoppers.")}
                limit={Math.max(1, toNum(section.props?.limit) || 8)}
              />
            </PreviewSelectableShell>
          );
        }

        if (section.type === "search_history_rail") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
              <SearchHistoryRail
                title={toStr(section.props?.title, "Inspired by your searches")}
                subtitle={toStr(section.props?.subtitle, "Products related to recent shopper searches.")}
                limit={Math.max(1, toNum(section.props?.limit) || 8)}
              />
            </PreviewSelectableShell>
          );
        }

        if (section.type === "trending_products_rail") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
              <TrendingProductsRail
                title={toStr(section.props?.title, "Trending on Piessang")}
                subtitle={toStr(section.props?.subtitle, "Marketplace-wide products rising from shopper searches, clicks, and views.")}
                limit={Math.max(1, toNum(section.props?.limit) || 8)}
                days={Math.max(1, Math.min(90, toNum(section.props?.days) || 30))}
                mode={toStr(section.props?.mode, "blended") as "blended" | "clicked" | "viewed" | "searched"}
              />
            </PreviewSelectableShell>
          );
        }

        if (section.type === "recommended_for_you") {
          return (
            <PreviewSelectableShell
              key={section.id}
              blockId={section.id}
              label={label}
              selected={isSelected}
              onSelect={onSelectBlock}
              controls={controls}
            >
              <RecommendedForYouRail
                title={toStr(section.props?.title, "Recommended for you")}
                subtitle={toStr(section.props?.subtitle, "A personalized mix based on browsing and search history.")}
                limit={Math.max(1, toNum(section.props?.limit) || 8)}
              />
            </PreviewSelectableShell>
          );
        }

        return null;
      });

  const mainClassName = editorCanvas
    ? "w-full px-3 py-6 lg:py-8"
    : "mx-auto w-full max-w-[1500px] px-3 py-6 lg:py-8";

  return (
    <div className="w-full overflow-hidden bg-white">
      {editorCanvas ? <PreviewHeader mode={mode} fixedHero={fixedHero} /> : <PiessangHeader />}
      <main data-page-body={editorCanvas ? "off" : "wide"} className={mainClassName}>
        <div className="space-y-6">
          {editorCanvas && isDesktop ? (
            <PreviewFixedHeroBlock
              fixedHero={fixedHero}
              selected={selectedBlockId === FIXED_HERO_BLOCK_ID}
              onSelect={onSelectBlock}
              controls={renderBlockControls?.(FIXED_HERO_BLOCK_ID)}
            />
          ) : null}
          {blocks}
        </div>
      </main>
      {editorCanvas ? <PreviewFooter /> : <PiessangFooter />}
    </div>
  );
}
