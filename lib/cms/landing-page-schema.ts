export type LandingSectionType =
  | "hero_banner"
  | "split_banner"
  | "seller_spotlight"
  | "countdown_promo"
  | "deal_strip_banner"
  | "compact_promo_grid"
  | "category_chip_rail"
  | "featured_duo"
  | "brand_logo_rail"
  | "facebook_rail"
  | "category_mosaic"
  | "editorial_collection"
  | "product_rail"
  | "category_rail"
  | "promo_tiles"
  | "text_block"
  | "recently_viewed_rail"
  | "search_history_rail"
  | "recommended_for_you";

export type LandingPromoTile = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  imageUrl: string;
};

export type LandingFixedHeroImage = {
  imageUrl: string;
  href: string;
  blurHashUrl?: string;
};

export type LandingFixedHero = {
  locked: boolean;
  rotationSeconds: number;
  images: LandingFixedHeroImage[];
};

export type LandingSection = {
  id: string;
  type: LandingSectionType;
  props: Record<string, any>;
};

export type LandingPageSeo = {
  title: string;
  description: string;
};

export type LandingPageState = {
  slug: string;
  title: string;
  seo: LandingPageSeo;
  fixedHero: LandingFixedHero;
  publishedSections: LandingSection[];
  draftSections: LandingSection[];
  publishedVersionId: string | null;
  draftVersionId: string | null;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};

export function getDefaultLandingFixedHero(): LandingFixedHero {
  return {
    locked: true,
    rotationSeconds: 4,
    images: [],
  };
}

export const LANDING_PAGE_SLUG = "home";

