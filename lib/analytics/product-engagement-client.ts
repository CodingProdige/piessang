"use client";

import { useEffect, useRef } from "react";

type ProductEngagementAction = "impression" | "click" | "hover" | "product_view";

type ProductEngagementPayload = {
  action: ProductEngagementAction;
  productId: string;
  productTitle?: string | null;
  vendorName?: string | null;
  sellerCode?: string | null;
  sellerSlug?: string | null;
  source?: string | null;
  pageType?: string | null;
  href?: string | null;
  userId?: string | null;
  dedupeKey?: string | null;
};

const RECENTLY_VIEWED_STORAGE_KEY = "piessang_recently_viewed_products_v1";

type RecentlyViewedEntry = {
  id: string;
  title: string;
  href: string | null;
  vendorName: string | null;
  sellerSlug: string | null;
  at: string;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  const key = "piessang:product-engagement-session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = `eng:${Math.random().toString(36).slice(2)}:${Date.now().toString(36)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

function persistRecentlyViewedProduct(payload: ProductEngagementPayload) {
  if (typeof window === "undefined") return;
  const productId = toStr(payload?.productId);
  if (!productId) return;
  const nextEntry: RecentlyViewedEntry = {
    id: productId,
    title: toStr(payload?.productTitle, "Product"),
    href: toStr(payload?.href) || null,
    vendorName: toStr(payload?.vendorName) || null,
    sellerSlug: toStr(payload?.sellerSlug) || null,
    at: new Date().toISOString(),
  };
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    const current = Array.isArray(JSON.parse(raw || "[]")) ? JSON.parse(raw || "[]") : [];
    const deduped = current.filter((item: any) => toStr(item?.id) !== productId);
    const next = [nextEntry, ...deduped].slice(0, 16);
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function trackProductEngagement(payload: ProductEngagementPayload) {
  if (typeof window === "undefined") return;
  const productId = toStr(payload?.productId);
  const action = toStr(payload?.action).toLowerCase();
  const dedupeKey = toStr(payload?.dedupeKey);
  if (!productId || !action) return;

  if (dedupeKey) {
    const existing = window.sessionStorage.getItem(dedupeKey);
    if (existing) return;
    window.sessionStorage.setItem(dedupeKey, "1");
  }

  if (action === "product_view" || action === "click") {
    persistRecentlyViewedProduct(payload);
  }

  const body = JSON.stringify({
    action,
    productId,
    productTitle: toStr(payload?.productTitle) || null,
    vendorName: toStr(payload?.vendorName) || null,
    sellerCode: toStr(payload?.sellerCode) || null,
    sellerSlug: toStr(payload?.sellerSlug) || null,
    source: toStr(payload?.source) || null,
    pageType: toStr(payload?.pageType) || null,
    href: toStr(payload?.href) || null,
    userId: toStr(payload?.userId) || null,
    sessionId: getSessionId() || null,
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/client/v1/analytics/product-engagement", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/client/v1/analytics/product-engagement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => null);
}

export function useProductImpressionTracker(payload: Omit<ProductEngagementPayload, "action">, options?: { enabled?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const node = ref.current;
    if (!node) return;

    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || fired) return;
        if (entry.intersectionRatio < 0.45) return;
        fired = true;
        trackProductEngagement({
          ...payload,
          action: "impression",
        });
        observer.disconnect();
      },
      { threshold: [0.45] },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [
    enabled,
    payload?.dedupeKey,
    payload?.href,
    payload?.pageType,
    payload?.productId,
    payload?.productTitle,
    payload?.sellerCode,
    payload?.sellerSlug,
    payload?.source,
    payload?.userId,
    payload?.vendorName,
  ]);

  return ref;
}
