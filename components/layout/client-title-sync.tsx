"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function humanize(value: string) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDashboardTitle(section: string, reviewContext: string) {
  const normalized = String(section || "").trim().toLowerCase();
  if ((normalized === "create-product" || normalized === "create") && reviewContext === "product-reviews") {
    return "Product Reviews";
  }
  switch (normalized) {
    case "products":
      return "Products";
    case "create-product":
    case "create":
      return "Create Product";
    case "warehouse":
      return "Warehouse";
    case "warehouse-calendar":
      return "Warehouse Calendar";
    case "customers":
      return "Customers";
    case "billing":
      return "Billing";
    case "settlements":
      return "Settlements";
    case "campaigns":
    case "marketing":
      return "Campaigns";
    case "seller-accounts":
    case "admin":
      return "Seller Accounts";
    case "brand-requests":
      return "Brand Requests";
    case "product-reviews":
      return "Product Reviews";
    case "product-reports":
      return "Product Reports";
    case "fees":
      return "Fees";
    case "new-orders":
      return "New Orders";
    case "unfulfilled":
      return "Unfulfilled Orders";
    case "fulfilled":
      return "Fulfilled Orders";
    case "analytics":
      return "Analytics";
    case "team":
      return "Team";
    case "settings":
      return "Settings";
    case "home":
    default:
      return "Seller Dashboard";
  }
}

function resolveTitle(pathname: string, searchParams: URLSearchParams) {
  if (!pathname || pathname === "/") return "Piessang";

  if (pathname === "/seller/dashboard") {
    const section = searchParams.get("section") || "home";
    const reviewContext = String(searchParams.get("reviewContext") || "").trim().toLowerCase();
    return `${getDashboardTitle(section, reviewContext)} | Piessang`;
  }

  if (pathname === "/seller/team") return "Team | Piessang";
  if (pathname === "/seller/catalogue") return "Catalogue | Piessang";
  if (pathname === "/seller/catalogue/new") {
    const isEditing = Boolean(searchParams.get("unique_id") || searchParams.get("id"));
    return `${isEditing ? "Edit Product" : "Create Product"} | Piessang`;
  }

  if (pathname === "/products") {
    const category = searchParams.get("category");
    const subCategory = searchParams.get("subCategory");
    const brand = searchParams.get("brand");
    const uniqueId = searchParams.get("unique_id") || searchParams.get("id");
    if (brand) return `${humanize(brand)} | Piessang`;
    if (subCategory) return `${humanize(subCategory)} | Piessang`;
    if (category) return `${humanize(category)} | Piessang`;
    if (uniqueId) return "Product | Piessang";
    return "Products | Piessang";
  }

  if (pathname.startsWith("/products/")) {
    const slug = pathname.split("/").filter(Boolean)[1] || "product";
    return `${humanize(slug)} | Piessang`;
  }

  if (pathname.startsWith("/vendors/")) {
    const slug = pathname.split("/").filter(Boolean)[1] || "vendor";
    return `${humanize(slug)} | Piessang`;
  }

  return `${humanize(pathname.split("/").filter(Boolean).slice(-1)[0] || "Piessang")} | Piessang`;
}

export function ClientTitleSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = resolveTitle(pathname || "", searchParams);
  }, [pathname, searchParams]);

  return null;
}
