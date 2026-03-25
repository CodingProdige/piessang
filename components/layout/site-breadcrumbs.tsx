"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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

export function SiteBreadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname || pathname === "/") {
    return null;
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
    if (category) crumbs.push({ label: humanize(category) });
    if (subCategory) crumbs.push({ label: humanize(subCategory) });
    if (brand) crumbs.push({ label: humanize(brand) });
  }

  const visibleCrumbs = crumbs.filter((crumb, index, list) => {
    if (index === list.length - 1) return true;
    return Boolean(crumb.href);
  });

  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-[1180px] px-3 py-3 lg:px-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[12px] text-[#7b8694]">
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
      </div>
    </div>
  );
}