function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeDefaultLandingSections(): LandingSection[] {
  return [
    {
      id: nextId("hero"),
      type: "hero_banner",
      props: {
        eyebrow: "Curated marketplace",
        headline: "Shop premium drinks and essentials from trusted sellers",
        subheadline:
          "Discover launches, promotions, and curated collections built around how Piessang shoppers browse.",
        ctaLabel: "Shop products",
        ctaHref: "/products",
        imageUrl: "",
      },
    },
    {
      id: nextId("deals"),
      type: "deal_strip_banner",
      props: {
        title: "Deals worth opening",
        subtitle: "Flash promos, bundles, and seasonal offers in one quick strip.",
        ctaLabel: "View deals",
        ctaHref: "/products",
      },
    },
    {
      id: nextId("chips"),
      type: "category_chip_rail",
      props: {
        title: "Quick shop",
        subtitle: "Jump straight into the categories shoppers browse most.",
        categorySlugs: [],
        categoryImages: {},
      },
    },
    {
      id: nextId("products"),
      type: "product_rail",
      props: {
        title: "New arrivals",
        subtitle: "Fresh catalogue additions that are live right now.",
        source: "new_arrivals",
        productIds: [],
        desktopLimit: 8,
        mobileLimit: 4,
        limit: 8,
      },
    },
    {
      id: nextId("duo"),
      type: "featured_duo",
      props: {
        title: "Featured picks",
        subtitle: "A tighter two-up product feature for mobile-first merchandising.",
        productIds: [],
      },
    },
    {
      id: nextId("spotlight"),
      type: "seller_spotlight",
      props: {
        eyebrow: "Seller spotlight",
        title: "Meet standout sellers on Piessang",
        subtitle: "Highlight a premium seller, brand story, or seasonal collection destination.",
        sellerName: "Featured seller",
        href: "/vendors",
        imageUrl: "",
      },
    },
    {
      id: nextId("split"),
      type: "split_banner",
      props: {
        eyebrow: "Featured collection",
        title: "Build rich editorial moments between rails",
        body: "Use split banners for launches, category spotlights, and premium campaign storytelling.",
        ctaLabel: "Explore now",
        ctaHref: "/products",
        imageUrl: "",
      },
    },
    {
      id: nextId("countdown"),
      type: "countdown_promo",
      props: {
        eyebrow: "Limited-time campaign",
        title: "Countdown to the next big launch",
        subtitle: "Use this block for flash campaigns, restocks, and seasonal pushes.",
        ctaLabel: "Shop the campaign",
        ctaHref: "/products",
        imageUrl: "",
        endsAt: "",
      },
    },
    {
      id: nextId("recommended"),
      type: "recommended_for_you",
      props: {
        title: "Recommended for you",
        subtitle: "A personalized rail based on what shoppers have been viewing and searching.",
        limit: 8,
      },
    },
    {
      id: nextId("logos"),
      type: "brand_logo_rail",
      props: {
        title: "Trusted brands",
        subtitle: "Clean logo-style brand chips to break up the page.",
        brands: ["CresHia", "IMOU", "EZVIZ", "SAMSUNG", "Coca-Cola"],
      },
    },
    {
      id: nextId("facebook"),
      type: "facebook_rail",
      props: {
        title: "Follow us on Facebook",
        subtitle: "Catch launches, marketplace updates, and fresh highlights on our Facebook page.",
        pageLink: "",
        ctaLabel: "Open Facebook",
        posts: [
          {
            id: nextId("fbpost"),
            title: "Fresh arrivals this week",
            subtitle: "Spotlight new products, launches, or marketplace highlights from your Facebook page.",
            href: "",
            imageUrl: "",
          },
          {
            id: nextId("fbpost"),
            title: "Campaign update",
            subtitle: "Use this card for your latest promotion, event, or community post.",
            href: "",
            imageUrl: "",
          },
        ],
      },
    },
    {
      id: nextId("mosaic"),
      type: "category_mosaic",
      props: {
        title: "Category mosaic",
        subtitle: "Mix category entry points into a more editorial layout.",
        categorySlugs: [],
      },
    },
    {
      id: nextId("compact"),
      type: "compact_promo_grid",
      props: {
        title: "Curated highlights",
        subtitle: "Smaller promos that keep the homepage moving.",
        tiles: [
          {
            id: nextId("tile"),
            title: "Weekend specials",
            subtitle: "Fast-moving deals in a tighter grid.",
            href: "/products",
            imageUrl: "",
          },
          {
            id: nextId("tile"),
            title: "Popular right now",
            subtitle: "Products shoppers are opening most.",
            href: "/products",
            imageUrl: "",
          },
          {
            id: nextId("tile"),
            title: "New in store",
            subtitle: "Fresh catalogue worth browsing first.",
            href: "/products",
            imageUrl: "",
          },
          {
            id: nextId("tile"),
            title: "Shop by mood",
            subtitle: "Lighter editorial merchandising moments.",
            href: "/products",
            imageUrl: "",
          },
        ],
      },
    },
    {
      id: nextId("categories"),
      type: "category_rail",
      props: {
        title: "Shop by category",
        subtitle: "Browse live categories across the marketplace.",
        categorySlugs: [],
      },
    },
    {
      id: nextId("promo"),
      type: "promo_tiles",
      props: {
        title: "Featured promos",
        subtitle: "Editorial or commercial highlights you want on the homepage.",
        tiles: [
          {
            id: nextId("tile"),
            title: "New seller launches",
            subtitle: "Promote newly published catalogue drops here.",
            href: "/products",
            imageUrl: "",
          },
          {
            id: nextId("tile"),
            title: "Trending deals",
            subtitle: "Pair promotions with hand-picked banners and destinations.",
            href: "/products",
            imageUrl: "",
          },
        ],
      },
    },
    {
      id: nextId("viewed"),
      type: "recently_viewed_rail",
      props: {
        title: "Continue browsing",
        subtitle: "Recently viewed products for returning shoppers.",
        limit: 8,
      },
    },
    {
      id: nextId("search"),
      type: "search_history_rail",
      props: {
        title: "Inspired by your searches",
        subtitle: "Use recent search history to surface more relevant products.",
        limit: 8,
      },
    },
    {
      id: nextId("text"),
      type: "text_block",
      props: {
        eyebrow: "Why Piessang",
        title: "Curated for repeat buying",
        body:
          "Use flexible landing-page sections to highlight seller campaigns, category moments, and product rails without waiting for a new deploy.",
        ctaLabel: "Explore categories",
        ctaHref: "/categories",
      },
    },
    {
      id: nextId("editorial"),
      type: "editorial_collection",
      props: {
        eyebrow: "Editorial collection",
        title: "Build a richer homepage story",
        body:
          "Use editorial collection blocks to pair a campaign headline with supporting callouts and links, without having to ship a new deploy.",
        points: [
          "Launches and seasonal campaigns",
          "Seller or brand storytelling",
          "Category-led merchandising moments",
        ],
        ctaLabel: "Explore the collection",
        ctaHref: "/products",
      },
    },
  ];
}

export function getDefaultLandingPageState(): LandingPageState {
  const sections = makeDefaultLandingSections();
  return {
    slug: LANDING_PAGE_SLUG,
    title: "Piessang homepage",
    seo: {
      title: "Piessang | Curated marketplace products",
      description:
        "Shop curated products from trusted Piessang sellers, with launches, promotions, and category highlights tailored to how you browse.",
    },
    fixedHero: getDefaultLandingFixedHero(),
    publishedSections: sections,
    draftSections: sections,
    publishedVersionId: null,
    draftVersionId: null,
    draftUpdatedAt: null,
    publishedAt: null,
  };
}
