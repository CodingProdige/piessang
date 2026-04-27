"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clientStorage } from "@/lib/firebase";
import { prepareImageAsset } from "@/lib/client/image-prep";
import { CustomerSellerInvoiceDrawer } from "@/components/account/customer-seller-invoice-drawer";
import { CustomerSellerShipmentCard } from "@/components/account/customer-seller-shipment-card";
import { DocumentSnackbar } from "@/components/ui/document-snackbar";
import { collectCustomerSellerInvoiceGroups, getCustomerBusinessDetails } from "@/lib/orders/customer-seller-invoices";
import { getFrozenLineTotalIncl, getFrozenOrderPaidIncl, getFrozenOrderPayableIncl, getFrozenOrderProductsIncl } from "@/lib/orders/frozen-money";
import { formatMoneyExact } from "@/lib/money";
import { formatShippingDestinationLabel, getOrderShippingAddress, getSellerShippingEntry } from "@/lib/orders/shipping-breakdown";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

type OrderData = {
  docId?: string;
  order?: {
    orderNumber?: string;
  };
  lifecycle?: {
    orderStatus?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    cancellationStatus?: string;
  };
  cancellation?: {
    canSubmit?: boolean;
    mode?: "cancel" | "request" | null;
    status?: string | null;
    title?: string;
    buttonLabel?: string;
    message?: string;
  };
  timeline?: {
    events?: Array<{
      id?: string;
      type?: string;
      title?: string;
      message?: string;
      createdAt?: string;
      actorLabel?: string | null;
      sellerCode?: string | null;
      sellerSlug?: string | null;
      status?: string | null;
    }>;
  };
  delivery_progress?: {
    percentageDelivered?: number;
    percentageProgress?: number;
  };
  timestamps?: {
    createdAt?: string;
    paidAt?: string;
    deliveredAt?: string;
  };
  totals?: {
    seller_delivery_fee_incl?: number;
    delivery_fee_incl?: number;
    shippingFinalTotal?: number;
  };
  shippingBreakdown?: Array<{
    sellerCode?: string;
    sellerSlug?: string;
    sellerId?: string;
    matchedRuleName?: string;
    matchType?: string;
    finalShippingFee?: number;
    estimatedDeliveryDays?: { min?: number; max?: number };
    destination?: { city?: string; province?: string; postalCode?: string; country?: string };
    status?: string;
  }>;
  pricing_snapshot?: {
    sellerDeliveryBreakdown?: Array<{
      sellerCode?: string;
      sellerSlug?: string;
      seller_code?: string;
      seller_slug?: string;
      seller_key?: string;
      delivery_type?: string;
      method?: string;
      tracking_url?: string;
      tracking_number?: string;
      courier_carrier?: string;
    }>;
  };
  delivery?: {
    fee?: {
      seller_breakdown?: Array<{
        sellerCode?: string;
        sellerSlug?: string;
        seller_code?: string;
        seller_slug?: string;
        seller_key?: string;
        delivery_type?: string;
        method?: string;
        tracking_url?: string;
        tracking_number?: string;
        courier_carrier?: string;
      }>;
    };
    address_snapshot?: {
      recipientName?: string;
      streetAddress?: string;
      addressLine2?: string;
      suburb?: string;
      city?: string;
      stateProvinceRegion?: string;
      province?: string;
      postalCode?: string;
      country?: string;
      phoneNumber?: string;
    };
  };
  delivery_snapshot?: {
    address?: {
      recipientName?: string;
      streetAddress?: string;
      addressLine2?: string;
      suburb?: string;
      city?: string;
      stateProvinceRegion?: string;
      province?: string;
      postalCode?: string;
      country?: string;
      phoneNumber?: string;
    };
  };
  delivery_address?: {
    recipientName?: string;
    streetAddress?: string;
    addressLine2?: string;
    suburb?: string;
    city?: string;
    stateProvinceRegion?: string;
    province?: string;
    postalCode?: string;
    country?: string;
    phoneNumber?: string;
  };
  payment?: {
    method?: string;
    provider?: string;
    paid_amount_incl?: number;
  };
  seller_slices?: Array<{
    sellerCode?: string;
    sellerSlug?: string;
    vendorName?: string;
    quantity?: number;
  }>;
  items?: Array<{
    quantity?: number;
    product_snapshot?: {
      name?: string;
      media?: {
        images?: Array<{ imageUrl?: string }>;
      };
    };
    selected_variant_snapshot?: {
      label?: string;
      media?: {
        images?: Array<{ imageUrl?: string }>;
      };
    };
    seller_snapshot?: {
      vendorName?: string;
      sellerCode?: string;
      sellerSlug?: string;
    };
    fulfillment_tracking?: {
      status?: string;
      label?: string;
      progressPercent?: number;
      actionOwner?: string;
      trackingNumber?: string | null;
      courierName?: string | null;
      trackingUrl?: string | null;
      labelUrl?: string | null;
      shipmentStatus?: string | null;
      checkpoints?: Array<{
        message?: string | null;
        status?: string | null;
        subtag_message?: string | null;
        details?: string | null;
        location?: string | null;
        city?: string | null;
        occurred_at?: string | null;
        created_at?: string | null;
      }>;
    };
    line_totals?: {
      final_incl?: number;
    };
  }>;
  delivery_docs?: {
    invoice?: {
      url?: string;
    };
  };
  credit_notes?: {
    seller_notes?: Record<string, {
      creditNoteId?: string;
      creditNoteNumber?: string;
      sellerCode?: string | null;
      sellerSlug?: string | null;
      vendorName?: string | null;
      amountIncl?: number;
      issuedAt?: string;
      status?: string;
    }>;
  };
};

type SellerReviewEntry = {
  docId?: string;
  sellerCode?: string | null;
  sellerSlug?: string | null;
  vendorName?: string | null;
  stars?: number;
  comment?: string;
  images?: string[];
};

type SellerCreditNoteEntry = {
  creditNoteId?: string;
  creditNoteNumber?: string;
  sellerCode?: string | null;
  sellerSlug?: string | null;
  vendorName?: string | null;
  amountIncl?: number;
  issuedAt?: string;
  status?: string;
};

