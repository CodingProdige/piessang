"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { DocumentLinkModal } from "@/components/ui/document-link-modal";
import { DocumentSnackbar } from "@/components/ui/document-snackbar";
import { PlatformPopover, PlatformPortalPopover, PopoverHintTrigger } from "@/components/ui/platform-popover";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { getSellerFulfillmentActions, getSellerFulfillmentStatusLabel } from "@/lib/orders/status-lifecycle";
import { getFrozenLineTotalIncl, getFrozenLineUnitPriceIncl } from "@/lib/orders/frozen-money";
import { formatMoneyExact } from "@/lib/money";

type SellerOrderSlice = {
  orderId: string;
  orderNumber: string;
  sellerCode?: string;
  sellerSlug?: string;
  createdAt?: string;
  customerName?: string;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  cancellation?: {
    status?: string;
    reason?: string;
    requestedAt?: string;
    approvedAt?: string;
    blocked?: boolean;
    blockMessage?: string;
  };
  deliveryOption?: {
    type?: string;
    label?: string;
    amountIncl?: number;
    leadTimeDays?: number | null;
    matchedRuleLabel?: string;
    destination?: string;
    instructions?: string;
    trackingMode?: string;
    cutoffTime?: string;
  };
  fulfilmentDeadline?: {
    dueAt?: string;
    dueAtLabel?: string;
    overdue?: boolean;
    showDeadline?: boolean;
  };
  actionPlan?: {
    title?: string;
    summary?: string;
    checklist?: string[];
  };
  customerContact?: {
    recipientName?: string;
    phone?: string;
    destination?: string;
    notes?: string;
  };
  deliveryProgress: {
    totalLines: number;
    deliveredLines: number;
    pendingLines: number;
    totalUnits: number;
    deliveredUnits: number;
    pendingUnits: number;
    percentageDelivered: number;
    linePercentageDelivered: number;
    isComplete: boolean;
  };
  vendorName?: string;
  counts: {
    items: number;
    quantity: number;
    selfFulfilment: number;
    piessangFulfilment: number;
  };
  totals: {
    subtotalIncl: number;
    deliveryIncl?: number;
    totalIncl?: number;
  };
  timeline?: Array<{
    id?: string;
    type?: string;
    title?: string;
    message?: string;
    actorType?: string;
    actorLabel?: string | null;
    createdAt?: string;
    status?: string | null;
    sellerCode?: string | null;
    sellerSlug?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  creditNotes?: Array<{
    creditNoteId?: string;
    creditNoteNumber?: string;
    amountIncl?: number;
    issuedAt?: string;
    status?: string;
  }>;
  flags: {
    new: boolean;
    unfulfilled: boolean;
    fulfilled: boolean;
  };
  lines: {
    selfFulfilment: any[];
    piessangFulfilment: any[];
  };
};

type SellerActionDraft = {
  courierName: string;
  trackingNumber: string;
  notes: string;
  cancellationReason: string;
};

type SellerActionLabels = {
  primary: string;
  secondary?: string;
};

type HoverCardState = {
  orderId: string;
  top: number;
  left: number;
  caretLeft: number;
} | null;

type LatePopoverState = {
  top: number;
  left: number;
  caretLeft: number;
} | null;

type SellerFulfillmentAction = "processing" | "dispatched" | "delivered" | "cancelled";
type SellerMetricPeriod = "today" | "7d" | "30d";
type SellerViewFilter = "all" | "unfulfilled" | "unpaid" | "open" | "fulfilled" | "cancelled" | "local_delivery";

type SellerOrdersWorkspaceProps = {
  sellerSlug?: string;
  sellerCode?: string;
  mode: "new" | "unfulfilled" | "fulfilled";
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatTime(value?: string) {
  const input = toStr(value);
  if (!input) return "";
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

function formatDateOnly(value?: string) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTimelineTime(value?: string) {
  const input = toStr(value);
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeOrderDate(value?: string) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  const timeLabel = new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  if (diffDays === 0) return `Today at ${timeLabel}`;
  if (diffDays === 1) return `Yesterday at ${timeLabel}`;
  return `${formatDateOnly(input)} at ${timeLabel}`;
}

function formatMoney(value: number) {
  return formatMoneyExact(value);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getLineTitle(item: any) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(product?.product?.title || product?.title || variant?.label || "Product");
}

function getLineSubtitle(item: any) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.label || variant?.variant_id || "");
}

function getLineImage(item: any) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const product = item?.product_snapshot || item?.product || {};
  return (
    toStr(variant?.media?.images?.find?.((entry: any) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(product?.media?.images?.find?.((entry: any) => Boolean(entry?.imageUrl))?.imageUrl) ||
    ""
  );
}

function getLineQty(item: any) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLineFrozenTotal(item: any) {
  return getFrozenLineTotalIncl(item);
}

function getLineFrozenUnitPrice(item: any) {
  return getFrozenLineUnitPriceIncl(item);
}

function getLineStatus(item: any) {
  return toStr(item?.fulfillment_tracking?.label || "Not started");
}

function orderStatusTone(status: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "completed" || normalized === "delivered") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "confirmed" || normalized === "payment_pending") return "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";
  if (normalized === "cancelled") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#57636c]";
}

function paymentStatusTone(status: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "paid") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "pending") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
  if (normalized === "failed" || normalized === "cancelled") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#57636c]";
}

function fulfillmentTone(status: string, overdue = false) {
  if (overdue) return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  const normalized = toStr(status).toLowerCase();
  if (normalized === "delivered") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "dispatched") return "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";
  if (normalized === "processing") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
  if (normalized === "confirmed") return "border-[#e5e7eb] bg-[#f9fafb] text-[#374151]";
  return "border-[#fef3c7] bg-[#fff7ed] text-[#8f7531]";
}

function statusLabelText(status: string) {
  return getSellerFulfillmentStatusLabel(status);
}

