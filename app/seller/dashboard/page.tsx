"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageBody } from "@/components/layout/page-body";
import CreateProductPage from "@/app/seller/catalogue/new/page";
import { SellerCustomersWorkspace } from "@/components/seller/customers-workspace";
import { SellerHomeWorkspace } from "@/components/seller/home-workspace";
import { SellerCampaignReviewsWorkspace } from "@/components/seller/campaign-reviews-workspace";
import { SellerCampaignsWorkspace } from "@/components/seller/campaigns-workspace";
import { SellerBillingWorkspace } from "@/components/seller/billing-workspace";
import { SellerAccountsWorkspace } from "@/components/seller/admin-seller-accounts";
import { SellerAdminOrdersWorkspace } from "@/components/seller/admin-orders-workspace";
import { SellerBrandRequestsWorkspace } from "@/components/seller/brand-requests-workspace";
import { SellerFeesWorkspace } from "@/components/seller/fees-workspace";
import { SellerVariantMetadataOptionsWorkspace } from "@/components/seller/variant-metadata-options-workspace";
import { SellerLiveCommerceWorkspace } from "@/components/seller/live-commerce-workspace";
import { SellerNewslettersWorkspace } from "@/components/seller/newsletters-workspace";
import { SellerNotificationsWorkspace } from "@/components/seller/notifications-workspace";
import { SellerOrdersWorkspace } from "@/components/seller/orders-workspace";
import { SellerPayoutBatchesWorkspace } from "@/components/seller/payout-batches-workspace";
import { SellerPlatformShippingWorkspace } from "@/components/seller/platform-shipping-workspace";
import { SellerGoogleMerchantCountriesWorkspace } from "@/components/seller/google-merchant-countries-workspace";
import { SellerGoogleAnalyticsWorkspace } from "@/components/seller/google-analytics-workspace";
import { SellerGoogleMerchantWorkspace } from "@/components/seller/google-merchant-workspace";
import { SellerProductReportsWorkspace } from "@/components/seller/product-reports-workspace";
import { SellerProductReviewsWorkspace } from "@/components/seller/product-reviews-workspace";
import { SellerProductsWorkspace } from "@/components/seller/products-workspace";
import { SellerReturnsWorkspace } from "@/components/seller/returns-workspace";
import { SellerIntegrationsWorkspace } from "@/components/seller/integrations-workspace";
import { SellerSettlementsWorkspace } from "@/components/seller/settlements-workspace";
import { SellerAnalyticsWorkspace } from "@/components/seller/analytics-workspace";
import { SellerAdminAnalyticsWorkspace } from "@/components/seller/admin-analytics-workspace";
import { SellerAdminBadgeSettingsWorkspace } from "@/components/seller/admin-badge-settings-workspace";
import { SellerAdminLandingBuilderWorkspace } from "@/components/seller/admin-landing-builder-workspace";
import { SellerAdminLandingSeoWorkspace } from "@/components/seller/admin-landing-seo-workspace";
import { SellerWarehouseWorkspace } from "@/components/seller/warehouse-workspace";
import { SellerPageIntro } from "@/components/seller/page-intro";
import { SellerSettingsWorkspace } from "@/components/seller/settings-workspace";
import { SellerSupportTicketsWorkspace } from "@/components/seller/support-tickets-workspace";
import SellerTeamPage from "@/app/seller/team/page";
import { normalizeShippingSettings } from "@/lib/shipping/settings";
import {
  getSellerBlockReasonFix,
  getSellerBlockReasonLabel,
  normalizeSellerBlockReasonCode,
  SELLER_BLOCK_REASONS,
} from "@/lib/seller/account-status";
import { toSellerSlug } from "@/lib/seller/vendor-name";

type SidebarSection =
  | "home"
  | "products"
  | "warehouse"
  | "warehouse-calendar"
  | "customers"
  | "returns"
  | "billing"
  | "marketing"
  | "settlements"
  | "admin"
  | "brand-requests"
  | "admin-analytics"
  | "admin-badge-settings"
  | "admin-live-view"
  | "admin-google-analytics"
  | "admin-landing-builder"
  | "admin-landing-seo"
  | "admin-newsletters"
  | "admin-orders"
  | "admin-platform-delivery"
  | "admin-google-merchant-countries"
  | "admin-google-merchant"
  | "admin-payouts"
  | "admin-support"
  | "admin-campaign-reviews"
  | "product-reviews"
  | "product-reports"
  | "admin-returns"
  | "fees"
  | "variant-metadata"
  | "create-product"
  | "inventory"
  | "collections"
  | "purchase-orders"
  | "transfers"
  | "new-orders"
  | "unfulfilled"
  | "fulfilled"
  | "analytics"
  | "notifications"
  | "integrations"
  | "team"
  | "settings"
  | "settings-profile"
  | "settings-shipping"
  | "settings-estimator"
  | "settings-branding"
  | "settings-business"
  | "settings-payouts";

type SellerContextItem = {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
  role: string | null;
  status: string | null;
  teamOwnerUid: string | null;
  grantedAt: string | null;
  blockedReasonCode: string | null;
  blockedReasonMessage: string | null;
  blockedAt: string | null;
  blockedBy: string | null;
  reviewRequestStatus: string | null;
  reviewRequestedAt: string | null;
  reviewRequestedBy: string | null;
  reviewRequestMessage: string | null;
  reviewResponseStatus: string | null;
  reviewResponseAt: string | null;
  reviewResponseBy: string | null;
  reviewResponseMessage: string | null;
};

type SellerAccessRole = "admin" | "manager" | "catalogue" | "orders" | "analytics" | "";

function toReviewText(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeReviewText(value: unknown) {
  return toReviewText(value).replace(/\s+/g, " ").trim();
}

function reviewValuesDiffer(left: unknown, right: unknown) {
  return normalizeReviewText(left) !== normalizeReviewText(right);
}

function reviewImageCount(data: any) {
  return Array.isArray(data?.media?.images) ? data.media.images.filter((entry: any) => Boolean(entry?.imageUrl)).length : 0;
}

function reviewVariantCount(data: any) {
  return Array.isArray(data?.variants) ? data.variants.length : 0;
}

function summarizeReviewVariantLabels(data: any) {
  if (!Array.isArray(data?.variants)) return "";
  return data.variants.map((variant: any) => toReviewText(variant?.label || variant?.variant_id || "")).filter(Boolean).join(", ");
}

function hasMeaningfulProductReviewDiff(item: any) {
  const live = item?.data?.live_snapshot || null;
  if (!live) return true;

  const pending = item?.data || {};
  const rows = [
    [toReviewText(live?.product?.title, "Not set"), toReviewText(pending?.product?.title, "Not set")],
    [toReviewText(live?.product?.brandTitle || "", "Not set"), toReviewText(pending?.product?.brandTitle || "", "Not set")],
    [toReviewText(live?.product?.vendorName || "", "Not set"), toReviewText(pending?.product?.vendorName || "", "Not set")],
    [toReviewText(live?.grouping?.category || "", "Not set"), toReviewText(pending?.grouping?.category || "", "Not set")],
    [toReviewText(live?.grouping?.subCategory || "", "Not set"), toReviewText(pending?.grouping?.subCategory || "", "Not set")],
    [toReviewText(live?.fulfillment?.mode || "", "Not set"), toReviewText(pending?.fulfillment?.mode || "", "Not set")],
    [String(reviewImageCount(live)), String(reviewImageCount(pending))],
    [
      `${reviewVariantCount(live)}${summarizeReviewVariantLabels(live) ? ` • ${summarizeReviewVariantLabels(live)}` : ""}`,
      `${reviewVariantCount(pending)}${summarizeReviewVariantLabels(pending) ? ` • ${summarizeReviewVariantLabels(pending)}` : ""}`,
    ],
    [toReviewText(live?.product?.overview || "", "Not set"), toReviewText(pending?.product?.overview || "", "Not set")],
    [toReviewText(live?.product?.description || "", "Not set"), toReviewText(pending?.product?.description || "", "Not set")],
  ];

  return rows.some(([liveValue, pendingValue]) => reviewValuesDiffer(liveValue, pendingValue));
}

function formatTeamRoleLabel(role?: string | null) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "owner") return "Seller account owner";
  if (value === "admin") return "Seller dashboard admin";
  if (value === "manager") return "Manager";
  if (value === "catalogue") return "Catalogue";
  if (value === "orders") return "Orders";
  if (value === "analytics") return "Analytics";
  if (value === "settlements") return "Settlements";
  return value || "Seller account";
}

function formatRoleValue(role?: string | null) {
  const value = String(role ?? "").trim().toLowerCase();
  if (!value) return "seller account";
  if (value === "owner") return "owner";
  if (value === "admin") return "admin";
  if (value === "manager") return "manager";
  if (value === "catalogue") return "catalogue";
  if (value === "orders") return "orders";
  if (value === "analytics") return "analytics";
  if (value === "settlements") return "settlements";
  return value;
}

function formatSellerContextLabel(item: SellerContextItem) {
  const bits = [item.vendorName || item.sellerSlug, item.role ? formatTeamRoleLabel(item.role) : null]
    .filter(Boolean)
    .join(" • ");
  return bits || item.sellerSlug;
}

function formatSellerAccessLabel(
  item: SellerContextItem | null | undefined,
  homeSlug: string,
  isSystemAdmin: boolean,
) {
  const role = normalizeSellerRole(item?.role || "");
  const isOwnerContext = Boolean(item && item.sellerSlug === homeSlug);
  if (isSystemAdmin && isOwnerContext) return "Owner dashboard";
  if (!role) return "Team dashboard";
  return `Team dashboard • ${formatTeamRoleLabel(role)}`;
}

function sellerContextMatches(value: string, item: SellerContextItem | null | undefined) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue || !item) return false;
  return normalizedValue === String(item.sellerSlug || "").trim() || normalizedValue === String(item.sellerCode || "").trim();
}

function normalizeSellerRole(role?: string | null): SellerAccessRole {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "owner") return "admin";
  if (value === "admin") return "admin";
  if (value === "manager") return "manager";
  if (value === "catalogue") return "catalogue";
  if (value === "orders") return "orders";
  if (value === "analytics") return "analytics";
  return "";
}

function getAdminActionableOrderCount(payload: any) {
  const items = Array.isArray(payload?.data?.data) ? payload.data.data : [];
  if (!items.length) {
    return Number(payload?.data?.totals?.totalNotCompleted || 0);
  }

  return items.filter((item: any) => {
    const orderStatus = String(item?.lifecycle?.orderStatus || item?.order?.status?.order || "").trim().toLowerCase();
    const paymentStatus = String(item?.lifecycle?.paymentStatus || item?.payment?.status || item?.order?.status?.payment || "").trim().toLowerCase();
    const fulfillmentStatus = String(item?.lifecycle?.fulfillmentStatus || item?.order?.status?.fulfillment || "").trim().toLowerCase();
    const deliveryPercent = Number(item?.delivery_progress?.percentageDelivered || 0);

    const refunded =
      paymentStatus === "refunded" ||
      paymentStatus === "partial_refund";
    const terminalOrder =
      orderStatus === "completed" ||
      orderStatus === "delivered" ||
      orderStatus === "cancelled";
    const terminalFulfillment =
      fulfillmentStatus === "completed" ||
      fulfillmentStatus === "delivered" ||
      fulfillmentStatus === "cancelled";
    const fullyDelivered = Number.isFinite(deliveryPercent) && deliveryPercent >= 100;

    return !refunded && !terminalOrder && !terminalFulfillment && !fullyDelivered;
  }).length;
}

