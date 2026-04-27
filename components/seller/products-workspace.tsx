"use client";

import Link from "next/link";
import { ProductLink } from "@/components/products/product-link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PlatformPopover, PopoverHintTrigger } from "@/components/ui/platform-popover";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { collectProductWeightRequirementIssues, sellerHasWeightBasedShipping } from "@/lib/seller/shipping-weight-requirements";

type ProductItem = {
  id: string;
  data: {
    product?: {
      unique_id?: string;
      sku?: string;
      title?: string;
      titleSlug?: string;
      vendorName?: string;
      brandTitle?: string | null;
      overview?: string | null;
      description?: string | null;
      keywords?: string[];
      shipping?: {
        courierEnabled?: boolean;
      };
    };
    grouping?: {
      category?: string;
      subCategory?: string;
      brand?: string;
      kind?: string;
    };
    placement?: {
      isActive?: boolean;
      isFeatured?: boolean;
      supplier_out_of_stock?: boolean;
      in_stock?: boolean;
    };
    fulfillment?: {
      mode?: "seller" | "bevgo" | string;
      lead_time_days?: number | null;
      cutoff_time?: string | null;
    };
    media?: {
      images?: Array<{
        imageUrl?: string | null;
        blurHashUrl?: string | null;
        altText?: string | null;
      }>;
    };
    moderation?: {
      status?: string | null;
      reason?: string | null;
      notes?: string | null;
      reviewedAt?: string | null;
    };
    status?: {
      stored?: string | null;
      current?: string | null;
      reviewQueueStatus?: string | null;
      pendingUpdateStatus?: string | null;
      hasPendingLiveUpdate?: boolean;
      hasMeaningfulPendingUpdate?: boolean;
      isStalePendingState?: boolean;
    };
    live_snapshot?: ProductItem["data"] | null;
    seller_offer_count?: number;
    canonical_offer_barcode?: string | null;
    variants?: Array<{
      variant_id?: string;
      label?: string;
      sku?: string | null;
      placement?: { isActive?: boolean; is_default?: boolean };
      total_in_stock_items_available?: number;
    }>;
    is_unavailable_for_listing?: boolean;
    has_in_stock_variants?: boolean;
    listing_block_reason_code?: string | null;
    listing_block_reason_message?: string | null;
  };
};

type SellerProductsWorkspaceProps = {
  vendorName: string;
  sellerCode?: string;
  sellerSlug?: string;
  onCreateProduct: () => void;
  onEditProduct: (productId: string) => void;
  onOpenSettings?: () => void;
};

type StatusFilter = "all" | "live" | "review" | "awaiting_stock" | "draft" | "rejected" | "blocked";