function sentenceStatus(value?: string | null) {
  const normalized = toStr(value || "unknown").replace(/_/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getDeliveryMethodDisplayLabel(option?: SellerOrderSlice["deliveryOption"]) {
  const raw = toStr(option?.label || "");
  if (!raw) return "Pending";
  return raw.replace(/\s+R\s?\d[\d.,]*/i, "").trim() || raw;
}

function isCourierTracked(item?: SellerOrderSlice | null) {
  return toStr(item?.deliveryOption?.trackingMode).toLowerCase() === "courier";
}

function getSellerActionLabels(item: SellerOrderSlice, nextStatus: SellerFulfillmentAction): SellerActionLabels {
  if (nextStatus === "processing") {
    return { primary: isCourierTracked(item) ? "Prepare shipment" : "Prepare delivery" };
  }
  if (nextStatus === "dispatched") {
    return {
      primary: isCourierTracked(item) ? "With courier" : "Out for delivery",
      secondary: isCourierTracked(item)
        ? "Add courier and tracking details before notifying the customer."
        : "Mark this order as on the way to the customer.",
    };
  }
  if (nextStatus === "delivered") {
    return { primary: "Mark delivered" };
  }
  if (nextStatus === "cancelled") {
    return { primary: "Cancel order" };
  }
  return { primary: `Mark ${statusLabelText(nextStatus).toLowerCase()}` };
}

function getNextSellerActions(item: SellerOrderSlice): SellerFulfillmentAction[] {
  if (item?.cancellation?.blocked) return [];
  return getSellerFulfillmentActions({
    currentStatus: item.fulfillmentStatus || item.orderStatus,
    deliveryType: item.deliveryOption?.type,
    isComplete: item.deliveryProgress?.isComplete,
  }) as SellerFulfillmentAction[];
}

function canSellerCancelOrder(item: SellerOrderSlice | null) {
  if (!item) return false;
  return getNextSellerActions(item).includes("cancelled");
}

function getDeadlineState(item: SellerOrderSlice, nowTick: number) {
  if (item?.cancellation?.blocked) {
    return { label: "Fulfilment locked", tone: "text-[#b91c1c]", overdue: false };
  }
  const fulfillmentStatus = toStr(item.fulfillmentStatus).toLowerCase();
  const orderStatus = toStr(item.orderStatus).toLowerCase();
  if (["delivered", "completed", "cancelled"].includes(fulfillmentStatus) || ["completed", "cancelled"].includes(orderStatus)) {
    return { label: "Fulfilment complete", tone: "text-[#166534]", overdue: false };
  }
  const dueAt = toStr(item.fulfilmentDeadline?.dueAt);
  if (!dueAt || item.fulfilmentDeadline?.showDeadline !== true) {
    return { label: "No fulfilment deadline", tone: "text-[#57636c]", overdue: false };
  }
  const deadline = new Date(dueAt);
  if (Number.isNaN(deadline.getTime())) {
    return { label: "Deadline unavailable", tone: "text-[#57636c]", overdue: false };
  }
  const diffMs = deadline.getTime() - nowTick;
  if (diffMs <= 0 || item.fulfilmentDeadline?.overdue) {
    const totalHoursLate = Math.max(1, Math.floor(Math.abs(diffMs) / (1000 * 60 * 60)));
    const daysLate = Math.floor(totalHoursLate / 24);
    const remainingHours = totalHoursLate % 24;
    const lateLabel =
      totalHoursLate < 24
        ? `Late by ${totalHoursLate}h`
        : remainingHours > 0
          ? `Late by ${daysLate}d ${remainingHours}h`
          : `Late by ${daysLate}d`;
    return {
      label: lateLabel,
      tone: "text-[#b91c1c]",
      overdue: true,
    };
  }
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const countdown = days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  return {
    label: countdown,
    tone: "text-[#8f7531]",
    overdue: false,
  };
}

function getCancellationTone(status: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "requested") return "border-[#facc15]/40 bg-[#fffbea] text-[#8f7531]";
  if (normalized === "approved" || normalized === "cancelled") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-black/10 bg-[#f7f7f7] text-[#57636c]";
}

function getSellerLifecycleDisplay(item: SellerOrderSlice, deadlineState: { label: string; tone: string; overdue: boolean }) {
  const orderStatus = toStr(item.orderStatus).toLowerCase();
  const paymentStatus = toStr(item.paymentStatus).toLowerCase();
  const cancellationStatus = toStr(item.cancellation?.status).toLowerCase();

  if (cancellationStatus === "cancelled" || orderStatus === "cancelled") {
    return {
      primaryLabel: "Cancelled",
      primaryTone: getCancellationTone("cancelled"),
      secondaryLabel: null as string | null,
      secondaryTone: "",
      message: item.cancellation?.blockMessage || "This order has been cancelled. Do not continue fulfilment.",
    };
  }

  if (paymentStatus === "refunded" || paymentStatus === "partial_refund") {
    return {
      primaryLabel: sentenceStatus(paymentStatus),
      primaryTone: paymentStatusTone(paymentStatus),
      secondaryLabel: cancellationStatus === "requested" ? "Cancellation requested" : null,
      secondaryTone: cancellationStatus === "requested" ? getCancellationTone("requested") : "",
      message: item.cancellation?.blockMessage || "This order has been refunded. Do not continue fulfilment.",
    };
  }

  if (cancellationStatus) {
    const statusLabel = cancellationStatus === "requested" ? "Cancellation requested" : cancellationStatus === "approved" ? "Cancellation approved" : `Cancellation ${sentenceStatus(cancellationStatus)}`;
    return {
      primaryLabel: getLineStatus(item),
      primaryTone: fulfillmentTone(item.fulfillmentStatus, deadlineState.overdue),
      secondaryLabel: statusLabel,
      secondaryTone: getCancellationTone(cancellationStatus),
      message: item.cancellation?.blocked ? item.cancellation.blockMessage || "Fulfilment is locked while this cancellation is being handled." : null,
    };
  }

  return {
    primaryLabel: getLineStatus(item),
    primaryTone: fulfillmentTone(item.fulfillmentStatus, deadlineState.overdue),
    secondaryLabel: null as string | null,
    secondaryTone: "",
    message: item.cancellation?.blocked ? item.cancellation.blockMessage || "Fulfilment locked." : null,
  };
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const lastIndex = Math.max(values.length - 1, 0);
  const lastValue = values[lastIndex] || 0;
  const areaPoints = [
    "0,100",
    ...values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    }),
    "100,100",
  ].join(" ");
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-10 w-[108px] overflow-visible">
      <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(32,32,32,0.1)" strokeWidth="2" />
      <polygon fill="rgba(87,166,255,0.12)" points={areaPoints} />
      <polyline fill="none" stroke="#57a6ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle
        cx={(lastIndex / Math.max(values.length - 1, 1)) * 100}
        cy={100 - (lastValue / max) * 100}
        r="3.5"
        fill="#57a6ff"
      />
    </svg>
  );
}

function buildSeriesFromOrders(items: SellerOrderSlice[], period: SellerMetricPeriod) {
  const bucketCount = period === "today" ? 8 : 7;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  const now = new Date();
  items.forEach((item) => {
    const input = toStr(item.createdAt);
    if (!input) return;
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return;
    if (period === "today") {
      const hoursAgo = (now.getTime() - date.getTime()) / 3_600_000;
      if (hoursAgo < 0 || hoursAgo > 24) return;
      const bucket = Math.min(bucketCount - 1, Math.max(0, Math.floor((23 - date.getHours()) / 3)));
      buckets[bucketCount - 1 - bucket] += 1;
      return;
    }
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (daysAgo < 0 || daysAgo >= bucketCount) return;
    buckets[bucketCount - 1 - daysAgo] += 1;
  });
  return buckets;
}

