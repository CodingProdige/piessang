"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { PlatformPopover, PlatformPortalPopover, PopoverHintTrigger } from "@/components/ui/platform-popover";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { formatCurrencyExact, formatMoneyExact, normalizeMoneyAmount } from "@/lib/money";

type AdminOrder = {
  docId?: string;
  order?: {
    orderNumber?: string;
    merchantTransactionId?: string;
    status?: {
      order?: string;
      payment?: string;
      fulfillment?: string;
    };
  };
  lifecycle?: {
    orderStatus?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
  };
  customer?: {
    accountName?: string;
    email?: string;
  };
  customer_snapshot?: {
    account?: {
      accountName?: string;
      type?: string;
    };
    email?: string;
    phone?: string;
  };
  delivery_snapshot?: {
    address?: {
      recipientName?: string;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      suburb?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      country?: string;
      notes?: string;
    };
  };
  timestamps?: {
    createdAt?: string;
  };
  totals?: {
    final_incl?: number;
  };
  payment?: {
    provider?: string;
    paid_amount_incl?: number;
    refunded_amount_incl?: number;
    currency?: string;
    method?: string;
    attempts?: Array<{
      type?: string;
      status?: string;
      createdAt?: string;
      amount_incl?: number;
      provider?: string;
      transactionId?: string;
    }>;
  };
  refund_summary?: {
    has_refund?: boolean;
    total_amount_incl?: number;
    entries?: Array<{
      amount_incl?: number;
      createdAt?: string;
      status?: string;
    }>;
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
  seller_slices?: Array<{
    sellerCode?: string;
    sellerSlug?: string;
    vendorName?: string;
    quantity?: number;
    subtotalIncl?: number;
    totalIncl?: number;
  }>;
  delivery_progress?: {
    percentageDelivered?: number;
  };
  items?: Array<{
    quantity?: number;
    line_totals?: {
      final_incl?: number;
      unit_price_incl?: number;
    };
    fulfillment_tracking?: {
      label?: string;
      status?: string;
    };
    product_snapshot?: {
      product?: {
        title?: string;
        sellerCode?: string;
        sellerSlug?: string;
        vendorName?: string;
      };
      media?: {
        images?: Array<{ imageUrl?: string }>;
      };
    };
    selected_variant_snapshot?: {
      label?: string;
      variant_id?: string;
      sku?: string;
      barcode?: string;
      media?: {
        images?: Array<{ imageUrl?: string }>;
      };
    };
  }>;
  cancellation?: {
    status?: string;
    reason?: string;
    requestedAt?: string;
    approvedAt?: string;
  };
  returns?: {
    totals?: {
      incl?: number;
    };
  };
  order_summary?: {
    subtotal_excl?: number;
    delivery_fee_excl?: number;
    vat_total?: number;
    final_incl?: number;
  };
};

type OrdersTotals = {
  totalOrders?: number;
  totalNotDelivered?: number;
  totalNotCompleted?: number;
  totalPaymentNotPaid?: number;
  sumFinalIncl?: number;
  sumPaidIncl?: number;
  totalOutstandingIncl?: number;
  paymentStatusCounts?: Record<string, number>;
  orderStatusCounts?: Record<string, number>;
  fulfillmentStatusCounts?: Record<string, number>;
};

type AdminMetricPeriod = "today" | "7d" | "30d";

type HoverCardState = {
  orderId: string;
  top: number;
  left: number;
  caretLeft: number;
} | null;

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number, currency = "ZAR") {
  return formatCurrencyExact(value, currency || "ZAR");
}

function formatDateTime(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Not available";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeOrderDate(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  const timeLabel = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (diffDays === 0) return `Today at ${timeLabel}`;
  if (diffDays === 1) return `Yesterday at ${timeLabel}`;
  return formatDateTime(value);
}

function sentenceStatus(value?: string | null) {
  const normalized = toStr(value || "unknown").replace(/_/g, " ");
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function progressTone(percent: number) {
  if (percent >= 100) return "bg-[#1f8f55]";
  if (percent >= 50) return "bg-[#e3c52f]";
  return "bg-[#202020]";
}

function statusTone(value?: string | null) {
  const normalized = toStr(value).toLowerCase();
  if (normalized === "paid" || normalized === "completed" || normalized === "delivered") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "pending" || normalized === "payment_pending" || normalized === "processing") return "border-[#fef3c7] bg-[#fff7ed] text-[#8f7531]";
  if (normalized === "cancelled" || normalized === "failed" || normalized === "refunded" || normalized === "partial_refund") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#475569]";
}

function sellerSummary(order: AdminOrder) {
  const slices = Array.isArray(order?.seller_slices) ? order.seller_slices : [];
  const names = slices.map((entry) => toStr(entry?.vendorName || entry?.sellerSlug || entry?.sellerCode)).filter(Boolean);
  const unique = Array.from(new Set(names));
  if (unique.length === 0) return "No seller slices";
  if (unique.length === 1) return unique[0];
  return `${unique[0]} + ${unique.length - 1} more`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function refundEligibility(order: AdminOrder) {
  const provider = toStr(order?.payment?.provider).toLowerCase();
  const paymentStatus = toStr(order?.lifecycle?.paymentStatus || order?.order?.status?.payment).toLowerCase();
  const paidAmount = Number(order?.payment?.paid_amount_incl || order?.totals?.final_incl || 0);
  const refundedAmount = Number(order?.payment?.refunded_amount_incl || order?.refund_summary?.total_amount_incl || 0);
  const remaining = Math.max(normalizeMoneyAmount(paidAmount - refundedAmount), 0);

  return {
    provider,
    allowed: provider === "stripe" && remaining > 0 && paymentStatus !== "refunded",
    remaining,
  };
}

function getAdminCreditNotes(order: AdminOrder) {
  const notesMap =
    order?.credit_notes?.seller_notes && typeof order.credit_notes.seller_notes === "object"
      ? order.credit_notes.seller_notes
      : {};
  return Object.values(notesMap)
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => toStr(right?.issuedAt).localeCompare(toStr(left?.issuedAt)));
}