const SECTION_ACCESS: Record<SidebarSection, SellerAccessRole[]> = {
  home: ["admin", "manager", "catalogue", "orders", "analytics"],
  products: ["admin", "manager", "catalogue"],
  warehouse: ["admin", "manager", "catalogue"],
  "warehouse-calendar": ["admin"],
  customers: ["admin", "manager", "orders"],
  returns: ["admin", "manager", "orders"],
  billing: ["admin", "manager", "analytics"],
  marketing: ["admin"],
  settlements: ["admin", "manager", "catalogue", "orders", "analytics"],
  admin: ["admin"],
  "brand-requests": ["admin"],
  "admin-analytics": ["admin"],
  "admin-badge-settings": ["admin"],
  "admin-live-view": ["admin"],
  "admin-google-analytics": ["admin"],
  "admin-landing-builder": ["admin"],
  "admin-landing-seo": ["admin"],
  "admin-newsletters": ["admin"],
  "admin-orders": ["admin"],
  "admin-platform-delivery": ["admin"],
  "admin-google-merchant-countries": ["admin"],
  "admin-google-merchant": ["admin"],
  "admin-payouts": ["admin"],
  "admin-support": ["admin"],
  "admin-campaign-reviews": ["admin"],
  "product-reviews": ["admin"],
  "product-reports": ["admin"],
  "admin-returns": ["admin"],
  fees: ["admin"],
  "variant-metadata": ["admin"],
  "create-product": ["admin", "manager", "catalogue"],
  inventory: ["admin", "manager", "catalogue"],
  collections: ["admin", "manager", "catalogue"],
  "purchase-orders": ["admin", "manager"],
  transfers: ["admin", "manager"],
  "new-orders": ["admin", "manager", "orders"],
  unfulfilled: ["admin", "manager", "orders"],
  fulfilled: ["admin", "manager", "orders"],
  analytics: ["admin", "manager", "analytics"],
  notifications: ["admin", "manager", "catalogue", "orders", "analytics"],
  integrations: ["admin", "manager", "catalogue", "orders", "analytics"],
  team: ["admin"],
  settings: ["admin", "manager", "catalogue", "orders", "analytics"],
  "settings-profile": ["admin", "manager", "catalogue", "orders", "analytics"],
  "settings-shipping": ["admin", "manager", "catalogue", "orders", "analytics"],
  "settings-estimator": ["admin", "manager", "catalogue", "orders", "analytics"],
  "settings-branding": ["admin", "manager", "catalogue", "orders", "analytics"],
  "settings-business": ["admin", "manager", "catalogue", "orders", "analytics"],
  "settings-payouts": ["admin", "manager", "catalogue", "orders", "analytics"],
};

function canAccessSellerSection(role: SellerAccessRole, section: SidebarSection) {
  return role === "admin" || SECTION_ACCESS[section].includes(role);
}