function formatDelta(current: number, previous: number) {
  if (previous <= 0) {
    if (current <= 0) return "0%";
    return "+100%";
  }
  const delta = ((current - previous) / previous) * 100;
  const rounded = Math.round(delta);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function inPeriod(value: string | undefined, days: number) {
  const input = toStr(value);
  if (!input) return false;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff <= days * 86_400_000;
}

function previousPeriod(value: string | undefined, days: number) {
  const input = toStr(value);
  if (!input) return false;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff > days * 86_400_000 && diff <= days * 2 * 86_400_000;
}

function SellerHoverCard({
  item,
  open,
  onOpenOrder,
  hoverCard,
}: {
  item: SellerOrderSlice;
  open: boolean;
  onOpenOrder: () => void;
  hoverCard: HoverCardState;
}) {
  if (!open || !hoverCard) return null;
  return (
    <PlatformPortalPopover open={open} top={hoverCard.top} left={hoverCard.left} width={300} caretLeft={hoverCard.caretLeft}>
      <p className="text-[15px] font-semibold leading-[1.15] text-[#202020]">{item.customerName || "Customer"}</p>
      <p className="mt-1 text-[13px] leading-[1.35] text-[#57636c]">{item.customerContact?.destination || item.deliveryOption?.destination || "Delivery destination pending"}</p>
      <p className="mt-3 text-[13px] text-[#202020]">{pluralize(item.counts.items, "line")} • {pluralize(item.counts.quantity, "item")}</p>
      <p className="mt-1 text-[13px] text-[#202020]">{formatMoney(item.totals.subtotalIncl)} seller subtotal</p>
      <button type="button" onClick={onOpenOrder} className="mt-4 w-full rounded-[12px] border border-black/10 px-3 py-2 text-[13px] font-semibold text-[#202020]">
        Open order
      </button>
    </PlatformPortalPopover>
  );
}

function SellerMetricCard({
  id,
  title,
  value,
  delta,
  helper,
  series,
  infoOpen = false,
  onToggleInfo,
  onOpenInfo,
  onCloseInfo,
}: {
  id: string;
  title: string;
  value: string | number;
  delta: string;
  helper: string;
  series: number[];
  infoOpen?: boolean;
  onToggleInfo?: () => void;
  onOpenInfo?: (id: string) => void;
  onCloseInfo?: () => void;
}) {
  return (
    <div
      data-seller-orders-metric-info
      className="relative min-h-[156px] rounded-[18px] border border-black/6 bg-[#fcfcfc] px-5 py-4 shadow-[0_6px_20px_rgba(20,24,27,0.04)]"
      onMouseEnter={() => onOpenInfo?.(id)}
      onMouseLeave={() => onCloseInfo?.()}
    >
      <button type="button" onClick={onToggleInfo} className="text-left" aria-label={`About ${title}`}>
        <PopoverHintTrigger active={infoOpen} className="text-[13px] font-semibold">
          {title}
        </PopoverHintTrigger>
      </button>
      {infoOpen ? (
        <PlatformPopover className="left-5 right-5 top-10 mt-2 w-auto">
          <p className="text-[15px] font-semibold leading-[1.15] text-[#202020]">{title} over time</p>
          <p className="mt-1 text-[13px] leading-[1.35] text-[#57636c]">{helper}</p>
        </PlatformPopover>
      ) : null}
      <div className="mt-5">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="text-[24px] font-semibold tracking-[-0.025em] leading-none text-[#202020] sm:text-[26px]">{value}</span>
          <span className={`pb-1 text-[12px] font-semibold ${delta.startsWith("-") ? "text-[#b91c1c]" : "text-[#1f8f55]"}`}>{delta}</span>
        </div>
      </div>
      <div className="mt-4 rounded-[14px] border border-black/6 bg-white/80 px-3 py-2">
        <Sparkline values={series} />
      </div>
    </div>
  );
}

function StatusWithLatePopover({
  status,
  deadlineState,
}: {
  status: string;
  deadlineState: { label: string; tone: string; overdue: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<LatePopoverState>(null);

  if (!deadlineState.overdue) {
    return <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[12px] font-semibold ${fulfillmentTone(status)}`}>{sentenceStatus(status)}</span>;
  }

  function openPopover(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 12,
      left: Math.max(16, Math.min(rect.left - 8, window.innerWidth - 236)),
      caretLeft: Math.max(20, Math.min(64, rect.width / 2)),
    });
    setOpen(true);
  }

  return (
    <div
      className="relative w-fit"
      onMouseEnter={(event) => openPopover(event.currentTarget)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          openPopover(event.currentTarget as HTMLElement);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          openPopover(event.currentTarget as HTMLElement);
        }}
        className="inline-block cursor-pointer text-left"
      >
        <PopoverHintTrigger active={open}>
          <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${fulfillmentTone(status, true)}`}>{sentenceStatus(status)}</span>
        </PopoverHintTrigger>
      </span>
      {open ? (
        <PlatformPortalPopover open={open} top={position?.top || 0} left={position?.left || 0} width={220} caretLeft={position?.caretLeft || 40}>
          <p className="text-[14px] font-semibold text-[#202020]">Fulfilment overdue</p>
          <p className="mt-1 text-[13px] text-[#b91c1c]">{deadlineState.label}</p>
        </PlatformPortalPopover>
      ) : null}
    </div>
  );
}

function SellerTimeline({ item }: { item: SellerOrderSlice }) {
  const entries = Array.isArray(item.timeline) ? item.timeline : [];
  return (
    <section className="rounded-[18px] border border-black/6 bg-white p-5">
      <p className="text-[16px] font-semibold text-[#202020]">Timeline</p>
      <div className="mt-4 space-y-4">
        {entries.length ? entries.map((entry, index) => (
          <div key={entry.id || `${entry.title}-${index}`} className="grid grid-cols-[14px_1fr_auto] gap-3 text-[13px]">
            <div className="flex justify-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#202020]" />
            </div>
            <div>
              <p className="font-semibold text-[#202020]">{entry.title || "Order updated"}</p>
              <p className="mt-1 text-[#57636c]">{entry.message || "No additional details were recorded for this event."}</p>
              {entry.actorLabel ? <p className="mt-1 text-[12px] text-[#8b94a3]">By {entry.actorLabel}</p> : null}
            </div>
            <p className="text-[#8b94a3]">{formatTimelineTime(entry.createdAt)}</p>
          </div>
        )) : (
          <p className="text-[13px] text-[#57636c]">No timeline activity recorded yet.</p>
        )}
      </div>
    </section>
  );
}

export function SellerOrdersWorkspace({ sellerSlug = "", sellerCode = "", mode }: SellerOrdersWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { authReady, isAuthenticated } = useAuth();
  const [items, setItems] = useState<SellerOrderSlice[]>([]);
  const [counts, setCounts] = useState({ all: 0, new: 0, unfulfilled: 0, fulfilled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionDrafts, setActionDrafts] = useState<Record<string, SellerActionDraft>>({});
  const [documentLoadingOrderId, setDocumentLoadingOrderId] = useState<string | null>(null);
  const [documentLoadingType, setDocumentLoadingType] = useState<"picking_slip" | "delivery_note" | "invoice" | "credit_note" | null>(null);
  const [documentModal, setDocumentModal] = useState<{ title: string; description: string; url: string; openLabel: string } | null>(null);
  const [documentSnackbar, setDocumentSnackbar] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<HoverCardState>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [metricPeriod, setMetricPeriod] = useState<SellerMetricPeriod>("7d");
  const [viewFilter, setViewFilter] = useState<SellerViewFilter>(mode === "fulfilled" ? "fulfilled" : mode === "unfulfilled" ? "unfulfilled" : "open");
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [metricInfoOpen, setMetricInfoOpen] = useState<string | null>(null);
  const [cancelModalOrderId, setCancelModalOrderId] = useState<string | null>(null);
  const [dispatchModalOrderId, setDispatchModalOrderId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const detailActionsRef = useRef<HTMLDivElement | null>(null);

  const activeOrderId = toStr(searchParams.get("order")) || null;

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!documentSnackbar) return;
    const timeout = window.setTimeout(() => setDocumentSnackbar(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [documentSnackbar]);

  useEffect(() => {
    if (!activeOrderId) {
      setCancelModalOrderId(null);
      setDispatchModalOrderId(null);
    }
  }, [activeOrderId]);

  useEffect(() => {
    setViewFilter(mode === "fulfilled" ? "fulfilled" : mode === "unfulfilled" ? "unfulfilled" : "open");
  }, [mode]);

  useOutsideDismiss(
    periodMenuOpen || moreActionsOpen || metricInfoOpen !== null || hoveredOrderId !== null,
    () => {
      setPeriodMenuOpen(false);
      setMoreActionsOpen(false);
      setMetricInfoOpen(null);
      setHoveredOrderId(null);
      setHoverCard(null);
    },
    {
      refs: [periodMenuRef, detailActionsRef],
      selectors: ["[data-seller-orders-metric-info]", "[data-seller-orders-customer]"],
    },
  );

  function openCustomerHoverCard(orderId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setHoveredOrderId(orderId);
    setHoverCard({
      orderId,
      top: rect.bottom + 12,
      left: Math.max(16, Math.min(rect.left - 8, window.innerWidth - 316)),
      caretLeft: Math.max(22, Math.min(72, rect.width / 2)),
    });
  }

  useEffect(() => {
    if (!authReady) return undefined;
    if (!isAuthenticated) {
      setItems([]);
      setCounts({ all: 0, new: 0, unfulfilled: 0, fulfilled: 0 });
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    async function loadOrders() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const params = new URLSearchParams({ filter: "all" });
        if (sellerCode) params.set("sellerCode", sellerCode);
        else if (sellerSlug) params.set("sellerSlug", sellerSlug);
        const response = await fetch(`/api/client/v1/orders/seller/list?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load seller orders.");
        }
        if (cancelled) return;
        setItems(Array.isArray(payload?.items) ? payload.items : []);
        setCounts(payload?.counts || { all: 0, new: 0, unfulfilled: 0, fulfilled: 0 });
      } catch (cause) {
        if (!cancelled) {
          setItems([]);
          setError(cause instanceof Error ? cause.message : "Unable to load seller orders.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, mode, sellerCode, sellerSlug]);

  useEffect(() => {
    setSelectedOrderIds((current) => current.filter((orderId) => items.some((item) => item.orderId === orderId)));
  }, [items]);

  function setOrderRoute(orderId: string | null) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (orderId) nextParams.set("order", orderId);
    else nextParams.delete("order");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.push(nextUrl, { scroll: false });
  }

  function getDraft(orderId: string): SellerActionDraft {
    return actionDrafts[orderId] || { courierName: "", trackingNumber: "", notes: "", cancellationReason: "" };
  }

  function updateDraft(orderId: string, patch: Partial<SellerActionDraft>) {
    setActionDrafts((current) => ({
      ...current,
      [orderId]: {
        courierName: current[orderId]?.courierName || "",
        trackingNumber: current[orderId]?.trackingNumber || "",
        notes: current[orderId]?.notes || "",
        cancellationReason: current[orderId]?.cancellationReason || "",
        ...patch,
      },
    }));
  }

  async function updateSellerOrderStatus(item: SellerOrderSlice, nextStatus: SellerFulfillmentAction) {
    setUpdatingOrderId(item.orderId);
    setError(null);
    setNotice(null);
    try {
      const draft = getDraft(item.orderId);
      const trackingMode = toStr(item.deliveryOption?.trackingMode).toLowerCase();
      const response = await fetch("/api/client/v1/orders/seller/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          sellerCode: sellerCode || item.sellerCode,
          sellerSlug: sellerSlug || item.sellerSlug,
          status: nextStatus,
          trackingNumber: trackingMode === "courier" ? draft.trackingNumber : "",
          courierName: trackingMode === "courier" ? draft.courierName : "",
          notes: draft.notes,
          cancellationReason: nextStatus === "cancelled" ? draft.cancellationReason : "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update seller order status.");
      }

      setItems((current) =>
        current.map((entry) =>
          entry.orderId !== item.orderId
            ? entry
            : {
                ...entry,
                orderStatus: nextStatus === "delivered" ? "completed" : nextStatus,
                fulfillmentStatus: nextStatus === "delivered" ? "delivered" : nextStatus,
                deliveryProgress: payload?.deliveryProgress || entry.deliveryProgress,
                lines: {
                  selfFulfilment: entry.lines.selfFulfilment.map((line) => ({
                    ...line,
                    fulfillment_tracking: {
                      ...(line?.fulfillment_tracking || {}),
                      status: nextStatus,
                      label: statusLabelText(nextStatus),
                      delivered: nextStatus === "delivered",
                      cancellationReason: nextStatus === "cancelled" ? draft.cancellationReason : line?.fulfillment_tracking?.cancellationReason,
                    },
                  })),
                  piessangFulfilment: entry.lines.piessangFulfilment,
                },
              },
        ),
      );
      setNotice(`Order ${item.orderNumber || item.orderId} marked ${statusLabelText(nextStatus).toLowerCase()}.`);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update seller order status.");
      return false;
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function bulkUpdateSelectedOrders(nextStatus: SellerFulfillmentAction) {
    const selectedItems = items.filter((item) => selectedOrderIds.includes(item.orderId));
    if (!selectedItems.length) return;
    let updated = 0;
    for (const item of selectedItems) {
      if (!getNextSellerActions(item).includes(nextStatus)) continue;
      const ok = await updateSellerOrderStatus(item, nextStatus);
      if (!ok) break;
      updated += 1;
    }
    if (updated > 1) {
      setNotice(`${updated} orders marked ${statusLabelText(nextStatus).toLowerCase()}.`);
    }
  }

  async function handleGenerateDocument(item: SellerOrderSlice, docType: "picking_slip" | "delivery_note" | "invoice") {
    setDocumentLoadingOrderId(item.orderId);
    setDocumentLoadingType(docType);
    setError(null);
    setNotice(null);
    setDocumentSnackbar({
      tone: "info",
      message: `Preparing ${docType === "picking_slip" ? "packing slip" : docType === "delivery_note" ? "delivery note" : "invoice"} for ${item.orderNumber || item.orderId}...`,
    });
    try {
      const response = await fetch("/api/client/v1/orders/seller/documents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          sellerCode: sellerCode || item.sellerCode,
          sellerSlug: sellerSlug || item.sellerSlug,
          docType: docType === "picking_slip" ? "packing_slip" : docType,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false || !payload?.data?.url) {
        throw new Error(payload?.message || "Unable to generate that document right now.");
      }
      setDocumentModal({
        title: docType === "picking_slip" ? "Packing slip ready" : docType === "delivery_note" ? "Delivery note ready" : "Invoice ready",
        description:
          docType === "picking_slip"
            ? "You can open this packing slip in a new tab or copy the link."
            : docType === "delivery_note"
              ? "You can open this delivery note in a new tab or copy the link."
              : "You can open this invoice in a new tab or copy the link.",
        url: String(payload.data.url),
        openLabel: docType === "picking_slip" ? "Open packing slip" : docType === "delivery_note" ? "Open delivery note" : "Open invoice",
      });
      setDocumentSnackbar({
        tone: "success",
        message: `${docType === "picking_slip" ? "Packing slip" : docType === "delivery_note" ? "Delivery note" : "Invoice"} ready for ${item.orderNumber || item.orderId}.`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to generate that document right now.";
      setError(message);
      setDocumentSnackbar({ tone: "error", message });
    } finally {
      setDocumentLoadingOrderId(null);
      setDocumentLoadingType(null);
    }
  }

  async function handleGenerateCreditNote(item: SellerOrderSlice, creditNoteId: string) {
    setDocumentLoadingOrderId(item.orderId);
    setDocumentLoadingType("credit_note");
    setError(null);
    setNotice(null);
    setDocumentSnackbar({
      tone: "info",
      message: `Preparing credit note for ${item.orderNumber || item.orderId}...`,
    });
    try {
      const response = await fetch("/api/client/v1/orders/documents/seller-credit-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: item.orderId,
          creditNoteId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false || !payload?.data?.url) {
        throw new Error(payload?.message || "Unable to generate that credit note right now.");
      }
      setDocumentModal({
        title: "Credit note ready",
        description: "You can open this credit note in a new tab or copy the link.",
        url: String(payload.data.url),
        openLabel: "Open credit note",
      });
      setDocumentSnackbar({ tone: "success", message: `Credit note ready for ${item.orderNumber || item.orderId}.` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to generate that credit note right now.";
      setError(message);
      setDocumentSnackbar({ tone: "error", message });
    } finally {
      setDocumentLoadingOrderId(null);
      setDocumentLoadingType(null);
    }
  }

  function handleSellerStatusAction(item: SellerOrderSlice, nextStatus: SellerFulfillmentAction) {
    if (nextStatus === "cancelled") {
      setCancelModalOrderId(item.orderId);
      return;
    }
    if (nextStatus === "dispatched" && isCourierTracked(item)) {
      setDispatchModalOrderId(item.orderId);
      return;
    }
    void updateSellerOrderStatus(item, nextStatus);
  }

  const filteredItems = useMemo(() => {
    const needle = toStr(searchTerm).toLowerCase();
    return items.filter((item) => {
      const orderStatus = toStr(item.orderStatus).toLowerCase();
      const fulfillmentStatus = toStr(item.fulfillmentStatus).toLowerCase();
      const paymentStatus = toStr(item.paymentStatus).toLowerCase();
      const deliveryType = toStr(item.deliveryOption?.type).toLowerCase();

      if (viewFilter === "unfulfilled" && !(fulfillmentStatus === "processing" || fulfillmentStatus === "confirmed" || fulfillmentStatus === "not started" || !item.deliveryProgress?.isComplete)) {
        return false;
      }
      if (viewFilter === "unpaid" && paymentStatus !== "pending") return false;
      if (viewFilter === "open" && ["completed", "cancelled", "delivered"].includes(orderStatus)) return false;
      if (viewFilter === "fulfilled" && fulfillmentStatus !== "delivered" && !item.deliveryProgress?.isComplete) return false;
      if (viewFilter === "cancelled" && orderStatus !== "cancelled" && toStr(item.cancellation?.status).toLowerCase() !== "cancelled") return false;
      if (viewFilter === "local_delivery" && !["direct_delivery", "collection"].includes(deliveryType)) return false;

      if (!needle) return true;
      const haystacks = [
        item.orderNumber,
        item.orderId,
        item.customerName,
        item.vendorName,
        ...item.lines.selfFulfilment.map((line) => getLineTitle(line)),
        ...item.lines.piessangFulfilment.map((line) => getLineTitle(line)),
      ]
        .map((value) => toStr(value).toLowerCase())
        .filter(Boolean);
      return haystacks.some((value) => value.includes(needle));
    });
  }, [items, searchTerm, viewFilter]);

  const totalUnits = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.counts.quantity || 0), 0), [filteredItems]);
  const totalValue = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.totals.totalIncl || item.totals.subtotalIncl || 0), 0), [filteredItems]);
  const totalDelivered = useMemo(() => filteredItems.filter((item) => item.deliveryProgress?.isComplete).length, [filteredItems]);
  const activeItem = useMemo(() => items.find((item) => item.orderId === activeOrderId) || null, [activeOrderId, items]);
  const cancelModalItem = useMemo(() => items.find((item) => item.orderId === cancelModalOrderId) || null, [cancelModalOrderId, items]);
  const dispatchModalItem = useMemo(() => items.find((item) => item.orderId === dispatchModalOrderId) || null, [dispatchModalOrderId, items]);
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedOrderIds.includes(item.orderId));
  const selectedItems = useMemo(() => items.filter((item) => selectedOrderIds.includes(item.orderId)), [items, selectedOrderIds]);
  const commonSelectedActions = useMemo(() => {
    if (!selectedItems.length) return [] as SellerFulfillmentAction[];
    return (["processing", "dispatched", "delivered"] as SellerFulfillmentAction[]).filter((status) =>
      selectedItems.every((item) => getNextSellerActions(item).includes(status)),
    );
  }, [selectedItems]);

  const periodDays = metricPeriod === "today" ? 1 : metricPeriod === "7d" ? 7 : 30;
  const periodStats = useMemo(() => {
    const currentItems = filteredItems.filter((item) => inPeriod(item.createdAt, periodDays));
    const previousItems = filteredItems.filter((item) => previousPeriod(item.createdAt, periodDays));
    const summarise = (list: SellerOrderSlice[]) => ({
      orders: list.length,
      units: list.reduce((sum, item) => sum + Number(item.counts.quantity || 0), 0),
      value: list.reduce((sum, item) => sum + Number(item.totals.totalIncl || item.totals.subtotalIncl || 0), 0),
      delivered: list.filter((item) => item.deliveryProgress?.isComplete).length,
    });
    return {
      current: summarise(currentItems),
      previous: summarise(previousItems),
      currentItems,
    };
  }, [filteredItems, periodDays]);

  const metricCards = [
    {
      id: "orders",
      title: "Orders",
      value: periodStats.current.orders,
      delta: formatDelta(periodStats.current.orders, periodStats.previous.orders),
      helper: "Orders created in the selected period and current table view.",
      series: buildSeriesFromOrders(periodStats.currentItems, metricPeriod),
    },
    {
      id: "items",
      title: "Items ordered",
      value: periodStats.current.units,
      delta: formatDelta(periodStats.current.units, periodStats.previous.units),
      helper: "Number of units ordered across this result set.",
      series: buildSeriesFromOrders(periodStats.currentItems, metricPeriod).map((value) => value * 2 || 0),
    },
    {
      id: "value",
      title: "Seller value",
      value: formatMoney(periodStats.current.value),
      delta: formatDelta(periodStats.current.value, periodStats.previous.value),
      helper: "Seller subtotal before shipping and marketplace fees.",
      series: buildSeriesFromOrders(periodStats.currentItems, metricPeriod).map((value, index) => value * (index + 1)),
    },
    {
      id: "delivered",
      title: "Orders delivered",
      value: periodStats.current.delivered,
      delta: formatDelta(periodStats.current.delivered, periodStats.previous.delivered),
      helper: "Orders that have completed delivery in this result set.",
      series: buildSeriesFromOrders(periodStats.currentItems.filter((item) => item.deliveryProgress?.isComplete), metricPeriod),
    },
  ];

  const periodLabel = metricPeriod === "today" ? "Today" : metricPeriod === "7d" ? "Last 7 days" : "Last 30 days";
  const periodHint = metricPeriod === "today" ? "Compared to current hour yesterday" : metricPeriod === "7d" ? "Compared to previous 7 days" : "Compared to previous 30 days";

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds((current) => (current.includes(orderId) ? current.filter((entry) => entry !== orderId) : [...current, orderId]));
  }

  function toggleVisibleSelection() {
    if (!filteredItems.length) return;
    setSelectedOrderIds((current) => {
      if (allVisibleSelected) return current.filter((orderId) => !filteredItems.some((item) => item.orderId === orderId));
      return Array.from(new Set([...current, ...filteredItems.map((item) => item.orderId)]));
    });
  }

  if (activeItem) {
    const deadlineState = getDeadlineState(activeItem, nowTick);
    return (
      <div className="space-y-5">
        <DocumentLinkModal
          open={Boolean(documentModal?.url)}
          title={documentModal?.title || "Document ready"}
          description={documentModal?.description || "You can open this document in a new tab or copy the link."}
          url={documentModal?.url || ""}
          onClose={() => setDocumentModal(null)}
          openLabel={documentModal?.openLabel || "Open document"}
        />
        {notice ? (
          <div className="flex items-start justify-between gap-3 rounded-[14px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">
            <p>{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#b7ebd1] text-[14px] text-[#166534] hover:bg-white/70"
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="flex items-start justify-between gap-3 rounded-[14px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f2c7cb] text-[14px] text-[#b91c1c] hover:bg-white/70"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        ) : null}

        <section className="flex flex-col gap-4 rounded-[24px] border border-black/6 bg-white px-5 py-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)] lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button type="button" onClick={() => setOrderRoute(null)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#57636c] hover:text-[#202020]">
              <span className="text-[18px]">&lsaquo;</span> Orders
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h2 className="text-[34px] font-semibold tracking-[-0.04em] text-[#202020]">{activeItem.orderNumber || activeItem.orderId}</h2>
              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${paymentStatusTone(activeItem.paymentStatus)}`}>{sentenceStatus(activeItem.paymentStatus)}</span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${fulfillmentTone(activeItem.fulfillmentStatus, deadlineState.overdue)}`}>{sentenceStatus(activeItem.fulfillmentStatus)}</span>
              {activeItem.cancellation?.status ? (
                <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getCancellationTone(activeItem.cancellation.status)}`}>
                  Cancellation {sentenceStatus(activeItem.cancellation.status)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[14px] text-[#57636c]">
              {formatTime(activeItem.createdAt)} from {getDeliveryMethodDisplayLabel(activeItem.deliveryOption)}
            </p>
            {activeItem.cancellation?.blocked ? (
              <div className="mt-4 max-w-[760px] rounded-[16px] border border-[#fecaca] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">
                <p className="font-semibold">Fulfilment locked</p>
                <p className="mt-1">
                  {activeItem.cancellation.blockMessage || "This order should not be fulfilled while the cancellation is being handled."}
                </p>
                {activeItem.cancellation.reason ? <p className="mt-1 text-[12px]">Reason: {activeItem.cancellation.reason}</p> : null}
              </div>
            ) : null}
          </div>
          <div ref={detailActionsRef} className="relative flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            {getNextSellerActions(activeItem).slice(0, 2).map((nextStatus) => (
              <button
                key={nextStatus}
                type="button"
                onClick={() => handleSellerStatusAction(activeItem, nextStatus)}
                disabled={updatingOrderId === activeItem.orderId}
                className={`rounded-[12px] px-4 py-2.5 text-[13px] font-semibold ${nextStatus === "processing" || nextStatus === "dispatched" ? "bg-[#202020] text-white" : nextStatus === "cancelled" ? "border border-[#f2c7cb] bg-white text-[#b91c1c]" : "border border-black/10 bg-white text-[#202020]"}`}
              >
                {updatingOrderId === activeItem.orderId ? "Updating..." : getSellerActionLabels(activeItem, nextStatus).primary}
              </button>
            ))}
            {canSellerCancelOrder(activeItem) && !getNextSellerActions(activeItem).slice(0, 2).includes("cancelled") ? (
              <button
                type="button"
                onClick={() => setCancelModalOrderId(activeItem.orderId)}
                disabled={updatingOrderId === activeItem.orderId}
                className="rounded-[12px] border border-[#f2c7cb] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#b91c1c]"
              >
                Cancel order
              </button>
            ) : null}
            <button type="button" onClick={() => setMoreActionsOpen((current) => !current)} className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">
              More actions
            </button>
            {moreActionsOpen ? (
              <div className="absolute right-0 top-[52px] z-30 w-[220px] rounded-[16px] border border-black/10 bg-white p-2 shadow-[0_24px_60px_rgba(20,24,27,0.18)]">
                <button type="button" onClick={() => { void handleGenerateDocument(activeItem, "picking_slip"); setMoreActionsOpen(false); }} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-[#202020] hover:bg-[#f6f6f6]">
                  {documentLoadingOrderId === activeItem.orderId && documentLoadingType === "picking_slip" ? "Generating packing slip..." : "Print packing slip"}
                </button>
                <button type="button" onClick={() => { void handleGenerateDocument(activeItem, "delivery_note"); setMoreActionsOpen(false); }} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-[#202020] hover:bg-[#f6f6f6]">
                  {documentLoadingOrderId === activeItem.orderId && documentLoadingType === "delivery_note" ? "Generating delivery note..." : "Print delivery note"}
                </button>
                <button type="button" onClick={() => { void handleGenerateDocument(activeItem, "invoice"); setMoreActionsOpen(false); }} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-[#202020] hover:bg-[#f6f6f6]">
                  {documentLoadingOrderId === activeItem.orderId && documentLoadingType === "invoice" ? "Generating invoice..." : "Print invoice"}
                </button>
                {canSellerCancelOrder(activeItem) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalOrderId(activeItem.orderId);
                      setMoreActionsOpen(false);
                    }}
                    className="mt-1 block w-full rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold text-[#b91c1c] hover:bg-[#fff7f8]"
                  >
                    Cancel order
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] ${fulfillmentTone(activeItem.fulfillmentStatus, deadlineState.overdue)}`}>
                  {sentenceStatus(activeItem.fulfillmentStatus)} ({activeItem.counts.quantity})
                </span>
                <span className="text-[13px] text-[#8b94a3]">{deadlineState.label}</span>
              </div>
              <div className="mt-4 rounded-[16px] border border-black/6 bg-[#fafafa] px-4 py-4 text-[14px] font-semibold text-[#3f3f46]">
                {activeItem.deliveryOption?.label || "Delivery method pending"}
              </div>
              <div className="mt-4 divide-y divide-black/6 overflow-hidden rounded-[16px] border border-black/6">
                {activeItem.lines.selfFulfilment.map((line, index) => (
                  <div key={`${activeItem.orderId}-line-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-4 bg-white px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-black/8 bg-[#f8f8f8]">
                        {getLineImage(line) ? (
                          <img src={getLineImage(line)} alt={getLineTitle(line)} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa1a9]">No image</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-[#202020]">{getLineTitle(line)}</p>
                        {getLineSubtitle(line) ? <p className="mt-1 text-[13px] text-[#676f79]">{getLineSubtitle(line)}</p> : null}
                      </div>
                    </div>
                    <p className="text-[15px] text-[#202020]">{formatMoney(getLineFrozenUnitPrice(line))} x {getLineQty(line)}</p>
                    <p className="text-[15px] font-semibold text-[#202020]">{formatMoney(getLineFrozenTotal(line))}</p>
                  </div>
                ))}
                {!activeItem.lines.selfFulfilment.length ? (
                  <div className="px-4 py-4 text-[14px] text-[#57636c]">No seller-handled lines on this order.</div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {getNextSellerActions(activeItem).map((nextStatus) => (
                  <button
                    key={nextStatus}
                    type="button"
                    onClick={() => handleSellerStatusAction(activeItem, nextStatus)}
                    disabled={updatingOrderId === activeItem.orderId}
                    className={`rounded-[12px] px-4 py-2.5 text-[13px] font-semibold ${nextStatus === "processing" || nextStatus === "dispatched" ? "bg-[#202020] text-white" : nextStatus === "cancelled" ? "border border-[#f2c7cb] bg-white text-[#b91c1c]" : "border border-black/10 bg-white text-[#202020]"}`}
                  >
                    {updatingOrderId === activeItem.orderId ? "Updating..." : getSellerActionLabels(activeItem, nextStatus).primary}
                  </button>
                ))}
                {canSellerCancelOrder(activeItem) && !getNextSellerActions(activeItem).includes("cancelled") ? (
                  <button
                    type="button"
                    onClick={() => setCancelModalOrderId(activeItem.orderId)}
                    disabled={updatingOrderId === activeItem.orderId}
                    className="rounded-[12px] border border-[#f2c7cb] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#b91c1c]"
                  >
                    Cancel order
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] ${paymentStatusTone(activeItem.paymentStatus)}`}>{sentenceStatus(activeItem.paymentStatus)}</span>
              <div className="mt-4 divide-y divide-black/6 rounded-[16px] border border-black/6">
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]">
                  <span className="text-[#57636c]">Subtotal</span>
                  <span className="font-semibold text-[#202020]">{formatMoney(activeItem.totals.subtotalIncl)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]">
                  <span className="text-[#57636c]">Delivery fee</span>
                  <span className="font-semibold text-[#202020]">{formatMoney(activeItem.totals.deliveryIncl || Number(activeItem.deliveryOption?.amountIncl || 0))}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]">
                  <span className="text-[#57636c]">Items</span>
                  <span className="font-semibold text-[#202020]">{pluralize(activeItem.counts.quantity, "item")}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]">
                  <span className="text-[#57636c]">Delivery method</span>
                  <span className="font-semibold text-[#202020]">{getDeliveryMethodDisplayLabel(activeItem.deliveryOption)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]">
                  <span className="text-[#57636c]">Total</span>
                  <span className="font-semibold text-[#202020]">{formatMoney(activeItem.totals.totalIncl || activeItem.totals.subtotalIncl + Number(activeItem.deliveryOption?.amountIncl || 0))}</span>
                </div>
              </div>
            </section>

            {Array.isArray(activeItem.creditNotes) && activeItem.creditNotes.length ? (
              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[16px] font-semibold text-[#202020]">Credit notes</p>
                    <p className="mt-1 text-[13px] text-[#57636c]">Refund adjustments stay separate from the original invoice.</p>
                  </div>
                  <span className="text-[13px] font-semibold text-[#202020]">{pluralize(activeItem.creditNotes.length, "credit note")}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {activeItem.creditNotes.map((note) => (
                    <div key={note.creditNoteId || note.creditNoteNumber} className="flex flex-col gap-3 rounded-[16px] border border-black/6 bg-[#fafafa] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[14px] font-semibold text-[#202020]">{note.creditNoteNumber || note.creditNoteId || "Credit note"}</p>
                        <p className="mt-1 text-[13px] text-[#57636c]">
                          {formatTime(note.issuedAt)} • {formatMoney(Number(note.amountIncl || 0))}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => note.creditNoteId && void handleGenerateCreditNote(activeItem, note.creditNoteId)}
                        disabled={!note.creditNoteId || (documentLoadingOrderId === activeItem.orderId && documentLoadingType === "credit_note")}
                        className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-60"
                      >
                        {documentLoadingOrderId === activeItem.orderId && documentLoadingType === "credit_note" ? "Opening..." : "View credit note"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <SellerTimeline item={activeItem} />
          </div>

          <div className="space-y-5">
            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Notes</p>
              <p className="mt-3 text-[14px] text-[#57636c]">{activeItem.customerContact?.notes || "No notes from customer"}</p>
              <p className="mt-5 text-[13px] font-semibold text-[#202020]">Delivery instructions</p>
              <p className="mt-2 text-[14px] text-[#57636c]">{activeItem.deliveryOption?.instructions || "No special delivery instructions saved."}</p>
              {activeItem.customerContact?.phone ? <p className="mt-2 text-[14px] text-[#202020]">{activeItem.customerContact.phone}</p> : null}
            </section>

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Customer</p>
              <p className="mt-4 text-[20px] font-semibold text-[#1d4ed8]">{activeItem.customerName || "Customer"}</p>
              <p className="mt-1 text-[14px] text-[#1d4ed8]">{pluralize(activeItem.counts.items, "order line")} on this seller slice</p>
              <div className="mt-5 space-y-4 text-[14px]">
                <div>
                  <p className="font-semibold text-[#202020]">Contact information</p>
                  <p className="mt-2 text-[#1d4ed8]">{activeItem.customerContact?.phone || "No phone saved"}</p>
                </div>
                <div>
                  <p className="font-semibold text-[#202020]">Delivery address</p>
                  <p className="mt-2 whitespace-pre-line text-[#57636c]">{activeItem.customerContact?.destination || activeItem.deliveryOption?.destination || "No address saved"}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Seller summary</p>
              <div className="mt-4 space-y-3 text-[14px] text-[#57636c]">
                <p>This is a {toStr(activeItem.deliveryOption?.type || "seller").replace(/_/g, " ")} order.</p>
                <p>{activeItem.counts.selfFulfilment} seller-handled lines require action.</p>
                <p>{activeItem.counts.piessangFulfilment} Piessang-handled lines are visible for context.</p>
                <p>{activeItem.deliveryProgress?.percentageDelivered ?? 0}% of this order has been delivered.</p>
              </div>
            </section>

          </div>
        </div>
        {dispatchModalItem ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seller-order-dispatch-title"
            onClick={() => {
              if (updatingOrderId !== dispatchModalItem.orderId) setDispatchModalOrderId(null);
            }}
          >
            <div
              className="w-full max-w-[620px] rounded-[24px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.26)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#1d4ed8]">
                    {getSellerActionLabels(dispatchModalItem, "dispatched").primary}
                  </p>
                  <h3 id="seller-order-dispatch-title" className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#202020]">
                    {dispatchModalItem.orderNumber || dispatchModalItem.orderId}
                  </h3>
                  <p className="mt-2 text-[14px] text-[#57636c]">
                    {getSellerActionLabels(dispatchModalItem, "dispatched").secondary}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchModalOrderId(null)}
                  disabled={updatingOrderId === dispatchModalItem.orderId}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c]"
                  aria-label="Close dispatch modal"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[13px] text-[#1e3a8a]">
                The customer will receive this delivery update as soon as you save it.
              </div>

              <div className="mt-5 grid gap-4">
                {isCourierTracked(dispatchModalItem) ? (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Courier name</span>
                      <input
                        value={getDraft(dispatchModalItem.orderId).courierName}
                        onChange={(event) => updateDraft(dispatchModalItem.orderId, { courierName: event.target.value })}
                        className="h-11 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[14px] outline-none"
                        placeholder="The Courier Guy"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Tracking number</span>
                      <input
                        value={getDraft(dispatchModalItem.orderId).trackingNumber}
                        onChange={(event) => updateDraft(dispatchModalItem.orderId, { trackingNumber: event.target.value })}
                        className="h-11 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[14px] outline-none"
                        placeholder="Tracking reference"
                      />
                    </label>
                  </>
                ) : null}
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                    {isCourierTracked(dispatchModalItem) ? "Dispatch note" : "Delivery note"}
                  </span>
                  <textarea
                    value={getDraft(dispatchModalItem.orderId).notes}
                    onChange={(event) => updateDraft(dispatchModalItem.orderId, { notes: event.target.value })}
                    rows={4}
                    className="w-full rounded-[12px] border border-black/10 bg-white px-3 py-3 text-[14px] outline-none"
                    placeholder={isCourierTracked(dispatchModalItem) ? "Optional note for this courier handoff." : "Optional note for this delivery update."}
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDispatchModalOrderId(null)}
                  disabled={updatingOrderId === dispatchModalItem.orderId}
                  className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020] disabled:opacity-60"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await updateSellerOrderStatus(dispatchModalItem, "dispatched");
                    if (ok) setDispatchModalOrderId(null);
                  }}
                  disabled={
                    updatingOrderId === dispatchModalItem.orderId ||
                    (isCourierTracked(dispatchModalItem) &&
                      (!toStr(getDraft(dispatchModalItem.orderId).courierName) || !toStr(getDraft(dispatchModalItem.orderId).trackingNumber)))
                  }
                  className="rounded-[12px] bg-[#202020] px-4 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingOrderId === dispatchModalItem.orderId ? "Saving..." : getSellerActionLabels(dispatchModalItem, "dispatched").primary}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {cancelModalItem ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seller-order-cancel-title"
            onClick={() => {
              if (updatingOrderId !== cancelModalItem.orderId) setCancelModalOrderId(null);
            }}
          >
            <div
              className="w-full max-w-[560px] rounded-[24px] border border-[#f2c7cb] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.26)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#b91c1c]">Cancel order</p>
                  <h3 id="seller-order-cancel-title" className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#202020]">
                    {cancelModalItem.orderNumber || cancelModalItem.orderId}
                  </h3>
                  <p className="mt-2 text-[14px] text-[#57636c]">
                    Provide a clear reason for the customer. This cancellation cannot be undone from the seller dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelModalOrderId(null)}
                  disabled={updatingOrderId === cancelModalItem.orderId}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c]"
                  aria-label="Close cancellation modal"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#6b1d1d]">
                The customer will receive this cancellation update by email and SMS.
              </div>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Cancellation reason</span>
                <textarea
                  value={getDraft(cancelModalItem.orderId).cancellationReason}
                  onChange={(event) => updateDraft(cancelModalItem.orderId, { cancellationReason: event.target.value })}
                  rows={5}
                  className="w-full rounded-[14px] border border-[#f2c7cb] bg-white px-4 py-3 text-[14px] outline-none transition focus:border-[#b91c1c]/45 focus:ring-2 focus:ring-[#b91c1c]/10"
                  placeholder="Explain why this order is being cancelled."
                />
              </label>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCancelModalOrderId(null)}
                  disabled={updatingOrderId === cancelModalItem.orderId}
                  className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020] disabled:opacity-60"
                >
                  Keep order
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await updateSellerOrderStatus(cancelModalItem, "cancelled");
                    if (ok) setCancelModalOrderId(null);
                  }}
                  disabled={updatingOrderId === cancelModalItem.orderId || !toStr(getDraft(cancelModalItem.orderId).cancellationReason)}
                  className="rounded-[12px] border border-[#f2c7cb] bg-[#b91c1c] px-4 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingOrderId === cancelModalItem.orderId ? "Cancelling..." : "Cancel order"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DocumentSnackbar notice={documentSnackbar} onClose={() => setDocumentSnackbar(null)} />
      <DocumentLinkModal
        open={Boolean(documentModal?.url)}
        title={documentModal?.title || "Document ready"}
        description={documentModal?.description || "You can open this document in a new tab or copy the link."}
        url={documentModal?.url || ""}
        onClose={() => setDocumentModal(null)}
        openLabel={documentModal?.openLabel || "Open document"}
      />
      <section className="rounded-[24px] border border-black/6 bg-white shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
        <div className="border-b border-black/6 px-4 py-4">
          <div ref={periodMenuRef} className="relative inline-block">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Timeframe</p>
            <button
              type="button"
              onClick={() => setPeriodMenuOpen((current) => !current)}
              className="grid min-w-[260px] grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] border border-black/10 bg-white px-4 py-3 text-left hover:border-black/20"
              aria-haspopup="listbox"
              aria-expanded={periodMenuOpen}
            >
              <div>
                <p className="text-[15px] font-semibold text-[#202020]">{periodLabel}</p>
                <p className="mt-1 text-[12px] text-[#667085]">{periodHint}</p>
              </div>
              <span className={`text-[14px] text-[#57636c] transition-transform ${periodMenuOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {periodMenuOpen ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-[260px] rounded-[16px] border border-black/10 bg-white p-2 shadow-[0_20px_50px_rgba(20,24,27,0.18)]">
                {([
                  { id: "today" as const, label: "Today", hint: "Compared to current hour yesterday" },
                  { id: "7d" as const, label: "Last 7 days", hint: "Compared to previous 7 days" },
                  { id: "30d" as const, label: "Last 30 days", hint: "Compared to previous 30 days" },
                ]).map((period) => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => {
                      setMetricPeriod(period.id);
                      setPeriodMenuOpen(false);
                    }}
                    role="option"
                    aria-selected={metricPeriod === period.id}
                    className={`block w-full rounded-[12px] px-4 py-3 text-left ${metricPeriod === period.id ? "bg-[#eff6ff]" : "hover:bg-[#fafafa]"}`}
                  >
                    <p className="text-[15px] font-semibold text-[#202020]">{period.label}</p>
                    <p className="mt-1 text-[12px] text-[#667085]">{period.hint}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => (
              <SellerMetricCard
                key={card.id}
                id={card.id}
                title={card.title}
                value={card.value}
                delta={card.delta}
                helper={card.helper}
                series={card.series}
                infoOpen={metricInfoOpen === card.id}
                onToggleInfo={() => setMetricInfoOpen((current) => (current === card.id ? null : card.id))}
                onOpenInfo={(id) => setMetricInfoOpen(id)}
                onCloseInfo={() => setMetricInfoOpen(null)}
              />
            ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-black/6 bg-white shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
        <div className="border-b border-black/6 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: "all" as const, label: "All" },
              { id: "unfulfilled" as const, label: "Unfulfilled" },
              { id: "unpaid" as const, label: "Unpaid" },
              { id: "open" as const, label: "Open" },
              { id: "fulfilled" as const, label: "Fulfilled" },
              { id: "cancelled" as const, label: "Cancelled" },
              { id: "local_delivery" as const, label: "Local Delivery" },
            ]).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setViewFilter(filter.id)}
                className={`rounded-[12px] px-4 py-2 text-[14px] font-semibold ${viewFilter === filter.id ? "bg-[#f1f3f5] text-[#202020]" : "text-[#57636c] hover:bg-[#fafafa]"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search order, customer, or item"
              className="h-11 w-full rounded-[14px] border border-black/10 bg-white px-4 text-[14px] outline-none md:max-w-[520px]"
            />
          </div>
        </div>

        {selectedOrderIds.length ? (
          <div className="flex flex-col gap-3 border-b border-black/6 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-[#1d4ed8] px-2 text-[12px] font-semibold text-white">{selectedOrderIds.length}</span>
              <p className="text-[14px] font-semibold text-[#202020]">{selectedOrderIds.length} selected</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => selectedOrderIds[0] && setOrderRoute(selectedOrderIds[0])} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">Open</button>
              {commonSelectedActions.map((nextStatus) => (
                <button key={nextStatus} type="button" onClick={() => void bulkUpdateSelectedOrders(nextStatus)} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">
                  Mark {statusLabelText(nextStatus).toLowerCase()}
                </button>
              ))}
              <button type="button" onClick={() => setSelectedOrderIds([])} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">Clear</button>
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-[14px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">
            <p>{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#b7ebd1] text-[14px] text-[#166534] hover:bg-white/70"
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-[14px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f2c7cb] text-[14px] text-[#b91c1c] hover:bg-white/70"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="px-4 py-8 text-[14px] text-[#57636c]">Loading orders...</div>
        ) : filteredItems.length ? (
          <>
          <div className="space-y-3 p-4 lg:hidden">
            {filteredItems.map((item) => {
              const selected = selectedOrderIds.includes(item.orderId);
              const deadlineState = getDeadlineState(item, nowTick);
              const lifecycleDisplay = getSellerLifecycleDisplay(item, deadlineState);
              return (
                <button
                  key={`mobile-${item.orderId}`}
                  type="button"
                  onClick={() => setOrderRoute(item.orderId)}
                  className={`w-full rounded-[18px] border border-black/6 bg-white p-4 text-left shadow-[0_8px_24px_rgba(20,24,27,0.04)] ${selected ? "ring-2 ring-[#3b82f6]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-semibold text-[#202020]">{item.orderNumber || item.orderId}</p>
                      <p className="mt-1 text-[13px] text-[#57636c]">{item.customerName || "Customer"} • {formatRelativeOrderDate(item.createdAt)}</p>
                    </div>
                    <input type="checkbox" checked={selected} onChange={() => toggleOrderSelection(item.orderId)} onClick={(event) => event.stopPropagation()} className="mt-1 h-4 w-4 rounded border-black/20" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${paymentStatusTone(item.paymentStatus)}`}>{sentenceStatus(item.paymentStatus)}</span>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${lifecycleDisplay.primaryTone}`}>
                      {lifecycleDisplay.primaryLabel}
                    </span>
                    {lifecycleDisplay.secondaryLabel ? (
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${lifecycleDisplay.secondaryTone}`}>
                        {lifecycleDisplay.secondaryLabel}
                      </span>
                    ) : null}
                  </div>
                  {lifecycleDisplay.message ? (
                    <div className="mt-3 rounded-[12px] border border-[#fecaca] bg-[#fff7f8] px-3 py-2 text-[12px] text-[#b91c1c]">
                      {lifecycleDisplay.message}
                    </div>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-[#57636c]">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Total</p>
                      <p className="mt-1 font-semibold text-[#202020]">{formatMoney(item.totals.totalIncl || item.totals.subtotalIncl)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Items</p>
                      <p className="mt-1 font-semibold text-[#202020]">{pluralize(item.counts.quantity, "item")}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Delivery</p>
                      <p className="mt-1 font-semibold text-[#202020]">{getDeliveryMethodDisplayLabel(item.deliveryOption)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto overflow-y-visible lg:block">
            <table className="min-w-[1120px] border-separate border-spacing-0 overflow-visible">
              <thead>
                <tr className="border-b border-black/6 text-left text-[12px] font-semibold text-[#6b7280]">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} className="h-4 w-4 rounded border-black/20" />
                  </th>
                  <th className="px-2 py-3">Order</th>
                  <th className="px-2 py-3">Date</th>
                  <th className="px-2 py-3">Customer</th>
                  <th className="px-2 py-3">Channel</th>
                  <th className="px-2 py-3">Total</th>
                  <th className="px-2 py-3">Payment status</th>
                  <th className="px-2 py-3">Fulfilment status</th>
                  <th className="px-2 py-3">Items</th>
                  <th className="px-4 py-3">Delivery method</th>
                </tr>
              </thead>
              <tbody className="overflow-visible">
                {filteredItems.map((item) => {
                  const selected = selectedOrderIds.includes(item.orderId);
                  const deadlineState = getDeadlineState(item, nowTick);
                  const lifecycleDisplay = getSellerLifecycleDisplay(item, deadlineState);
                  return (
                    <tr
                      key={item.orderId}
                      className={`cursor-pointer border-t border-black/6 text-[14px] ${selected ? "bg-[rgba(59,130,246,0.06)]" : "hover:bg-[#fafafa]"} ${hoveredOrderId === item.orderId ? "relative z-20" : ""}`}
                      onClick={() => setOrderRoute(item.orderId)}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => toggleOrderSelection(item.orderId)} className="h-4 w-4 rounded border-black/20" />
                      </td>
                      <td className="px-2 py-3 font-semibold text-[#202020]">{item.orderNumber || item.orderId}</td>
                      <td className="px-2 py-3 text-[#3f3f46]">{formatRelativeOrderDate(item.createdAt)}</td>
                      <td
                        data-seller-orders-customer
                        className={`relative px-2 py-3 text-[#3f3f46] ${hoveredOrderId === item.orderId ? "z-30" : ""}`}
                        onMouseEnter={(event) => openCustomerHoverCard(item.orderId, event.currentTarget)}
                        onMouseLeave={() => {
                          setHoveredOrderId((current) => (current === item.orderId ? null : current));
                          setHoverCard((current) => (current?.orderId === item.orderId ? null : current));
                        }}
                      >
                        <button type="button" onClick={(event) => {
                          event.stopPropagation();
                          if (hoveredOrderId === item.orderId) {
                            setHoveredOrderId(null);
                            setHoverCard(null);
                            return;
                          }
                          openCustomerHoverCard(item.orderId, event.currentTarget.closest("[data-seller-orders-customer]") as HTMLElement);
                        }} className="font-medium">
                          <PopoverHintTrigger active={hoveredOrderId === item.orderId}>
                            <span>{item.customerName || "Customer"}</span>
                          </PopoverHintTrigger>
                        </button>
                        <SellerHoverCard item={item} open={hoveredOrderId === item.orderId} onOpenOrder={() => setOrderRoute(item.orderId)} hoverCard={hoverCard?.orderId === item.orderId ? hoverCard : null} />
                      </td>
                      <td className="px-2 py-3 text-[#3f3f46]">Online Store</td>
                      <td className="px-2 py-3 font-medium text-[#202020]">{formatMoney(item.totals.totalIncl || item.totals.subtotalIncl)}</td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${paymentStatusTone(item.paymentStatus)}`}>{sentenceStatus(item.paymentStatus)}</span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${lifecycleDisplay.primaryTone}`}>
                            {lifecycleDisplay.primaryLabel}
                          </span>
                          {lifecycleDisplay.secondaryLabel ? (
                            <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${lifecycleDisplay.secondaryTone}`}>
                              {lifecycleDisplay.secondaryLabel}
                            </span>
                          ) : null}
                        </div>
                        {lifecycleDisplay.message ? (
                          <p className="mt-2 max-w-[240px] text-[12px] text-[#b91c1c]">
                            {lifecycleDisplay.message}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 text-[#3f3f46]">{pluralize(item.counts.quantity, "item")}</td>
                      <td className="max-w-[220px] px-4 py-3 text-[#3f3f46]">
                        <span className="block truncate">{getDeliveryMethodDisplayLabel(item.deliveryOption)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="px-4 py-8 text-[14px] text-[#57636c]">No seller orders matched this view.</div>
        )}
      </section>
    </div>
  );
}

export default SellerOrdersWorkspace;
