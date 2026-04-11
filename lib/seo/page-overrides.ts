import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";

export type SeoPageKey =
  | "about"
  | "home"
  | "products"
  | "categories"
  | "fees"
  | "contact"
  | "delivery"
  | "returns"
  | "payments"
  | "privacy"
  | "terms"
  | "sell_on_piessang";

export type SeoPageDefinition = {
  key: SeoPageKey;
  label: string;
  path: string;
  defaultTitle: string;
  defaultDescription: string;
};

export type SeoPageOverride = {
  key: SeoPageKey;
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  updatedAt?: string | null;
};

export const SEO_PAGE_DEFINITIONS: SeoPageDefinition[] = [
  {
    key: "about",
    label: "About Piessang",
    path: "/about",
    defaultTitle: "About Piessang | Marketplace built for buyers and sellers",
    defaultDescription:
      "Learn about Piessang, how the marketplace works, and how Piessang supports buyers and sellers through one trusted ecommerce platform.",
  },
  {
    key: "home",
    label: "Home page",
    path: "/",
    defaultTitle: "Piessang | Curated marketplace products",
    defaultDescription:
      "Shop curated products from trusted Piessang sellers, with launches, promotions, and category highlights tailored to how you browse.",
  },
  {
    key: "products",
    label: "Products",
    path: "/products",
    defaultTitle: "Browse Products | Piessang",
    defaultDescription: "Browse the full Piessang catalogue and discover products from trusted marketplace sellers.",
  },
  {
    key: "categories",
    label: "Categories",
    path: "/categories",
    defaultTitle: "Browse Categories | Piessang",
    defaultDescription: "Explore Piessang categories and jump straight into the products you want to shop.",
  },
  {
    key: "fees",
    label: "Seller fees",
    path: "/fees",
    defaultTitle: "Seller Fees and Charges | Piessang",
    defaultDescription:
      "View the seller fees and charges information for selling on Piessang.",
  },
  {
    key: "contact",
    label: "Contact us",
    path: "/contact",
    defaultTitle: "Contact Us | Piessang",
    defaultDescription:
      "Get in touch with Piessang for help with orders, delivery, returns, seller support, and marketplace questions.",
  },
  {
    key: "delivery",
    label: "Delivery policy",
    path: "/delivery",
    defaultTitle: "Delivery Policy | Piessang",
    defaultDescription: "Review the detailed delivery, shipping, and collection policy for the Piessang marketplace.",
  },
  {
    key: "returns",
    label: "Returns policy",
    path: "/returns",
    defaultTitle: "Returns Policy | Piessang",
    defaultDescription: "Read the detailed Piessang returns, refunds, and return-responsibility policy.",
  },
  {
    key: "payments",
    label: "Payments policy",
    path: "/payments",
    defaultTitle: "Payments Policy | Piessang",
    defaultDescription: "Learn how checkout, payment processing, and refunds work on Piessang.",
  },
  {
    key: "privacy",
    label: "Privacy policy",
    path: "/privacy",
    defaultTitle: "Privacy Policy | Piessang",
    defaultDescription: "Review the detailed privacy policy governing how Piessang collects, uses, stores, and shares information.",
  },
  {
    key: "terms",
    label: "Terms of use",
    path: "/terms",
    defaultTitle: "Terms of Use | Piessang",
    defaultDescription: "Review the detailed terms governing use of the Piessang marketplace.",
  },
  {
    key: "sell_on_piessang",
    label: "Sell on Piessang",
    path: "/sell-on-piessang",
    defaultTitle: "Sell on Piessang",
    defaultDescription:
      "Register as a seller on Piessang and choose the fulfilment model that suits your operation, from self-managed dispatch to Piessang warehousing.",
  },
];

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toIso(value: any) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (value instanceof Date) return value.toISOString();
  return toStr(value) || null;
}

function toAbsolutePath(value: string) {
  const src = toStr(value);
  if (!src) return "";
  return src.startsWith("/") ? src : `/${src}`;
}

function getDefaultSeoImage(pageKey: SeoPageKey) {
  if (pageKey === "sell_on_piessang") {
    return "/backgrounds/monkey-on-beach-wide.png";
  }
  if (pageKey === "home") {
    return "/backgrounds/monkey-on-beach-wide.png";
  }
  return "/logo/Piessang Logo.png";
}

export function getSeoPageDefinition(pageKey: string) {
  return SEO_PAGE_DEFINITIONS.find((item) => item.key === pageKey) || null;
}

export async function getSeoPageOverride(pageKey: SeoPageKey): Promise<SeoPageOverride | null> {
  const db = getAdminDb();
  if (!db) return null;
  const definition = getSeoPageDefinition(pageKey);
  if (!definition) return null;
  const snap = await db.collection("seo_pages_v1").doc(pageKey).get().catch(() => null);
  if (!snap?.exists) return null;
  const data = snap.data() || {};
  return {
    key: pageKey,
    path: toStr(data.path, definition.path),
    title: toStr(data.title),
    description: toStr(data.description),
    ogTitle: toStr(data.ogTitle),
    ogDescription: toStr(data.ogDescription),
    ogImage: toStr(data.ogImage),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function buildSeoMetadata(
  pageKey: SeoPageKey,
  fallback: { title: string; description: string },
  options?: {
    path?: string;
    image?: string;
  },
): Promise<Metadata> {
  const override = await getSeoPageOverride(pageKey);
  const definition = getSeoPageDefinition(pageKey);
  const title = toStr(override?.title, fallback.title);
  const description = toStr(override?.description, fallback.description);
  const ogTitle = toStr(override?.ogTitle, title);
  const ogDescription = toStr(override?.ogDescription, description);
  const path = toAbsolutePath(options?.path || override?.path || definition?.path || "/");
  const image = toAbsolutePath(override?.ogImage || options?.image || getDefaultSeoImage(pageKey));
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      title: ogTitle,
      description: ogDescription,
      url: path,
      siteName: "Piessang",
      images: image
        ? [
            {
              url: image,
              alt: ogTitle,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: image ? [image] : undefined,
    },
  };
}
