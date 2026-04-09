import Link from "next/link";
import Image from "next/image";
import { getAdminDb } from "@/lib/firebase/admin";
import type { LandingSection } from "@/lib/cms/landing-page-schema";
import { ProductRailCarousel } from "@/components/cms/product-rail-carousel";
import { DeferredSection } from "@/components/cms/deferred-section";
import type { ProductItem } from "@/components/products/products-results";
import { campaignsCollection, normalizeCampaignRecord } from "@/lib/campaigns";
import { canServeCampaign } from "@/lib/campaign-serving";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import {
  RecommendedForYouRail,
  RecentlyViewedRail,
  SearchHistoryRail,
} from "@/components/cms/personalized-landing-sections";

type ProductOption = ProductItem & {
  title: string;
  category: string;
  categorySlug: string;
  hasActiveCampaign: boolean;
};

type CategoryOption = {
  id: string;
  slug: string;
  title: string;
  productCount: number;
};

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

function getSellerIdentifier(data: any) {
  return toStr(
    data?.seller?.sellerCode ||
      data?.seller?.activeSellerCode ||
      data?.seller?.groupSellerCode ||
      data?.seller?.sellerSlug ||
      data?.product?.sellerCode ||
      data?.product?.sellerSlug ||
      data?.product?.vendorSlug,
  );
}

function applySellerDisplayData(data: any, sellerOwner: any) {
  if (!sellerOwner || !sellerOwner.data) return data;
  const seller = sellerOwner.data?.seller && typeof sellerOwner.data.seller === "object" ? sellerOwner.data.seller : {};
  const sellerCode = toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode);
  const vendorName = toStr(seller?.vendorName || seller?.groupVendorName || "");
  const vendorDescription = toStr(seller?.vendorDescription || seller?.description || "");
  const deliveryProfile = normalizeSellerDeliveryProfile(
    seller?.deliveryProfile && typeof seller.deliveryProfile === "object" ? seller.deliveryProfile : {},
  );

  return {
    ...data,
    seller: {
      ...(data?.seller && typeof data.seller === "object" ? data.seller : {}),
      sellerCode: sellerCode || null,
      vendorName: vendorName || null,
      vendorDescription: vendorDescription || null,
      baseLocation: toStr(seller?.baseLocation || data?.seller?.baseLocation) || null,
      sellerSlug: toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.seller?.sellerSlug) || null,
      activeSellerSlug: toStr(seller?.activeSellerSlug || seller?.sellerSlug || data?.seller?.activeSellerSlug) || null,
      groupSellerSlug: toStr(seller?.groupSellerSlug || seller?.sellerSlug || data?.seller?.groupSellerSlug) || null,
      deliveryProfile,
    },
    product: {
      ...(data?.product && typeof data.product === "object" ? data.product : {}),
      vendorName: vendorName || data?.product?.vendorName || null,
      vendorDescription: vendorDescription || data?.product?.vendorDescription || null,
      sellerCode: sellerCode || data?.product?.sellerCode || null,
      sellerSlug: toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.product?.sellerSlug) || null,
    },
  };
}

function toPlainJsonValue(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => toPlainJsonValue(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const asDate = value.toDate();
      return asDate instanceof Date ? asDate.toISOString() : toStr(asDate);
    }
    const plain: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      plain[key] = toPlainJsonValue(entry);
    }
    return plain;
  }
  return value;
}