type ReturnDraftLine = {
  lineKey: string;
  title: string;
  variant: string;
  quantity: number;
  status: string;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number) {
  return formatMoneyExact(value);
}

function formatDateTime(value?: string) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sentenceStatus(value?: string) {
  const normalized = toStr(value || "unknown").replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function fulfillmentTone(status?: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "delivered" || normalized === "completed") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "dispatched") return "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";
  if (normalized === "processing" || normalized === "confirmed") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
  if (normalized === "cancelled") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#57636c]";
}

function paymentTone(status?: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "paid") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "partial_refund" || normalized === "refunded") return "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";
  if (normalized === "pending") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#57636c]";
}

function getLineImage(item: any) {
  return (
    toStr(item?.selected_variant_snapshot?.media?.images?.find?.((entry: any) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(item?.product_snapshot?.media?.images?.find?.((entry: any) => Boolean(entry?.imageUrl))?.imageUrl)
  );
}

function getShipmentProgressSteps(mode: unknown, status: unknown) {
  const normalized = toStr(status).toLowerCase();
  const activeIndex =
    normalized === "delivered"
      ? 3
      : normalized === "dispatched"
        ? 2
        : normalized === "processing" || normalized === "confirmed"
          ? 1
          : 0;
  const labels = ["Confirmed", "Prepared", "In transit", "Delivered"];
  return labels.map((label, index) => ({
    key: `${toStr(mode || "delivery")}-${index}`,
    label,
    icon: String(index + 1),
    done: activeIndex >= index,
    active: activeIndex === index,
  }));
}

function getShipmentSummaryCopy(group: {
  deliveryType?: string;
  latestStatus?: string;
  courierName?: string;
  trackingNumber?: string;
  destination?: string;
  eta?: string;
}) {
  return {
    eyebrow: "Shipment progress",
    subtext: "Shipping updates for this seller shipment.",
    meta: [toStr(group.courierName), toStr(group.trackingNumber), toStr(group.destination), toStr(group.eta)].filter(Boolean).join(" • "),
  };
}

function getSellerGroups(order: OrderData | null) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const sliceMeta = new Map<string, { vendorName: string; sellerCode: string; sellerSlug: string; quantity: number }>();
  for (const slice of Array.isArray(order?.seller_slices) ? order!.seller_slices! : []) {
    const sliceKey = toStr(slice?.sellerCode || slice?.sellerSlug || slice?.vendorName);
    if (!sliceKey) continue;
    sliceMeta.set(sliceKey, {
      vendorName: toStr(slice?.vendorName || "Seller"),
      sellerCode: toStr(slice?.sellerCode),
      sellerSlug: toStr(slice?.sellerSlug),
      quantity: Math.max(0, Number(slice?.quantity || 0)),
    });
  }
  const groups = new Map<string, { key: string; vendorName: string; sellerCode: string; sellerSlug: string; items: any[]; totalQty: number; progressSum: number; latestStatus: string; deliveryType: string; trackingUrl: string; trackingNumber: string; courierName: string; destination: string; eta: string }>();
  for (const item of items) {
    const productSnapshot: any = item?.product_snapshot || {};
    const snapshotProduct = productSnapshot?.product || {};
    const snapshotSeller = item?.seller_snapshot || productSnapshot?.seller || snapshotProduct?.seller || {};
    const sellerCode = toStr(snapshotSeller?.sellerCode || snapshotProduct?.sellerCode);
    const sellerSlug = toStr(snapshotSeller?.sellerSlug || snapshotProduct?.sellerSlug);
    const snapshotVendorName = toStr(
      snapshotSeller?.vendorName ||
        snapshotProduct?.vendorName ||
        productSnapshot?.vendorName,
    );
    const metaMatch =
      sliceMeta.get(toStr(sellerCode || sellerSlug || snapshotVendorName)) ||
      Array.from(sliceMeta.values()).find((entry) =>
        (sellerCode && entry.sellerCode === sellerCode) ||
        (sellerSlug && entry.sellerSlug === sellerSlug) ||
        (snapshotVendorName && entry.vendorName === snapshotVendorName),
      );
    const vendorName = toStr(metaMatch?.vendorName || snapshotVendorName || "Seller");
    const key = toStr(metaMatch?.sellerCode || sellerCode || metaMatch?.sellerSlug || sellerSlug || vendorName);
    const quantity = Math.max(1, Number(item?.quantity || 0));
    const itemStatus = toStr(item?.fulfillment_tracking?.status).toLowerCase();
    const progressPercent = itemStatus === "cancelled"
      ? 100
      : Math.max(0, Math.min(100, Number(item?.fulfillment_tracking?.progressPercent || 0)));
    const current = groups.get(key) || {
      key,
      vendorName,
      sellerCode: toStr(metaMatch?.sellerCode || sellerCode),
      sellerSlug: toStr(metaMatch?.sellerSlug || sellerSlug),
      items: [],
      totalQty: 0,
      progressSum: 0,
      latestStatus: "not_started",
      deliveryType: "",
      trackingUrl: "",
      trackingNumber: "",
      courierName: "",
      destination: "",
      eta: "",
    };
    current.items.push(item);
    current.totalQty += quantity;
    current.progressSum += quantity * progressPercent;
    const nextStatus = toStr(item?.fulfillment_tracking?.status || current.latestStatus);
    const nextRank = ["not_started", "confirmed", "processing", "dispatched", "delivered"].indexOf(nextStatus);
    const currentRank = ["not_started", "confirmed", "processing", "dispatched", "delivered"].indexOf(current.latestStatus);
    if (nextRank > currentRank) current.latestStatus = nextStatus;
    const shippingMatch = getSellerShippingEntry(order || {}, sellerCode, sellerSlug);
    if (shippingMatch) {
      current.deliveryType = "shipping";
      current.destination = formatShippingDestinationLabel(shippingMatch?.destination || {});
      current.eta =
        Number(shippingMatch?.estimatedDeliveryDays?.min || 0) > 0 || Number(shippingMatch?.estimatedDeliveryDays?.max || 0) > 0
          ? `${Number(shippingMatch?.estimatedDeliveryDays?.min || 0)}-${Number(shippingMatch?.estimatedDeliveryDays?.max || 0)} days`
          : "";
      current.trackingUrl = toStr(shippingMatch?.tracking?.trackingUrl || current.trackingUrl);
      current.trackingNumber = toStr(shippingMatch?.tracking?.trackingNumber || current.trackingNumber);
      current.courierName = toStr(shippingMatch?.tracking?.courierName || current.courierName);
    }
    current.trackingUrl = toStr(item?.fulfillment_tracking?.trackingUrl || current.trackingUrl);
    current.trackingNumber = toStr(item?.fulfillment_tracking?.trackingNumber || current.trackingNumber);
    current.courierName = toStr(item?.fulfillment_tracking?.courierName || current.courierName);
    groups.set(key, current);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    progress: group.totalQty > 0 ? Math.round(group.progressSum / group.totalQty) : 0,
    latestStatus: (() => {
      const statuses = group.items.map((item) => toStr(item?.fulfillment_tracking?.status).toLowerCase()).filter(Boolean);
      if (statuses.length && statuses.every((status) => status === "cancelled")) return "cancelled";
      const activeStatuses = statuses.filter((status) => status !== "cancelled");
      if (activeStatuses.length && activeStatuses.every((status) => status === "delivered")) {
        return statuses.includes("cancelled") ? "delivered" : "delivered";
      }
      if (activeStatuses.includes("dispatched")) return "dispatched";
      if (activeStatuses.includes("processing")) return "processing";
      if (activeStatuses.includes("confirmed")) return "confirmed";
      if (statuses.includes("cancelled")) return "cancelled";
      return group.latestStatus;
    })(),
  }));
}