function SidebarIcon({ icon }: { icon: string }) {
  const common = "h-4.5 w-4.5";
  switch (icon) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10.8V20h12v-9.2" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7.5 12 4l8 3.5-8 3.5z" />
          <path d="M4 7.5V17l8 3.5 8-3.5V7.5" />
          <path d="M12 11v9.5" />
        </svg>
      );
    case "orders":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16l-1.5 11h-13z" />
          <path d="M8 9h8" />
          <circle cx="9" cy="19" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="17" cy="19" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "truck":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7h11v10H3z" />
          <path d="M14 10h3l3 3v4h-6z" />
          <circle cx="8" cy="19" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="19" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12.5 9 17 20 6" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "inventory":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7.5 12 4l8 3.5-8 3.5z" />
          <path d="M4 7.5V17l8 3.5 8-3.5V7.5" />
        </svg>
      );
    case "collections":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
        </svg>
      );
    case "purchase":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16l-1.5 12h-13z" />
          <path d="M8 6V4.5A2.5 2.5 0 0 1 10.5 2h3A2.5 2.5 0 0 1 16 4.5V6" />
        </svg>
      );
    case "transfer":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 7h10" />
          <path d="M13 4 16 7l-3 3" />
          <path d="M17 17H7" />
          <path d="M11 14 8 17l3 3" />
        </svg>
      );
    case "team":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3.5 20c1.2-3.2 3.8-5 5.5-5s4.3 1.8 5.5 5" />
          <path d="M13.5 20c.7-2.2 2.2-3.5 3.5-3.5s2.8 1.3 3.5 3.5" />
        </svg>
      );
    case "customers":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20c1.2-3.2 3.8-5 5.5-5s4.3 1.8 5.5 5" />
          <path d="M16 8h4" />
          <path d="M18 6v4" />
        </svg>
      );
    case "marketing":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 14V10h4l8-5v14l-8-5H4z" />
          <path d="M15.5 9.5c.9.8 1.4 1.9 1.4 3.1s-.5 2.3-1.4 3.1" />
          <path d="M17.8 7.2c1.6 1.4 2.5 3.4 2.5 5.4s-.9 4-2.5 5.4" />
        </svg>
      );
    case "cash":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="7" width="16" height="10" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "analytics":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
          <path d="M3 19h18" />
        </svg>
      );
    case "globe":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c3 3.5 4.5 6.5 4.5 9S15 17.5 12 21c-3-3.5-4.5-6.5-4.5-9S9 6.5 12 3Z" />
        </svg>
      );
    case "pulse":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l2-4 4 8 2-4h6" />
        </svg>
      );
    case "wand":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 20 10-10" />
          <path d="m14 4 1.5 1.5" />
          <path d="M16.5 2.5 18 4" />
          <path d="m19 7 1.5 1.5" />
          <path d="M17.5 5.5 19 7" />
          <path d="M3 21l2.5-2.5" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "notifications":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 4a5 5 0 0 0-5 5v2.4c0 .7-.2 1.4-.6 2L5 16h14l-1.4-2.6c-.4-.6-.6-1.3-.6-2V9a5 5 0 0 0-5-5Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M19.4 15a1.2 1.2 0 0 0 .24 1.32l.05.05a1.5 1.5 0 0 1 0 2.12l-1.06 1.06a1.5 1.5 0 0 1-2.12 0l-.05-.05A1.2 1.2 0 0 0 15 19.4a1.2 1.2 0 0 0-.72.18 1.2 1.2 0 0 0-.58 1.1V21a1.5 1.5 0 0 1-1.5 1.5h-1.5A1.5 1.5 0 0 1 9.2 21v-.32a1.2 1.2 0 0 0-.58-1.1 1.2 1.2 0 0 0-.72-.18 1.2 1.2 0 0 0-1.32.24l-.05.05a1.5 1.5 0 0 1-2.12 0L3.35 18.6a1.5 1.5 0 0 1 0-2.12l.05-.05A1.2 1.2 0 0 0 3.64 15a1.2 1.2 0 0 0-.18-.72 1.2 1.2 0 0 0-1.1-.58H2A1.5 1.5 0 0 1 .5 12.2v-1.5A1.5 1.5 0 0 1 2 9.2h.32a1.2 1.2 0 0 0 1.1-.58 1.2 1.2 0 0 0 .18-.72 1.2 1.2 0 0 0-.24-1.32l-.05-.05a1.5 1.5 0 0 1 0-2.12L4.37 3.35a1.5 1.5 0 0 1 2.12 0l.05.05A1.2 1.2 0 0 0 8 3.64c.23 0 .48-.07.72-.18a1.2 1.2 0 0 0 .58-1.1V2A1.5 1.5 0 0 1 10.8.5h1.5A1.5 1.5 0 0 1 13.8 2v.32c0 .44.24.84.58 1.1.24.11.49.18.72.18a1.2 1.2 0 0 0 1.32-.24l.05-.05a1.5 1.5 0 0 1 2.12 0l1.06 1.06a1.5 1.5 0 0 1 0 2.12l-.05.05A1.2 1.2 0 0 0 19.36 9c.34.26.58.66.64 1.1H21a1.5 1.5 0 0 1 1.5 1.5v1.5A1.5 1.5 0 0 1 21 14.6h-.32c-.44 0-.84.24-1.1.58Z" />
        </svg>
      );
    case "plug":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 7V4" />
          <path d="M15 7V4" />
          <path d="M8 10h8" />
          <path d="M8 7h8v4a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4V7Z" />
          <path d="M12 15v5" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3 19 6v5.5c0 4.8-3.1 8.6-7 10.5-3.9-1.9-7-5.7-7-10.5V6l7-3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "flag":
      return (
        <svg viewBox="0 0 20 20" className={common} fill="currentColor">
          <path d="M5 2a1 1 0 0 1 1 1v1h7.38l-.17-.34A1 1 0 0 1 14.1 2h.9a1 1 0 0 1 .89 1.45L15.12 5l.77 1.55A1 1 0 0 1 15 8h-1a1 1 0 0 1-.89-.55L13 7H6v10a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1z" />
        </svg>
      );
    case "returns":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h12l2 4-6 6 4 6H6l4-6-6-6 2-4Z" />
          <path d="M9 8h6" />
          <path d="M10 12l1.5 2L14 10" />
        </svg>
      );
    case "help":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.6-1.5 1.1-1.5 2.5" />
          <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6h11" />
          <path d="M9 12h11" />
          <path d="M9 18h11" />
          <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "badge":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 5 7v5c0 4.4 2.7 7.8 7 9 4.3-1.2 7-4.6 7-9V7l-7-4Z" />
          <path d="m9.5 12 1.7 1.7 3.3-3.4" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarButton({
  active,
  label,
  icon,
  onClick,
  locked = false,
  nested = false,
  badgeCount,
  collapsed = false,
  complete = false,
}: {
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
  locked?: boolean;
  nested?: boolean;
  badgeCount?: number | null;
  collapsed?: boolean;
  complete?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  function syncTooltipPosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  }

  useEffect(() => {
    if (!tooltipOpen) return undefined;
    const update = () => syncTooltipPosition();
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [tooltipOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={() => {
          if (!collapsed) return;
          syncTooltipPosition();
          setTooltipOpen(true);
        }}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => {
          if (!collapsed) return;
          syncTooltipPosition();
          setTooltipOpen(true);
        }}
        onBlur={() => setTooltipOpen(false)}
        disabled={locked}
        aria-disabled={locked}
        title={collapsed ? undefined : label}
        className={`group relative flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-medium transition-colors lg:px-3 ${
          nested ? (collapsed ? "justify-center" : "lg:pl-10") : ""
        } ${
          locked
            ? "cursor-not-allowed bg-[rgba(32,32,32,0.04)] text-[#8b8b8b]"
            : active
              ? "bg-white text-[#202020] shadow-[0_6px_18px_rgba(20,24,27,0.08)]"
              : "text-[#4a4545] hover:bg-white/70 hover:text-[#202020]"
        }`}
      >
        <span
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-[8px] transition-colors ${
            locked
              ? "bg-white/70 text-[#a8a8a8]"
              : active
                ? "bg-[rgba(203,178,107,0.14)] text-[#907d4c]"
                : "bg-white/70 text-[#707070] group-hover:text-[#202020]"
          }`}
        >
          <SidebarIcon icon={icon} />
        </span>
      {!collapsed ? <span className="truncate">{label}</span> : null}
      {!locked && Number(badgeCount || 0) > 0 ? (
        <span className={`${collapsed ? "absolute right-1 top-1" : "ml-auto"} inline-flex min-w-[20px] items-center justify-center rounded-full bg-[rgba(203,178,107,0.16)] px-1.5 py-0.5 text-[10px] font-semibold text-[#8f7531]`}>
          {Number(badgeCount)}
        </span>
      ) : !locked && complete ? (
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center rounded-full bg-[#1f9d55] text-white shadow-[0_2px_6px_rgba(31,157,85,0.22)] ${
            collapsed
              ? "absolute right-1 top-1 h-[14px] w-[14px]"
              : "ml-auto h-[18px] w-[18px]"
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            className={collapsed ? "h-[9px] w-[9px]" : "h-[11px] w-[11px]"}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 8 2.2 2.2L12 4.8" />
          </svg>
        </span>
      ) : null}
      {locked && !collapsed ? (
        <span className="ml-auto inline-flex h-4 w-4 items-center justify-center text-[#a8a8a8]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 11V8a5 5 0 0 1 10 0v3" />
            <rect x="5" y="11" width="14" height="10" rx="2" />
          </svg>
        </span>
      ) : null}
      </button>
      {collapsed && tooltipOpen && typeof document !== "undefined"
        ? createPortal(
            <span
              className="pointer-events-none fixed z-[260] inline-flex -translate-y-1/2 whitespace-nowrap rounded-[10px] bg-[#202020] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(20,24,27,0.16)]"
              style={{ top: `${tooltipPosition.top}px`, left: `${tooltipPosition.left}px` }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </>
  );
}

function SidebarGroup({
  title,
  description,
  icon,
  collapsed,
  children,
}: {
  title: string;
  description: string;
  icon: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const interactive = !collapsed;

  return (
    <div className={`space-y-1 rounded-[16px] border border-black/6 bg-[#fbfbfb] ${collapsed ? "px-2 py-2" : "px-3 py-3"}`}>
      <button
        type="button"
        onClick={() => {
          if (!interactive) return;
          setOpen((current) => !current);
        }}
        className={`flex w-full items-center gap-2 text-left ${collapsed ? "justify-center px-0" : "px-2"} ${interactive ? "cursor-pointer" : ""}`}
        aria-expanded={interactive ? open : undefined}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f3efe2] text-[#8a6f25]">
          <SidebarIcon icon={icon} />
        </span>
        <div className={`min-w-0 ${collapsed ? "hidden" : ""}`}>
          <p className="text-[14px] font-semibold text-[#202020]">{title}</p>
          <p className="text-[11px] text-[#8b94a3]">{description}</p>
        </div>
        {!collapsed ? (
          <span className="ml-auto inline-flex h-7 w-7 min-h-7 min-w-7 shrink-0 items-center justify-center rounded-[8px] border border-black/8 bg-white text-[#707070]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
            >
              <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </button>
      {collapsed || open ? (
        <div className={`${collapsed ? "" : "ml-3 border-l border-black/10 pl-3"}`}>{children}</div>
      ) : null}
    </div>
  );
}

function MenuIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function SidebarCollapseIcon({ collapsed, className = "" }: { collapsed: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarMenu({
  mobile = false,
  collapsed = false,
  userEmail,
  vendorName,
  activeSection,
  sellerRole,
  sellerRoleLabel,
  sellerBlocked,
  showAdminSection,
  adminBadges,
  sellerBadges,
  settingsReady,
  onNavigate,
  onClose,
  onBackToMySeller,
}: {
  mobile?: boolean;
  collapsed?: boolean;
  userEmail: string;
  vendorName: string;
  activeSection: SidebarSection;
  sellerRole: SellerAccessRole;
  sellerRoleLabel: string;
  sellerBlocked?: boolean;
  showAdminSection: boolean;
  adminBadges?: {
    sellerReviewCount?: number;
    brandRequestCount?: number;
    productReviewCount?: number;
    productReportCount?: number;
    newsletterCount?: number;
    orderCount?: number;
    payoutCount?: number;
    supportCount?: number;
    campaignReviewCount?: number;
  };
  sellerBadges?: {
    newOrders?: number;
    warehouse?: number;
    notifications?: number;
  };
  settingsReady?: {
    profile: boolean;
    shipping: boolean;
    branding: boolean;
    business: boolean;
    payouts: boolean;
  };
  onNavigate: (nextSection: SidebarSection) => void;
  onClose?: () => void;
  onBackToMySeller?: () => void;
}) {
  const blockedAllowedSections: SidebarSection[] = ["home", "settings", "integrations", "team", "notifications", "admin", "admin-analytics", "admin-badge-settings", "admin-live-view", "admin-google-analytics", "admin-landing-builder", "admin-landing-seo", "admin-newsletters", "admin-orders", "admin-platform-delivery", "admin-google-merchant-countries", "admin-google-merchant", "admin-payouts", "admin-support", "admin-campaign-reviews", "admin-returns", "fees", "variant-metadata", "product-reports", "product-reviews"];
  const handleNavigate = (nextSection: SidebarSection) => {
    if (sellerBlocked && !blockedAllowedSections.includes(nextSection)) return;
    if (!canAccessSellerSection(sellerRole, nextSection)) return;
    onNavigate(nextSection);
    onClose?.();
  };

  const headingClass = mobile
    ? "px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7d7d7d]"
    : `hidden px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7d7d7d] lg:block ${collapsed ? "lg:hidden" : ""}`;

  const titleBlockClass = mobile
    ? "px-1 py-1.5"
    : "px-1 py-1.5";
  const compactDesktop = !mobile && collapsed;

  return (
    <div className="flex h-full flex-col">
      <div className={titleBlockClass}>
        <div className="flex items-start justify-between gap-3">
          {!compactDesktop ? (
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Piessang seller</p>
              <div className="mt-1 space-y-0.5 text-[11px] leading-[1.35] text-[#656565]">
                <p className="truncate">{userEmail || "Signed in"}</p>
                <p className="truncate">{formatRoleValue(sellerRoleLabel || sellerRole)}</p>
                <p className="truncate">{vendorName || "seller account"}</p>
              </div>
            </div>
          ) : (
            <div className="flex w-full justify-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-[rgba(203,178,107,0.14)] text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">
                {(vendorName || "P").slice(0, 1)}
              </span>
            </div>
          )}
          {mobile ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.06)]"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {!compactDesktop && onBackToMySeller ? (
          <button
            type="button"
            onClick={() => {
              onBackToMySeller();
              onClose?.();
            }}
            className="mt-3 inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.06)]"
          >
            Back to my seller dashboard
          </button>
        ) : null}
      </div>

      <nav className={mobile ? "mt-3 space-y-3 overflow-y-auto pb-4" : "mt-2 space-y-3 lg:mt-3 lg:space-y-4"}>
        <section className="space-y-1">
          <p className={headingClass}>Main</p>
          <div className="space-y-1">
            <SidebarButton label="Home" icon="home" active={activeSection === "home"} collapsed={compactDesktop} onClick={() => handleNavigate("home")} />
            <SidebarButton
              label="Orders"
              icon="orders"
              active={["new-orders", "unfulfilled", "fulfilled"].includes(activeSection)}
              badgeCount={sellerBadges?.newOrders || 0}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "new-orders")}
              onClick={() => handleNavigate("new-orders")}
            />
            <SidebarButton
              label="Customers"
              icon="customers"
              active={activeSection === "customers"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "customers")}
              onClick={() => handleNavigate("customers")}
            />
            <SidebarButton
              label="Returns"
              icon="returns"
              active={activeSection === "returns"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "returns")}
              onClick={() => handleNavigate("returns")}
            />
            <SidebarButton
              label="Billing"
              icon="cash"
              active={activeSection === "billing"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "billing")}
              onClick={() => handleNavigate("billing")}
            />
            <SidebarButton
              label="Settlements"
              icon="cash"
              active={activeSection === "settlements"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "settlements")}
              onClick={() => handleNavigate("settlements")}
            />
            <SidebarButton
              label="Products"
              icon="box"
              active={activeSection === "products" || activeSection === "create-product"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "products")}
              onClick={() => handleNavigate("products")}
            />
            <div className={`${compactDesktop ? "" : "ml-3 border-l border-black/10 pl-3"}`}>
              <SidebarButton
                label="Create product"
                icon="plus"
                active={activeSection === "create-product"}
                collapsed={compactDesktop}
                locked={sellerBlocked || !canAccessSellerSection(sellerRole, "create-product")}
                onClick={() => handleNavigate("create-product")}
                nested
              />
            </div>
            <SidebarButton
              label="Warehouse"
              icon="truck"
              active={activeSection === "warehouse"}
              badgeCount={sellerBadges?.warehouse || 0}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "warehouse")}
              onClick={() => handleNavigate("warehouse")}
            />
            <SidebarButton
              label="Analytics"
              icon="analytics"
              active={activeSection === "analytics"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "analytics")}
              onClick={() => handleNavigate("analytics")}
            />
            <SidebarButton
              label="Notifications"
              icon="notifications"
              active={activeSection === "notifications"}
              badgeCount={sellerBadges?.notifications || 0}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "notifications")}
              onClick={() => handleNavigate("notifications")}
            />
            <SidebarButton
              label="Integrations"
              icon="plug"
              active={activeSection === "integrations"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "integrations")}
              onClick={() => handleNavigate("integrations")}
            />
            <SidebarButton
              label="Team"
              icon="team"
              active={activeSection === "team"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "team")}
              onClick={() => handleNavigate("team")}
            />
          </div>
        </section>

        <section className="space-y-1">
          <p className={headingClass}>Marketing</p>
          <div className="space-y-1">
            <SidebarButton
              label="Campaigns"
              icon="marketing"
              active={activeSection === "marketing"}
              collapsed={compactDesktop}
              locked={sellerBlocked || !canAccessSellerSection(sellerRole, "marketing")}
              onClick={() => handleNavigate("marketing")}
            />
          </div>
        </section>

        {showAdminSection ? (
          <section className="space-y-1">
            <p className={headingClass}>Admin</p>
            <div className="space-y-1">
            <SidebarButton
              label="Seller accounts"
              icon="shield"
              active={activeSection === "admin"}
              badgeCount={adminBadges?.sellerReviewCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin")}
            />
            <SidebarButton
              label="Brand requests"
              icon="box"
              active={activeSection === "brand-requests"}
              badgeCount={adminBadges?.brandRequestCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("brand-requests")}
            />
            <SidebarGroup
              title="Analytics"
              description="Global and live marketplace activity"
              icon="analytics"
              collapsed={compactDesktop}
            >
              <SidebarButton
                label="Global analytics"
                icon="globe"
                active={activeSection === "admin-analytics"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-analytics")}
                nested
              />
              <SidebarButton
                label="Badge settings"
                icon="badge"
                active={activeSection === "admin-badge-settings"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-badge-settings")}
                nested
              />
              <SidebarButton
                label="Live view"
                icon="pulse"
                active={activeSection === "admin-live-view"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-live-view")}
                nested
              />
              <SidebarButton
                label="Google Analytics"
                icon="globe"
                active={activeSection === "admin-google-analytics"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-google-analytics")}
                nested
              />
            </SidebarGroup>
            <SidebarGroup
              title="Landing page"
              description="Homepage builder and search metadata"
              icon="collections"
              collapsed={compactDesktop}
            >
              <SidebarButton
                label="Builder"
                icon="wand"
                active={activeSection === "admin-landing-builder"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-landing-builder")}
                nested
              />
              <SidebarButton
                label="SEO"
                icon="search"
                active={activeSection === "admin-landing-seo"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-landing-seo")}
                nested
              />
            </SidebarGroup>
            <SidebarButton
              label="Newsletters"
              icon="marketing"
              active={activeSection === "admin-newsletters"}
              badgeCount={adminBadges?.newsletterCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-newsletters")}
            />
            <SidebarButton
              label="Orders"
              icon="orders"
              active={activeSection === "admin-orders"}
              badgeCount={adminBadges?.orderCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-orders")}
            />
            <SidebarButton
              label="Platform shipping"
              icon="truck"
              active={activeSection === "admin-platform-delivery"}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-platform-delivery")}
            />
            <SidebarGroup
              title="Google Merchant"
              description="Country rollout and sync operations"
              icon="globe"
              collapsed={compactDesktop}
            >
              <SidebarButton
                label="Countries"
                icon="globe"
                active={activeSection === "admin-google-merchant-countries"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-google-merchant-countries")}
                nested
              />
              <SidebarButton
                label="Sync"
                icon="globe"
                active={activeSection === "admin-google-merchant"}
                collapsed={compactDesktop}
                onClick={() => handleNavigate("admin-google-merchant")}
                nested
              />
            </SidebarGroup>
            <SidebarButton
              label="Payouts"
              icon="cash"
              active={activeSection === "admin-payouts"}
              badgeCount={adminBadges?.payoutCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-payouts")}
            />
            <SidebarButton
              label="Support"
              icon="help"
              active={activeSection === "admin-support"}
              badgeCount={adminBadges?.supportCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-support")}
            />
            <SidebarButton
              label="Campaign reviews"
              icon="marketing"
              active={activeSection === "admin-campaign-reviews"}
              badgeCount={adminBadges?.campaignReviewCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-campaign-reviews")}
            />
            <SidebarButton
              label="Product reviews"
              icon="check"
              active={activeSection === "product-reviews"}
              badgeCount={adminBadges?.productReviewCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("product-reviews")}
            />
            <SidebarButton
              label="Product reports"
              icon="flag"
              active={activeSection === "product-reports"}
              badgeCount={adminBadges?.productReportCount || 0}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("product-reports")}
            />
            <SidebarButton
              label="Returns"
              icon="returns"
              active={activeSection === "admin-returns"}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("admin-returns")}
            />
            <SidebarButton
              label="Warehouse calendar"
              icon="truck"
              active={activeSection === "warehouse-calendar"}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("warehouse-calendar")}
            />
            <SidebarButton
              label="Fees"
              icon="cash"
              active={activeSection === "fees"}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("fees")}
            />
            <SidebarButton
              label="Variant metadata"
              icon="list"
              active={activeSection === "variant-metadata"}
              collapsed={compactDesktop}
              onClick={() => handleNavigate("variant-metadata")}
            />
            </div>
          </section>
        ) : null}

        <section className="space-y-1">
          <p className={headingClass}>Settings</p>
          <SidebarGroup
            title="Settings"
            description="Seller account setup and operational preferences"
            icon="settings"
            collapsed={compactDesktop}
          >
            <SidebarButton
              label="Profile"
              icon="team"
              active={activeSection === "settings-profile"}
              collapsed={compactDesktop}
              complete={settingsReady?.profile === true}
              locked={!canAccessSellerSection(sellerRole, "settings-profile")}
              onClick={() => handleNavigate("settings-profile")}
              nested
            />
            <SidebarButton
              label="Shipping"
              icon="truck"
              active={activeSection === "settings-shipping"}
              collapsed={compactDesktop}
              complete={settingsReady?.shipping === true}
              locked={!canAccessSellerSection(sellerRole, "settings-shipping")}
              onClick={() => handleNavigate("settings-shipping")}
              nested
            />
            <SidebarButton
              label="Estimator"
              icon="analytics"
              active={activeSection === "settings-estimator"}
              collapsed={compactDesktop}
              locked={!canAccessSellerSection(sellerRole, "settings-estimator")}
              onClick={() => handleNavigate("settings-estimator")}
              nested
            />
            <SidebarButton
              label="Branding"
              icon="collections"
              active={activeSection === "settings-branding"}
              collapsed={compactDesktop}
              complete={settingsReady?.branding === true}
              locked={!canAccessSellerSection(sellerRole, "settings-branding")}
              onClick={() => handleNavigate("settings-branding")}
              nested
            />
            <SidebarButton
              label="Business"
              icon="shield"
              active={activeSection === "settings-business"}
              collapsed={compactDesktop}
              complete={settingsReady?.business === true}
              locked={!canAccessSellerSection(sellerRole, "settings-business")}
              onClick={() => handleNavigate("settings-business")}
              nested
            />
            <SidebarButton
              label="Payouts"
              icon="cash"
              active={activeSection === "settings-payouts"}
              collapsed={compactDesktop}
              complete={settingsReady?.payouts === true}
              locked={!canAccessSellerSection(sellerRole, "settings-payouts")}
              onClick={() => handleNavigate("settings-payouts")}
              nested
            />
          </SidebarGroup>
        </section>
      </nav>
    </div>
  );
}

function SellerDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { authReady, isAuthenticated, isSeller, sellerStatus, profile, openAuthModal, openSellerRegistrationModal } = useAuth();
  const resolveSection = (value: string | null): SidebarSection => {
    const reviewContext = (searchParams.get("reviewContext") || "").toLowerCase();
    if (((value || "").toLowerCase() === "create-product" || (value || "").toLowerCase() === "create") && reviewContext === "product-reviews") {
      return "product-reviews";
    }
    switch ((value || "").toLowerCase()) {
      case "create-product":
      case "create":
        return "create-product";
      case "products":
      case "catalogue":
      case "all-products":
        return "products";
      case "warehouse":
      case "stock-movements":
      case "warehouse-movements":
        return "warehouse";
      case "warehouse-calendar":
      case "calendar":
        return "warehouse-calendar";
      case "customers":
        return "customers";
      case "returns":
        return "returns";
      case "billing":
        return "billing";
      case "marketing":
        return "marketing";
      case "settlements":
        return "settlements";
      case "admin":
      case "seller-accounts":
        return "admin";
      case "brand-requests":
      case "brands":
        return "brand-requests";
      case "admin-analytics":
      case "live-analytics":
        return "admin-analytics";
      case "admin-badge-settings":
      case "badge-settings":
        return "admin-badge-settings";
      case "admin-live-view":
      case "live-view":
        return "admin-live-view";
      case "admin-google-analytics":
      case "google-analytics":
        return "admin-google-analytics";
      case "admin-landing-builder":
      case "landing-page":
      case "landing-builder":
        return "admin-landing-builder";
      case "admin-landing-seo":
      case "landing-seo":
        return "admin-landing-seo";
      case "admin-newsletters":
      case "newsletters":
        return "admin-newsletters";
      case "admin-orders":
      case "orders-admin":
      case "marketplace-orders":
        return "admin-orders";
      case "admin-platform-delivery":
      case "platform-delivery":
      case "shipping-admin":
        return "admin-platform-delivery";
      case "admin-google-merchant-countries":
      case "google-merchant-countries":
      case "google-countries":
        return "admin-google-merchant-countries";
      case "admin-google-merchant":
      case "google-merchant":
      case "google-sync":
        return "admin-google-merchant";
      case "admin-payouts":
      case "payouts":
        return "admin-payouts";
      case "admin-support":
      case "support":
        return "admin-support";
      case "admin-campaign-reviews":
      case "campaign-reviews":
        return "admin-campaign-reviews";
      case "product-reviews":
      case "product-review":
      case "review-products":
        return "product-reviews";
      case "product-reports":
      case "product-report":
      case "reported-products":
        return "product-reports";
      case "admin-returns":
      case "returns-admin":
        return "admin-returns";
      case "fees":
      case "marketplace-fees":
        return "fees";
      case "inventory":
        return "inventory";
      case "collections":
        return "collections";
      case "purchase-orders":
        return "purchase-orders";
      case "transfers":
        return "transfers";
      case "new-orders":
        return "new-orders";
      case "unfulfilled":
        return "unfulfilled";
      case "fulfilled":
        return "fulfilled";
      case "analytics":
        return "analytics";
      case "notifications":
        return "notifications";
      case "integrations":
        return "integrations";
      case "settings-profile":
        return "settings-profile";
      case "settings-shipping":
        return "settings-shipping";
      case "settings-estimator":
        return "settings-estimator";
      case "settings-branding":
        return "settings-branding";
      case "settings-business":
        return "settings-business";
      case "settings-payouts":
        return "settings-payouts";
      case "team":
        return "team";
      case "settings":
        return "settings";
      case "home":
        return "home";
      default:
        return "home";
    }
  };

  const readSectionFromUrl = () => {
    if (typeof window === "undefined") {
      return resolveSection(searchParams.get("section"));
    }
    const urlParams = new URLSearchParams(window.location.search);
    return resolveSection(urlParams.get("section"));
  };

  const [activeSection, setActiveSection] = useState<SidebarSection>(() => readSectionFromUrl());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuCollapsed, setDesktopMenuCollapsed] = useState(false);
  const [adminBadges, setAdminBadges] = useState({ sellerReviewCount: 0, brandRequestCount: 0, productReviewCount: 0, productReportCount: 0, newsletterCount: 0, orderCount: 0, payoutCount: 0, supportCount: 0, campaignReviewCount: 0 });
  const [sellerBadges, setSellerBadges] = useState({ newOrders: 0, warehouse: 0, notifications: 0 });
  const [settingsReady, setSettingsReady] = useState({
    profile: false,
    shipping: false,
    branding: false,
    business: false,
    payouts: false,
  });
  const [adminSelectedSellerContext, setAdminSelectedSellerContext] = useState<SellerContextItem | null>(null);
  const [reviewRequestOpen, setReviewRequestOpen] = useState(false);
  const [reviewRequestReason, setReviewRequestReason] = useState("other");
  const [reviewRequestMessage, setReviewRequestMessage] = useState("");
  const [reviewRequestSubmitting, setReviewRequestSubmitting] = useState(false);

  useEffect(() => {
    const rawSection = searchParams.get("section");
    const reviewContext = (searchParams.get("reviewContext") || "").toLowerCase();
    const hasExplicitSection = Boolean(String(rawSection || "").trim());
    const isReviewEditor = (String(rawSection || "").toLowerCase() === "create-product" || String(rawSection || "").toLowerCase() === "create") && reviewContext === "product-reviews";
    if (!hasExplicitSection && !isReviewEditor) return;
    setActiveSection(resolveSection(rawSection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const vendorName = profile?.sellerVendorName?.trim() || profile?.accountName?.trim() || "";
  const isSystemAdmin = profile?.systemAccessType === "admin";
  async function refreshAdminBadges() {
    if (!isSystemAdmin || !profile?.uid) return;
    try {
      await fetch("/api/client/v1/admin/products/review-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => null);

      const [sellerResponse, brandResponse, productResponse, reportResponse, newsletterResponse, ordersResponse, payoutResponse, supportResponse, campaignResponse] = await Promise.all([
        fetch(`/api/client/v1/accounts/seller/list?uid=${encodeURIComponent(profile.uid)}&filter=review`, { cache: "no-store" }),
        fetch("/api/client/v1/admin/brand-requests?status=pending", { cache: "no-store" }),
        fetch("/api/catalogue/v1/products/product/get?limit=all&includeUnavailable=true", { cache: "no-store" }),
        fetch("/api/client/v1/admin/product-reports?status=pending", { cache: "no-store" }),
        fetch("/api/client/v1/newsletters/list?adminMode=true", { cache: "no-store" }),
        fetch("/api/client/v1/orders/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: profile.uid, returnAll: true }),
        }),
        fetch(`/api/client/v1/orders/settlement/payout-batches/list?uid=${encodeURIComponent(profile.uid)}&status=all`, { cache: "no-store" }),
        fetch("/api/client/v1/support/tickets/list?adminMode=true", { cache: "no-store" }),
        fetch("/api/client/v1/campaigns/list?adminMode=true", { cache: "no-store" }),
      ]);
      const sellerPayload = await sellerResponse.json().catch(() => ({}));
      const brandPayload = await brandResponse.json().catch(() => ({}));
      const productPayload = await productResponse.json().catch(() => ({}));
      const reportPayload = await reportResponse.json().catch(() => ({}));
      const newsletterPayload = await newsletterResponse.json().catch(() => ({}));
      const ordersPayload = await ordersResponse.json().catch(() => ({}));
      const payoutPayload = await payoutResponse.json().catch(() => ({}));
      const supportPayload = await supportResponse.json().catch(() => ({}));
      const campaignPayload = await campaignResponse.json().catch(() => ({}));
      const productReviewCount =
        productResponse.ok && productPayload?.ok !== false && Array.isArray(productPayload?.items)
          ? productPayload.items.filter((item: any) => {
              const queueStatus = String(item?.data?.status?.reviewQueueStatus || "").trim().toLowerCase();
              if (queueStatus) return queueStatus === "in_review";
              const status = String(item?.data?.moderation?.status || "").trim().toLowerCase();
              if (status !== "in_review") return false;
              return hasMeaningfulProductReviewDiff(item);
            }).length
          : 0;
      setAdminBadges({
        sellerReviewCount: sellerResponse.ok && sellerPayload?.ok !== false ? Number(sellerPayload?.count || 0) : 0,
        brandRequestCount: brandResponse.ok && brandPayload?.ok !== false ? Number(brandPayload?.count || 0) : 0,
        productReviewCount,
        productReportCount: reportResponse.ok && reportPayload?.ok !== false ? Number(reportPayload?.count || 0) : 0,
        newsletterCount: newsletterResponse.ok && newsletterPayload?.ok !== false ? Number(newsletterPayload?.data?.counts?.active || 0) : 0,
        orderCount:
          ordersResponse.ok && ordersPayload?.ok !== false
            ? getAdminActionableOrderCount(ordersPayload)
            : 0,
        payoutCount:
          payoutResponse.ok && payoutPayload?.ok !== false
            ? Number(payoutPayload?.data?.counts?.pendingSubmission || 0) +
              Number(payoutPayload?.data?.counts?.awaitingProviderConfig || 0) +
              Number(payoutPayload?.data?.counts?.awaitingManualPayout || 0) +
              Number(payoutPayload?.data?.counts?.submissionFailed || 0)
            : 0,
        supportCount: supportResponse.ok && supportPayload?.ok !== false ? Number(supportPayload?.data?.counts?.active || 0) : 0,
        campaignReviewCount: campaignResponse.ok && campaignPayload?.ok !== false ? Number(campaignPayload?.data?.counts?.pendingReview || 0) : 0,
      });
    } catch {
      setAdminBadges({ sellerReviewCount: 0, brandRequestCount: 0, productReviewCount: 0, productReportCount: 0, newsletterCount: 0, orderCount: 0, payoutCount: 0, supportCount: 0, campaignReviewCount: 0 });
    }
  }
  useEffect(() => {
    let cancelled = false;
    async function loadAdminBadges() {
      if (!isSystemAdmin || !profile?.uid) return;
      try {
        await refreshAdminBadges();
        if (cancelled) return;
      } catch {
        if (!cancelled) {
          setAdminBadges({ sellerReviewCount: 0, brandRequestCount: 0, productReviewCount: 0, productReportCount: 0, newsletterCount: 0, orderCount: 0, payoutCount: 0, supportCount: 0, campaignReviewCount: 0 });
        }
      }
    }
    void loadAdminBadges();
    return () => {
      cancelled = true;
    };
  }, [isSystemAdmin, profile?.uid, activeSection]);

  useEffect(() => {
    function handleAdminBadgeRefresh() {
      void refreshAdminBadges();
    }

    window.addEventListener("piessang:refresh-admin-badges", handleAdminBadgeRefresh);
    return () => {
      window.removeEventListener("piessang:refresh-admin-badges", handleAdminBadgeRefresh);
    };
  }, [isSystemAdmin, profile?.uid, activeSection]);
  const sellerContexts = useMemo<SellerContextItem[]>(() => {
    const items: SellerContextItem[] = [];
    const seen = new Set<string>();

    const add = (item: Partial<SellerContextItem>) => {
      const sellerSlug = String(item.sellerSlug ?? "").trim();
      const sellerCode = String(item.sellerCode ?? "").trim();
      const key = sellerSlug || sellerCode;
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push({
        sellerSlug: sellerSlug || sellerCode,
        sellerCode: sellerCode || sellerSlug,
        vendorName: String(item.vendorName ?? "").trim() || sellerSlug,
        role: item.role ?? null,
        status: item.status ?? null,
        teamOwnerUid: item.teamOwnerUid ?? null,
        grantedAt: item.grantedAt ?? null,
        blockedReasonCode: item.blockedReasonCode ?? null,
        blockedReasonMessage: item.blockedReasonMessage ?? null,
        blockedAt: item.blockedAt ?? null,
        blockedBy: item.blockedBy ?? null,
        reviewRequestStatus: item.reviewRequestStatus ?? null,
        reviewRequestedAt: item.reviewRequestedAt ?? null,
        reviewRequestedBy: item.reviewRequestedBy ?? null,
        reviewRequestMessage: item.reviewRequestMessage ?? null,
        reviewResponseStatus: item.reviewResponseStatus ?? null,
        reviewResponseAt: item.reviewResponseAt ?? null,
        reviewResponseBy: item.reviewResponseBy ?? null,
        reviewResponseMessage: item.reviewResponseMessage ?? null,
      });
    };

    add({
      sellerSlug: profile?.sellerSlug?.trim() || profile?.sellerActiveSellerSlug?.trim() || toSellerSlug(vendorName),
      sellerCode: profile?.sellerCode?.trim() || "",
      vendorName: vendorName || profile?.sellerVendorName || profile?.accountName || "Seller account",
      role: profile?.sellerTeamRole || "admin",
      status: profile?.sellerStatus || null,
      blockedReasonCode: profile?.sellerBlockedReasonCode || null,
      blockedReasonMessage: profile?.sellerBlockedReasonMessage || null,
      blockedAt: profile?.sellerBlockedAt || null,
      blockedBy: profile?.sellerBlockedBy || null,
      reviewRequestStatus: profile?.sellerReviewRequestStatus || null,
      reviewRequestedAt: profile?.sellerReviewRequestedAt || null,
      reviewRequestedBy: profile?.sellerReviewRequestedBy || null,
      reviewRequestMessage: profile?.sellerReviewRequestMessage || null,
      reviewResponseStatus: profile?.sellerReviewResponseStatus || null,
      reviewResponseAt: profile?.sellerReviewResponseAt || null,
      reviewResponseBy: profile?.sellerReviewResponseBy || null,
      reviewResponseMessage: profile?.sellerReviewResponseMessage || null,
    });

    if (isSystemAdmin) {
      for (const managed of profile?.sellerManagedAccounts ?? []) {
        add({
          sellerSlug: managed?.sellerSlug?.trim() || "",
          sellerCode: managed?.sellerCode?.trim() || "",
          vendorName: managed?.vendorName?.trim() || vendorName || "Seller account",
          role: managed?.role ? String(managed.role).trim().toLowerCase() : null,
          status: managed?.status ? String(managed.status).trim().toLowerCase() : null,
          teamOwnerUid: managed?.teamOwnerUid ? String(managed.teamOwnerUid).trim() : null,
          grantedAt: managed?.grantedAt ? String(managed.grantedAt).trim() : null,
          blockedReasonCode: managed?.blockedReasonCode ? String(managed.blockedReasonCode).trim() : null,
          blockedReasonMessage: managed?.blockedReasonMessage ? String(managed.blockedReasonMessage).trim() : null,
          blockedAt: managed?.blockedAt ? String(managed.blockedAt).trim() : null,
          blockedBy: managed?.blockedBy ? String(managed.blockedBy).trim() : null,
          reviewRequestStatus: managed?.reviewRequestStatus ? String(managed.reviewRequestStatus).trim().toLowerCase() : null,
          reviewRequestedAt: managed?.reviewRequestedAt ? String(managed.reviewRequestedAt).trim() : null,
          reviewRequestedBy: managed?.reviewRequestedBy ? String(managed.reviewRequestedBy).trim() : null,
          reviewRequestMessage: managed?.reviewRequestMessage ? String(managed.reviewRequestMessage).trim() : null,
          reviewResponseStatus: managed?.reviewResponseStatus ? String(managed.reviewResponseStatus).trim().toLowerCase() : null,
          reviewResponseAt: managed?.reviewResponseAt ? String(managed.reviewResponseAt).trim() : null,
          reviewResponseBy: managed?.reviewResponseBy ? String(managed.reviewResponseBy).trim() : null,
          reviewResponseMessage: managed?.reviewResponseMessage ? String(managed.reviewResponseMessage).trim() : null,
        });
      }
    }

    return items;
  }, [
    profile?.accountName,
    profile?.sellerActiveSellerSlug,
    profile?.sellerCode,
    isSystemAdmin,
    profile?.sellerManagedAccounts,
    profile?.sellerSlug,
    profile?.sellerStatus,
    profile?.sellerTeamRole,
    profile?.sellerVendorName,
    vendorName,
  ]);
  const requestedSeller = searchParams.get("seller")?.trim() || "";
  const isRequestedSellerKnown = useMemo(
    () => sellerContexts.some((item) => item.sellerSlug === requestedSeller || item.sellerCode === requestedSeller),
    [requestedSeller, sellerContexts],
  );

  useEffect(() => {
    const requesterUid = profile?.uid || "";
    if (!isSystemAdmin || !requesterUid || !requestedSeller) {
      setAdminSelectedSellerContext(null);
      return;
    }
    if (isRequestedSellerKnown) {
      setAdminSelectedSellerContext(null);
      return;
    }

    let cancelled = false;
    async function loadRequestedSellerContext() {
      try {
        const params = new URLSearchParams({
          uid: requesterUid,
          filter: "all",
          seller: requestedSeller,
        });
        const response = await fetch(`/api/client/v1/accounts/seller/list?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        const match = Array.isArray(payload?.sellers) ? payload.sellers[0] : null;
        if (!response.ok || payload?.ok === false || !match) {
          if (!cancelled) setAdminSelectedSellerContext(null);
          return;
        }
        if (!cancelled) {
          setAdminSelectedSellerContext({
            sellerSlug: String(match?.sellerSlug || match?.sellerCode || "").trim(),
            sellerCode: String(match?.sellerCode || match?.sellerSlug || "").trim(),
            vendorName: String(match?.vendorName || match?.sellerSlug || match?.sellerCode || "Seller account").trim(),
            role: "admin",
            status: String(match?.status || "").trim().toLowerCase() || null,
            teamOwnerUid: null,
            grantedAt: null,
            blockedReasonCode: String(match?.blockedReasonCode || "").trim() || null,
            blockedReasonMessage: String(match?.blockedReasonMessage || "").trim() || null,
            blockedAt: String(match?.blockedAt || "").trim() || null,
            blockedBy: String(match?.blockedBy || "").trim() || null,
            reviewRequestStatus: String(match?.reviewStatus || "").trim().toLowerCase() || null,
            reviewRequestedAt: String(match?.reviewRequestedAt || "").trim() || null,
            reviewRequestedBy: String(match?.reviewRequestedBy || "").trim() || null,
            reviewRequestMessage: String(match?.reviewRequestMessage || "").trim() || null,
            reviewResponseStatus: String(match?.reviewResponseStatus || "").trim().toLowerCase() || null,
            reviewResponseAt: String(match?.reviewResponseAt || "").trim() || null,
            reviewResponseBy: String(match?.reviewResponseBy || "").trim() || null,
            reviewResponseMessage: String(match?.reviewResponseMessage || "").trim() || null,
          });
        }
      } catch {
        if (!cancelled) setAdminSelectedSellerContext(null);
      }
    }

    void loadRequestedSellerContext();
    return () => {
      cancelled = true;
    };
  }, [isRequestedSellerKnown, isSystemAdmin, profile?.uid, requestedSeller]);

  const adminRequestedSellerPending =
    Boolean(isSystemAdmin && requestedSeller) &&
    !isRequestedSellerKnown &&
    !adminSelectedSellerContext;

  const availableSellerContexts = useMemo(() => {
    if (!adminSelectedSellerContext) return sellerContexts;
    const alreadyIncluded = sellerContexts.some(
      (item) =>
        item.sellerSlug === adminSelectedSellerContext.sellerSlug ||
        item.sellerCode === adminSelectedSellerContext.sellerCode,
    );
    return alreadyIncluded ? sellerContexts : [...sellerContexts, adminSelectedSellerContext];
  }, [adminSelectedSellerContext, sellerContexts]);

  const resolvedSellerSlug = useMemo(() => {
    if (
      requestedSeller &&
      availableSellerContexts.some((item) => item.sellerSlug === requestedSeller || item.sellerCode === requestedSeller)
    ) {
      return requestedSeller;
    }

    if (adminRequestedSellerPending) {
      return requestedSeller;
    }

    return availableSellerContexts[0]?.sellerCode || availableSellerContexts[0]?.sellerSlug || profile?.sellerCode?.trim() || toSellerSlug(vendorName);
  }, [adminRequestedSellerPending, availableSellerContexts, profile?.sellerCode, requestedSeller, vendorName]);

  const activeSellerContext = useMemo(() => {
    if (adminRequestedSellerPending) return null;
    return availableSellerContexts.find((item) => item.sellerSlug === resolvedSellerSlug || item.sellerCode === resolvedSellerSlug) ?? availableSellerContexts[0] ?? null;
  }, [adminRequestedSellerPending, availableSellerContexts, resolvedSellerSlug]);
  const activeVendorName = activeSellerContext?.vendorName || vendorName;
  const activeSellerRole = normalizeSellerRole(activeSellerContext?.role || profile?.sellerTeamRole || "");
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;

    async function loadSettingsReadiness() {
      if (!resolvedSellerSlug) {
        if (!cancelled) {
          setSettingsReady({
            profile: false,
            shipping: false,
            branding: false,
            business: false,
            payouts: false,
          });
        }
        return;
      }

      try {
        const response = await fetch(
          `/api/client/v1/accounts/seller/settings/get?sellerSlug=${encodeURIComponent(resolvedSellerSlug)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load seller settings readiness.");
        }

        const seller = payload?.seller && typeof payload.seller === "object" ? payload.seller : {};
        const branding = payload?.branding && typeof payload.branding === "object" ? payload.branding : {};
        const businessDetails = payload?.businessDetails && typeof payload.businessDetails === "object" ? payload.businessDetails : {};
        const payoutProfile = payload?.payoutProfile && typeof payload.payoutProfile === "object" ? payload.payoutProfile : {};
        const shippingSettings = normalizeShippingSettings(
          payload?.shippingSettings && typeof payload.shippingSettings === "object" ? payload.shippingSettings : {},
        );

        const hasLocalProvinceRules =
          shippingSettings.localDelivery.enabled &&
          shippingSettings.localDelivery.mode === "province" &&
          shippingSettings.localDelivery.provinces.some((item) => item.enabled !== false && item.province.trim());
        const hasLocalPostalGroups =
          shippingSettings.localDelivery.enabled &&
          shippingSettings.localDelivery.mode === "postal_code_group" &&
          shippingSettings.localDelivery.postalCodeGroups.some(
            (item) => item.name.trim() && (item.postalCodes.length > 0 || item.postalCodeRanges.length > 0),
          );
        const hasShippingZones = shippingSettings.zones.some((zone) => zone.enabled !== false && zone.countryCode.trim());

        if (!cancelled) {
          setSettingsReady({
            profile: Boolean(String(seller?.vendorName || activeVendorName || "").trim()),
            shipping:
              Boolean(
                shippingSettings.shipsFrom.countryCode &&
                  shippingSettings.shipsFrom.city &&
                  shippingSettings.shipsFrom.postalCode,
              ) && (hasLocalProvinceRules || hasLocalPostalGroups || hasShippingZones),
            branding: Boolean(String(branding?.bannerImageUrl || "").trim() && String(branding?.logoImageUrl || "").trim()),
            business: Boolean(
              String(businessDetails?.companyName || "").trim() &&
                (String(businessDetails?.email || "").trim() || String(businessDetails?.phoneNumber || "").trim()),
            ),
            payouts: Boolean(
              payoutProfile?.payoutMethodEnabled === true ||
                String(payoutProfile?.wiseRecipientId || "").trim() ||
                ["verified", "ready"].includes(
                  String(payoutProfile?.verificationStatus || payoutProfile?.onboardingStatus || "")
                    .trim()
                    .toLowerCase(),
                ),
            ),
          });
        }
      } catch {
        if (!cancelled) {
          setSettingsReady({
            profile: false,
            shipping: false,
            branding: false,
            business: false,
            payouts: false,
          });
        }
      }
    }

    void loadSettingsReadiness();
    return () => {
      cancelled = true;
    };
  }, [resolvedSellerSlug, activeVendorName, settingsRefreshKey]);
  useEffect(() => {
    let cancelled = false;
    async function loadSellerBadges() {
      if (!authReady || !isAuthenticated) {
        if (!cancelled) setSellerBadges({ newOrders: 0, warehouse: 0, notifications: 0 });
        return;
      }
      const activeSellerCode = activeSellerContext?.sellerCode || profile?.sellerCode || "";
      const activeSellerSlug = activeSellerContext?.sellerSlug || "";
      if (!activeSellerCode && !activeSellerSlug) return;
      try {
        const params = new URLSearchParams();
        if (activeSellerCode) params.set("sellerCode", activeSellerCode);
        else if (activeSellerSlug) params.set("sellerSlug", activeSellerSlug);
        const warehouseParams = params.toString();
        const [ordersResponse, inboundResponse, upliftmentResponse, notificationsResponse] = await Promise.all([
          fetch(`/api/client/v1/orders/seller/list?${warehouseParams}&filter=new`, { cache: "no-store" }),
          fetch(`/api/client/v1/accounts/seller/inbound-bookings?${warehouseParams}`, { cache: "no-store" }),
          fetch(`/api/client/v1/accounts/seller/stock-upliftments?${warehouseParams}`, { cache: "no-store" }),
          fetch(`/api/client/v1/accounts/seller/notifications?${warehouseParams}`, { cache: "no-store" }),
        ]);
        const ordersPayload = await ordersResponse.json().catch(() => ({}));
        const inboundPayload = await inboundResponse.json().catch(() => ({}));
        const upliftmentPayload = await upliftmentResponse.json().catch(() => ({}));
        const notificationsPayload = await notificationsResponse.json().catch(() => ({}));
        if (cancelled) return;
        const inboundItems = Array.isArray(inboundPayload?.items) ? inboundPayload.items : [];
        const upliftmentItems = Array.isArray(upliftmentPayload?.items) ? upliftmentPayload.items : [];
        const inboundPending = inboundItems.filter((item: any) => ["scheduled", "received"].includes(String(item?.status || "").trim().toLowerCase())).length;
        const upliftmentPending = upliftmentItems.filter((item: any) => ["requested", "released"].includes(String(item?.status || "").trim().toLowerCase())).length;
        setSellerBadges({
          newOrders: ordersResponse.ok && ordersPayload?.ok !== false ? Number(ordersPayload?.counts?.new || 0) : 0,
          warehouse: inboundPending + upliftmentPending,
          notifications: notificationsResponse.ok && notificationsPayload?.ok !== false ? Number(notificationsPayload?.unreadCount || 0) : 0,
        });
      } catch {
        if (!cancelled) setSellerBadges({ newOrders: 0, warehouse: 0, notifications: 0 });
      }
    }
    void loadSellerBadges();
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, activeSellerContext?.sellerCode, activeSellerContext?.sellerSlug, profile?.sellerCode, activeSection]);
  const activeSellerStatus = String(activeSellerContext?.status || profile?.sellerStatus || "").trim().toLowerCase();
  const canManageSellerDashboard = isSystemAdmin;
  const homeSellerContext = useMemo(() => {
    const profileSlug = profile?.sellerSlug?.trim() || profile?.sellerActiveSellerSlug?.trim() || "";
    const profileCode = profile?.sellerCode?.trim() || "";
    return (
      sellerContexts.find((item) => sellerContextMatches(profileSlug, item) || sellerContextMatches(profileCode, item)) ||
      (isSystemAdmin ? sellerContexts.find((item) => normalizeSellerRole(item.role || "") === "admin") || null : null) ||
      sellerContexts[0] ||
      null
    );
  }, [isSystemAdmin, profile?.sellerActiveSellerSlug, profile?.sellerCode, profile?.sellerSlug, sellerContexts]);
  const homeSellerSlug = homeSellerContext?.sellerSlug || "";
  const showReturnHome = Boolean(
    homeSellerContext &&
      activeSellerContext &&
      homeSellerContext.sellerSlug !== activeSellerContext.sellerSlug &&
      homeSellerContext.sellerCode !== activeSellerContext.sellerCode,
  );
  const blockedSections: SidebarSection[] = ["products", "warehouse", "customers", "returns", "marketing", "settlements", "create-product", "inventory", "collections", "purchase-orders", "transfers", "new-orders", "unfulfilled", "fulfilled", "analytics"];
  const sellerBlocked = activeSellerStatus === "blocked";
  const sellerClosed = activeSellerStatus === "closed" || activeSellerStatus === "deleted" || activeSellerStatus === "archived";
  const sellerUnavailable = sellerBlocked || sellerClosed;
  const sellerReviewPending = String(activeSellerContext?.reviewRequestStatus || profile?.sellerReviewRequestStatus || "")
    .trim()
    .toLowerCase() === "pending";
  const sellerBlockedReasonCode = activeSellerContext?.blockedReasonCode || profile?.sellerBlockedReasonCode || "other";
  const sellerBlockedReasonLabel = getSellerBlockReasonLabel(sellerBlockedReasonCode);
  const sellerBlockedFixHint = getSellerBlockReasonFix(sellerBlockedReasonCode);
  const sectionLocked = sellerUnavailable
    ? blockedSections.includes(activeSection)
      : activeSection === "admin" || activeSection === "brand-requests" || activeSection === "admin-analytics" || activeSection === "admin-badge-settings" || activeSection === "admin-live-view" || activeSection === "admin-google-analytics" || activeSection === "admin-landing-builder" || activeSection === "admin-landing-seo" || activeSection === "admin-newsletters" || activeSection === "admin-orders" || activeSection === "admin-platform-delivery" || activeSection === "admin-google-merchant-countries" || activeSection === "admin-google-merchant" || activeSection === "admin-payouts" || activeSection === "admin-support" || activeSection === "admin-campaign-reviews" || activeSection === "product-reviews" || activeSection === "product-reports" || activeSection === "admin-returns" || activeSection === "fees" || activeSection === "variant-metadata" || activeSection === "warehouse-calendar"
        ? !canManageSellerDashboard
        : !canAccessSellerSection(activeSellerRole, activeSection);
  const firstAllowedSection = useMemo(() => {
    const preferredOrder: SidebarSection[] = sellerBlocked
      ? ["home", "settings", "team"]
      : sellerClosed
        ? ["home", "settings"]
        : ["products", "new-orders", "notifications", "returns", "customers", "analytics", "home", "settings"];
    return preferredOrder.find((section) => canAccessSellerSection(activeSellerRole, section)) || "home";
  }, [activeSellerRole, sellerBlocked, sellerClosed]);
  const currentAccessLabel = formatSellerAccessLabel(activeSellerContext, homeSellerSlug, isSystemAdmin);
  const currentSearch = searchParams.toString();
  const currentUrl = currentSearch ? `${pathname}?${currentSearch}` : pathname;

  async function submitSellerReviewRequest() {
    if (!profile?.uid || !resolvedSellerSlug) return;
    setReviewRequestSubmitting(true);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/review/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile.uid,
          data: {
            sellerSlug: resolvedSellerSlug,
            reasonCode: reviewRequestReason,
            message: reviewRequestMessage,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to request review.");
      }
      setReviewRequestOpen(false);
      setReviewRequestMessage("");
    } finally {
      setReviewRequestSubmitting(false);
    }
  }

  function setSellerContext(nextSellerSlug: string, nextSection: SidebarSection = "home") {
    const sellerValue = String(nextSellerSlug ?? "").trim();
    if (!sellerValue) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("seller", sellerValue);
    nextParams.set("section", nextSection);
    nextParams.delete("unique_id");
    nextParams.delete("id");
    if (nextSection !== "product-reviews") {
      nextParams.delete("reviewContext");
    }
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    router.push(nextUrl, { scroll: false });
    setMobileMenuOpen(false);
  }

  useEffect(() => {
    if (!resolvedSellerSlug) return;
    if (adminRequestedSellerPending) return;
    if (requestedSeller === resolvedSellerSlug) return;
    if (activeSection === "create-product") return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("seller", resolvedSellerSlug);
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [activeSection, adminRequestedSellerPending, currentUrl, pathname, requestedSeller, resolvedSellerSlug, searchParams]);

  useEffect(() => {
    const currentId = searchParams.get("unique_id")?.trim() || searchParams.get("id")?.trim() || "";
    if (!currentId) return;
    if (activeSection === "create-product") return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", activeSection);
    nextParams.delete("unique_id");
    nextParams.delete("id");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [activeSection, currentUrl, pathname, searchParams]);

  function setSection(nextSection: SidebarSection) {
    if ((nextSection === "admin" || nextSection === "brand-requests" || nextSection === "admin-analytics" || nextSection === "admin-badge-settings" || nextSection === "admin-live-view" || nextSection === "admin-google-analytics" || nextSection === "admin-landing-builder" || nextSection === "admin-landing-seo" || nextSection === "admin-newsletters" || nextSection === "admin-orders" || nextSection === "admin-platform-delivery" || nextSection === "admin-google-merchant-countries" || nextSection === "admin-google-merchant" || nextSection === "admin-payouts" || nextSection === "admin-support" || nextSection === "admin-campaign-reviews" || nextSection === "product-reviews" || nextSection === "product-reports" || nextSection === "admin-returns" || nextSection === "fees" || nextSection === "variant-metadata" || nextSection === "warehouse-calendar") && !canManageSellerDashboard) return;
    if (!canAccessSellerSection(activeSellerRole, nextSection)) return;
    setActiveSection(nextSection);
    setMobileMenuOpen(false);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", nextSection);
    if (nextSection !== "create-product") {
      nextParams.delete("unique_id");
      nextParams.delete("id");
    }
    if (nextSection !== "product-reviews") {
      nextParams.delete("reviewContext");
    }
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    router.push(nextUrl, { scroll: false });
  }

  function openProductEditor(productId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", "create-product");
    nextParams.set("unique_id", productId);
    nextParams.delete("id");
    nextParams.delete("reviewContext");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    router.push(nextUrl, { scroll: false });
    setActiveSection("create-product");
    setMobileMenuOpen(false);
  }

  function openReviewProductEditor(productId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", "create-product");
    nextParams.set("unique_id", productId);
    nextParams.set("reviewContext", "product-reviews");
    nextParams.delete("id");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    if (nextUrl === currentUrl) return;
    router.push(nextUrl, { scroll: false });
    setActiveSection("product-reviews");
    setMobileMenuOpen(false);
  }

  const pageTitle = useMemo(() => {
    switch (activeSection) {
      case "products":
        return "Products";
      case "warehouse":
        return "Warehouse";
      case "warehouse-calendar":
        return "Warehouse calendar";
      case "customers":
        return "Customers";
      case "returns":
        return "Returns";
      case "billing":
        return "Billing";
      case "marketing":
        return "Campaigns";
      case "settlements":
        return "Settlements";
      case "admin":
        return "Seller accounts";
      case "brand-requests":
        return "Brand requests";
      case "admin-analytics":
        return "Analytics";
      case "admin-live-view":
        return "Live view";
      case "admin-google-analytics":
        return "Google Analytics";
      case "admin-landing-builder":
        return "Landing page";
      case "admin-landing-seo":
        return "Landing page SEO";
      case "admin-newsletters":
        return "Newsletters";
      case "admin-orders":
        return "Orders";
      case "admin-platform-delivery":
        return "Platform delivery";
      case "admin-google-merchant-countries":
        return "Google countries";
      case "admin-google-merchant":
        return "Google sync";
      case "admin-payouts":
        return "Payouts";
      case "admin-support":
        return "Support";
      case "admin-campaign-reviews":
        return "Campaign reviews";
      case "product-reviews":
        return "Product reviews";
      case "product-reports":
        return "Product reports";
      case "admin-returns":
        return "Returns";
      case "fees":
        return "Marketplace fees";
      case "admin-badge-settings":
        return "Badge settings";
      case "variant-metadata":
        return "Variant metadata";
      case "inventory":
        return "Inventory";
      case "collections":
        return "Collections";
      case "purchase-orders":
        return "Purchase orders";
      case "transfers":
        return "Transfers";
      case "new-orders":
        return "New orders";
      case "unfulfilled":
        return "Unfulfilled orders";
      case "fulfilled":
        return "Fulfilled orders";
      case "analytics":
        return "Analytics";
      case "notifications":
        return "Notifications";
      case "integrations":
        return "Integrations";
      case "team":
        return "Team";
      case "settings-profile":
        return "Profile settings";
      case "settings-shipping":
        return "Shipping settings";
      case "settings-estimator":
        return "Shipping estimator";
      case "settings-branding":
        return "Branding settings";
      case "settings-business":
        return "Business settings";
      case "settings-payouts":
        return "Payout settings";
      case "settings":
        return "Settings";
      case "home":
        return "Home";
      case "create-product":
        return "Create product";
      default:
        return "Products";
    }
  }, [activeSection]);

  const pageDescription = useMemo(() => {
    switch (activeSection) {
      case "home":
        return "Overview of your seller account and quick access to your tools.";
      case "products":
        return "Manage and edit your seller catalogue from one table.";
      case "warehouse":
        return "Book inbound deliveries to Piessang and request stock upliftments from one workspace.";
      case "warehouse-calendar":
        return "Review inbound and outbound warehouse bookings in one admin-only calendar.";
      case "customers":
        return "See customers who have ordered from this seller account.";
      case "returns":
        return "Review the return requests you need to handle for orders fulfilled by you.";
      case "billing":
        return "Review monthly seller billing, due amounts, and fee summaries.";
      case "marketing":
        return "Plan and review paid campaigns for this seller account.";
      case "settlements":
        return "Track settlements, fulfilment claims, and payout status.";
      case "admin":
        return "Switch and manage seller accounts when you are a system admin.";
      case "brand-requests":
        return "Review and resolve seller-submitted brand requests before they become canonical brands.";
      case "admin-analytics":
        return "View marketplace-wide admin analytics and live commerce insights.";
      case "admin-badge-settings":
        return "Manage recent-window badge thresholds, activation, and sales or engagement rules.";
      case "admin-live-view":
        return "Track live marketplace activity across carts, checkouts, and purchases.";
      case "admin-google-analytics":
        return "Open the platform's Google Analytics context for live traffic, audience behavior, and acquisition reporting.";
      case "admin-landing-builder":
        return "Build and publish the Piessang landing page using reusable homepage sections.";
      case "admin-landing-seo":
        return "Manage public page SEO metadata separately from the landing-page content builder.";
      case "admin-newsletters":
        return "Create and manage the newsletters customers can subscribe to from their account settings.";
      case "admin-orders":
        return "See every marketplace order in one place, including payment, fulfilment, and delivery progress.";
      case "admin-platform-delivery":
        return "Manage Piessang platform shipping settings, including internal shipping markup applied to customer-facing shipping totals.";
      case "admin-google-merchant-countries":
        return "Manage which countries Google Merchant product ads are allowed to target.";
      case "admin-google-merchant":
        return "Monitor Google Merchant queue activity, manual syncs, logs, and offer cleanup from one workspace.";
      case "admin-payouts":
        return "Prepare, submit, and reconcile seller payout batches from one admin queue.";
      case "admin-support":
        return "Review support tickets, reply to customers, and close resolved cases from one admin queue.";
      case "admin-campaign-reviews":
        return "Review seller advertising campaigns before they can run on Piessang.";
      case "product-reviews":
        return "Approve or reject seller product submissions before they become visible on the marketplace.";
      case "product-reports":
        return "Review customer product reports, block listings when required, and resolve seller disputes.";
      case "admin-returns":
        return "Review marketplace return requests, approve them, and process refunds once they are approved.";
      case "fees":
        return "Manage marketplace fee rules and push updated rates across the catalogue.";
      case "create-product":
        return "Create and edit product records, variants, and publishing settings.";
      case "inventory":
        return "Keep an eye on stock and warehouse availability.";
      case "collections":
        return "Group products into collections for easier browsing.";
      case "purchase-orders":
        return "Track purchase orders and supplier intake.";
      case "transfers":
        return "Review stock transfers between locations.";
      case "new-orders":
        return "Work through newly placed orders.";
      case "unfulfilled":
        return "See orders that still need to be fulfilled.";
      case "fulfilled":
        return "Review orders that have already been fulfilled.";
      case "analytics":
        return "Review seller performance and reporting.";
      case "notifications":
        return "Track followers, seller activity, and important product or account events from one inbox.";
      case "integrations":
        return "Connect Shopify, preview imported products, and control how catalogue sync should work for this seller account.";
      case "team":
        return "Manage teammate access and roles for this seller account.";
      case "settings-profile":
        return "Manage your seller identity, public vendor name, description, and seller code.";
      case "settings-shipping":
        return "Set seller shipping origin, local delivery rules, and broader shipping zones.";
      case "settings-estimator":
        return "Test your shipping rules and compare them with advisory courier estimates before going live.";
      case "settings-branding":
        return "Manage your store banner, logo, and seller-facing brand presentation.";
      case "settings-business":
        return "Keep invoice-facing business and supplier details current.";
      case "settings-payouts":
        return "Manage where Piessang should send your seller payouts.";
      case "settings":
        return "Manage branding, seller account details, and seller access settings.";
      default:
        return "Manage your seller tools from one workspace.";
    }
  }, [activeSection]);

  if (!authReady) {
    return (
      <PageBody className="px-3 py-4 lg:px-4 lg:py-6">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller workspace</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Loading seller workspace</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            We’re checking your account and loading your seller access.
          </p>
        </section>
      </PageBody>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageBody className="px-4 py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Sign in to manage seller tools</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Once you are signed in, you can register your seller account and manage your catalogue from here.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to access your seller tools.")}
            className="brand-button mt-5 inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
          >
            Sign in
          </button>
        </section>
      </PageBody>
    );
  }

  if (!isSeller) {
    if (sellerClosed) {
      return (
        <PageBody className="px-4 py-10">
          <section className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Seller account closed</p>
            <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">
              This seller account is no longer open for business.
            </h1>
            <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
              {profile?.sellerBlockedReasonMessage ||
                "Your seller account was closed and the catalogue is no longer public. If this was done in error, please contact Piessang support to review the account."}
            </p>
          </section>
        </PageBody>
      );
    }
    return (
      <PageBody className="px-4 py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller tools</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Register to sell on Piessang</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Create your vendor profile to unlock your catalogue, orders, and performance tools.
          </p>
          <button
            type="button"
            onClick={() => openSellerRegistrationModal("Register your seller account to unlock catalogue tools.")}
            className="mt-5 inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
          >
            Register as seller
          </button>
        </section>
      </PageBody>
    );
  }

  return (
    <>
      <PageBody className="px-3 py-4 lg:px-4 lg:py-6">
        <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] font-semibold text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.06)]"
        >
          <MenuIcon className="h-4 w-4" />
          Seller menu
        </button>
        <span className="truncate text-[12px] font-medium text-[#57636c]">{currentAccessLabel}</span>
      </div>

      <div className={`grid gap-4 transition-[grid-template-columns] duration-200 ${desktopMenuCollapsed ? "lg:grid-cols-[88px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)]"}`}>
        <aside className="hidden rounded-[8px] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,243,243,0.98))] p-3 shadow-[0_8px_24px_rgba(20,24,27,0.05)] lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)] lg:overflow-x-visible lg:overflow-y-auto lg:[scrollbar-width:none] lg:[-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className={`mb-3 flex items-center gap-2 ${desktopMenuCollapsed ? "justify-center" : "justify-between"}`}>
            {!desktopMenuCollapsed ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Navigation</p>
            ) : null}
            <button
              type="button"
              onClick={() => setDesktopMenuCollapsed((current) => !current)}
              aria-label={desktopMenuCollapsed ? "Expand seller navigation" : "Collapse seller navigation"}
              title={desktopMenuCollapsed ? "Expand navigation" : "Collapse navigation"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.06)]"
            >
              <SidebarCollapseIcon collapsed={desktopMenuCollapsed} className="h-4 w-4" />
            </button>
          </div>
              <SidebarMenu
                collapsed={desktopMenuCollapsed}
                vendorName={activeVendorName}
                userEmail={profile?.email || ""}
                activeSection={activeSection}
                sellerRole={activeSellerRole}
                sellerRoleLabel={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                sellerBlocked={sellerBlocked}
                showAdminSection={canManageSellerDashboard}
                adminBadges={adminBadges}
                sellerBadges={sellerBadges}
                settingsReady={settingsReady}
                onNavigate={setSection}
                onBackToMySeller={showReturnHome ? () => setSellerContext(homeSellerSlug) : undefined}
              />
        </aside>

        <section className="min-w-0">
          {sellerBlocked ? (
            <section className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Seller account blocked</p>
              <h2 className="mt-2 text-[22px] font-semibold text-[#202020]">
                {sellerBlockedReasonLabel}
              </h2>
              <p className="mt-2 max-w-[760px] text-[13px] leading-[1.6] text-[#57636c]">
                {activeSellerContext?.blockedReasonMessage || sellerBlockedFixHint}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewRequestReason(sellerBlockedReasonCode);
                    setReviewRequestMessage(activeSellerContext?.blockedReasonMessage || sellerBlockedFixHint);
                    setReviewRequestOpen(true);
                  }}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                >
                  Request review
                </button>
                {sellerReviewPending ? (
                  <span className="inline-flex h-10 items-center rounded-[8px] border border-[#f0e7c9] bg-[rgba(203,178,107,0.08)] px-4 text-[12px] font-semibold text-[#8f7531]">
                    Review request pending
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          <SellerPageIntro title={pageTitle} description={pageDescription} />

          <div className="mt-4 rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
            {sectionLocked ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-[8px] border border-dashed border-black/10 bg-[rgba(32,32,32,0.02)] px-6 py-12 text-center">
                <div className="max-w-[460px]">
                  <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(32,32,32,0.06)] text-[#8b8b8b]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                    </svg>
                  </span>
                  <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Access limited</p>
                  <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">
                    You do not have permission to open this section
                  </h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
                    Your current seller role only allows access to part of this dashboard. The locked items in the
                    sidebar show what you can and cannot open.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSection(firstAllowedSection)}
                      className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                    >
                      Go to allowed section
                    </button>
                    {showReturnHome ? (
                      <button
                        type="button"
                        onClick={() => setSellerContext(homeSellerSlug)}
                        className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                      >
                        Back to my seller dashboard
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : activeSection === "admin" && canManageSellerDashboard ? (
              <SellerAccountsWorkspace
                activeSellerSlug={resolvedSellerSlug}
                activeSellerLabel={activeVendorName}
                activeSellerRoleLabel={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                onSwitchSeller={setSellerContext}
                onBackToMySeller={showReturnHome ? () => setSellerContext(homeSellerSlug) : undefined}
              />
            ) : activeSection === "brand-requests" && canManageSellerDashboard ? (
              <SellerBrandRequestsWorkspace />
            ) : activeSection === "admin-live-view" && canManageSellerDashboard ? (
              <SellerLiveCommerceWorkspace />
            ) : activeSection === "admin-google-analytics" && canManageSellerDashboard ? (
              <SellerGoogleAnalyticsWorkspace />
            ) : activeSection === "admin-landing-builder" && canManageSellerDashboard ? (
              <SellerAdminLandingBuilderWorkspace />
            ) : activeSection === "admin-landing-seo" && canManageSellerDashboard ? (
              <SellerAdminLandingSeoWorkspace />
            ) : activeSection === "admin-newsletters" && canManageSellerDashboard ? (
              <SellerNewslettersWorkspace />
            ) : activeSection === "admin-orders" && canManageSellerDashboard ? (
              <SellerAdminOrdersWorkspace userId={profile?.uid || ""} />
            ) : activeSection === "admin-platform-delivery" && canManageSellerDashboard ? (
              <SellerPlatformShippingWorkspace />
            ) : activeSection === "admin-google-merchant-countries" && canManageSellerDashboard ? (
              <SellerGoogleMerchantCountriesWorkspace />
            ) : activeSection === "admin-google-merchant" && canManageSellerDashboard ? (
              <SellerGoogleMerchantWorkspace />
            ) : activeSection === "admin-payouts" && canManageSellerDashboard ? (
              <SellerPayoutBatchesWorkspace />
            ) : activeSection === "admin-support" && canManageSellerDashboard ? (
              <SellerSupportTicketsWorkspace />
            ) : activeSection === "admin-campaign-reviews" && canManageSellerDashboard ? (
              <SellerCampaignReviewsWorkspace />
            ) : activeSection === "product-reviews" && canManageSellerDashboard ? (
              <SellerProductReviewsWorkspace onQueueChanged={() => { void refreshAdminBadges(); }} />
            ) : activeSection === "product-reports" && canManageSellerDashboard ? (
              <SellerProductReportsWorkspace onQueueChanged={() => { void refreshAdminBadges(); }} />
            ) : activeSection === "admin-returns" && canManageSellerDashboard ? (
              <SellerReturnsWorkspace adminMode />
            ) : activeSection === "fees" && canManageSellerDashboard ? (
              <SellerFeesWorkspace />
            ) : activeSection === "variant-metadata" && canManageSellerDashboard ? (
              <SellerVariantMetadataOptionsWorkspace />
            ) : activeSection === "admin-badge-settings" && canManageSellerDashboard ? (
              <SellerAdminBadgeSettingsWorkspace />
            ) : activeSection === "warehouse-calendar" && canManageSellerDashboard ? (
              <SellerWarehouseWorkspace
                vendorName={activeVendorName}
                sellerSlug={activeSellerContext?.sellerSlug || ""}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                isSystemAdmin={isSystemAdmin}
                adminCalendarOnly
              />
            ) : activeSection === "admin-analytics" && canManageSellerDashboard ? (
              <SellerAdminAnalyticsWorkspace vendorName="Marketplace" />
            ) : activeSection === "warehouse" ? (
              <SellerWarehouseWorkspace
                vendorName={activeVendorName}
                sellerSlug={activeSellerContext?.sellerSlug || ""}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                isSystemAdmin={isSystemAdmin}
              />
            ) : activeSection === "new-orders" ? (
              <SellerOrdersWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                mode="new"
              />
            ) : activeSection === "unfulfilled" ? (
              <SellerOrdersWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                mode="unfulfilled"
              />
            ) : activeSection === "fulfilled" ? (
              <SellerOrdersWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                mode="fulfilled"
              />
            ) : activeSection === "products" ? (
              <SellerProductsWorkspace
                vendorName={activeVendorName}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                sellerSlug={resolvedSellerSlug}
                onCreateProduct={() => setSection("create-product")}
                onEditProduct={openProductEditor}
                onOpenSettings={() => setSection("settings")}
              />
            ) : activeSection === "customers" ? (
              <SellerCustomersWorkspace vendorName={activeVendorName} />
            ) : activeSection === "returns" ? (
              <SellerReturnsWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
              />
            ) : activeSection === "billing" ? (
              <SellerBillingWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                vendorName={activeVendorName}
              />
            ) : activeSection === "marketing" ? (
              <SellerCampaignsWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                vendorName={activeVendorName}
              />
            ) : activeSection === "analytics" ? (
              <SellerAnalyticsWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                vendorName={activeVendorName}
              />
            ) : activeSection === "notifications" ? (
              <SellerNotificationsWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
              />
            ) : activeSection === "integrations" ? (
              <SellerIntegrationsWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                vendorName={activeVendorName}
              />
            ) : activeSection === "settlements" ? (
              <SellerSettlementsWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                vendorName={activeVendorName}
                isSystemAdmin={isSystemAdmin}
              />
            ) : activeSection === "team" ? (
              <SellerTeamPage showIntro={false} />
            ) : activeSection === "settings-profile" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                visibleSections={["profile"]}
                showDangerZone={false}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "settings-shipping" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                visibleSections={["shipping"]}
                showDangerZone={false}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "settings-estimator" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                visibleSections={["estimator"]}
                showDangerZone={false}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "settings-branding" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                visibleSections={["branding"]}
                showDangerZone={false}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "settings-business" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                visibleSections={["business"]}
                showDangerZone={false}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "settings-payouts" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                visibleSections={["payouts"]}
                showDangerZone={false}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "settings" ? (
              <SellerSettingsWorkspace
                sellerSlug={resolvedSellerSlug}
                vendorName={activeVendorName}
                sellerRole={activeSellerContext?.role || profile?.sellerTeamRole || ""}
                isSystemAdmin={isSystemAdmin}
                onSettingsSaved={() => setSettingsRefreshKey((current) => current + 1)}
              />
            ) : activeSection === "create-product" ? (
              <div className="space-y-3">
                <Suspense
                  fallback={
                    <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-5 text-[13px] text-[#57636c]">
                      Loading create product form...
                    </div>
                  }
                >
                  <CreateProductPage />
                </Suspense>
              </div>
            ) : activeSection === "home" ? (
              <SellerHomeWorkspace
                sellerSlug={resolvedSellerSlug}
                sellerCode={activeSellerContext?.sellerCode || profile?.sellerCode || ""}
                vendorName={activeVendorName}
                onNavigate={setSection}
              />
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-[8px] border border-dashed border-black/10 bg-[rgba(32,32,32,0.02)] px-6 py-12 text-center">
                <div className="max-w-[460px]">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
                    Coming soon
                  </p>
                  <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">
                    {pageTitle} will live here
                  </h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
                    We&apos;re keeping the dashboard shell ready so we can plug in orders, analytics, inventory, and
                    other seller tools without changing the layout again.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {reviewRequestOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close review request modal"
            className="absolute inset-0 bg-black/45"
            onClick={() => setReviewRequestOpen(false)}
          />
          <div className="relative h-[90svh] w-full max-w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Request review</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{activeVendorName}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    Tell us what you fixed and request a manual review of the blocked seller account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewRequestOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
                  aria-label="Close review request modal"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Reason</span>
                  <select
                    value={reviewRequestReason}
                    onChange={(event) => {
                      const next = normalizeSellerBlockReasonCode(event.target.value);
                      setReviewRequestReason(next);
                      const preset = SELLER_BLOCK_REASONS.find((item) => item.value === next);
                      if (!reviewRequestMessage.trim() && preset) {
                        setReviewRequestMessage(preset.fix);
                      }
                    }}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  >
                    {SELLER_BLOCK_REASONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] text-[#57636c]">
                  {sellerBlockedFixHint}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Your update</span>
                  <textarea
                    value={reviewRequestMessage}
                    onChange={(event) => setReviewRequestMessage(event.target.value)}
                    rows={5}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Explain what you fixed before requesting review."
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setReviewRequestOpen(false)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitSellerReviewRequest()}
                  disabled={reviewRequestSubmitting}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewRequestSubmitting ? "Sending..." : "Request review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`fixed inset-0 z-50 xl:hidden ${mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 lg:hidden ${
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileMenuOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[min(86vw,320px)] border-r border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,244,244,0.98))] p-3 shadow-[20px_0_32px_rgba(20,24,27,0.12)] transition-transform duration-300 ease-out lg:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarMenu
            mobile
            vendorName={activeVendorName}
            userEmail={profile?.email || ""}
            activeSection={activeSection}
            sellerRole={activeSellerRole}
            sellerRoleLabel={activeSellerContext?.role || profile?.sellerTeamRole || ""}
            sellerBlocked={sellerBlocked}
            showAdminSection={canManageSellerDashboard}
            adminBadges={adminBadges}
            sellerBadges={sellerBadges}
            onNavigate={setSection}
            onBackToMySeller={showReturnHome ? () => setSellerContext(homeSellerSlug) : undefined}
            onClose={() => setMobileMenuOpen(false)}
          />
        </aside>
        </div>
      </PageBody>
    </>
  );
}

export default function SellerDashboardPage() {
  return (
    <Suspense
      fallback={
        <PageBody className="px-3 py-4 lg:px-4 lg:py-6">
          <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller home</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#202020]">Loading dashboard</h1>
            <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
              We’re preparing your seller workspace.
            </p>
          </section>
        </PageBody>
      }
    >
      <SellerDashboardContent />
    </Suspense>
  );
}
