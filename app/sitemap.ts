import type { MetadataRoute } from "next";
import { getAdminDb } from "@/lib/firebase/admin";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://piessang.co.za").replace(/\/+$/, "");

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toUrl(path: string) {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseDate(value: unknown) {
  const text = toStr(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getProductPath(data: any, docId: string) {
  const slug =
    toStr(data?.product?.slug) ||
    toStr(data?.product?.titleSlug) ||
    toStr(data?.slug) ||
    toStr(docId);
  return `/products/${encodeURIComponent(slug)}`;
}

function getSellerPath(data: any) {
  const sellerIdentifier = getSellerIdentifier(data);
  if (!sellerIdentifier) return "";
  return `/vendors/${encodeURIComponent(sellerIdentifier)}`;
}

function getSellerIdentifier(data: any) {
  return toStr(
    data?.product?.sellerCode ||
    data?.seller?.sellerCode ||
    data?.product?.sellerSlug ||
    data?.seller?.sellerSlug ||
    data?.sellerSlug,
  );
}

function isPublicProduct(data: any) {
  const active = data?.product?.active;
  const reviewStatus = toStr(data?.review?.status || data?.marketplace?.reviewStatus).toLowerCase();
  const deleted = Boolean(data?.timestamps?.deletedAt || data?.deletedAt);
  if (deleted) return false;
  if (active === false) return false;
  if (reviewStatus && !["approved", "published", "live"].includes(reviewStatus)) return false;
  return true;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: toUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: toUrl("/products"), lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: toUrl("/categories"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: toUrl("/contact"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: toUrl("/delivery"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: toUrl("/returns"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: toUrl("/payments"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: toUrl("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: toUrl("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: toUrl("/support"), lastModified: now, changeFrequency: "monthly", priority: 0.45 },
    { url: toUrl("/sell-on-bevgo"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: toUrl("/sell-on-piessang"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  const db = getAdminDb();
  if (!db) return routes;

  const productsSnap = await db.collection("products_v2").get();
  const sellerMap = new Map<string, { lastModified?: Date }>();
  const sellerIdentifiers = new Set<string>();

  for (const doc of productsSnap.docs) {
    const data = doc.data() || {};
    if (!isPublicProduct(data)) continue;
    const sellerIdentifier = getSellerIdentifier(data);
    if (sellerIdentifier) sellerIdentifiers.add(sellerIdentifier);
  }

  const sellerStatusMap = new Map<string, boolean>();
  await Promise.all(
    Array.from(sellerIdentifiers).map(async (sellerIdentifier) => {
      try {
        const owner = await findSellerOwnerByIdentifier(sellerIdentifier);
        sellerStatusMap.set(sellerIdentifier, Boolean(owner && isSellerAccountUnavailable(owner.data)));
      } catch {
        sellerStatusMap.set(sellerIdentifier, false);
      }
    }),
  );

  for (const doc of productsSnap.docs) {
    const data = doc.data() || {};
    if (!isPublicProduct(data)) continue;
    const sellerIdentifier = getSellerIdentifier(data);
    if (sellerIdentifier && sellerStatusMap.get(sellerIdentifier) === true) continue;

    const lastModified =
      parseDate(data?.timestamps?.updatedAt) ||
      parseDate(data?.timestamps?.createdAt) ||
      parseDate(data?.created_time) ||
      now;

    routes.push({
      url: toUrl(getProductPath(data, doc.id)),
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    });

    const sellerPath = getSellerPath(data);
    if (sellerPath) {
      const current = sellerMap.get(sellerPath);
      if (!current || (current.lastModified?.getTime() || 0) < lastModified.getTime()) {
        sellerMap.set(sellerPath, { lastModified });
      }
    }
  }

  for (const [path, meta] of sellerMap.entries()) {
    routes.push({
      url: toUrl(path),
      lastModified: meta.lastModified || now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
    routes.push({
      url: toUrl(`${path}/reviews`),
      lastModified: meta.lastModified || now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return routes;
}