function buildCheckpointEventsForGroup(group: ReturnType<typeof getSellerGroups>[number]) {
  const seen = new Set<string>();
  const events: Array<{
    id?: string;
    title?: string;
    message?: string;
    createdAt?: string;
    sellerCode?: string | null;
    sellerSlug?: string | null;
    status?: string | null;
  }> = [];

  for (const item of Array.isArray(group?.items) ? group.items : []) {
    const checkpoints = Array.isArray(item?.fulfillment_tracking?.checkpoints) ? item.fulfillment_tracking.checkpoints : [];
    for (const checkpoint of checkpoints) {
      const title = toStr(checkpoint?.message || checkpoint?.status || checkpoint?.subtag_message || "Shipment update");
      const createdAt = toStr(checkpoint?.occurred_at || checkpoint?.created_at || "");
      const location = toStr(checkpoint?.location || checkpoint?.city || "");
      const detail = toStr(checkpoint?.subtag_message || checkpoint?.details || "");
      const dedupeKey = `${title}::${createdAt}::${location}::${detail}`;
      if (!title || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      events.push({
        id: dedupeKey,
        title,
        message: [detail, location].filter(Boolean).join(location && detail ? " • " : ""),
        createdAt,
        sellerCode: group?.sellerCode || null,
        sellerSlug: group?.sellerSlug || null,
        status: toStr(checkpoint?.status || ""),
      });
    }
  }

  return events.sort((left, right) => toStr(right.createdAt).localeCompare(toStr(left.createdAt)));
}

export function CustomerOrderDetailWorkspace({ uid, orderId }: { uid: string; orderId: string }) {
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceDrawerOpen, setInvoiceDrawerOpen] = useState(false);
  const [invoiceSnackbar, setInvoiceSnackbar] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [customerBusiness, setCustomerBusiness] = useState({
    companyName: "",
    vatNumber: "",
    registrationNumber: "",
    businessType: "",
    phoneNumber: "",
  });
  const [openSellerKey, setOpenSellerKey] = useState<string | null>(null);
  const [sellerReviews, setSellerReviews] = useState<Record<string, SellerReviewEntry>>({});
  const [sellerReviewBusy, setSellerReviewBusy] = useState(false);
  const [sellerReviewMessage, setSellerReviewMessage] = useState<string | null>(null);
  const [activeSellerReviewKey, setActiveSellerReviewKey] = useState<string | null>(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [reviewImagesUploading, setReviewImagesUploading] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnMessage, setReturnMessage] = useState("");
  const [returnEvidence, setReturnEvidence] = useState<string[]>([]);
  const [returnEvidenceUploading, setReturnEvidenceUploading] = useState(false);
  const [returnSelectedLines, setReturnSelectedLines] = useState<string[]>([]);
  const [returnFeedback, setReturnFeedback] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  function applyCancellationState(
    nextStatus: "requested" | "cancelled",
    refundStarted = false,
    nextCancellation?: OrderData["cancellation"] | null,
  ) {
    setOrder((current) => {
      if (!current) return current;
      const cancellationState =
        nextCancellation ||
        (nextStatus === "requested"
          ? {
              canSubmit: false,
              mode: null,
              status: "requested",
              title: "Cancellation requested",
              buttonLabel: "",
              message: "We’ve received your cancellation request and are reviewing it before we stop fulfilment.",
            }
          : {
              canSubmit: false,
              mode: null,
              status: "cancelled",
              title: "Order cancelled",
              buttonLabel: "",
              message: refundStarted
                ? "This order has been cancelled and the refund process has started."
                : "This order has already been cancelled.",
            });

      return {
        ...current,
        lifecycle: {
          ...(current.lifecycle || {}),
          orderStatus: nextStatus === "cancelled" ? "cancelled" : current.lifecycle?.orderStatus,
          cancellationStatus: nextStatus,
          paymentStatus:
            nextStatus === "cancelled" && refundStarted
              ? "refunded"
              : current.lifecycle?.paymentStatus,
        },
        cancellation: cancellationState,
      };
    });
  }

  async function loadOrderSnapshot() {
    const response = await fetch("/api/client/v1/orders/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ userId: uid, orderId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load that order.");
    return payload?.data?.data || payload?.data || null;
  }

  useEffect(() => {
    if (!uid || !orderId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const nextOrder = await loadOrderSnapshot();
        if (!cancelled) setOrder(nextOrder);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load that order.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId, uid]);

  useEffect(() => {
    if (!invoiceSnackbar) return;
    const timeout = window.setTimeout(() => setInvoiceSnackbar(null), 3800);
    return () => window.clearTimeout(timeout);
  }, [invoiceSnackbar]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    async function loadAccount() {
      try {
        const response = await fetch("/api/client/v1/accounts/account/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false || cancelled) return;
        setCustomerBusiness(getCustomerBusinessDetails(payload?.data || {}, order || {}));
      } catch {}
    }
    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [order, uid]);

  useEffect(() => {
    if (!uid || !orderId) return;
    let cancelled = false;
    async function loadSellerReviews() {
      try {
        const response = await fetch(`/api/client/v1/accounts/seller/ratings?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false || cancelled) return;
        const reviews = Array.isArray(payload?.data?.reviews) ? payload.data.reviews : [];
        const next: Record<string, SellerReviewEntry> = {};
        for (const review of reviews) {
          const key = String(review?.sellerCode || review?.sellerSlug || "");
          if (!key) continue;
          next[key] = review;
        }
        setSellerReviews(next);
      } catch {}
    }
    void loadSellerReviews();
    return () => {
      cancelled = true;
    };
  }, [orderId, uid]);

  async function handleSaveBusinessDetails(details: typeof customerBusiness) {
    const response = await fetch("/api/client/v1/accounts/account/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        data: {
          business: {
            companyName: details.companyName,
            vatNumber: details.vatNumber,
            registrationNumber: details.registrationNumber,
            businessType: details.businessType,
            phoneNumber: details.phoneNumber,
          },
          account: {
            accountName: details.companyName,
            vatNumber: details.vatNumber,
            registrationNumber: details.registrationNumber,
            businessType: details.businessType,
            phoneNumber: details.phoneNumber,
          },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message || "Unable to save business details.");
    }
    setCustomerBusiness(details);
  }

  async function handleViewCreditNote(creditNoteId: string) {
    setInvoiceSnackbar({ tone: "info", message: "Preparing credit note..." });
    try {
      const response = await fetch("/api/client/v1/orders/documents/seller-credit-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, creditNoteId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false || !payload?.data?.url) {
        throw new Error(payload?.message || "Unable to open that credit note right now.");
      }
      setInvoiceSnackbar({ tone: "success", message: "Credit note ready." });
      window.open(String(payload.data.url), "_blank", "noopener,noreferrer");
    } catch (cause) {
      setInvoiceSnackbar({
        tone: "error",
        message: cause instanceof Error ? cause.message : "Unable to open that credit note right now.",
      });
    }
  }

  async function handleReviewImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 6 - reviewImages.length);
    event.target.value = "";
    if (!files.length || !uid || !orderId) return;
    setReviewImagesUploading(true);
    setSellerReviewMessage(null);
    try {
      const uploads: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const prepared = await prepareImageAsset(file, { maxDimension: 1800, quality: 0.82 });
        const safeName = prepared.file.name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
        const fileRef = storageRef(clientStorage, `users/${uid}/seller-reviews/${orderId}/${Date.now()}-${safeName}`);
        await uploadBytes(fileRef, prepared.file, { contentType: prepared.file.type });
        uploads.push(await getDownloadURL(fileRef));
      }
      setReviewImages((current) => [...current, ...uploads].slice(0, 6));
    } catch (cause) {
      setSellerReviewMessage(cause instanceof Error ? cause.message : "Unable to upload review images.");
    } finally {
      setReviewImagesUploading(false);
    }
  }

  const returnableLines = useMemo<ReturnDraftLine[]>(() => {
    return (Array.isArray(order?.items) ? order.items : [])
      .map((rawItem, index) => {
        const item: any = rawItem;
        const productSnapshot: any = item?.product_snapshot || {};
        const lineKey = toStr(
          item?.lineId ||
            item?.line_id ||
            `${toStr(productSnapshot?.product?.unique_id || productSnapshot?.docId || "product")}:${toStr(item?.selected_variant_snapshot?.variant_id || "variant")}:${index}`,
        );
        return {
          lineKey,
          title: toStr(productSnapshot?.name || productSnapshot?.product?.title || "Product"),
          variant: toStr(item?.selected_variant_snapshot?.label || ""),
          quantity: Math.max(0, Number(item?.quantity || 0)),
          status: toStr(item?.fulfillment_tracking?.status || ""),
        };
      })
      .filter((line) => line.lineKey && line.status.toLowerCase() === "delivered");
  }, [order]);

  function openReturnModal() {
    setReturnSelectedLines(returnableLines.map((line) => line.lineKey));
    setReturnReason("");
    setReturnMessage("");
    setReturnEvidence([]);
    setReturnFeedback(null);
    setReturnModalOpen(true);
  }

  function openCancelModal() {
    setCancelReason("");
    setCancelFeedback(null);
    setCancelModalOpen(true);
  }

  async function handleSubmitCancellation() {
    if (cancelSubmitting || !cancelReason.trim()) return;
    setCancelSubmitting(true);
    setCancelFeedback(null);
    try {
      const response = await fetch("/api/client/v1/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          reason: cancelReason.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to process your cancellation.");
      setCancelModalOpen(false);
      const nextStatus = payload?.data?.status === "requested" ? "requested" : "cancelled";
      const refundStarted = Boolean(payload?.data?.refundStatus);
      applyCancellationState(nextStatus, refundStarted, payload?.data?.cancellation || null);
      setInvoiceSnackbar({
        tone: "success",
        message:
          nextStatus === "requested"
            ? "Cancellation request submitted."
            : refundStarted
              ? "Order cancelled and refund started."
              : "Order cancelled successfully.",
      });
      try {
        const nextOrder = await loadOrderSnapshot();
        setOrder(nextOrder);
      } catch {}
    } catch (cause) {
      setCancelFeedback(cause instanceof Error ? cause.message : "Unable to process your cancellation.");
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function handleReturnEvidenceSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 6 - returnEvidence.length);
    event.target.value = "";
    if (!files.length || !uid || !orderId) return;
    setReturnEvidenceUploading(true);
    setReturnFeedback(null);
    try {
      const uploads: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const prepared = await prepareImageAsset(file, { maxDimension: 1800, quality: 0.82 });
        const safeName = prepared.file.name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
        const fileRef = storageRef(clientStorage, `users/${uid}/returns/${orderId}/${Date.now()}-${safeName}`);
        await uploadBytes(fileRef, prepared.file, { contentType: prepared.file.type });
        uploads.push(await getDownloadURL(fileRef));
      }
      setReturnEvidence((current) => [...current, ...uploads].slice(0, 6));
    } catch (cause) {
      setReturnFeedback(cause instanceof Error ? cause.message : "Unable to upload return evidence.");
    } finally {
      setReturnEvidenceUploading(false);
    }
  }

  async function handleSubmitReturn() {
    if (returnSubmitting) return;
    setReturnSubmitting(true);
    setReturnFeedback(null);
    try {
      const response = await fetch("/api/client/v1/orders/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          reason: returnReason,
          message: returnMessage,
          evidence: returnEvidence,
          lineKeys: returnSelectedLines,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to submit your return request.");
      setReturnFeedback(payload?.data?.alreadyRequested ? "A return request already exists for those items." : "Return request submitted.");
      setReturnModalOpen(false);
      setInvoiceSnackbar({ tone: "success", message: payload?.data?.alreadyRequested ? "A return request already exists for these items." : "Return request submitted." });
    } catch (cause) {
      setReturnFeedback(cause instanceof Error ? cause.message : "Unable to submit your return request.");
    } finally {
      setReturnSubmitting(false);
    }
  }

  function openSellerReviewModal(group: ReturnType<typeof getSellerGroups>[number]) {
    const reviewKey = group.sellerCode || group.sellerSlug || group.key;
    const existing = sellerReviews[reviewKey];
    setActiveSellerReviewKey(group.key);
    setReviewStars(Number(existing?.stars || 5));
    setReviewComment(String(existing?.comment || ""));
    setReviewImages(Array.isArray(existing?.images) ? existing.images : []);
    setSellerReviewMessage(null);
  }

  async function handleSubmitSellerReview(group: ReturnType<typeof getSellerGroups>[number]) {
    if (sellerReviewBusy) return;
    setSellerReviewBusy(true);
    setSellerReviewMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          sellerCode: group.sellerCode,
          sellerSlug: group.sellerSlug,
          vendorName: group.vendorName,
          stars: reviewStars,
          comment: reviewComment,
          images: reviewImages,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to submit your seller rating.");
      const review = payload?.data?.review || null;
      const reviewKey = String(review?.sellerCode || review?.sellerSlug || group.sellerCode || group.sellerSlug || group.key);
      setSellerReviews((current) => ({
        ...current,
        [reviewKey]: review || {
          sellerCode: group.sellerCode,
          sellerSlug: group.sellerSlug,
          vendorName: group.vendorName,
          stars: reviewStars,
          comment: reviewComment,
          images: reviewImages,
        },
      }));
      setSellerReviewMessage("Seller rating saved.");
      setActiveSellerReviewKey(null);
    } catch (cause) {
      setSellerReviewMessage(cause instanceof Error ? cause.message : "Unable to submit your seller rating.");
    } finally {
      setSellerReviewBusy(false);
    }
  }

  const productsSubtotal = getFrozenOrderProductsIncl(order || {});
  const deliveryFee = Number(order?.totals?.shippingFinalTotal || 0) || Number(order?.totals?.seller_delivery_fee_incl || 0) + Number(order?.totals?.delivery_fee_incl || 0);
  const totalIncl = getFrozenOrderPayableIncl(order || {});
  const paidIncl = getFrozenOrderPaidIncl(order || {}) || totalIncl;
  const paymentMethodLabel = useMemo(() => {
    const provider = toStr(order?.payment?.provider || "");
    const method = toStr(order?.payment?.method || "");
    return [provider, method].filter(Boolean).map(sentenceStatus).join(" / ") || "Card payment";
  }, [order?.payment?.method, order?.payment?.provider]);
  const resolvedAddress = getOrderShippingAddress(order || {});
  const deliveryAddress = [
    resolvedAddress?.streetAddress,
    resolvedAddress?.addressLine2,
    resolvedAddress?.suburb,
    resolvedAddress?.city,
    resolvedAddress?.province,
    resolvedAddress?.postalCode,
    resolvedAddress?.country,
  ].filter(Boolean);
  const sellerGroups = useMemo(() => getSellerGroups(order), [order]);
  const progress = Math.max(0, Math.min(100, Number(order?.delivery_progress?.percentageProgress || order?.delivery_progress?.percentageDelivered || 0)));
  const cancelledSellerGroups = sellerGroups.filter((group) => group.latestStatus === "cancelled").length;
  const progressLabel =
    progress >= 100
      ? cancelledSellerGroups
        ? `Complete, with ${cancelledSellerGroups} cancelled seller ${cancelledSellerGroups === 1 ? "delivery" : "deliveries"}`
        : "Delivered"
      : `${progress}% complete across all seller fulfilments`;
  const progressBarTone =
    progress >= 100
      ? cancelledSellerGroups
        ? "bg-[#f59e0b]"
        : "bg-[#1f8f55]"
      : progress >= 50
        ? "bg-[#57a6ff]"
        : "bg-[#202020]";
  const invoiceSellerGroups = useMemo(() => collectCustomerSellerInvoiceGroups(order || {}), [order]);
  const creditNotesBySeller = useMemo<SellerCreditNoteEntry[]>(() => {
    const notesMap =
      order?.credit_notes?.seller_notes && typeof order.credit_notes.seller_notes === "object"
        ? order.credit_notes.seller_notes
        : ({} as Record<string, SellerCreditNoteEntry>);
    return (Object.values(notesMap) as SellerCreditNoteEntry[])
      .filter(Boolean)
      .sort((a, b) => toStr(b.issuedAt).localeCompare(toStr(a.issuedAt)));
  }, [order]);
  const autoOpenSellerSlug = String(searchParams?.get("rateSeller") || "");
  const cumulativeEvents = useMemo(
    () =>
      (Array.isArray(order?.timeline?.events) ? order.timeline!.events! : [])
        .slice()
        .sort((a, b) => toStr(b.createdAt).localeCompare(toStr(a.createdAt))),
    [order],
  );

  useEffect(() => {
    if (!autoOpenSellerSlug || !sellerGroups.length || activeSellerReviewKey) return;
    const target = sellerGroups.find((group) => group.sellerSlug === autoOpenSellerSlug || group.sellerCode === autoOpenSellerSlug);
    if (target && target.latestStatus === "delivered") {
      openSellerReviewModal(target);
    }
  }, [activeSellerReviewKey, autoOpenSellerSlug, sellerGroups]);

  if (!uid) {
    return (
      <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        Sign in to view this order.
      </div>
    );
  }

  if (!orderId) {
    return (
      <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        Loading your order…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#57636c]">
        <Link href="/account" className="font-semibold text-[#0f80c3]">My Account</Link>
        <span>/</span>
        <Link href="/account/orders" className="font-semibold text-[#0f80c3]">Orders</Link>
        <span>/</span>
        <span className="text-[#202020]">Order detail</span>
      </div>

      {loading ? <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">Loading your order…</div> : null}
      {error ? <div className="rounded-[24px] border border-[#f0c7cb] bg-[#fff7f8] px-6 py-4 text-[13px] text-[#b91c1c] shadow-[0_12px_30px_rgba(20,24,27,0.05)]">{error}</div> : null}

      {!loading && !error && order ? (
        <>
          <DocumentSnackbar notice={invoiceSnackbar} onClose={() => setInvoiceSnackbar(null)} />

          <CustomerSellerInvoiceDrawer
            open={invoiceDrawerOpen}
            orderId={orderId}
            orderNumber={toStr(order?.order?.orderNumber || orderId)}
            orderDate={formatDateTime(order?.timestamps?.createdAt)}
            sellers={invoiceSellerGroups}
            initialBusiness={customerBusiness}
            onClose={() => setInvoiceDrawerOpen(false)}
            onSaveBusiness={handleSaveBusinessDetails}
          />

          {activeSellerReviewKey ? (
            <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/35 px-4" onClick={() => setActiveSellerReviewKey(null)}>
              <div
                className="w-full max-w-[640px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]"
                onClick={(event) => event.stopPropagation()}
              >
                {(() => {
                  const group = sellerGroups.find((entry) => entry.key === activeSellerReviewKey);
                  if (!group) return null;
                  return (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Rate {group.vendorName}</p>
                          <p className="mt-2 text-[14px] text-[#57636c]">Share your experience with this seller. You can add a comment and photos if you want to.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSellerReviewKey(null)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c] transition hover:bg-[#f6f7f8] hover:text-[#202020]"
                          aria-label="Close seller rating modal"
                        >
                          ×
                        </button>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewStars(star)}
                            className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition ${reviewStars === star ? "border-[#202020] bg-[#202020] text-white" : "border-black/10 bg-white text-[#202020]"}`}
                          >
                            {star} star{star === 1 ? "" : "s"}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        placeholder="Tell other customers how this seller handled your order."
                        className="mt-5 min-h-[120px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-[14px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
                      />

                      <div className="mt-4">
                        <label className="inline-flex h-11 cursor-pointer items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
                          {reviewImagesUploading ? "Uploading..." : "Add photos"}
                          <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleReviewImageSelection(event)} disabled={reviewImagesUploading} />
                        </label>
                        {reviewImages.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {reviewImages.map((url, index) => (
                              <div key={`${url}-${index}`} className="relative overflow-hidden rounded-[10px] border border-black/10">
                                <img src={url} alt="Seller review upload" className="h-20 w-20 object-cover" />
                                <button
                                  type="button"
                                  onClick={() => setReviewImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[12px] font-semibold text-white"
                                  aria-label="Remove review image"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {sellerReviewMessage ? <p className="mt-3 text-[13px] text-[#57636c]">{sellerReviewMessage}</p> : null}

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleSubmitSellerReview(group)}
                          disabled={sellerReviewBusy}
                          className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                        >
                          {sellerReviewBusy ? "Saving..." : "Submit rating"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSellerReviewKey(null)}
                          className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {returnModalOpen ? (
            <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/35 px-4" onClick={() => setReturnModalOpen(false)}>
              <div
                className="w-full max-w-[760px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Log a return</p>
                    <p className="mt-2 text-[14px] text-[#57636c]">Select the delivered items you want to return, choose a reason, and tell us what went wrong.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReturnModalOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c] transition hover:bg-[#f6f7f8] hover:text-[#202020]"
                    aria-label="Close return modal"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-5 rounded-[18px] border border-black/8 bg-[#fafafa] p-4">
                  <p className="text-[14px] font-semibold text-[#202020]">Delivered items</p>
                  <div className="mt-3 space-y-2">
                    {returnableLines.length ? (
                      returnableLines.map((line) => (
                        <label key={line.lineKey} className="flex items-start gap-3 rounded-[14px] border border-black/6 bg-white p-3">
                          <input
                            type="checkbox"
                            checked={returnSelectedLines.includes(line.lineKey)}
                            onChange={(event) =>
                              setReturnSelectedLines((current) =>
                                event.target.checked ? [...current, line.lineKey] : current.filter((entry) => entry !== line.lineKey),
                              )
                            }
                            className="mt-1 h-4 w-4 rounded border-black/20"
                          />
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-[#202020]">{line.title}</p>
                            <p className="mt-1 text-[12px] text-[#57636c]">{line.variant || "Selected option"} • Qty {line.quantity}</p>
                          </div>
                        </label>
                      ))
                    ) : (
                      <p className="text-[13px] text-[#57636c]">Only delivered items can be returned from this page.</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-[13px] font-semibold text-[#202020]">Reason</span>
                    <select
                      value={returnReason}
                      onChange={(event) => setReturnReason(event.target.value)}
                      className="h-12 w-full rounded-[16px] border border-black/10 bg-white px-4 text-[14px] text-[#202020] outline-none"
                    >
                      <option value="">Choose a reason</option>
                      <option value="Damaged item">Damaged item</option>
                      <option value="Defective item">Defective item</option>
                      <option value="Wrong item sent">Wrong item sent</option>
                      <option value="Item missing from order">Item missing from order</option>
                      <option value="Item not as described">Item not as described</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <div className="space-y-2">
                    <span className="text-[13px] font-semibold text-[#202020]">Evidence</span>
                    <label className="inline-flex h-12 cursor-pointer items-center rounded-[16px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
                      {returnEvidenceUploading ? "Uploading..." : "Add photos"}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleReturnEvidenceSelection(event)} disabled={returnEvidenceUploading} />
                    </label>
                    {returnEvidence.length ? (
                      <div className="flex flex-wrap gap-2">
                        {returnEvidence.map((url, index) => (
                          <div key={`${url}-${index}`} className="relative overflow-hidden rounded-[10px] border border-black/10">
                            <img src={url} alt="Return evidence" className="h-16 w-16 object-cover" />
                            <button
                              type="button"
                              onClick={() => setReturnEvidence((current) => current.filter((_, evidenceIndex) => evidenceIndex !== index))}
                              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[12px] font-semibold text-white"
                              aria-label="Remove return evidence image"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="space-y-2">
                    <span className="text-[13px] font-semibold text-[#202020]">What happened?</span>
                    <textarea
                      value={returnMessage}
                      onChange={(event) => setReturnMessage(event.target.value)}
                      placeholder="Describe the issue so we can review your return request quickly."
                      className="min-h-[120px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-[14px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
                    />
                  </label>
                </div>

                {returnFeedback ? <p className="mt-3 text-[13px] text-[#57636c]">{returnFeedback}</p> : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSubmitReturn()}
                    disabled={returnSubmitting || !returnSelectedLines.length || !returnReason || !returnMessage.trim()}
                    className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                  >
                    {returnSubmitting ? "Submitting..." : "Submit return request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnModalOpen(false)}
                    className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {cancelModalOpen ? (
            <div
              className="fixed inset-0 z-[160] flex min-h-dvh items-end justify-center bg-black/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:items-center md:pb-4"
              onClick={() => setCancelModalOpen(false)}
            >
              <div
                className="w-full max-w-[620px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{order.cancellation?.title || "Manage cancellation"}</p>
                    <p className="mt-2 text-[14px] text-[#57636c]">{order.cancellation?.message || "Tell us why you want to cancel this order."}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCancelModalOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c] transition hover:bg-[#f6f7f8] hover:text-[#202020]"
                    aria-label="Close cancellation modal"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-5 rounded-[18px] border border-black/8 bg-[#fafafa] p-4">
                  <p className="text-[14px] font-semibold text-[#202020]">What happens next</p>
                  <p className="mt-2 text-[13px] text-[#57636c]">
                    {order.cancellation?.mode === "cancel"
                      ? "This order will be cancelled immediately because fulfilment has not started yet."
                      : "We’ll submit a cancellation request for review before stopping fulfilment or starting any refund handling."}
                  </p>
                </div>

                <div className="mt-4">
                  <label className="space-y-2">
                    <span className="text-[13px] font-semibold text-[#202020]">Why are you cancelling?</span>
                    <textarea
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Give a short reason so the seller and Piessang can review the cancellation properly."
                      className="min-h-[140px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-[14px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
                    />
                  </label>
                </div>

                {cancelFeedback ? <p className="mt-3 text-[13px] text-[#b91c1c]">{cancelFeedback}</p> : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSubmitCancellation()}
                    disabled={cancelSubmitting || !cancelReason.trim()}
                    className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                  >
                    {cancelSubmitting
                      ? order.cancellation?.mode === "cancel"
                        ? "Cancelling..."
                        : "Submitting..."
                      : order.cancellation?.buttonLabel || "Continue"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelModalOpen(false)}
                    className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                  >
                    Keep order
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">{order.order?.orderNumber || orderId}</h1>
                <p className="mt-2 text-[14px] text-[#57636c]">Placed {formatDateTime(order.timestamps?.createdAt)}{order.timestamps?.paidAt ? ` • Paid ${formatDateTime(order.timestamps?.paidAt)}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setInvoiceDrawerOpen(true)} className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-[#f6f7f8] px-4 text-[14px] font-semibold text-[#202020]">
                  View invoice
                </button>
                {order.cancellation?.canSubmit ? (
                  <button
                    type="button"
                    onClick={openCancelModal}
                    className="inline-flex h-11 items-center rounded-[14px] border border-[#f3d2d2] bg-[#fff7f8] px-4 text-[14px] font-semibold text-[#b91c1c]"
                  >
                    {order.cancellation?.buttonLabel || "Cancel order"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openReturnModal}
                  className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                >
                  Log return
                </button>
                {!order.cancellation?.canSubmit && order.cancellation?.status === "requested" ? (
                  <span className="inline-flex h-11 items-center rounded-[14px] border border-[#fef3c7] bg-[#fff7ed] px-4 text-[14px] font-semibold text-[#9a3412]">
                    Cancellation requested
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="space-y-5">
              <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[18px] font-semibold text-[#202020]">Order progress</p>
                    <p className="mt-1 text-[13px] text-[#57636c]">{progressLabel}</p>
                  </div>
                  <p className="text-[16px] font-semibold text-[#202020]">{progress}%</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#eceff3]">
                  <div className={`h-full rounded-full ${progressBarTone}`} style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[18px] font-semibold text-[#202020]">Seller fulfilment breakdown</p>
                    <p className="mt-1 text-[13px] text-[#57636c]">Each seller in your order ships their own part, so progress can move at different times.</p>
                  </div>
                  <p className="text-[14px] font-semibold text-[#202020]">{sellerGroups.length} seller{sellerGroups.length === 1 ? "" : "s"}</p>
                </div>
                <div className="mt-4 space-y-4">
                  {sellerGroups.map((group) => (
                    <CustomerSellerShipmentCard
                      key={group.key}
                      group={group}
                      isOpen={openSellerKey === group.key}
                      summary={getShipmentSummaryCopy(group)}
                      steps={getShipmentProgressSteps(group.deliveryType, group.latestStatus)}
                      sellerReviewExists={Boolean(sellerReviews[group.sellerCode || group.sellerSlug || group.key])}
                      sellerEvents={[
                        ...buildCheckpointEventsForGroup(group),
                        ...cumulativeEvents.filter((entry) => Boolean((group.sellerCode && toStr(entry?.sellerCode) === group.sellerCode) || (group.sellerSlug && toStr(entry?.sellerSlug) === group.sellerSlug))),
                      ]
                        .sort((left, right) => toStr(right.createdAt).localeCompare(toStr(left.createdAt)))
                        .filter((entry, index, source) => {
                          const key = `${toStr(entry.title)}::${toStr(entry.createdAt)}::${toStr(entry.message)}`;
                          return source.findIndex((candidate) => `${toStr(candidate.title)}::${toStr(candidate.createdAt)}::${toStr(candidate.message)}` === key) === index;
                        })}
                      sellerCreditNotes={creditNotesBySeller.filter((entry) => Boolean((group.sellerCode && toStr(entry?.sellerCode) === group.sellerCode) || (group.sellerSlug && toStr(entry?.sellerSlug) === group.sellerSlug)))}
                      getLineImage={getLineImage}
                      sentenceStatus={sentenceStatus}
                      fulfillmentTone={fulfillmentTone}
                      formatMoney={formatMoney}
                      formatDateTime={formatDateTime}
                      getFrozenLineTotalIncl={getFrozenLineTotalIncl}
                      onToggleDetails={() => setOpenSellerKey((current) => (current === group.key ? null : group.key))}
                      onOpenSellerReview={() => openSellerReviewModal(group)}
                      onViewCreditNote={(creditNoteId) => handleViewCreditNote(creditNoteId)}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
                <p className="text-[18px] font-semibold text-[#202020]">Order events</p>
                <p className="mt-1 text-[13px] text-[#57636c]">This timeline combines events across all sellers involved in the order.</p>
                <div className="mt-4 space-y-4">
                  {cumulativeEvents.length ? (
                    cumulativeEvents.map((entry, index) => (
                      <div key={entry.id || `${entry.title || "event"}-${index}`} className="relative pl-6">
                        <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-[#202020]" />
                        {index < cumulativeEvents.length - 1 ? <span className="absolute left-[4px] top-4 h-[calc(100%+12px)] w-px bg-black/10" /> : null}
                        <p className="text-[15px] font-semibold text-[#202020]">{entry.title || "Order update"}</p>
                        {entry.message ? <p className="mt-1 text-[14px] text-[#57636c]">{entry.message}</p> : null}
                        <p className="mt-1 text-[12px] text-[#8b94a3]">
                          {formatDateTime(entry.createdAt)}
                          {entry.actorLabel ? ` • ${entry.actorLabel}` : ""}
                          {entry.sellerCode || entry.sellerSlug ? ` • ${sellerGroups.find((group) => (group.sellerCode && group.sellerCode === toStr(entry.sellerCode)) || (group.sellerSlug && group.sellerSlug === toStr(entry.sellerSlug)))?.vendorName || "Seller update"}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[14px] text-[#57636c]">Order updates will appear here as your order progresses.</p>
                  )}
                </div>
              </div>

              {creditNotesBySeller.length ? (
                <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[18px] font-semibold text-[#202020]">Credit notes</p>
                      <p className="mt-1 text-[13px] text-[#57636c]">Refunded seller slices are reflected here as separate adjustment documents.</p>
                    </div>
                    <p className="text-[14px] font-semibold text-[#202020]">{creditNotesBySeller.length} note{creditNotesBySeller.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {creditNotesBySeller.map((entry) => (
                      <div key={entry.creditNoteId || entry.creditNoteNumber} className="flex flex-col gap-3 rounded-[18px] border border-black/6 bg-[#fcfcfc] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[15px] font-semibold text-[#202020]">{entry.creditNoteNumber || "Credit note"}</p>
                          <p className="mt-1 text-[13px] text-[#57636c]">
                            {entry.vendorName || "Seller"} • {formatDateTime(entry.issuedAt)} • {formatMoney(Number(entry.amountIncl || 0))}
                          </p>
                        </div>
                        {entry.creditNoteId ? (
                          <button
                            type="button"
                            onClick={() => void handleViewCreditNote(entry.creditNoteId!)}
                            className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                          >
                            View credit note
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
                <p className="text-[18px] font-semibold text-[#202020]">Delivery address</p>
                <p className="mt-4 text-[16px] font-semibold text-[#202020]">{resolvedAddress?.recipientName || "Recipient"}</p>
                <div className="mt-2 space-y-1 text-[14px] text-[#57636c]">
                  {deliveryAddress.map((line) => <p key={line}>{line}</p>)}
                  {resolvedAddress?.phoneNumber ? <p>{resolvedAddress.phoneNumber}</p> : null}
                </div>
              </div>

              <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
                <p className="text-[18px] font-semibold text-[#202020]">Payment summary</p>
                <div className="mt-4 space-y-3 text-[14px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#57636c]">Products</span>
                    <span className="font-semibold text-[#202020]">{formatMoney(productsSubtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#57636c]">Delivery fee</span>
                    <span className="font-semibold text-[#202020]">{formatMoney(deliveryFee)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#57636c]">Payment method</span>
                    <span className="font-semibold text-[#202020]">{paymentMethodLabel}</span>
                  </div>
                  <div className="border-t border-black/6 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#202020]">Total</span>
                      <span className="text-[22px] font-semibold text-[#202020]">{formatMoney(totalIncl)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span className="text-[#57636c]">Paid</span>
                      <span className="font-semibold text-[#202020]">{formatMoney(paidIncl)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