function toSlug(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeTextValue(value: unknown) {
  return toStr(value).replace(/\s+/g, " ").trim();
}

function valuesDiffer(left: unknown, right: unknown) {
  return normalizeTextValue(left) !== normalizeTextValue(right);
}

function imageCount(data: ProductItem["data"] | null | undefined) {
  return Array.isArray(data?.media?.images) ? data.media.images.filter((entry) => Boolean(entry?.imageUrl)).length : 0;
}

function variantCount(data: ProductItem["data"] | null | undefined) {
  return Array.isArray(data?.variants) ? data.variants.length : 0;
}

function summarizeVariantLabels(data: ProductItem["data"] | null | undefined) {
  if (!Array.isArray(data?.variants)) return "";
  return data.variants.map((variant) => toStr(variant?.label || variant?.variant_id || "")).filter(Boolean).join(", ");
}

function buildReviewDiffRows(item: ProductItem["data"]) {
  const live = item?.live_snapshot || null;
  if (!live) return [];

  const pending = item || {};
  const rows = [
    {
      liveValue: toStr(live?.product?.title, "Not set"),
      pendingValue: toStr(pending?.product?.title, "Not set"),
    },
    {
      liveValue: toStr(live?.product?.brandTitle || "", "Not set"),
      pendingValue: toStr(pending?.product?.brandTitle || "", "Not set"),
    },
    {
      liveValue: toStr(live?.product?.vendorName || "", "Not set"),
      pendingValue: toStr(pending?.product?.vendorName || "", "Not set"),
    },
    {
      liveValue: toStr(live?.grouping?.category || "", "Not set"),
      pendingValue: toStr(pending?.grouping?.category || "", "Not set"),
    },
    {
      liveValue: toStr(live?.grouping?.subCategory || "", "Not set"),
      pendingValue: toStr(pending?.grouping?.subCategory || "", "Not set"),
    },
    {
      liveValue: toStr(live?.fulfillment?.mode || "", "Not set"),
      pendingValue: toStr(pending?.fulfillment?.mode || "", "Not set"),
    },
    {
      liveValue: String(imageCount(live)),
      pendingValue: String(imageCount(pending)),
    },
    {
      liveValue: `${variantCount(live)}${summarizeVariantLabels(live) ? ` • ${summarizeVariantLabels(live)}` : ""}`,
      pendingValue: `${variantCount(pending)}${summarizeVariantLabels(pending) ? ` • ${summarizeVariantLabels(pending)}` : ""}`,
    },
    {
      liveValue: toStr(live?.product?.overview || "", "Not set"),
      pendingValue: toStr(pending?.product?.overview || "", "Not set"),
    },
    {
      liveValue: toStr(live?.product?.description || "", "Not set"),
      pendingValue: toStr(pending?.product?.description || "", "Not set"),
    },
  ];

  return rows.filter((row) => valuesDiffer(row.liveValue, row.pendingValue));
}

function hasMeaningfulReviewDiff(item: ProductItem["data"]) {
  return buildReviewDiffRows(item).length > 0;
}

function normalizeStatus(item: ProductItem["data"]) {
  const explicitCurrent = String(item?.status?.current || "").trim().toLowerCase();
  if (explicitCurrent) {
    if (explicitCurrent === "published") return item?.placement?.isActive === false ? "draft" : "live";
    if (explicitCurrent === "in_review") return "review";
    if (explicitCurrent === "awaiting_stock") return "awaiting_stock";
    if (explicitCurrent === "draft") return "draft";
    if (explicitCurrent === "rejected") return "rejected";
    if (explicitCurrent === "blocked") return "blocked";
  }
  const moderation = String(item?.moderation?.status ?? "").toLowerCase();
  if (moderation === "archived" || moderation === "deleted") return "archived";
  if (moderation === "blocked") return "blocked";
  if (moderation === "rejected") return "rejected";
  if (moderation === "in_review" || moderation === "pending") {
    if (item?.live_snapshot && !hasMeaningfulReviewDiff(item)) {
      return item?.placement?.isActive === false ? "draft" : "live";
    }
    return "review";
  }
  if (moderation === "awaiting_stock") return "awaiting_stock";
  if (moderation === "draft") return "draft";
  if (moderation === "published") {
    if (item?.placement?.isActive === false) return "draft";
    return "live";
  }
  if (item?.placement?.isActive === false) return "draft";
  return "live";
}

function displayStatus(item: ProductItem["data"]) {
  const baseStatus = normalizeStatus(item);
  if (baseStatus === "live" && item?.is_unavailable_for_listing) return "live_hidden";
  return baseStatus;
}

function statusTone(status: string) {
  switch (status) {
    case "live":
      return "bg-[rgba(57,169,107,0.12)] text-[#166534]";
    case "live_hidden":
      return "bg-[rgba(245,158,11,0.14)] text-[#b45309]";
    case "review":
      return "bg-[rgba(203,178,107,0.14)] text-[#8f7531]";
    case "awaiting_stock":
      return "bg-[rgba(99,102,241,0.12)] text-[#4f46e5]";
    case "rejected":
      return "bg-[rgba(220,38,38,0.10)] text-[#b91c1c]";
    case "blocked":
      return "bg-[rgba(127,29,29,0.12)] text-[#7f1d1d]";
    case "draft":
      return "bg-[rgba(148,163,184,0.14)] text-[#475569]";
    default:
      return "bg-[rgba(148,163,184,0.14)] text-[#475569]";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "live_hidden":
      return "Live hidden";
    case "review":
      return "In review";
    case "awaiting_stock":
      return "Awaiting stock";
    case "blocked":
      return "Blocked";
    default:
      return status;
  }
}

function getListingVisibilityMessage(item: ProductItem["data"]) {
  const reasonMessage = String(item?.listing_block_reason_message || "").trim();
  if (reasonMessage) return reasonMessage;

  const reasonCode = String(item?.listing_block_reason_code || "").trim();
  if (reasonCode === "missing_delivery_settings") {
    return "Complete your shipping settings to show this self-fulfilled product to shoppers.";
  }
  if (reasonCode === "missing_variant_weight_for_shipping") {
    return "Add the required variant weight for your per-kg shipping zones to show this product to shoppers.";
  }
  if (item?.placement?.supplier_out_of_stock) {
    return "This product is hidden because the supplier is marked out of stock.";
  }
  if (item?.is_unavailable_for_listing) {
    return "No sellable variants yet. Add stock, disable inventory tracking, or enable continue selling when out of stock.";
  }
  return "Hidden from shoppers";
}

function ChevronRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2.8 12s3.4-6.2 9.2-6.2S21.2 12 21.2 12s-3.4 6.2-9.2 6.2S2.8 12 2.8 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function WarningIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 4 21 20H3L12 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function ListingInfoPill({
  label,
  message,
  toneClassName,
  iconClassName = "",
}: {
  label: string;
  message: string;
  toneClassName: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${toneClassName}`}
        aria-label={label}
      >
        <WarningIcon className={iconClassName || "h-3.5 w-3.5"} />
        <PopoverHintTrigger active={open} className="gap-1 border-b-0 pb-0 text-[10px] font-semibold text-inherit">
          <span>{label}</span>
        </PopoverHintTrigger>
      </button>
      {open ? (
        <PlatformPopover className="left-0 right-auto top-7 z-20 mt-2 w-[min(320px,calc(100vw-64px))]">
          <p className="text-[14px] font-semibold text-[#202020]">{label}</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-[#57636c]">{message}</p>
        </PlatformPopover>
      ) : null}
    </span>
  );
}

function isRowEditIgnored(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, a, input, textarea, select, label, [data-ignore-row-edit="true"]'));
}

export function SellerProductsWorkspace({
  vendorName,
  sellerCode = "",
  sellerSlug = "",
  onCreateProduct,
  onEditProduct,
  onOpenSettings,
}: SellerProductsWorkspaceProps) {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [weightBasedShippingRequired, setWeightBasedShippingRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rejectionModalItem, setRejectionModalItem] = useState<ProductItem | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<{
    total: number;
    completed: number;
    current: string | null;
  } | null>(null);
  const deleteAbortRef = useRef<AbortController | null>(null);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);

  const isAbortError = (cause: unknown) =>
    (cause instanceof DOMException && cause.name === "AbortError") ||
    (typeof cause === "object" &&
      cause !== null &&
      "name" in cause &&
      cause.name === "AbortError");

  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "all",
        includeUnavailable: "true",
      });
      if (sellerCode.trim()) params.set("sellerCode", sellerCode.trim());
      else if (sellerSlug.trim()) params.set("sellerSlug", sellerSlug.trim());
      else if (vendorName.trim()) params.set("vendorName", vendorName.trim());

      const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
        signal,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      setItems(
        (rows as ProductItem[]).filter(
          (item) => normalizeStatus(item?.data) !== "archived",
        ),
      );
    } catch (cause) {
      if (!isAbortError(cause)) {
        console.error("seller products load failed:", cause);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [sellerCode, sellerSlug, vendorName]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  useEffect(() => {
    let mounted = true;
    if (!sellerSlug) {
      setWeightBasedShippingRequired(false);
      return;
    }
    fetch(`/api/client/v1/accounts/seller/settings/get?sellerSlug=${encodeURIComponent(sellerSlug)}`, {
      cache: "no-store",
    })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (!mounted) return;
        const settings =
          payload?.shippingSettings && typeof payload.shippingSettings === "object" ? payload.shippingSettings : {};
        setWeightBasedShippingRequired(sellerHasWeightBasedShipping(settings));
      })
      .catch(() => {
        if (mounted) {
          setWeightBasedShippingRequired(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [sellerSlug]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const status = normalizeStatus(item.data);
      const shownStatus = displayStatus(item.data);
      if (statusFilter !== "all") {
        if (statusFilter === "live") {
          if (shownStatus !== "live") return false;
        } else if (status !== statusFilter) {
          return false;
        }
      }
      if (!needle) return true;

      const title = String(item?.data?.product?.title ?? "").toLowerCase();
      const brand = String(item?.data?.grouping?.brand ?? "").toLowerCase();
      const category = String(item?.data?.grouping?.category ?? "").toLowerCase();
      return title.includes(needle) || brand.includes(needle) || category.includes(needle);
    });
  }, [items, query, statusFilter]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  useEffect(() => {
    setExpandedIds((current) => current.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  useOutsideDismiss(bulkMenuOpen, () => setBulkMenuOpen(false), { refs: [bulkMenuRef] });

  useEffect(() => {
    if (!bulkNotice) return undefined;
    const timeoutId = window.setTimeout(() => setBulkNotice(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [bulkNotice]);

  const stats = useMemo(() => {
    const totals = {
      all: items.length,
      live: 0,
      review: 0,
      awaiting_stock: 0,
      draft: 0,
      rejected: 0,
      blocked: 0,
      variants: 0,
    };
    for (const item of items) {
      const status = displayStatus(item.data) === "live" ? "live" : normalizeStatus(item.data);
      totals[status as keyof typeof totals] += 1;
      totals.variants += Array.isArray(item.data?.variants) ? item.data.variants.length : 0;
    }
    return totals;
  }, [items]);

  const selectedCount = selectedIds.length;
  const activeRowCount = rows.length;
  const hiddenByWeightShippingCount = useMemo(
    () => items.filter((item) => item?.data?.listing_block_reason_code === "missing_variant_weight_for_shipping").length,
    [items],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  );
  const selectedStatuses = useMemo(
    () => selectedRows.map((row) => normalizeStatus(row.data)),
    [selectedRows],
  );
  const canBulkPublish = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedStatuses.every((status) => status === "draft" || status === "rejected"),
    [selectedRows.length, selectedStatuses],
  );
  const canBulkDraft = useMemo(
    () =>
      selectedRows.length > 0 &&
      selectedStatuses.some((status) => status !== "draft"),
    [selectedRows.length, selectedStatuses],
  );

  function getPublishBlockingReasons(item: ProductItem) {
    const reasons: string[] = [];
    const product = item.data?.product ?? {};
    const variants = Array.isArray(item.data?.variants) ? item.data.variants : [];
    const fulfillmentMode = String(item.data?.fulfillment?.mode ?? "seller").toLowerCase();

    if (!String(product.title ?? "").trim()) reasons.push("Title");
    if (!String(product.unique_id ?? "").trim()) reasons.push("Product code");
    if (!String(product.sku ?? "").trim()) reasons.push("SKU");
    if (!String(item.data?.grouping?.category ?? "").trim()) reasons.push("Category");
    if (!String(item.data?.grouping?.subCategory ?? "").trim()) reasons.push("Sub category");
    if (!String(item.data?.grouping?.brand ?? "").trim()) reasons.push("Brand");
    if (!String(product.overview ?? "").trim()) reasons.push("Overview");
    if (!String(product.description ?? "").trim()) reasons.push("Description");
    if (!Array.isArray(product.keywords) || product.keywords.length === 0) reasons.push("Keywords");
    if (!Array.isArray(item.data?.media?.images) || item.data.media.images.filter((image) => Boolean(image?.imageUrl)).length === 0) {
      reasons.push("Images");
    }
    if (variants.length === 0) reasons.push("At least one variant");
    if (fulfillmentMode === "seller") {
      if (weightBasedShippingRequired && collectProductWeightRequirementIssues(item.data).includes("Variant weight")) reasons.push("Variant weight");
    }
    return reasons;
  }

  function getSelectedPublishBlockingReasons() {
    const results = selectedRows.map((item) => ({
      id: item.id,
      title: String(item.data?.product?.title ?? "Untitled product"),
      reasons: getPublishBlockingReasons(item),
    }));
    return results.filter((item) => item.reasons.length > 0);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  }

  function openProductEditor(productId?: string | null) {
    const id = String(productId ?? "").trim();
    if (!id) return;
    onEditProduct(id);
  }

  async function applyBulkStatus(nextStatus: "draft" | "active") {
    if (!selectedIds.length) return;
    if (nextStatus === "active") {
      const blocked = getSelectedPublishBlockingReasons();
      if (blocked.length) {
        const summary = blocked
          .map((item) => `${item.title}: ${item.reasons.join(", ")}`)
          .join(" | ");
        setBulkMessage(`Some selected products are missing required details before publishing. ${summary}`);
        setBulkMenuOpen(false);
        return;
      }
    }

    setBulkBusy(true);
    setBulkMessage(null);
    setBulkNotice({
      tone: "info",
      message:
        nextStatus === "active"
          ? `Submitting ${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"} for review...`
          : `Moving ${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"} to draft...`,
    });
    try {
      const results = await Promise.allSettled(
        selectedIds.map((productId) =>
          fetch("/api/catalogue/v1/products/product/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unique_id: productId,
              data: {
                placement: { isActive: nextStatus === "active" },
                moderation: {
                  status: nextStatus === "active" ? "in_review" : "draft",
                  reason: null,
                  notes: null,
                  reviewedAt: null,
                  reviewedBy: null,
                },
              },
            }),
          }).then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
              throw new Error(payload?.message || "Unable to update product status.");
            }
          }),
        ),
      );

      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) {
        throw new Error("One or more products could not be updated.");
      }

      setSelectedIds([]);
      setBulkMenuOpen(false);
      setBulkMessage(
        nextStatus === "active"
          ? `Submitted ${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"} for review.`
          : `Moved ${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"} to draft.`,
      );
      setBulkNotice({
        tone: "success",
        message:
          nextStatus === "active"
            ? `Submitted ${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"} for review.`
            : `Moved ${selectedIds.length} product${selectedIds.length === 1 ? "" : "s"} to draft.`,
      });
      await loadProducts();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to update selected products.";
      setBulkMessage(message);
      setBulkNotice({ tone: "error", message });
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelectedProducts() {
    if (!selectedIds.length) return;
    setShowDeleteConfirm(false);
    setBulkMenuOpen(false);
    setDeleteProgress({
      total: selectedIds.length,
      completed: 0,
      current: null,
    });
    setBulkMessage(null);
    const controller = new AbortController();
    deleteAbortRef.current = controller;
    let completed = 0;

    try {
      for (const productId of selectedIds) {
        if (controller.signal.aborted) break;
        const current = rows.find((row) => row.id === productId)?.data?.product?.title ?? productId;
        setDeleteProgress((state) => ({ total: state?.total ?? selectedIds.length, completed, current }));

        const response = await fetch("/api/catalogue/v1/products/product/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unique_id: productId }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || `Unable to delete ${current}.`);
        }
        completed += 1;
        setDeleteProgress({ total: selectedIds.length, completed, current });
      }

      setSelectedIds([]);
      setDeleteProgress((state) => (state ? { ...state, current: null } : state));
      setBulkMessage(controller.signal.aborted ? "Delete aborted." : `Deleted ${completed} product${completed === 1 ? "" : "s"}.`);
      await loadProducts();
    } catch (cause) {
      if (controller.signal.aborted) {
        setBulkMessage(`Delete aborted after ${completed} deleted.`);
      } else {
        setBulkMessage(cause instanceof Error ? cause.message : "Unable to delete selected products.");
      }
    } finally {
      deleteAbortRef.current = null;
      setDeleteProgress(null);
    }
  }

  function abortBulkDelete() {
    deleteAbortRef.current?.abort();
  }

  const renderLoadingSkeleton = () => (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-[8px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(20,24,27,0.05)] lg:flex-row lg:items-center lg:justify-between">
        <div className="h-4 w-36 animate-pulse rounded-[8px] bg-black/5" />
        <div className="h-9 w-28 animate-pulse rounded-[8px] bg-black/5" />
      </section>

      <section className="rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="flex flex-col gap-3 border-b border-black/5 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-8 w-20 animate-pulse rounded-full bg-black/5" />
            ))}
          </div>
          <div className="h-9 w-[220px] animate-pulse rounded-[8px] bg-black/5" />
        </div>

        <div className="hidden divide-y divide-black/5 md:block">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid min-w-full grid-cols-[90px_minmax(0,2.2fr)_160px_140px_150px_120px_90px] gap-3 px-3 py-3">
              {Array.from({ length: 7 }).map((__, cellIndex) => (
                <div key={cellIndex} className="h-10 animate-pulse rounded-[8px] bg-black/5" />
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-[8px] border border-black/5 p-4">
              <div className="h-5 w-40 animate-pulse rounded-[8px] bg-black/5" />
              <div className="h-4 w-24 animate-pulse rounded-[8px] bg-black/5" />
              <div className="h-4 w-full animate-pulse rounded-[8px] bg-black/5" />
              <div className="h-9 w-28 animate-pulse rounded-[8px] bg-black/5" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      <AppSnackbar notice={bulkNotice} />
      <section className="flex flex-col gap-3 rounded-[8px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(20,24,27,0.05)] lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[12px] text-[#57636c]">
          {activeRowCount} product{activeRowCount === 1 ? "" : "s"} visible
        </p>
        <button
          type="button"
          onClick={onCreateProduct}
          className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white"
        >
          Add product
        </button>
      </section>

      {hiddenByWeightShippingCount > 0 ? (
        <section className="rounded-[8px] border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] px-4 py-4 text-[13px] text-[#202020]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b45309]">Variant weights required</p>
              <p className="mt-1 leading-[1.6] text-[#57636c]">
                {hiddenByWeightShippingCount} product{hiddenByWeightShippingCount === 1 ? " is" : "s are"} hidden from the storefront because your per-kg shipping zones need variant weights and there is no local-delivery fallback for those listings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className="inline-flex min-h-9 items-center justify-center rounded-[8px] bg-[#202020] px-4 py-2 text-[12px] font-semibold text-white"
            >
              Shipping settings
            </button>
          </div>
        </section>
      ) : null}

      {selectedIds.length > 0 ? (
        <section className="rounded-[8px] border border-black/5 bg-[rgba(203,178,107,0.08)] px-4 py-3 text-[13px] text-[#202020]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">
              {selectedCount} product{selectedCount === 1 ? "" : "s"} selected
            </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCount === 1) onEditProduct(selectedIds[0]);
                }}
                disabled={selectedCount !== 1}
                className="inline-flex h-8 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                    Edit selected
                  </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={bulkBusy || deleteProgress !== null}
                  className="inline-flex h-8 items-center rounded-[8px] border border-[#b91c1c]/20 bg-white px-3 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete selected
                </button>
                <div ref={bulkMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setBulkMenuOpen((current) => !current)}
                    disabled={bulkBusy || deleteProgress !== null}
                    className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-haspopup="menu"
                  aria-expanded={bulkMenuOpen}
                >
                  {bulkBusy ? "Working..." : "Bulk actions"}
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
                {bulkMenuOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-[8px] border border-black/10 bg-white p-1 shadow-[0_16px_36px_rgba(20,24,27,0.12)]">
                    {canBulkPublish ? (
                      <button
                        type="button"
                        onClick={() => void applyBulkStatus("active")}
                        disabled={bulkBusy || deleteProgress !== null}
                        className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5] disabled:opacity-60"
                      >
                        Submit selected for review
                      </button>
                    ) : null}
                    {canBulkDraft ? (
                      <button
                        type="button"
                        onClick={() => void applyBulkStatus("draft")}
                        disabled={bulkBusy || deleteProgress !== null}
                        className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5] disabled:opacity-60"
                      >
                        Set as draft
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds([]);
                        setBulkMenuOpen(false);
                      }}
                      className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#b91c1c] hover:bg-[#fff4f4]"
                    >
                      Clear selection
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Clear
              </button>
            </div>
          </div>
          {bulkMessage ? (
            <p className="mt-2 text-[12px] text-[#57636c]">{bulkMessage}</p>
          ) : null}
        </section>
      ) : null}

      <ConfirmModal
        open={showDeleteConfirm}
        eyebrow="Delete selected"
        title={`Delete ${selectedCount} product${selectedCount === 1 ? "" : "s"}?`}
        description="This removes the selected products permanently. If the delete is already running, you can abort it below."
        confirmLabel="Delete selected"
        busy={!selectedIds.length || deleteProgress !== null}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => void deleteSelectedProducts()}
      />

      <ConfirmModal
        open={Boolean(rejectionModalItem)}
        eyebrow="Review feedback"
        title={String(rejectionModalItem?.data?.product?.title || "Rejected product")}
        description={
          String(rejectionModalItem?.data?.moderation?.reason || rejectionModalItem?.data?.moderation?.notes || "").trim() ||
          "Piessang rejected this product and left feedback that needs to be fixed before resubmitting."
        }
        cancelLabel="Dismiss"
        confirmLabel="Close"
        onClose={() => setRejectionModalItem(null)}
        onConfirm={() => setRejectionModalItem(null)}
      />

      <section className="rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="flex flex-col gap-3 border-b border-black/5 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "live", "review", "awaiting_stock", "draft", "rejected", "blocked"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold capitalize transition-colors ${
                  statusFilter === status
                    ? "bg-[rgba(203,178,107,0.16)] text-[#907d4c]"
                    : "bg-[#f4f4f4] text-[#57636c] hover:bg-[#ececec]"
                }`}
                >
                  {statusLabel(status)}
                <span className="ml-2 text-[11px] font-medium tabular-nums opacity-70">
                  {status === "all"
                    ? stats.all
                    : status === "live"
                      ? stats.live
                      : status === "review"
                        ? stats.review
                        : status === "awaiting_stock"
                          ? stats.awaiting_stock
                        : status === "draft"
                          ? stats.draft
                          : status === "rejected"
                            ? stats.rejected
                            : stats.blocked}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3">
              <span className="text-[12px] text-[#8b94a3]">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products"
                className="ml-2 w-[220px] bg-transparent text-[12px] outline-none placeholder:text-[#8b94a3]"
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden">
          {loading ? renderLoadingSkeleton() : rows.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-[14px] font-semibold text-[#202020]">No products found</p>
              <p className="mt-2 text-[13px] text-[#57636c]">
                {query || statusFilter !== "all"
                  ? "Try a different search or clear the filter."
                  : "Start by adding your first product."}
              </p>
              <button
                type="button"
                onClick={onCreateProduct}
                className="mt-4 inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white"
              >
                Create product
              </button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="bg-[#fafafa]">
                    <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-[#7d7d7d]">
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold">Select</th>
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold">Product</th>
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold">Status</th>
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold">Inventory</th>
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold">Category</th>
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold">Variants</th>
                      <th className="border-b border-black/5 px-3 py-2.5 font-semibold text-center">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => {
                      const product = item.data?.product || {};
                      const grouping = item.data?.grouping || {};
                      const status = normalizeStatus(item.data);
                      const rowStatus = displayStatus(item.data);
                      const images = item.data?.media?.images || [];
                      const image = images[0];
                      const variants = Array.isArray(item.data?.variants) ? item.data.variants : [];
                      const totalVariants = variants.length;
                      const inStockVariants = variants.filter((variant) => Number(variant?.total_in_stock_items_available ?? 0) > 0).length;
                      const expanded = expandedIds.includes(item.id);
                      const sellerOfferCount = Math.max(Number(item.data?.seller_offer_count || 1), 1);
                      const canonicalBarcode = String(item.data?.canonical_offer_barcode || "").trim();

                    return (
                      <Fragment key={item.id}>
                          <tr
                            className={`text-[12px] text-[#202020] ${
                              selectedIds.includes(item.id) ? "bg-[rgba(203,178,107,0.06)]" : ""
                            }`}
                          >
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle">
                              <input
                                type="checkbox"
                                data-ignore-row-edit="true"
                                checked={selectedIds.includes(item.id)}
                                onChange={(event) =>
                                  setSelectedIds((current) =>
                                    event.target.checked
                                      ? [...current, item.id]
                                      : current.filter((id) => id !== item.id),
                                  )
                                }
                                className="h-4 w-4 rounded border-black/20 text-[#907d4c] focus:ring-[#cbb26b]"
                              />
                            </td>
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  data-ignore-row-edit="true"
                                  onClick={() => toggleExpanded(item.id)}
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#57636c] transition-colors hover:border-[#cbb26b]/60 hover:text-[#202020]"
                                  aria-label={expanded ? "Collapse variants" : "Expand variants"}
                                >
                                  {expanded ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                                </button>
                                <BlurhashImage
                                  src={image?.imageUrl ?? null}
                                  blurHash={image?.blurHashUrl ?? null}
                                  alt={image?.altText || product.title || "Product image"}
                                  sizes="48px"
                                  className="h-10 w-10 rounded-[8px] border border-black/5 bg-[#f4f4f4]"
                                  imageClassName="object-cover"
                                />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    data-ignore-row-edit="true"
                                    onClick={() => openProductEditor(item.data?.product?.unique_id || item.id)}
                                    className="truncate text-left font-semibold text-[#202020] hover:underline"
                                  >
                                    {product.title || "Untitled product"}
                                  </button>
                                  {item.data?.listing_block_reason_code === "missing_delivery_settings" ? (
                                    <div className="mt-1">
                                      <ListingInfoPill
                                        label="Hidden from storefront"
                                        message={item.data?.listing_block_reason_message || "This seller-fulfilled product is hidden until shipping settings are completed."}
                                        toneClassName="bg-[rgba(185,28,28,0.08)] text-[#b91c1c]"
                                      />
                                    </div>
                                  ) : null}
                                  {item.data?.listing_block_reason_code === "missing_variant_weight_for_shipping" ? (
                                    <div className="mt-1">
                                      <ListingInfoPill
                                        label="Weight required"
                                        message={item.data?.listing_block_reason_message || "This listing is hidden until every variant has a weight required by your per-kg shipping zones."}
                                        toneClassName="bg-[rgba(245,158,11,0.12)] text-[#b45309]"
                                      />
                                    </div>
                                  ) : null}
                                  <p className="mt-0.5 truncate text-[11px] text-[#7d7d7d]">
                                    {product.brandTitle || grouping.brand || "Brand not set"} • {product.vendorName || "Piessang"}
                                  </p>
                                  {sellerOfferCount > 1 || canonicalBarcode ? (
                                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-[#8f7531]">
                                      {sellerOfferCount > 1 ? (
                                        <span className="inline-flex rounded-full bg-[rgba(203,178,107,0.14)] px-2 py-0.5">
                                          Same product sold by {sellerOfferCount} sellers
                                        </span>
                                      ) : null}
                                      {canonicalBarcode ? <span>Barcode {canonicalBarcode}</span> : null}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle">
                              {status === "rejected" ? (
                                <button
                                  type="button"
                                  data-ignore-row-edit="true"
                                  onClick={() => setRejectionModalItem(item)}
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone(rowStatus)} transition-opacity hover:opacity-80`}
                                  title="View rejection feedback"
                                >
                                  {statusLabel(rowStatus)}
                                </button>
                              ) : (
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone(rowStatus)}`}>
                                  {statusLabel(rowStatus)}
                                </span>
                              )}
                            </td>
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle text-[12px] text-[#57636c]">
                              {item.data?.is_unavailable_for_listing ? (
                                <span className="font-semibold text-[#b45309]">
                                  {getListingVisibilityMessage(item.data)}
                                </span>
                              ) : item.data?.placement?.supplier_out_of_stock ? (
                                <span className="font-semibold text-[#b91c1c]">Supplier out of stock</span>
                              ) : inStockVariants > 0 ? (
                                <span className="font-semibold text-[#166534]">{inStockVariants} variants in stock</span>
                              ) : (
                                "Inventory not tracked"
                              )}
                            </td>
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle">
                              <p className="font-medium capitalize text-[#202020]">{grouping.category?.replace(/-/g, " ") || "Uncategorised"}</p>
                              <p className="mt-0.5 text-[11px] capitalize text-[#7d7d7d]">
                                {grouping.subCategory?.replace(/-/g, " ") || "No subcategory"}
                              </p>
                            </td>
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle text-[12px] text-[#57636c]">
                              <span className="font-semibold text-[#202020]">{totalVariants}</span> total
                            </td>
                            <td className="border-b border-black/5 px-3 py-2.5 align-middle">
                              <div className="flex justify-center">
                                <ProductLink
                                  href={`/products/${toSlug(product.title || product.unique_id || "product")}?id=${product.unique_id || item.id}`}
                                  data-ignore-row-edit="true"
                                  className="group inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#57636c] transition-colors hover:border-[#cbb26b]/60 hover:text-[#202020]"
                                  title="Preview product"
                                  aria-label="Preview product"
                                >
                                  <EyeIcon className="h-4 w-4" />
                                </ProductLink>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr>
                              <td className="border-b border-black/5 bg-[#fafafa] px-3 py-3" colSpan={7}>
                                <div className="rounded-[8px] border border-black/5 bg-white p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Variants</p>
                                    <button
                                      type="button"
                                      data-ignore-row-edit="true"
                                      onClick={() => openProductEditor(item.data?.product?.unique_id || item.id)}
                                      className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                                    >
                                      Edit product
                                    </button>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    {variants.length ? (
                                      variants.map((variant, variantIndex) => (
                                        <div
                                          key={`${variant.variant_id ?? variantIndex}`}
                                          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2"
                                        >
                                          <div>
                                            <p className="text-[12px] font-semibold text-[#202020]">{variant.label || "Untitled variant"}</p>
                                            <p className="mt-0.5 text-[11px] text-[#57636c]">
                                              {variant.variant_id ? `Code ${variant.variant_id}` : "No code"}
                                              {variant.sku ? ` • SKU ${variant.sku}` : ""}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2 text-[11px]">
                                            {variant.placement?.isActive === false ? (
                                              <span className="rounded-full bg-[rgba(148,163,184,0.14)] px-2.5 py-1 font-semibold text-[#475569]">
                                                Draft
                                              </span>
                                            ) : (
                                              <span className="rounded-full bg-[rgba(57,169,107,0.12)] px-2.5 py-1 font-semibold text-[#166534]">
                                                Active
                                              </span>
                                            )}
                                            {variant.placement?.is_default ? (
                                              <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 font-semibold text-[#907d4c]">
                                                Default
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-3 py-3 text-[12px] text-[#57636c]">
                                        No variants added yet.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                      </Fragment>
                    );
                  })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-3 md:hidden">
                {rows.map((item) => {
                  const product = item.data?.product || {};
                  const grouping = item.data?.grouping || {};
                  const status = normalizeStatus(item.data);
                  const rowStatus = displayStatus(item.data);
                  const images = item.data?.media?.images || [];
                  const image = images[0];
                  const variants = Array.isArray(item.data?.variants) ? item.data.variants : [];
                  const totalVariants = variants.length;
                  const expanded = expandedIds.includes(item.id);
                  const sellerOfferCount = Math.max(Number(item.data?.seller_offer_count || 1), 1);
                  const canonicalBarcode = String(item.data?.canonical_offer_barcode || "").trim();

                  return (
                    <article
                      key={item.id}
                      className={`rounded-[8px] border border-black/5 bg-white p-3 shadow-[0_8px_24px_rgba(20,24,27,0.04)] ${
                        selectedIds.includes(item.id) ? "ring-2 ring-[rgba(203,178,107,0.4)]" : ""
                      } outline-none`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          data-ignore-row-edit="true"
                          checked={selectedIds.includes(item.id)}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                          className="mt-1.5 h-4 w-4 rounded border-black/20 text-[#907d4c] focus:ring-[#cbb26b]"
                        />
                        <button
                          type="button"
                          data-ignore-row-edit="true"
                          onClick={() => toggleExpanded(item.id)}
                          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] border border-black/5 bg-white"
                          aria-label={expanded ? "Collapse variants" : "Expand variants"}
                        >
                          <BlurhashImage
                            src={image?.imageUrl ?? null}
                            blurHash={image?.blurHashUrl ?? null}
                            alt={image?.altText || product.title || "Product image"}
                            sizes="56px"
                            className="h-14 w-14 rounded-[8px] bg-[#f4f4f4]"
                            imageClassName="object-cover"
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                data-ignore-row-edit="true"
                                onClick={() => openProductEditor(item.data?.product?.unique_id || item.id)}
                                className="truncate text-left text-[13px] font-semibold text-[#202020] hover:underline"
                              >
                                {product.title || "Untitled product"}
                              </button>
                              {item.data?.listing_block_reason_code === "missing_delivery_settings" ? (
                                <div className="mt-1">
                                  <ListingInfoPill
                                    label="Hidden from storefront"
                                    message={item.data?.listing_block_reason_message || "This seller-fulfilled product is hidden until shipping settings are completed."}
                                    toneClassName="bg-[rgba(185,28,28,0.08)] text-[#b91c1c]"
                                  />
                                </div>
                              ) : null}
                              {item.data?.listing_block_reason_code === "missing_variant_weight_for_shipping" ? (
                                <div className="mt-1">
                                  <ListingInfoPill
                                    label="Weight required"
                                    message={item.data?.listing_block_reason_message || "This listing is hidden until every variant has a weight required by your per-kg shipping zones."}
                                    toneClassName="bg-[rgba(245,158,11,0.12)] text-[#b45309]"
                                  />
                                </div>
                              ) : null}
                              <p className="mt-0.5 truncate text-[11px] text-[#7d7d7d]">
                                {product.brandTitle || grouping.brand || "Brand not set"}
                              </p>
                              {sellerOfferCount > 1 || canonicalBarcode ? (
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-[#8f7531]">
                                  {sellerOfferCount > 1 ? (
                                    <span className="inline-flex rounded-full bg-[rgba(203,178,107,0.14)] px-2 py-0.5">
                                      {sellerOfferCount} sellers on this barcode
                                    </span>
                                  ) : null}
                                  {canonicalBarcode ? <span>Barcode {canonicalBarcode}</span> : null}
                                </p>
                              ) : null}
                            </div>
                            <ProductLink
                              href={`/products/${toSlug(product.title || product.unique_id || "product")}?id=${product.unique_id || item.id}`}
                              data-ignore-row-edit="true"
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#57636c]"
                              title="Preview product"
                              aria-label="Preview product"
                            >
                              <EyeIcon className="h-4 w-4" />
                            </ProductLink>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {status === "rejected" ? (
                              <button
                                type="button"
                                data-ignore-row-edit="true"
                                onClick={() => setRejectionModalItem(item)}
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone(rowStatus)} transition-opacity hover:opacity-80`}
                              >
                                {statusLabel(rowStatus)}
                              </button>
                            ) : (
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone(rowStatus)}`}>
                                {statusLabel(rowStatus)}
                              </span>
                            )}
                            <span className="text-[11px] text-[#57636c]">{totalVariants} variants</span>
                          </div>
                          {item.data?.is_unavailable_for_listing ? (
                            <p className="mt-2 text-[11px] font-medium text-[#b45309]">
                              {getListingVisibilityMessage(item.data)}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              data-ignore-row-edit="true"
                              onClick={() => openProductEditor(item.data?.product?.unique_id || item.id)}
                              className="inline-flex h-8 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              data-ignore-row-edit="true"
                              onClick={() => toggleExpanded(item.id)}
                              className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                            >
                              {expanded ? "Hide variants" : "Show variants"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {expanded ? (
                        <div className="mt-3 rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Variants</p>
                          <div className="mt-2 space-y-2">
                            {variants.length ? (
                              variants.map((variant, variantIndex) => (
                                <div
                                  key={`${variant.variant_id ?? variantIndex}`}
                                  className="rounded-[8px] border border-black/5 bg-white px-3 py-2 text-[11px]"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold text-[#202020]">{variant.label || "Untitled variant"}</p>
                                    <span className="text-[#7d7d7d]">{variant.sku || "No SKU"}</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c]">
                                No variants added yet.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {deleteProgress ? (
        <div className="fixed bottom-4 left-1/2 z-[75] w-[min(92vw,520px)] -translate-x-1/2 rounded-[8px] border border-black/5 bg-white px-4 py-3 shadow-[0_18px_44px_rgba(20,24,27,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Deleting products</p>
              <p className="mt-1 text-[13px] font-medium text-[#202020]">
                {deleteProgress.completed} of {deleteProgress.total} deleted
                {deleteProgress.current ? ` • ${deleteProgress.current}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={abortBulkDelete}
              className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#b91c1c]"
            >
              Abort
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