function getAdminLineTitle(item: NonNullable<AdminOrder["items"]>[number]) {
  return toStr(item?.product_snapshot?.product?.title || item?.selected_variant_snapshot?.label || "Product");
}

function getAdminLineSubtitle(item: NonNullable<AdminOrder["items"]>[number]) {
  const variant = item?.selected_variant_snapshot || {};
  const bits = [toStr(variant?.label), toStr(variant?.sku), toStr(variant?.barcode)].filter(Boolean);
  return bits.join(" • ");
}

function getAdminLineImage(item: NonNullable<AdminOrder["items"]>[number]) {
  return (
    toStr(item?.selected_variant_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(item?.product_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
    ""
  );
}

function formatAddress(order: AdminOrder) {
  const address = order?.delivery_snapshot?.address || {};
  return [
    toStr(address?.recipientName),
    toStr(address?.phone),
    toStr(address?.addressLine1),
    toStr(address?.addressLine2),
    toStr(address?.suburb),
    toStr(address?.city),
    toStr(address?.province),
    toStr(address?.postalCode),
    toStr(address?.country),
  ].filter(Boolean);
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

function buildSeriesFromOrders(items: AdminOrder[], period: AdminMetricPeriod) {
  const bucketCount = period === "today" ? 8 : 7;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  const now = new Date();
  items.forEach((item) => {
    const input = toStr(item.timestamps?.createdAt);
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

function AdminHoverCard({ order, open, onOpenOrder, hoverCard }: { order: AdminOrder; open: boolean; onOpenOrder: () => void; hoverCard: HoverCardState }) {
  if (!open || !hoverCard) return null;
  return (
    <PlatformPortalPopover open={open} top={hoverCard.top} left={hoverCard.left} width={290} caretLeft={hoverCard.caretLeft}>
      <p className="text-[15px] font-semibold leading-[1.15] text-[#202020]">{order.customer?.accountName || "Customer"}</p>
      <p className="mt-1 text-[13px] leading-[1.35] text-[#57636c]">{order.customer?.email || "No email saved"}</p>
      <p className="mt-3 text-[13px] text-[#202020]">{sellerSummary(order)}</p>
      <p className="mt-1 text-[13px] text-[#202020]">{formatMoney(Number(order.totals?.final_incl || 0), toStr(order.payment?.currency || "ZAR"))}</p>
      <button type="button" onClick={onOpenOrder} className="mt-4 w-full rounded-[12px] border border-black/10 px-3 py-2 text-[13px] font-semibold text-[#202020]">
        Open order
      </button>
    </PlatformPortalPopover>
  );
}

function AdminMetricCard({
  id,
  title,
  value,
  delta,
  helper,
  series,
  infoOpen,
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
  infoOpen: boolean;
  onToggleInfo: (id: string) => void;
  onOpenInfo: (id: string) => void;
  onCloseInfo: () => void;
}) {
  return (
    <div
      data-admin-orders-metric-info
      className="relative min-h-[120px] rounded-[18px] border border-black/6 bg-[#fcfcfc] px-5 py-4 shadow-[0_6px_20px_rgba(20,24,27,0.04)]"
      onMouseEnter={() => onOpenInfo(id)}
      onMouseLeave={() => onCloseInfo()}
    >
      <button type="button" onClick={() => onToggleInfo(id)} className="text-left" aria-label={`About ${title}`}>
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
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">{value}</span>
          <span className={`text-[12px] font-semibold ${delta.startsWith("-") ? "text-[#b91c1c]" : "text-[#1f8f55]"}`}>{delta}</span>
        </div>
        <Sparkline values={series} />
      </div>
    </div>
  );
}

export function SellerAdminOrdersWorkspace({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<AdminOrder[]>([]);
  const [totals, setTotals] = useState<OrdersTotals>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [customerScope, setCustomerScope] = useState("");
  const [sellerScope, setSellerScope] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<HoverCardState>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [metricPeriod, setMetricPeriod] = useState<AdminMetricPeriod>("7d");
  const [metricInfoOpen, setMetricInfoOpen] = useState<string | null>(null);
  const [detailActionsOpen, setDetailActionsOpen] = useState(false);
  const [refundMode, setRefundMode] = useState<"full" | "partial">("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const detailActionsRef = useRef<HTMLDivElement | null>(null);

  const activeOrderId = toStr(searchParams.get("adminOrder")) || null;

  function setOrderRoute(orderId: string | null) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (orderId) nextParams.set("adminOrder", orderId);
    else nextParams.delete("adminOrder");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.push(nextUrl, { scroll: false });
  }

  async function loadOrders() {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, returnAll: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load marketplace orders.");
      }
      setItems(Array.isArray(payload?.data?.data) ? payload.data.data : []);
      setTotals(payload?.data?.totals || {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load marketplace orders.");
      setItems([]);
      setTotals({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [userId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useOutsideDismiss(
    periodMenuOpen || detailActionsOpen || metricInfoOpen !== null || hoveredOrderId !== null,
    () => {
      setPeriodMenuOpen(false);
      setDetailActionsOpen(false);
      setMetricInfoOpen(null);
      setHoveredOrderId(null);
      setHoverCard(null);
    },
    {
      refs: [periodMenuRef, detailActionsRef],
      selectors: ["[data-admin-orders-metric-info]", "[data-admin-orders-customer]"],
    },
  );

  function openCustomerHoverCard(orderId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setHoveredOrderId(orderId);
    setHoverCard({
      orderId,
      top: rect.bottom + 12,
      left: Math.max(16, Math.min(rect.left - 8, window.innerWidth - 306)),
      caretLeft: Math.max(22, Math.min(72, rect.width / 2)),
    });
  }

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const customerNeedle = customerScope.trim().toLowerCase();
    const sellerNeedle = sellerScope.trim().toLowerCase();
    return items.filter((item) => {
      const orderStatus = toStr(item?.lifecycle?.orderStatus || item?.order?.status?.order).toLowerCase();
      const fulfillmentStatus = toStr(item?.lifecycle?.fulfillmentStatus || item?.order?.status?.fulfillment).toLowerCase();
      const paymentStatus = toStr(item?.lifecycle?.paymentStatus || item?.order?.status?.payment).toLowerCase();
      const customerStack = [item?.customer?.accountName, item?.customer?.email].join(" ").toLowerCase();
      const sellerStack = [
        sellerSummary(item),
        ...(Array.isArray(item?.seller_slices)
          ? item.seller_slices.flatMap((slice) => [slice?.vendorName, slice?.sellerCode, slice?.sellerSlug])
          : []),
      ]
        .join(" ")
        .toLowerCase();

      if (statusFilter !== "all" && orderStatus !== statusFilter && fulfillmentStatus !== statusFilter && paymentStatus !== statusFilter) {
        return false;
      }
      if (customerNeedle && !customerStack.includes(customerNeedle)) return false;
      if (sellerNeedle && !sellerStack.includes(sellerNeedle)) return false;
      if (!needle) return true;
      const stack = [item?.order?.orderNumber, item?.order?.merchantTransactionId, item?.customer?.accountName, item?.customer?.email, sellerSummary(item)].join(" ").toLowerCase();
      return stack.includes(needle);
    });
  }, [customerScope, items, query, sellerScope, statusFilter]);

  useEffect(() => {
    setSelectedOrderIds((current) => current.filter((orderId) => items.some((item) => (item.docId || item.order?.orderNumber) === orderId)));
  }, [items]);

  const activeOrder = useMemo(
    () =>
      filteredItems.find((item) => (item.docId || item.order?.orderNumber) === activeOrderId) ||
      items.find((item) => (item.docId || item.order?.orderNumber) === activeOrderId) ||
      null,
    [activeOrderId, filteredItems, items],
  );

  useEffect(() => {
    if (!activeOrder) {
      setRefundMode("full");
      setRefundAmount("");
      setRefundNote("");
      setRefundError(null);
      setRefundBusy(false);
      return;
    }
    const { remaining } = refundEligibility(activeOrder);
    setRefundMode("full");
    setRefundAmount(remaining > 0 ? formatMoneyExact(remaining, { currencySymbol: "", space: false }) : "");
    setRefundNote("");
    setRefundError(null);
  }, [activeOrder]);

  async function submitRefund() {
    if (!activeOrder?.docId || refundBusy) return;
    const eligibility = refundEligibility(activeOrder);
    if (!eligibility.allowed) {
      setRefundError("This order is not currently eligible for an admin Stripe refund.");
      return;
    }
    const amount = refundMode === "full" ? eligibility.remaining : Number(refundAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRefundError("Enter a valid refund amount.");
      return;
    }
    if (amount > eligibility.remaining) {
      setRefundError("Refund amount cannot be more than the remaining paid amount.");
      return;
    }

    setRefundBusy(true);
    setRefundError(null);
    try {
      const response = await fetch("/api/client/v1/payments/stripe/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: activeOrder.docId,
          orderNumber: activeOrder.order?.orderNumber,
          merchantTransactionId: activeOrder.order?.merchantTransactionId,
          amount,
          note: refundNote,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to process the refund for this order.");
      }
      setToast(refundMode === "full" ? "Full refund processed." : "Partial refund processed.");
      setOrderRoute(null);
      await loadOrders();
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : "Unable to process the refund for this order.");
    } finally {
      setRefundBusy(false);
    }
  }

  const periodDays = metricPeriod === "today" ? 1 : metricPeriod === "7d" ? 7 : 30;
  const periodStats = useMemo(() => {
    const currentItems = filteredItems.filter((item) => inPeriod(item.timestamps?.createdAt, periodDays));
    const previousItems = filteredItems.filter((item) => previousPeriod(item.timestamps?.createdAt, periodDays));
    const summarise = (list: AdminOrder[]) => ({
      orders: list.length,
      items: list.reduce((sum, item) => sum + (item.seller_slices?.reduce((sliceSum, slice) => sliceSum + Number(slice.quantity || 0), 0) || 0), 0),
      fulfilled: list.filter((item) => toStr(item.lifecycle?.fulfillmentStatus || item.order?.status?.fulfillment).toLowerCase() === "delivered").length,
      delivered: list.filter((item) => clampPercent(Number(item.delivery_progress?.percentageDelivered || 0)) >= 100).length,
    });
    return { current: summarise(currentItems), previous: summarise(previousItems) };
  }, [filteredItems, periodDays]);

  const summaryCards = [
    { title: "Orders", value: periodStats.current.orders, delta: formatDelta(periodStats.current.orders, periodStats.previous.orders), helper: "Marketplace-wide order count", series: buildSeriesFromOrders(filteredItems.filter((item) => inPeriod(item.timestamps?.createdAt, periodDays)), metricPeriod) },
    { title: "Items ordered", value: periodStats.current.items, delta: formatDelta(periodStats.current.items, periodStats.previous.items), helper: "Units across visible orders", series: buildSeriesFromOrders(filteredItems.filter((item) => inPeriod(item.timestamps?.createdAt, periodDays)), metricPeriod).map((value) => value * 2 || 0) },
    { title: "Orders fulfilled", value: periodStats.current.fulfilled, delta: formatDelta(periodStats.current.fulfilled, periodStats.previous.fulfilled), helper: "Delivered fulfilment states in this period", series: buildSeriesFromOrders(filteredItems.filter((item) => inPeriod(item.timestamps?.createdAt, periodDays) && toStr(item.lifecycle?.fulfillmentStatus || item.order?.status?.fulfillment).toLowerCase() === "delivered"), metricPeriod) },
    { title: "Orders delivered", value: periodStats.current.delivered, delta: formatDelta(periodStats.current.delivered, periodStats.previous.delivered), helper: "Orders with full delivery completion", series: buildSeriesFromOrders(filteredItems.filter((item) => inPeriod(item.timestamps?.createdAt, periodDays) && clampPercent(Number(item.delivery_progress?.percentageDelivered || 0)) >= 100), metricPeriod) },
  ];

  const periodLabel = metricPeriod === "today" ? "Today" : metricPeriod === "7d" ? "Last 7 days" : "Last 30 days";

  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedOrderIds.includes(item.docId || item.order?.orderNumber || ""));

  function toggleVisibleSelection() {
    if (!filteredItems.length) return;
    setSelectedOrderIds((current) => {
      if (allVisibleSelected) return current.filter((orderId) => !filteredItems.some((item) => (item.docId || item.order?.orderNumber) === orderId));
      return Array.from(new Set([...current, ...filteredItems.map((item) => item.docId || item.order?.orderNumber || "").filter(Boolean)]));
    });
  }

  if (activeOrder) {
    const progress = clampPercent(Number(activeOrder.delivery_progress?.percentageDelivered || 0));
    const adminCreditNotes = getAdminCreditNotes(activeOrder);
    const statuses = [
      activeOrder.lifecycle?.orderStatus || activeOrder.order?.status?.order || "unknown",
      activeOrder.lifecycle?.paymentStatus || activeOrder.order?.status?.payment || "unknown",
      activeOrder.lifecycle?.fulfillmentStatus || activeOrder.order?.status?.fulfillment || "unknown",
    ];
    return (
      <div className="space-y-5">
        {error ? <div className="rounded-[14px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
        <section className="flex flex-col gap-4 rounded-[24px] border border-black/6 bg-white px-5 py-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)] lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button type="button" onClick={() => setOrderRoute(null)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#57636c]">
              <span className="text-[18px]">&lsaquo;</span> Orders
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h2 className="text-[34px] font-semibold tracking-[-0.04em] text-[#202020]">{activeOrder.order?.orderNumber || activeOrder.docId || "Order"}</h2>
              {statuses.map((statusValue, index) => (
                <span key={`${statusValue}-${index}`} className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(statusValue)}`}>{sentenceStatus(statusValue)}</span>
              ))}
            </div>
            <p className="mt-2 text-[14px] text-[#57636c]">{formatDateTime(activeOrder.timestamps?.createdAt)} from Online Store</p>
          </div>
          <div ref={detailActionsRef} className="relative flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            <button type="button" className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">Print</button>
            <button type="button" onClick={() => setDetailActionsOpen((current) => !current)} className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">More actions</button>
            {detailActionsOpen ? (
              <div className="absolute right-0 top-[52px] z-30 w-[220px] rounded-[16px] border border-black/10 bg-white p-2 shadow-[0_24px_60px_rgba(20,24,27,0.18)]">
                <button type="button" onClick={() => setDetailActionsOpen(false)} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-[#202020] hover:bg-[#f6f6f6]">View payment summary</button>
                <button type="button" onClick={() => setDetailActionsOpen(false)} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-[#202020] hover:bg-[#f6f6f6]">Review seller slices</button>
                <button type="button" onClick={() => setDetailActionsOpen(false)} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-[#202020] hover:bg-[#f6f6f6]">Open customer profile</button>
              </div>
            ) : null}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Marketplace overview</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Customer</p>
                  <p className="mt-2 text-[18px] font-semibold text-[#202020]">{activeOrder.customer?.accountName || activeOrder.customer_snapshot?.account?.accountName || "Customer"}</p>
                  <p className="mt-1 text-[14px] text-[#57636c]">{activeOrder.customer?.email || activeOrder.customer_snapshot?.email || "No email"}</p>
                  {activeOrder.customer_snapshot?.phone ? <p className="mt-1 text-[14px] text-[#57636c]">{activeOrder.customer_snapshot.phone}</p> : null}
                </div>
                <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Sellers</p>
                  <p className="mt-2 text-[18px] font-semibold text-[#202020]">{sellerSummary(activeOrder)}</p>
                  <p className="mt-1 text-[14px] text-[#57636c]">{activeOrder.seller_slices?.length || 0} seller slices</p>
                </div>
              </div>
            </section>

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[16px] font-semibold text-[#202020]">Ordered items</p>
                <p className="text-[13px] text-[#57636c]">{Array.isArray(activeOrder.items) ? activeOrder.items.length : 0} lines</p>
              </div>
              {Array.isArray(activeOrder.items) && activeOrder.items.length ? (
                <div className="mt-4 space-y-3">
                  {activeOrder.items.map((item, index) => {
                    const imageUrl = getAdminLineImage(item);
                    return (
                      <article key={`${getAdminLineTitle(item)}-${index}`} className="grid gap-4 rounded-[18px] border border-black/6 bg-[#fafafa] p-4 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center">
                        <div className="h-[72px] w-[72px] overflow-hidden rounded-[14px] bg-white">
                          {imageUrl ? <img src={imageUrl} alt={getAdminLineTitle(item)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[11px] text-[#8b94a3]">No image</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-[#202020]">{getAdminLineTitle(item)}</p>
                          <p className="mt-1 text-[13px] text-[#57636c]">{getAdminLineSubtitle(item) || "Variant details unavailable"}</p>
                          <p className="mt-2 text-[12px] text-[#8b94a3]">{sentenceStatus(item?.fulfillment_tracking?.label || item?.fulfillment_tracking?.status || "pending")}</p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="text-[13px] text-[#57636c]">Qty {Number(item?.quantity || 0)}</p>
                          <p className="mt-1 text-[15px] font-semibold text-[#202020]">{formatMoney(Number(item?.line_totals?.final_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-[13px] text-[#57636c]">No line-item detail is available on this order.</p>
              )}
            </section>

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Seller slices</p>
              {Array.isArray(activeOrder.seller_slices) && activeOrder.seller_slices.length ? (
                <div className="mt-4 space-y-3">
                  {activeOrder.seller_slices.map((slice, index) => (
                    <div key={`${slice?.sellerCode || slice?.sellerSlug || "slice"}-${index}`} className="flex items-center justify-between rounded-[16px] border border-black/6 bg-[#fafafa] px-4 py-3 text-[13px]">
                      <div>
                        <p className="font-semibold text-[#202020]">{slice?.vendorName || slice?.sellerSlug || slice?.sellerCode || "Seller"}</p>
                        <p className="mt-1 text-[#57636c]">{pluralize(Number(slice?.quantity || 0), "item")}</p>
                      </div>
                      <div className="text-right">
                        {Number.isFinite(Number(slice?.totalIncl)) ? <p className="font-semibold text-[#202020]">{formatMoney(Number(slice?.totalIncl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</p> : null}
                        <p className="mt-1 text-[#57636c]">{slice?.sellerCode || slice?.sellerSlug || "No seller key"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-[13px] text-[#57636c]">No seller slice data is available on this order.</p>
              )}
            </section>

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Payment and delivery</p>
              <div className="mt-4 divide-y divide-black/6 rounded-[16px] border border-black/6">
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]"><span className="text-[#57636c]">Order total</span><span className="font-semibold text-[#202020]">{formatMoney(Number(activeOrder.totals?.final_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</span></div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]"><span className="text-[#57636c]">Paid amount</span><span className="font-semibold text-[#202020]">{formatMoney(Number(activeOrder.payment?.paid_amount_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</span></div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]"><span className="text-[#57636c]">Refunded so far</span><span className="font-semibold text-[#202020]">{formatMoney(Number(activeOrder.payment?.refunded_amount_incl || activeOrder.refund_summary?.total_amount_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</span></div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]"><span className="text-[#57636c]">Payment method</span><span className="font-semibold text-[#202020]">{sentenceStatus(activeOrder.payment?.method || activeOrder.payment?.provider || "unknown")}</span></div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-[14px]"><span className="text-[#57636c]">Delivery progress</span><span className="font-semibold text-[#202020]">{progress}%</span></div>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-black/8">
                <div className={`h-full rounded-full ${progressTone(progress)}`} style={{ width: `${Math.max(6, progress)}%` }} />
              </div>
              <div className="mt-4 rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Delivery address</p>
                {formatAddress(activeOrder).length ? (
                  <div className="mt-2 space-y-1 text-[13px] text-[#202020]">
                    {formatAddress(activeOrder).map((line, index) => (
                      <p key={`${line}-${index}`}>{line}</p>
                    ))}
                    {activeOrder.delivery_snapshot?.address?.notes ? <p className="pt-1 text-[#57636c]">Notes: {activeOrder.delivery_snapshot.address.notes}</p> : null}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-[#57636c]">No delivery address snapshot is available.</p>
                )}
              </div>
            </section>

            {Array.isArray(activeOrder.payment?.attempts) && activeOrder.payment.attempts.length ? (
              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
                <p className="text-[16px] font-semibold text-[#202020]">Payment history</p>
                <div className="mt-4 space-y-3">
                  {activeOrder.payment.attempts.map((attempt, index) => (
                    <div key={`${attempt?.createdAt || "attempt"}-${index}`} className="flex items-center justify-between rounded-[16px] border border-black/6 bg-[#fafafa] px-4 py-3 text-[13px]">
                      <div>
                        <p className="font-semibold text-[#202020]">{sentenceStatus(attempt?.type || attempt?.status || "payment event")}</p>
                        <p className="mt-1 text-[#57636c]">{formatDateTime(attempt?.createdAt)} • {sentenceStatus(attempt?.provider || activeOrder.payment?.provider || "provider")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#202020]">{formatMoney(Number(attempt?.amount_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</p>
                        <p className="mt-1 text-[#57636c]">{attempt?.transactionId || "No reference"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Refund history</p>
              {Array.isArray(activeOrder.refund_summary?.entries) && activeOrder.refund_summary.entries.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {activeOrder.refund_summary.entries.map((entry, index) => (
                    <div key={`${entry.createdAt || "refund"}-${index}`} className="flex items-center justify-between rounded-[14px] bg-[#fafafa] px-4 py-3 text-[13px]">
                      <div>
                        <p className="font-medium text-[#202020]">{formatMoney(Number(entry.amount_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</p>
                        <p className="text-[12px] text-[#8b94a3]">{formatDateTime(entry.createdAt)}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(entry.status)}`}>{sentenceStatus(entry.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-[#57636c]">No refunds have been processed on this order yet.</p>
              )}
            </section>

            {adminCreditNotes.length ? (
              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
                <p className="text-[16px] font-semibold text-[#202020]">Credit notes</p>
                <p className="mt-1 text-[13px] text-[#57636c]">Each seller adjustment is preserved separately from the original invoice.</p>
                <div className="mt-3 space-y-2">
                  {adminCreditNotes.map((entry, index) => (
                    <div key={`${entry?.creditNoteId || entry?.creditNoteNumber || "credit"}-${index}`} className="flex items-center justify-between rounded-[14px] bg-[#fafafa] px-4 py-3 text-[13px]">
                      <div>
                        <p className="font-medium text-[#202020]">{entry?.creditNoteNumber || "Credit note"}</p>
                        <p className="text-[12px] text-[#8b94a3]">
                          {entry?.vendorName || entry?.sellerSlug || entry?.sellerCode || "Seller"} • {formatDateTime(entry?.issuedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-[#202020]">{formatMoney(Number(entry?.amountIncl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</p>
                        <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(entry?.status)}`}>{sentenceStatus(entry?.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {activeOrder.cancellation?.status ? (
              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
                <p className="text-[16px] font-semibold text-[#202020]">Cancellation</p>
                <div className="mt-4 rounded-[16px] border border-black/6 bg-[#fafafa] p-4 text-[13px] text-[#202020]">
                  <p><span className="font-semibold">Status:</span> {sentenceStatus(activeOrder.cancellation.status)}</p>
                  {activeOrder.cancellation.reason ? <p className="mt-2"><span className="font-semibold">Reason:</span> {activeOrder.cancellation.reason}</p> : null}
                  {activeOrder.cancellation.requestedAt ? <p className="mt-2 text-[#57636c]">Requested {formatDateTime(activeOrder.cancellation.requestedAt)}</p> : null}
                  {activeOrder.cancellation.approvedAt ? <p className="mt-1 text-[#57636c]">Approved {formatDateTime(activeOrder.cancellation.approvedAt)}</p> : null}
                </div>
              </section>
            ) : null}

            {Number(activeOrder.returns?.totals?.incl || 0) > 0 ? (
              <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
                <p className="text-[16px] font-semibold text-[#202020]">Returns</p>
                <div className="mt-4 rounded-[16px] border border-black/6 bg-[#fafafa] p-4 text-[13px]">
                  <p className="font-semibold text-[#202020]">{formatMoney(Number(activeOrder.returns?.totals?.incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}</p>
                  <p className="mt-1 text-[#57636c]">Total returns collected on this order.</p>
                </div>
              </section>
            ) : null}
          </div>

          <div className="space-y-5">
            <section className="rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
              <p className="text-[16px] font-semibold text-[#202020]">Admin refund controls</p>
              {refundEligibility(activeOrder).allowed ? (
                <>
                  <div className="mt-4 flex gap-2 rounded-[12px] bg-[#f6f6f6] p-1">
                    {(["full", "partial"] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => { setRefundMode(mode); if (mode === "full") setRefundAmount(formatMoneyExact(refundEligibility(activeOrder).remaining, { currencySymbol: "", space: false })); }} className={`flex-1 rounded-[10px] px-3 py-2 text-[12px] font-semibold ${refundMode === mode ? "bg-[#202020] text-white" : "text-[#57636c]"}`}>
                        {mode === "full" ? "Full refund" : "Partial refund"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Refundable balance</p>
                    <p className="mt-2 text-[24px] font-semibold text-[#202020]">{formatMoney(refundEligibility(activeOrder).remaining, toStr(activeOrder.payment?.currency || "ZAR"))}</p>
                  </div>
                  {refundMode === "partial" ? (
                    <label className="mt-4 block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Refund amount</span>
                      <input value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className="h-11 w-full rounded-[12px] border border-black/10 px-3 text-[14px] outline-none" placeholder="0.00" />
                    </label>
                  ) : null}
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Internal refund note</span>
                    <textarea value={refundNote} onChange={(event) => setRefundNote(event.target.value)} rows={4} className="w-full rounded-[12px] border border-black/10 px-3 py-3 text-[14px] outline-none" placeholder="Optional note for this refund action" />
                  </label>
                  {refundError ? <div className="mt-3 rounded-[14px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{refundError}</div> : null}
                  <button type="button" onClick={() => void submitRefund()} disabled={refundBusy} className="mt-4 w-full rounded-[12px] bg-[#202020] px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-60">
                    {refundBusy ? "Processing refund..." : refundMode === "full" ? "Process full refund" : "Process partial refund"}
                  </button>
                </>
              ) : (
                <div className="mt-4 rounded-[16px] border border-black/6 bg-[#fafafa] px-4 py-4 text-[13px] text-[#57636c]">
                  This order does not currently have an admin Stripe refund action available.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-[14px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

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
                <p className="mt-1 text-[12px] text-[#667085]">Analytics over the selected period</p>
              </div>
              <span className={`text-[14px] text-[#57636c] transition-transform ${periodMenuOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {periodMenuOpen ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-[260px] rounded-[16px] border border-black/10 bg-white p-2 shadow-[0_20px_50px_rgba(20,24,27,0.18)]">
                {([
                  { id: "today" as const, label: "Today" },
                  { id: "7d" as const, label: "Last 7 days" },
                  { id: "30d" as const, label: "Last 30 days" },
                ]).map((period) => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => { setMetricPeriod(period.id); setPeriodMenuOpen(false); }}
                    role="option"
                    aria-selected={metricPeriod === period.id}
                    className={`block w-full rounded-[12px] px-4 py-3 text-left ${metricPeriod === period.id ? "bg-[#eff6ff]" : "hover:bg-[#fafafa]"}`}
                  >
                    <p className="text-[15px] font-semibold text-[#202020]">{period.label}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <AdminMetricCard
                key={card.title}
                id={card.title}
                title={card.title}
                value={card.value}
                delta={card.delta}
                helper={card.helper}
                series={card.series}
                infoOpen={metricInfoOpen === card.title}
                onToggleInfo={(id) => setMetricInfoOpen((current) => (current === id ? null : id))}
                onOpenInfo={(id) => setMetricInfoOpen(id)}
                onCloseInfo={() => setMetricInfoOpen(null)}
              />
            ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-black/6 bg-white shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 border-b border-black/6 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {["all", "payment_pending", "processing", "completed", "cancelled"].map((filter) => (
              <button key={filter} type="button" onClick={() => setStatusFilter(filter)} className={`rounded-[12px] px-4 py-2 text-[14px] font-semibold ${statusFilter === filter ? "bg-[#f1f3f5] text-[#202020]" : "text-[#57636c] hover:bg-[#fafafa]"}`}>
                {filter === "all" ? "All" : sentenceStatus(filter)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, or seller" className="h-11 min-w-[260px] rounded-[14px] border border-black/10 bg-white px-4 text-[14px] outline-none" />
            <input value={customerScope} onChange={(event) => setCustomerScope(event.target.value)} placeholder="Isolate customer" className="h-11 min-w-[220px] rounded-[14px] border border-black/10 bg-white px-4 text-[14px] outline-none" />
            <input value={sellerScope} onChange={(event) => setSellerScope(event.target.value)} placeholder="Isolate seller" className="h-11 min-w-[220px] rounded-[14px] border border-black/10 bg-white px-4 text-[14px] outline-none" />
            <button type="button" className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">Export</button>
            <button type="button" className="rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">More actions</button>
          </div>
        </div>

        {selectedOrderIds.length ? (
          <div className="flex items-center justify-between gap-3 border-b border-black/6 px-4 py-3">
            <p className="text-[14px] font-semibold text-[#202020]">{selectedOrderIds.length} selected</p>
            <div className="flex gap-2">
              {selectedOrderIds.length === 1 ? <button type="button" onClick={() => setOrderRoute(selectedOrderIds[0])} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">Open order</button> : null}
              <button type="button" onClick={() => setSelectedOrderIds([])} className="rounded-[12px] border border-black/10 bg-white px-4 py-2 text-[13px] font-semibold text-[#202020]">Clear</button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="px-4 py-8 text-[14px] text-[#57636c]">Loading marketplace orders...</div>
        ) : filteredItems.length ? (
          <>
          <div className="space-y-3 p-4 lg:hidden">
            {filteredItems.map((item) => {
              const rowId = item.docId || item.order?.orderNumber || "";
              const progress = clampPercent(Number(item.delivery_progress?.percentageDelivered || 0));
              const paymentStatus = item?.lifecycle?.paymentStatus || item?.order?.status?.payment || "unknown";
              const fulfilmentStatus = item?.lifecycle?.fulfillmentStatus || item?.order?.status?.fulfillment || "unknown";
              const selected = selectedOrderIds.includes(rowId);
              return (
                <button key={`mobile-${rowId}`} type="button" onClick={() => setOrderRoute(rowId)} className={`w-full rounded-[18px] border border-black/6 bg-white p-4 text-left shadow-[0_8px_24px_rgba(20,24,27,0.04)] ${selected ? "ring-2 ring-[#3b82f6]" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-semibold text-[#202020]">{item.order?.orderNumber || item.docId || "Order"}</p>
                      <p className="mt-1 text-[13px] text-[#57636c]">{item.customer?.accountName || "Customer"} • {formatRelativeOrderDate(item.timestamps?.createdAt)}</p>
                    </div>
                    <input type="checkbox" checked={selected} onChange={() => setSelectedOrderIds((current) => current.includes(rowId) ? current.filter((entry) => entry !== rowId) : [...current, rowId])} onClick={(event) => event.stopPropagation()} className="mt-1 h-4 w-4 rounded border-black/20" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${statusTone(paymentStatus)}`}>{sentenceStatus(paymentStatus)}</span>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${statusTone(fulfilmentStatus)}`}>{sentenceStatus(fulfilmentStatus)}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-[#57636c]">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Total</p>
                      <p className="mt-1 font-semibold text-[#202020]">{formatMoney(Number(item.totals?.final_incl || 0), toStr(item.payment?.currency || "ZAR"))}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Delivery</p>
                      <p className="mt-1 font-semibold text-[#202020]">{progress}% delivered</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Seller slices</p>
                      <p className="mt-1 font-semibold text-[#202020]">{sellerSummary(item)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto overflow-y-visible lg:block">
            <table className="min-w-[1080px] border-separate border-spacing-0 overflow-visible">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-[#6b7280]">
                  <th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} className="h-4 w-4 rounded border-black/20" /></th>
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
                  const rowId = item.docId || item.order?.orderNumber || "";
                  const progress = clampPercent(Number(item.delivery_progress?.percentageDelivered || 0));
                  const orderStatus = item?.lifecycle?.orderStatus || item?.order?.status?.order || "unknown";
                  const paymentStatus = item?.lifecycle?.paymentStatus || item?.order?.status?.payment || "unknown";
                  const fulfilmentStatus = item?.lifecycle?.fulfillmentStatus || item?.order?.status?.fulfillment || "unknown";
                  const selected = selectedOrderIds.includes(rowId);
                  return (
                    <tr key={rowId} className={`cursor-pointer text-[14px] ${selected ? "bg-[rgba(59,130,246,0.06)]" : "hover:bg-[#fafafa]"} ${hoveredOrderId === rowId ? "relative z-20" : ""}`} onClick={() => setOrderRoute(rowId)}>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => setSelectedOrderIds((current) => current.includes(rowId) ? current.filter((entry) => entry !== rowId) : [...current, rowId])} className="h-4 w-4 rounded border-black/20" />
                      </td>
                      <td className="px-2 py-3 font-semibold text-[#202020]">{item.order?.orderNumber || item.docId || "Order"}</td>
                      <td className="px-2 py-3 text-[#3f3f46]">{formatRelativeOrderDate(item.timestamps?.createdAt)}</td>
                      <td
                        data-admin-orders-customer
                        className={`relative px-2 py-3 text-[#3f3f46] ${hoveredOrderId === rowId ? "z-30" : ""}`}
                        onMouseEnter={(event) => openCustomerHoverCard(rowId, event.currentTarget)}
                        onMouseLeave={() => {
                          setHoveredOrderId((current) => (current === rowId ? null : current));
                          setHoverCard((current) => (current?.orderId === rowId ? null : current));
                        }}
                      >
                        <button type="button" onClick={(event) => {
                          event.stopPropagation();
                          if (hoveredOrderId === rowId) {
                            setHoveredOrderId(null);
                            setHoverCard(null);
                            return;
                          }
                          openCustomerHoverCard(rowId, event.currentTarget.closest("[data-admin-orders-customer]") as HTMLElement);
                        }}>
                          <PopoverHintTrigger active={hoveredOrderId === rowId}>
                            <span>{item.customer?.accountName || "Customer"}</span>
                          </PopoverHintTrigger>
                        </button>
                        <AdminHoverCard order={item} open={hoveredOrderId === rowId} onOpenOrder={() => setOrderRoute(rowId)} hoverCard={hoverCard?.orderId === rowId ? hoverCard : null} />
                      </td>
                      <td className="px-2 py-3 text-[#3f3f46]">Online Store</td>
                      <td className="px-2 py-3 font-medium text-[#202020]">{formatMoney(Number(item.totals?.final_incl || 0), toStr(item.payment?.currency || "ZAR"))}</td>
                      <td className="px-2 py-3"><span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${statusTone(paymentStatus)}`}>{sentenceStatus(paymentStatus)}</span></td>
                      <td className="px-2 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[12px] font-semibold ${statusTone(fulfilmentStatus)}`}>{sentenceStatus(fulfilmentStatus)}</span>
                          <span className="text-[11px] font-semibold text-[#8b94a3]">{progress}% delivered</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[#3f3f46]">{pluralize(item.seller_slices?.reduce((sum, slice) => sum + Number(slice?.quantity || 0), 0) || 0, "item")}</td>
                      <td className="px-4 py-3 text-[#3f3f46]">{sellerSummary(item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="px-4 py-8 text-[14px] text-[#57636c]">No orders matched this view.</div>
        )}
      </section>

      <AppSnackbar notice={toast ? { tone: "info", message: toast } : null} />
    </div>
  );
}
