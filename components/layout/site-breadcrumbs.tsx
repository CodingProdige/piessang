"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageBody } from "@/components/layout/page-body";

type Crumb = {
  href?: string;
  label: string;
};

const SEGMENT_LABELS: Record<string, string> = {
  account: "My Account",
  cart: "Cart",
  products: "Products",
  seller: "Seller",
  dashboard: "Seller Dashboard",
  catalogue: "Catalogue",
  new: "Create Product",
  team: "Team",
  vendors: "Vendors",
};

function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function labelForSegment(segment: string) {
  return SEGMENT_LABELS[segment] ?? humanize(segment);
}

function buildVisibleCrumbs(pathname: string, searchParams: URLSearchParams) {
  if (pathname === "/checkout") {
    return [
      { href: "/", label: "Home" },
      { href: "/cart", label: "Cart" },
      { label: "Checkout" },
    ];
  }

  if (pathname === "/checkout/success") {
    return [
      { href: "/", label: "Home" },
      { href: "/cart", label: "Cart" },
      { href: "/checkout", label: "Checkout" },
      { label: "Success" },
    ];
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/", label: "Home" }];

  let runningPath = "";
  for (const segment of segments) {
    runningPath += `/${segment}`;
    crumbs.push({
      href: runningPath,
      label: labelForSegment(segment),
    });
  }

  if (pathname === "/products") {
    const category = searchParams.get("category");
    const subCategory = searchParams.get("subCategory");
    const brand = searchParams.get("brand");
    const vendor = searchParams.get("vendor");
    const search = searchParams.get("search");
    if (search) crumbs.push({ label: `Search: ${search}` });
    if (category) crumbs.push({ label: humanize(category) });
    if (subCategory) crumbs.push({ label: humanize(subCategory) });
    if (brand) crumbs.push({ label: humanize(brand) });
    if (vendor) crumbs.push({ label: humanize(vendor) });
  }

  return crumbs.filter((crumb, index, list) => {
    if (index === list.length - 1) return true;
    return Boolean(crumb.href);
  });
}

export function SiteBreadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [resolvedProductLabel, setResolvedProductLabel] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!pathname?.startsWith("/products/")) {
      setResolvedProductLabel(null);
      return;
    }
    const readResolvedLabel = () => {
      const heading = document.querySelector<HTMLElement>("[data-safe-title]");
      const headingText = String(heading?.textContent || "").replace(/\s+/g, " ").trim();
      if (headingText) {
        setResolvedProductLabel(headingText);
        return true;
      }
      return false;
    };

    setResolvedProductLabel(null);
    if (readResolvedLabel()) return;

    const observer = new MutationObserver(() => {
      if (readResolvedLabel()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  if (!pathname || pathname === "/") {
    return null;
  }
  const visibleCrumbs = buildVisibleCrumbs(pathname, searchParams).map((crumb, index, list) => {
    const isLast = index === list.length - 1;
    if (isLast && pathname.startsWith("/products/") && resolvedProductLabel) {
      return { ...crumb, label: resolvedProductLabel };
    }
    return crumb;
  });
  const mobileCrumbs =
    visibleCrumbs.length > 3
      ? [visibleCrumbs[0], { label: "…" }, visibleCrumbs[visibleCrumbs.length - 1]].filter(
          (crumb): crumb is Crumb => Boolean(crumb),
        )
      : visibleCrumbs;

  return (
    <div className="bg-white">
      <PageBody as="div" className="py-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px] text-[#7b8694] md:hidden">
          {mobileCrumbs.map((crumb, index) => {
            const isLast = index === mobileCrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}-mobile`} className="inline-flex min-w-0 items-center gap-2">
                {isLast || !crumb.href ? (
                  <span className="truncate font-medium text-[#4a4545]">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="truncate transition-colors hover:text-[#202020]">
                    {crumb.label}
                  </Link>
                )}
                {!isLast ? <span aria-hidden="true" className="shrink-0">/</span> : null}
              </span>
            );
          })}
        </nav>
        <nav aria-label="Breadcrumb" className="hidden flex-wrap items-center gap-2 text-[12px] text-[#7b8694] md:flex">
          {visibleCrumbs.map((crumb, index) => {
            const isLast = index === visibleCrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-2">
                {isLast || !crumb.href ? (
                  <span className="font-medium text-[#4a4545]">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="transition-colors hover:text-[#202020]">
                    {crumb.label}
                  </Link>
                )}
                {!isLast ? <span aria-hidden="true">/</span> : null}
              </span>
            );
          })}
        </nav>
      </PageBody>
    </div>
  );
}
