"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SellerCatalogueEditor } from "@/app/seller/catalogue/new/page";
import { ContentsquareReplayCaptureModal } from "@/components/seller/contentsquare-replay-capture-modal";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { formatMoneyExact } from "@/lib/money";

type ReviewProduct = {
  id: string;
  data: {
    product?: {
      title?: string | null;
      brandTitle?: string | null;
      vendorName?: string | null;
      overview?: string | null;
      description?: string | null;
    };
    grouping?: {
      category?: string | null;
      subCategory?: string | null;
    };
    fulfillment?: {
      mode?: string | null;
    };
    moderation?: {
      status?: string | null;
      notes?: string | null;
      reason?: string | null;
    };
    seller_offer_count?: number;
    canonical_offer_barcode?: string | null;
    live_snapshot?: ReviewProduct["data"] | null;
    media?: {
      images?: Array<{ imageUrl?: string | null }>;
    };
    variants?: Array<{
      variant_id?: string;
      label?: string | null;
      inventory?: Array<{ in_stock_qty?: number | string | null }>;
      media?: { images?: Array<{ imageUrl?: string | null }> };
      pricing?: { selling_price_incl?: number | string | null };
      sale?: {
        is_on_sale?: boolean | null;
        discount_percent?: number | string | null;
        sale_price_incl?: number | string | null;
      };
    }>;
  };
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeTextValue(value: unknown) {
  return toStr(value).replace(/\s+/g, " ").trim();
}

function valuesDiffer(left: unknown, right: unknown) {
  return normalizeTextValue(left) !== normalizeTextValue(right);
}

function imageCount(data: ReviewProduct["data"] | null | undefined) {
  return Array.isArray(data?.media?.images) ? data.media.images.filter((entry) => Boolean(entry?.imageUrl)).length : 0;
}

function variantCount(data: ReviewProduct["data"] | null | undefined) {
  return Array.isArray(data?.variants) ? data.variants.length : 0;
}

function summarizeVariantLabels(data: ReviewProduct["data"] | null | undefined) {
  if (!Array.isArray(data?.variants)) return "";
  return data.variants.map((variant) => toStr(variant?.label || variant?.variant_id || "")).filter(Boolean).join(", ");
}

function variantInventoryTotal(variant: { inventory?: Array<{ in_stock_qty?: number | string | null }> } | null | undefined) {
  if (!Array.isArray(variant?.inventory)) return 0;
  return variant.inventory.reduce((sum, row) => sum + (Number(row?.in_stock_qty || 0) || 0), 0);
}

function formatCurrency(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Not set";
  return formatMoneyExact(amount, { space: true });
}

function summarizeVariantDetails(data: ReviewProduct["data"] | null | undefined) {
  if (!Array.isArray(data?.variants) || !data.variants.length) return "No variants";
  return data.variants
    .map((variant) => {
      const label = toStr(variant?.label || variant?.variant_id || "Variant");
      const price = formatCurrency(variant?.pricing?.selling_price_incl);
      const saleOn = Boolean(variant?.sale?.is_on_sale) && Number(variant?.sale?.discount_percent || 0) > 0;
      const salePart = saleOn
        ? `Sale ${Number(variant?.sale?.discount_percent || 0).toFixed(0)}% to ${formatCurrency(variant?.sale?.sale_price_incl)}`
        : "No sale";
      const stockPart = `${variantInventoryTotal(variant)} in stock`;
      const imagePart = `${Array.isArray(variant?.media?.images) ? variant.media.images.filter((entry) => Boolean(entry?.imageUrl)).length : 0} images`;
      return `${label} • ${price} • ${salePart} • ${stockPart} • ${imagePart}`;
    })
    .join("\n");
}

function buildReviewDiffRows(product: ReviewProduct) {
  const live = product?.data?.live_snapshot || null;
  if (!live) return [];

  const pending = product?.data || {};
  const rows = [
    {
      label: "Title",
      liveValue: toStr(live?.product?.title, "Not set"),
      pendingValue: toStr(pending?.product?.title, "Not set"),
    },
    {
      label: "Brand",
      liveValue: toStr(live?.product?.brandTitle || "", "Not set"),
      pendingValue: toStr(pending?.product?.brandTitle || "", "Not set"),
    },
    {
      label: "Vendor",
      liveValue: toStr(live?.product?.vendorName || "", "Not set"),
      pendingValue: toStr(pending?.product?.vendorName || "", "Not set"),
    },
    {
      label: "Category",
      liveValue: toStr(live?.grouping?.category || "", "Not set"),
      pendingValue: toStr(pending?.grouping?.category || "", "Not set"),
    },
    {
      label: "Sub category",
      liveValue: toStr(live?.grouping?.subCategory || "", "Not set"),
      pendingValue: toStr(pending?.grouping?.subCategory || "", "Not set"),
    },
    {
      label: "Fulfilment",
      liveValue: toStr(live?.fulfillment?.mode || "", "Not set"),
      pendingValue: toStr(pending?.fulfillment?.mode || "", "Not set"),
    },
    {
      label: "Images",
      liveValue: String(imageCount(live)),
      pendingValue: String(imageCount(pending)),
    },
    {
      label: "Variants",
      liveValue: `${variantCount(live)}${summarizeVariantLabels(live) ? ` • ${summarizeVariantLabels(live)}` : ""}`,
      pendingValue: `${variantCount(pending)}${summarizeVariantLabels(pending) ? ` • ${summarizeVariantLabels(pending)}` : ""}`,
    },
    {
      label: "Variant details",
      liveValue: summarizeVariantDetails(live),
      pendingValue: summarizeVariantDetails(pending),
    },
    {
      label: "Overview",
      liveValue: toStr(live?.product?.overview || "", "Not set"),
      pendingValue: toStr(pending?.product?.overview || "", "Not set"),
    },
    {
      label: "Description",
      liveValue: toStr(live?.product?.description || "", "Not set"),
      pendingValue: toStr(pending?.product?.description || "", "Not set"),
    },
  ];

  return rows.filter((row) => valuesDiffer(row.liveValue, row.pendingValue));
}

const REJECTION_PRESETS = [
  {
    code: "images",
    label: "Images need work",
    message: "Please update the product images. Make sure the images are clear, relevant to the listing, and show the product properly before resubmitting for review.",
  },
  {
    code: "title",
    label: "Title or branding issue",
    message: "Please correct the product title and brand details so the listing clearly identifies the product and matches the brand shown on the item before resubmitting.",
  },
  {
    code: "description",
    label: "Description incomplete",
    message: "Please improve the product overview, description, or keywords so customers can understand exactly what is being sold before resubmitting for review.",
  },
  {
    code: "category",
    label: "Wrong category",
    message: "Please move this product into the correct category and subcategory before resubmitting it for review.",
  },
  {
    code: "variant",
    label: "Variant data missing",
    message: "Please complete the variant information, including SKU, barcode, pricing, and any required product-specific details before resubmitting for review.",
  },
  {
    code: "fulfillment",
    label: "Fulfilment data incomplete",
    message: "Please complete the fulfilment information for this listing, including the required lead times or Piessang logistics details, before resubmitting for review.",
  },
  {
    code: "policy",
    label: "Restricted or non-compliant",
    message: "This listing does not currently meet marketplace policy requirements. Please update the product so it complies with Piessang listing requirements before resubmitting.",
  },
  {
    code: "other",
    label: "Other issue",
    message: "Please update the listing details and fix the product information called out during review before resubmitting.",
  },
] as const;

type SellerProductReviewsWorkspaceProps = {
  onQueueChanged?: () => void;
};

export function SellerProductReviewsWorkspace({ onQueueChanged }: SellerProductReviewsWorkspaceProps) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ReviewProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [snackbarNotice, setSnackbarNotice] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReviewProduct | null>(null);
  const [rejectIssueCode, setRejectIssueCode] = useState<string>("other");
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [reviewModalProductId, setReviewModalProductId] = useState<string | null>(null);
  const [replayTarget, setReplayTarget] = useState<ReviewProduct | null>(null);

  async function loadItems(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      await fetch("/api/client/v1/admin/products/review-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => null);

      const params = new URLSearchParams({
        limit: "all",
        includeUnavailable: "true",
      });
      const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load product review queue.");
      }
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      setItems(
        rows.filter((item: ReviewProduct) => toStr(item?.data?.moderation?.status).toLowerCase() === "in_review"),
      );
    } catch (cause) {
      if (!silent) {
        setError(cause instanceof Error ? cause.message : "Unable to load product review queue.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busyId && !bulkBusy) {
        void loadItems({ silent: true });
      }
    }, 15000);

    function handleWindowFocus() {
      if (!busyId && !bulkBusy) void loadItems({ silent: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !busyId && !bulkBusy) {
        void loadItems({ silent: true });
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [busyId, bulkBusy]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  useEffect(() => {
    if (!snackbarNotice) return undefined;
    const timeoutId = window.setTimeout(() => setSnackbarNotice(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [snackbarNotice]);

  const pendingCount = items.length;

  async function updateReview(product: ReviewProduct, outcome: "approve" | "reject", rejectionReason = "") {
    const productId = toStr(product?.id);
    if (!productId) return;

    const fulfillmentMode = toStr(product?.data?.fulfillment?.mode, "seller").toLowerCase();
    const isLiveUpdate = Boolean(product?.data?.live_snapshot);
    const approvedStatus = fulfillmentMode === "bevgo" ? "awaiting_stock" : "published";
    const trimmedReason = toStr(rejectionReason);

    setBusyId(productId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/catalogue/v1/products/product/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_id: productId,
          data: {
            placement: {
              isActive: outcome === "approve" && approvedStatus === "published",
            },
            moderation: {
              status: outcome === "approve" ? approvedStatus : "rejected",
              reason: outcome === "approve" ? null : trimmedReason || "Rejected by Piessang during product review.",
              notes:
                outcome === "approve"
                  ? fulfillmentMode === "bevgo"
                    ? isLiveUpdate
                      ? "Approved by Piessang. The product update is approved and now awaiting inbound stock before the changes go live."
                      : "Approved by Piessang. Awaiting inbound stock before going live."
                    : isLiveUpdate
                      ? "Approved by Piessang. The product update has been approved and applied to the live listing."
                      : "Approved by Piessang and published."
                  : trimmedReason || "Rejected by Piessang during product review.",
              reviewedAt: new Date().toISOString(),
              reviewedBy: "system_admin",
            },
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update review outcome.");
      }
      setMessage(
        outcome === "approve"
          ? fulfillmentMode === "bevgo"
            ? isLiveUpdate
              ? "Product update approved. The approved changes are now awaiting stock."
              : "Product approved and moved to awaiting stock."
            : isLiveUpdate
              ? "Product update approved and applied to the live listing."
              : "Product approved and published."
          : isLiveUpdate
            ? "Product update rejected. The current live listing stays visible."
            : "Product rejected.",
      );
      if (outcome === "reject") {
        setRejectTarget(null);
        setRejectIssueCode("other");
        setRejectFeedback("");
      }
      setSelectedIds((current) => current.filter((id) => id !== productId));
      await loadItems();
      onQueueChanged?.();
      window.dispatchEvent(new CustomEvent("piessang:refresh-admin-badges"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update review outcome.");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkApproveSelected() {
    const targets = items.filter((item) => selectedIds.includes(item.id));
    if (!targets.length) return;

    setBulkBusy(true);
    setBusyId(null);
    setError(null);
    setMessage(null);
    setSnackbarNotice({
      tone: "info",
      message: `Approving ${targets.length} product${targets.length === 1 ? "" : "s"}...`,
    });

    try {
      for (const product of targets) {
        const productId = toStr(product?.id);
        if (!productId) continue;

        const fulfillmentMode = toStr(product?.data?.fulfillment?.mode, "seller").toLowerCase();
        const isLiveUpdate = Boolean(product?.data?.live_snapshot);
        const approvedStatus = fulfillmentMode === "bevgo" ? "awaiting_stock" : "published";

        const response = await fetch("/api/catalogue/v1/products/product/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unique_id: productId,
            data: {
              placement: {
                isActive: approvedStatus === "published",
              },
              moderation: {
                status: approvedStatus,
                reason: null,
                notes:
                  fulfillmentMode === "bevgo"
                    ? isLiveUpdate
                      ? "Approved by Piessang. The product update is approved and now awaiting inbound stock before the changes go live."
                      : "Approved by Piessang. Awaiting inbound stock before going live."
                    : isLiveUpdate
                      ? "Approved by Piessang. The product update has been approved and applied to the live listing."
                      : "Approved by Piessang and published.",
                reviewedAt: new Date().toISOString(),
                reviewedBy: "system_admin",
              },
            },
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || `Unable to approve ${toStr(product?.data?.product?.title, "product")}.`);
        }
      }

      setSelectedIds([]);
      setMessage(
        `Approved ${targets.length} product${targets.length === 1 ? "" : "s"} successfully.`,
      );
      setSnackbarNotice({
        tone: "success",
        message: `Approved ${targets.length} product${targets.length === 1 ? "" : "s"}.`,
      });
      await loadItems();
      onQueueChanged?.();
      window.dispatchEvent(new CustomEvent("piessang:refresh-admin-badges"));
    } catch (cause) {
      const nextError = cause instanceof Error ? cause.message : "Unable to approve selected products.";
      setError(nextError);
      setSnackbarNotice({
        tone: "error",
        message: nextError,
      });
    } finally {
      setBulkBusy(false);
    }
  }

  function openReviewProduct(productId: string) {
    const id = toStr(productId);
    if (!id) return;
    setReviewModalProductId(id);
  }

  const reviewSellerSlug = useMemo(() => toStr(searchParams.get("seller")), [searchParams]);

  const cards = useMemo(() => items, [items]);
  const selectedCount = selectedIds.length;
  const allSelected = Boolean(cards.length) && selectedIds.length === cards.length;
  const reviewModalProduct = useMemo(
    () => cards.find((item) => item.id === reviewModalProductId) || null,
    [cards, reviewModalProductId],
  );
  const reviewDiffRows = useMemo(
    () => (reviewModalProduct ? buildReviewDiffRows(reviewModalProduct) : []),
    [reviewModalProduct],
  );

  function renderLoadingSkeleton() {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`review-skeleton-${index}`}
            className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 gap-4">
                <div className="h-20 w-20 rounded-[8px] bg-[#f1f1f1] shimmer" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-5 w-56 rounded bg-[#f1f1f1] shimmer" />
                  <div className="h-4 w-40 rounded bg-[#f1f1f1] shimmer" />
                  <div className="h-4 w-64 rounded bg-[#f1f1f1] shimmer" />
                  <div className="h-4 w-32 rounded bg-[#f1f1f1] shimmer" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-10 w-24 rounded-[8px] bg-[#f1f1f1] shimmer" />
                <div className="h-10 w-32 rounded-[8px] bg-[#f1f1f1] shimmer" />
                <div className="h-10 w-24 rounded-[8px] bg-[#f1f1f1] shimmer" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AppSnackbar notice={snackbarNotice} />

      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span>{pendingCount} product{pendingCount === 1 ? "" : "s"} waiting for review.</span>
          {cards.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-[12px] font-medium text-[#202020]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => setSelectedIds(event.target.checked ? cards.map((item) => item.id) : [])}
                  className="h-4 w-4 rounded border-black/20"
                />
                Select all
              </label>
              {selectedCount ? (
                <>
                  <span className="text-[12px] text-[#57636c]">
                    {selectedCount} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => void bulkApproveSelected()}
                    disabled={bulkBusy || Boolean(busyId)}
                    className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {bulkBusy ? "Approving..." : `Approve selected${selectedCount ? ` (${selectedCount})` : ""}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    disabled={bulkBusy}
                    className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3.5 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {loading ? (
        renderLoadingSkeleton()
      ) : cards.length ? (
        <div className="space-y-4">
          {cards.map((item) => {
            const image = Array.isArray(item?.data?.media?.images)
              ? item.data.media.images.find((entry) => Boolean(entry?.imageUrl))?.imageUrl || null
              : null;
            const title = toStr(item?.data?.product?.title, "Untitled product");
            const brand = toStr(item?.data?.product?.brandTitle || "");
            const vendor = toStr(item?.data?.product?.vendorName || "");
            const category = toStr(item?.data?.grouping?.category || "");
            const subCategory = toStr(item?.data?.grouping?.subCategory || "");
            const fulfillmentMode = toStr(item?.data?.fulfillment?.mode, "seller").toLowerCase();
            const variantCount = Array.isArray(item?.data?.variants) ? item.data.variants.length : 0;
            const isBusy = busyId === item.id;
            const isLiveUpdate = Boolean(item?.data?.live_snapshot);
            const sellerOfferCount = Math.max(Number(item?.data?.seller_offer_count || 1), 1);
            const canonicalBarcode = toStr(item?.data?.canonical_offer_barcode || "");
            const isSelected = selectedIds.includes(item.id);

            return (
              <section key={item.id} className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <label className="mt-1 inline-flex h-5 shrink-0 items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          setSelectedIds((current) =>
                            event.target.checked ? Array.from(new Set([...current, item.id])) : current.filter((id) => id !== item.id),
                          )
                        }
                        disabled={bulkBusy}
                        className="h-4 w-4 rounded border-black/20"
                        aria-label={`Select ${title}`}
                      />
                    </label>
                    <div className="h-20 w-20 overflow-hidden rounded-[8px] border border-black/5 bg-[#f4f4f4]">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt={title} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openReviewProduct(item.id)}
                        className="text-left text-[18px] font-semibold text-[#202020] transition-colors hover:text-[#907d4c]"
                      >
                        {title}
                      </button>
                      <p className="mt-1 text-[13px] text-[#57636c]">
                        {[brand, vendor].filter(Boolean).join(" • ") || "No brand or vendor"}
                      </p>
                      {sellerOfferCount > 1 || canonicalBarcode ? (
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-[#8f7531]">
                          {sellerOfferCount > 1 ? (
                            <span className="inline-flex rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f7531]">
                              {sellerOfferCount} seller offers on this barcode
                            </span>
                          ) : null}
                          {canonicalBarcode ? <span>Barcode {canonicalBarcode}</span> : null}
                        </p>
                      ) : null}
                      {isLiveUpdate ? (
                        <p className="mt-2 inline-flex rounded-full bg-[rgba(57,169,107,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#166534]">
                          Live update under review
                        </p>
                      ) : null}
                      <p className="mt-1 text-[12px] text-[#57636c]">
                        {[category, subCategory].filter(Boolean).join(" • ")} • {variantCount} variant{variantCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-2 text-[12px] font-medium text-[#8f7531]">
                        {fulfillmentMode === "bevgo" ? "Piessang fulfilment" : "Seller fulfilment"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectIssueCode("other");
                        setRejectFeedback(REJECTION_PRESETS.find((preset) => preset.code === "other")?.message || "");
                      }}
                      disabled={isBusy}
                      className="inline-flex h-10 items-center rounded-[8px] border border-[#f0c7cb] bg-white px-4 text-[13px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Saving..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openReviewProduct(item.id)}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      Review product
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplayTarget(item)}
                      disabled={isBusy || bulkBusy}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save replay
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateReview(item, "approve")}
                      disabled={isBusy || bulkBusy}
                      className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Saving..." : "Approve"}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] text-[13px] text-[#57636c]">
          No products are waiting for review right now.
        </div>
      )}

      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-xl rounded-[8px] bg-white p-5 shadow-[0_18px_50px_rgba(20,24,27,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Reject product</p>
            <h3 className="mt-2 text-[20px] font-semibold text-[#202020]">
              {toStr(rejectTarget?.data?.product?.title, "Product")}
            </h3>
            <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
              The seller will receive this feedback by email, and the product will stay hidden until they fix it and submit it for review again.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Issue type</span>
              <select
                value={rejectIssueCode}
                onChange={(event) => {
                  const nextCode = event.target.value;
                  setRejectIssueCode(nextCode);
                  const preset = REJECTION_PRESETS.find((item) => item.code === nextCode);
                  if (preset) setRejectFeedback(preset.message);
                }}
                className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
              >
                {REJECTION_PRESETS.map((preset) => (
                  <option key={preset.code} value={preset.code}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Rejection feedback</span>
              <textarea
                value={rejectFeedback}
                onChange={(event) => setRejectFeedback(event.target.value)}
                rows={6}
                className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                placeholder="Tell the seller exactly what must be fixed before this product can be approved."
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectIssueCode("other");
                  setRejectFeedback("");
                }}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void updateReview(rejectTarget, "reject", rejectFeedback)}
                disabled={!toStr(rejectFeedback) || busyId === rejectTarget.id}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === rejectTarget.id ? "Saving..." : "Reject product"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewModalProductId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="flex h-[min(92vh,960px)] w-full max-w-[1280px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_24px_80px_rgba(20,24,27,0.28)]">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Product review</p>
                <p className="mt-1 text-[13px] text-[#57636c]">
                  {reviewModalProduct?.data?.live_snapshot
                    ? "Compare the live listing against the pending update before approving the changes."
                    : "Review the full product without leaving the admin queue."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalProductId(null)}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f4ee]">
              {reviewModalProduct?.data?.live_snapshot ? (
                <div className="border-b border-black/10 bg-white px-5 py-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#166534]">Pending changes</p>
                      <h3 className="mt-1 text-[20px] font-semibold text-[#202020]">
                        {reviewDiffRows.length
                          ? `${reviewDiffRows.length} change${reviewDiffRows.length === 1 ? "" : "s"} to review`
                          : "No field changes detected"}
                      </h3>
                    </div>
                    <div className="rounded-full bg-[rgba(57,169,107,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#166534]">
                      Live version stays visible
                    </div>
                  </div>

                  {reviewDiffRows.length ? (
                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <section className="rounded-[10px] border border-black/10 bg-[#faf8f2] p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Current live version</p>
                        <div className="mt-4 space-y-3">
                          {reviewDiffRows.map((row) => (
                            <div key={`live-${row.label}`} className="rounded-[8px] border border-black/5 bg-white px-3 py-2.5">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">{row.label}</p>
                              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.6] text-[#202020]">{row.liveValue}</p>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-[10px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.06)] p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#166534]">Pending update</p>
                        <div className="mt-4 space-y-3">
                          {reviewDiffRows.map((row) => (
                            <div key={`pending-${row.label}`} className="rounded-[8px] border border-[#cfe8d8] bg-white px-3 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#166534]">{row.label}</p>
                                <span className="inline-flex rounded-full bg-[rgba(57,169,107,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#166534]">
                                  Changed
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.6] text-[#202020]">{row.pendingValue}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <SellerCatalogueEditor
                editorProductIdOverride={reviewModalProductId}
                sellerOverride={reviewSellerSlug}
                embeddedMode
              />
            </div>
          </div>
        </div>
      ) : null}

      <ContentsquareReplayCaptureModal
        open={Boolean(replayTarget)}
        title={toStr(replayTarget?.data?.product?.title, "Save replay")}
        defaults={
          replayTarget
            ? {
                title: `Product review • ${toStr(replayTarget?.data?.product?.title, "Product")}`,
                productSlug: "",
                sellerSlug: reviewSellerSlug,
                pagePath: replayTarget?.id ? `/products/${replayTarget.id}` : "",
                issueType: "product review",
                notes: replayTarget?.data?.live_snapshot
                  ? "Replay captured from product update review flow."
                  : "Replay captured from new product review flow.",
              }
            : undefined
        }
        onClose={() => setReplayTarget(null)}
        onSaved={() =>
          setSnackbarNotice({
            tone: "success",
            message: "Replay saved to Contentsquare tools.",
          })
        }
      />
    </div>
  );
}