function resolveRailLimit(sectionProps: any, mode: "desktop" | "mobile" = "desktop") {
  const legacyLimit = Math.max(1, toNum(sectionProps?.limit) || 8);
  if (mode === "mobile") {
    return Math.max(1, toNum(sectionProps?.mobileLimit) || Math.min(legacyLimit, 4));
  }
  return Math.max(1, toNum(sectionProps?.desktopLimit) || legacyLimit);
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

function isoToDate(value: unknown) {
  if (!value) return null;
  const date = new Date(toStr(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFirstPublishedAt(data: any) {
  return data?.marketplace?.firstPublishedAt || data?.timestamps?.createdAt || null;
}

function isNewArrival(firstPublishedAt: unknown, windowDays = 30) {
  const publishedDate = isoToDate(firstPublishedAt);
  if (!publishedDate) return false;
  const ageMs = Date.now() - publishedDate.getTime();
  if (ageMs < 0) return true;
  return ageMs <= windowDays * 24 * 60 * 60 * 1000;
}

async function loadCatalogData() {
  const db = getAdminDb();
  if (!db) return { products: [] as ProductOption[], categories: [] as CategoryOption[] };

  const [productsSnap, categoriesSnap, campaignsSnap] = await Promise.all([
    db.collection("products_v2").where("placement.isActive", "==", true).limit(120).get(),
    db.collection("categories").where("placement.isActive", "==", true).get(),
    campaignsCollection(db).get().catch(() => null),
  ]);

  const activeCampaignProductIds = new Set(
    (campaignsSnap?.docs || [])
      .map((docSnap: any) => normalizeCampaignRecord(docSnap.id, docSnap.data() || {}))
      .filter((campaign: any) => {
        if (toStr(campaign?.type).toLowerCase() !== "sponsored_products") return false;
        if (!canServeCampaign(campaign, "homepage_feature")) return false;
        return Array.isArray(campaign?.promotedProducts) && campaign.promotedProducts.length > 0;
      })
      .flatMap((campaign: any) => (Array.isArray(campaign?.promotedProducts) ? campaign.promotedProducts : []))
      .map((productId: any) => toStr(productId))
      .filter(Boolean),
  );

  const products = await Promise.all(
    productsSnap.docs.map(async (docSnap) => {
      const baseData = toPlainJsonValue(docSnap.data() || {});
      const sellerOwner = await findSellerOwnerByIdentifier(getSellerIdentifier(baseData)).catch(() => null);
      const hydratedData = applySellerDisplayData(baseData, sellerOwner);
      const firstPublishedAt = getFirstPublishedAt(hydratedData);
      const data = {
        ...hydratedData,
        is_new_arrival: isNewArrival(firstPublishedAt),
        marketplace: {
          ...(hydratedData?.marketplace && typeof hydratedData.marketplace === "object" ? hydratedData.marketplace : {}),
          firstPublishedAt,
        },
      };
      return {
        id: docSnap.id,
        data,
        title: toStr(data?.product?.title, "Product"),
        category: toStr(data?.grouping?.category),
        categorySlug: slugify(data?.grouping?.categorySlug || data?.grouping?.category),
        hasActiveCampaign: activeCampaignProductIds.has(docSnap.id),
      };
    }),
  );

  const categories = categoriesSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const slug = toStr(data?.category?.slug || docSnap.id);
    const productCount = products.reduce((count, product) => {
      const productCategorySlug = slugify(
        product?.data?.grouping?.categorySlug || product?.data?.grouping?.category || product?.data?.product?.grouping?.category,
      );
      return productCategorySlug === slug.toLowerCase() ? count + 1 : count;
    }, 0);
    return {
      id: docSnap.id,
      slug,
      title: toStr(data?.category?.title, "Category"),
      productCount,
    };
  });

  return { products, categories };
}

function sortProductsForRail(items: ProductOption[], prioritizeCampaigns: boolean, randomize: boolean) {
  const sorted = [...items];
  if (randomize) {
    sorted.sort(() => Math.random() - 0.5);
  }
  if (prioritizeCampaigns) {
    sorted.sort((a, b) => Number(Boolean(b?.hasActiveCampaign)) - Number(Boolean(a?.hasActiveCampaign)));
  }
  return sorted;
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return <section className="w-full max-w-full rounded-[8px] border border-black/6 bg-white p-4 shadow-[0_10px_24px_rgba(20,24,27,0.04)] sm:p-5 sm:shadow-[0_12px_30px_rgba(20,24,27,0.05)]">{children}</section>;
}

function getDeferredSectionMinHeight(section: LandingSection) {
  switch (section.type) {
    case "hero_banner":
      return 420;
    case "split_banner":
    case "seller_spotlight":
    case "countdown_promo":
      return 360;
    case "product_rail":
    case "featured_duo":
    case "recently_viewed_rail":
    case "search_history_rail":
    case "recommended_for_you":
      return 480;
    case "category_rail":
    case "category_mosaic":
    case "promo_tiles":
    case "editorial_collection":
      return 320;
    case "compact_promo_grid":
      return 260;
    case "category_chip_rail":
    case "brand_logo_rail":
    case "text_block":
      return 220;
    case "deal_strip_banner":
      return 120;
    default:
      return 280;
  }
}

export async function LandingPageRenderer({ sections }: { sections: LandingSection[] }) {
  const { products, categories } = await loadCatalogData();

  const blocks = sections.map((section, index) => {
    let block: React.ReactNode = null;

    if (section.type === "hero_banner") {
      block = (
        <section
          key={section.id}
          className="relative w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fff8e8_0%,#ffffff_46%,#eef6ff_100%)] p-8 shadow-[0_18px_44px_rgba(20,24,27,0.07)]"
        >
          <div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_55%)]" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div className="relative z-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f7531] sm:text-[12px]">{toStr(section.props?.eyebrow, "Piessang")}</p>
              <h1 className="mt-3 max-w-[12ch] text-[32px] font-semibold tracking-[-0.05em] text-[#202020] sm:text-[48px]">
                {toStr(section.props?.headline, "Curated products for repeat buying")}
              </h1>
              <p className="mt-4 max-w-[58ch] text-[14px] leading-[1.7] text-[#57636c] sm:text-[16px]">{toStr(section.props?.subheadline)}</p>
              <div className="mt-6">
                <Link href={toStr(section.props?.ctaHref, "/products")} className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white sm:h-12 sm:px-5 sm:text-[14px]">
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
      );
    }

    if (section.type === "split_banner") {
      block = (
        <section
          key={section.id}
          className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_52%,#fff8e8_100%)] shadow-[0_18px_44px_rgba(20,24,27,0.07)]"
        >
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8f7531]">{toStr(section.props?.eyebrow, "Featured collection")}</p>
              <p className="mt-3 max-w-[14ch] text-[36px] font-semibold tracking-[-0.05em] text-[#202020]">{toStr(section.props?.title, "Split banner")}</p>
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
      );
    }

    if (section.type === "seller_spotlight") {
      block = (
        <section
          key={section.id}
          className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fffef8_0%,#ffffff_55%,#f7fbff_100%)] shadow-[0_18px_44px_rgba(20,24,27,0.07)]"
        >
          <div className="grid gap-6 p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center">
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
              <p className="mt-3 text-[36px] font-semibold tracking-[-0.05em] text-[#202020]">{toStr(section.props?.title, "Meet standout sellers on Piessang")}</p>
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
      );
    }

    if (section.type === "countdown_promo") {
      const countdown = formatCountdown(section.props?.endsAt);
      block = (
        <section
          key={section.id}
          className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#202020_0%,#2c3744_55%,#3b82f6_140%)] text-white shadow-[0_18px_44px_rgba(20,24,27,0.18)]"
        >
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">{toStr(section.props?.eyebrow, "Limited-time campaign")}</p>
              <p className="mt-3 max-w-[14ch] text-[36px] font-semibold tracking-[-0.05em]">{toStr(section.props?.title, "Countdown to the next launch")}</p>
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
      );
    }

    if (section.type === "deal_strip_banner") {
      block = (
        <section
          key={section.id}
          className="w-full max-w-full overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#202020_0%,#2d3743_52%,#d5aa22_150%)] px-4 py-4 text-white shadow-[0_14px_34px_rgba(20,24,27,0.12)] sm:px-5"
        >
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
            ? products.filter((product) => {
                if (!selectedCategorySlugs.length) return true;
                return selectedCategorySlugs.includes(slugify(product.categorySlug || product.category));
              })
            : products.slice().reverse();
      const items = sortProductsForRail(selectedProducts, prioritizeCampaigns, randomize).slice(0, resolveRailLimit(section.props, "desktop"));
      block = (
        <ProductRailCarousel
          key={section.id}
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
      block = (
        <ProductRailCarousel
          key={section.id}
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
      ).filter((category) => category.productCount > 0);
      block = (
        <SectionShell key={section.id}>
          <div>
            <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Quick shop")}</p>
            <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {selected.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/8 bg-[#fbfbfb] px-4 text-[13px] font-semibold text-[#202020]"
              >
                <CategoryChipIcon category={category} />
                {category.title}
              </Link>
            ))}
          </div>
        </SectionShell>
      );
    }

    if (section.type === "category_rail") {
      const selected = Array.isArray(section.props?.categorySlugs) && section.props.categorySlugs.length
        ? categories.filter((category) => section.props.categorySlugs.includes(category.slug))
        : categories.slice(0, 8);
      block = (
        <SectionShell key={section.id}>
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
                  index === 0
                    ? "bg-[linear-gradient(135deg,#fff8e8,#ffffff)]"
                    : "bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]"
                }`}
              >
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Category</p>
                <p className="mt-3 text-[18px] font-semibold tracking-[-0.03em] text-[#202020] sm:text-[22px]">{category.title}</p>
                <p className="mt-2 text-[13px] text-[#7a8594]">{category.slug}</p>
              </Link>
            ))}
          </div>
        </SectionShell>
      );
    }

    if (section.type === "brand_logo_rail") {
      const brands = (Array.isArray(section.props?.brands) ? section.props.brands : []).map((brand: unknown) => toStr(brand)).filter(Boolean);
      block = (
        <SectionShell key={section.id}>
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
      );
    }

    if (section.type === "category_mosaic") {
      const selected = Array.isArray(section.props?.categorySlugs) && section.props.categorySlugs.length
        ? categories.filter((category) => section.props.categorySlugs.includes(category.slug)).slice(0, 5)
        : categories.slice(0, 5);
      block = (
        <SectionShell key={section.id}>
          <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Category mosaic")}</p>
          <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Link href={`/products?category=${encodeURIComponent(selected[0]?.slug || "")}`} className="rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#fff8e8,#ffffff)] p-6 shadow-[0_12px_28px_rgba(20,24,27,0.05)]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">Featured category</p>
              <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(selected[0]?.title, "Category")}</p>
              <p className="mt-3 text-[14px] text-[#57636c]">Lead shoppers into the strongest category moment right now.</p>
            </Link>
            <div className="grid gap-4 sm:grid-cols-2">
              {selected.slice(1).map((category) => (
                <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`} className="rounded-[8px] border border-black/6 bg-[#fbfbfb] p-5">
                  <p className="text-[18px] font-semibold text-[#202020]">{category.title}</p>
                  <p className="mt-2 text-[13px] text-[#7a8594]">{category.slug}</p>
                </Link>
              ))}
            </div>
          </div>
        </SectionShell>
      );
    }

    if (section.type === "compact_promo_grid") {
      const tiles = (Array.isArray(section.props?.tiles) ? section.props.tiles : []).slice(0, 4);
      block = (
        <SectionShell key={section.id}>
          <div>
            <p className="text-[20px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[24px]">{toStr(section.props?.title, "Curated highlights")}</p>
            <p className="mt-2 text-[13px] text-[#57636c] sm:text-[14px]">{toStr(section.props?.subtitle)}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {tiles.map((tile: any, index: number) => (
              <Link
                key={toStr(tile?.id, `compact-tile-${index}`)}
                href={toStr(tile?.href, "/products")}
                className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(180deg,#ffffff,#fbfbfb)]"
              >
                <div className="relative aspect-[1/1] bg-[#fafafa]">
                  {toStr(tile?.imageUrl) ? (
                    <Image src={toStr(tile?.imageUrl)} alt={toStr(tile?.title, "Promo tile")} fill sizes="(max-width: 640px) 50vw, 280px" className="object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="text-[14px] font-semibold leading-[1.25] text-[#202020]">{toStr(tile?.title, "Promo tile")}</p>
                  <p className="mt-1 text-[11px] leading-[1.5] text-[#7a8594]">{toStr(tile?.subtitle)}</p>
                </div>
              </Link>
            ))}
          </div>
        </SectionShell>
      );
    }

    if (section.type === "promo_tiles") {
      const tiles = Array.isArray(section.props?.tiles) ? section.props.tiles : [];
      block = (
        <SectionShell key={section.id}>
          <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toStr(section.props?.title, "Promo tiles")}</p>
          <p className="mt-2 text-[15px] text-[#57636c]">{toStr(section.props?.subtitle)}</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {tiles.map((tile: any, index: number) => (
              <Link key={toStr(tile?.id, `tile-${index}`)} href={toStr(tile?.href, "/products")} className="overflow-hidden rounded-[8px] border border-black/6 bg-[linear-gradient(135deg,#ffffff,#f9fafb)] shadow-[0_12px_28px_rgba(20,24,27,0.05)]">
                <div className="grid min-h-[220px] gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
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
      );
    }

    if (section.type === "text_block") {
      block = (
        <SectionShell key={section.id}>
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
      );
    }

    if (section.type === "editorial_collection") {
      const points = (Array.isArray(section.props?.points) ? section.props.points : []).map((point: unknown) => toStr(point)).filter(Boolean);
      block = (
        <SectionShell key={section.id}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
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
      );
    }

    if (section.type === "recently_viewed_rail") {
      block = (
        <RecentlyViewedRail
          key={section.id}
          title={toStr(section.props?.title, "Continue browsing")}
          subtitle={toStr(section.props?.subtitle, "Recently viewed products for returning shoppers.")}
          limit={Math.max(1, toNum(section.props?.limit) || 8)}
        />
      );
    }

    if (section.type === "search_history_rail") {
      block = (
        <SearchHistoryRail
          key={section.id}
          title={toStr(section.props?.title, "Inspired by your searches")}
          subtitle={toStr(section.props?.subtitle, "Products related to recent shopper searches.")}
          limit={Math.max(1, toNum(section.props?.limit) || 8)}
        />
      );
    }

    if (section.type === "recommended_for_you") {
      block = (
        <RecommendedForYouRail
          key={section.id}
          title={toStr(section.props?.title, "Recommended for you")}
          subtitle={toStr(section.props?.subtitle, "A personalized mix based on browsing and search history.")}
          limit={Math.max(1, toNum(section.props?.limit) || 8)}
        />
      );
    }

    if (!block) return null;

    const eager = index < 2 || section.type === "hero_banner";

    return (
      <DeferredSection
        key={section.id}
        eager={eager}
        minHeight={getDeferredSectionMinHeight(section)}
        rootMargin="500px 0px"
      >
        {block}
      </DeferredSection>
    );
  });

  return <div className="w-full max-w-full space-y-6">{blocks}</div>;
}
