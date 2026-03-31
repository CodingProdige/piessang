"use client";

import { useEffect, useMemo, useState } from "react";

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
  seller_slices?: Array<{
    sellerCode?: string;
    sellerSlug?: string;
    vendorName?: string;
    quantity?: number;
  }>;
  delivery_progress?: {
    percentageDelivered?: number;
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

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currency || "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
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

function sentenceStatus(value?: string | null) {
  const normalized = toStr(value || "unknown").replace(/_/g, " ");
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function progressTone(percent: number) {
  if (percent >= 100) return "bg-[#1f8f55]";
  if (percent >= 50) return "bg-[#e3c52f]";
  return "bg-[#202020]";
}

function statusTone(value?: string | null) {
  const normalized = toStr(value).toLowerCase();
  if (normalized === "paid" || normalized === "completed" || normalized === "delivered") {
    return "bg-[rgba(57,169,107,0.12)] text-[#166534]";
  }
  if (normalized === "pending" || normalized === "payment_pending" || normalized === "processing") {
    return "bg-[rgba(203,178,107,0.14)] text-[#8f7531]";
  }
  if (normalized === "cancelled" || normalized === "failed" || normalized === "refunded" || normalized === "partial_refund") {
    return "bg-[rgba(220,38,38,0.10)] text-[#b91c1c]";
  }
  return "bg-[rgba(148,163,184,0.14)] text-[#475569]";
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
  const remaining = Math.max(Number((paidAmount - refundedAmount).toFixed(2)), 0);

  return {
    provider,
    allowed: provider === "stripe" && remaining > 0 && paymentStatus !== "refunded",
    remaining,
  };
}

export function SellerAdminOrdersWorkspace({ userId }: { userId: string }) {
  const [items, setItems] = useState<AdminOrder[]>([]);
  const [totals, setTotals] = useState<OrdersTotals>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [refundMode, setRefundMode] = useState<"full" | "partial">("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const orderStatus = toStr(item?.lifecycle?.orderStatus || item?.order?.status?.order).toLowerCase();
      const fulfillmentStatus = toStr(item?.lifecycle?.fulfillmentStatus || item?.order?.status?.fulfillment).toLowerCase();
      const paymentStatus = toStr(item?.lifecycle?.paymentStatus || item?.order?.status?.payment).toLowerCase();

      if (statusFilter !== "all" && orderStatus !== statusFilter && fulfillmentStatus !== statusFilter && paymentStatus !== statusFilter) {
        return false;
      }

      if (!needle) return true;

      const stack = [
        item?.order?.orderNumber,
        item?.order?.merchantTransactionId,
        item?.customer?.accountName,
        item?.customer?.email,
        sellerSummary(item),
      ]
        .join(" ")
        .toLowerCase();

      return stack.includes(needle);
    });
  }, [items, query, statusFilter]);

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
    setRefundAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setRefundNote("");
    setRefundError(null);
    setRefundBusy(false);
  }, [activeOrderId]);

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
      setActiveOrderId(null);
      await loadOrders();
    } catch (cause) {
      setRefundError(cause instanceof Error ? cause.message : "Unable to process the refund for this order.");
    } finally {
      setRefundBusy(false);
    }
  }

  const summaryCards = [
    {
      label: "Total orders",
      value: Number(totals?.totalOrders || 0),
      helper: "Marketplace-wide order count",
    },
    {
      label: "Payment pending",
      value: Number(totals?.paymentStatusCounts?.pending || totals?.totalPaymentNotPaid || 0),
      helper: "Orders still awaiting successful payment",
    },
    {
      label: "Still in progress",
      value: Number(totals?.totalNotCompleted || 0),
      helper: "Orders not yet completed, cancelled, or refunded",
    },
    {
      label: "Revenue",
      value: formatMoney(Number(totals?.sumPaidIncl || totals?.sumFinalIncl || 0)),
      helper: "Paid marketplace turnover",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        Review all marketplace orders from one queue, see payment and fulfilment health at a glance, and open each order for refund history or admin actions.
      </div>

      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">{card.label}</p>
            <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#202020]">{card.value}</p>
            <p className="mt-1 text-[12px] text-[#8b94a3]">{card.helper}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[18px] font-semibold text-[#202020]">All marketplace orders</p>
            <p className="mt-1 text-[13px] text-[#57636c]">
              {filteredItems.length} visible order{filteredItems.length === 1 ? "" : "s"} across payment, fulfilment, and delivery states.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order, customer, or seller"
              className="h-10 min-w-[240px] rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            >
              <option value="all">All statuses</option>
              <option value="payment_pending">Payment pending</option>
              <option value="processing">Processing</option>
              <option value="dispatched">Dispatched</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
            Loading marketplace orders...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
            No orders matched this view.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredItems.map((item) => {
              const progress = clampPercent(Number(item?.delivery_progress?.percentageDelivered || 0));
              const orderStatus = item?.lifecycle?.orderStatus || item?.order?.status?.order || "unknown";
              const paymentStatus = item?.lifecycle?.paymentStatus || item?.order?.status?.payment || "unknown";
              const fulfillmentStatus = item?.lifecycle?.fulfillmentStatus || item?.order?.status?.fulfillment || "unknown";
              const eligibility = refundEligibility(item);

              return (
                <button
                  key={item.docId || item.order?.orderNumber}
                  type="button"
                  onClick={() => setActiveOrderId(item.docId || item.order?.orderNumber || null)}
                  className="w-full rounded-[8px] border border-black/5 bg-[#fafafa] p-4 text-left transition hover:border-[#cbb26b] hover:bg-white"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[18px] font-semibold text-[#202020]">
                          {item?.order?.orderNumber || item?.docId || "Order"}
                        </p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(orderStatus)}`}>
                          {sentenceStatus(orderStatus)}
                        </span>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(paymentStatus)}`}>
                          {sentenceStatus(paymentStatus)}
                        </span>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(fulfillmentStatus)}`}>
                          {sentenceStatus(fulfillmentStatus)}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-[#57636c]">
                        {item?.customer?.accountName || "Customer"} • {item?.customer?.email || "No email"} • {sellerSummary(item)}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8b94a3]">
                        {formatDateTime(item?.timestamps?.createdAt)} • {Array.isArray(item?.seller_slices) ? item.seller_slices.length : 0} seller slice{Array.isArray(item?.seller_slices) && item.seller_slices.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Order total</p>
                      <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">
                        {formatMoney(Number(item?.totals?.final_incl || 0), toStr(item?.payment?.currency || "ZAR"))}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8b94a3]">
                        {eligibility.allowed ? `${formatMoney(eligibility.remaining)} still refundable` : "Open order for more detail"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                      <span>Delivery progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-black/8">
                      <div
                        className={`h-full rounded-full transition-all ${progressTone(progress)}`}
                        style={{ width: `${Math.max(6, progress)}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeOrder ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(15,23,42,0.42)] p-4">
          <div className="max-h-[90vh] w-full max-w-[880px] overflow-y-auto rounded-[12px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Marketplace order</p>
                <h3 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">
                  {activeOrder.order?.orderNumber || activeOrder.docId || "Order"}
                </h3>
                <p className="mt-1 text-[13px] text-[#57636c]">
                  {activeOrder.customer?.accountName || "Customer"} • {activeOrder.customer?.email || "No email"} • {sellerSummary(activeOrder)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveOrderId(null)}
                className="rounded-full border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-[#57636c] transition hover:bg-[#fafafa]"
              >
                Close
              </button>
            </div>

            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.25fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-[10px] border border-black/6 bg-[#fafafa] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      activeOrder.lifecycle?.orderStatus || activeOrder.order?.status?.order || "unknown",
                      activeOrder.lifecycle?.paymentStatus || activeOrder.order?.status?.payment || "unknown",
                      activeOrder.lifecycle?.fulfillmentStatus || activeOrder.order?.status?.fulfillment || "unknown",
                    ].map((statusValue, index) => (
                      <span key={`${statusValue}-${index}`} className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(statusValue)}`}>
                        {sentenceStatus(statusValue)}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Order created</p>
                      <p className="mt-1 text-[14px] text-[#202020]">{formatDateTime(activeOrder.timestamps?.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Merchant reference</p>
                      <p className="mt-1 text-[14px] text-[#202020]">{activeOrder.order?.merchantTransactionId || "Not available"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Order total</p>
                      <p className="mt-1 text-[14px] font-semibold text-[#202020]">
                        {formatMoney(Number(activeOrder.totals?.final_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Refunded so far</p>
                      <p className="mt-1 text-[14px] text-[#202020]">
                        {formatMoney(Number(activeOrder.refund_summary?.total_amount_incl || activeOrder.payment?.refunded_amount_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[10px] border border-black/6 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                    <span>Delivery progress</span>
                    <span>{clampPercent(Number(activeOrder.delivery_progress?.percentageDelivered || 0))}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-black/8">
                    <div
                      className={`h-full rounded-full transition-all ${progressTone(clampPercent(Number(activeOrder.delivery_progress?.percentageDelivered || 0)))}`}
                      style={{ width: `${Math.max(6, clampPercent(Number(activeOrder.delivery_progress?.percentageDelivered || 0)))}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-[10px] border border-black/6 bg-white p-4">
                  <p className="text-[16px] font-semibold text-[#202020]">Refund history</p>
                  {Array.isArray(activeOrder.refund_summary?.entries) && activeOrder.refund_summary.entries.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {activeOrder.refund_summary.entries.map((entry, index) => (
                        <div key={`${entry.createdAt || "refund"}-${index}`} className="flex items-center justify-between rounded-[8px] bg-[#fafafa] px-3 py-2 text-[13px]">
                          <div>
                            <p className="font-medium text-[#202020]">
                              {formatMoney(Number(entry.amount_incl || 0), toStr(activeOrder.payment?.currency || "ZAR"))}
                            </p>
                            <p className="text-[12px] text-[#8b94a3]">{formatDateTime(entry.createdAt)}</p>
                          </div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(entry.status)}`}>
                            {sentenceStatus(entry.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[13px] text-[#57636c]">No refunds have been processed on this order yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[10px] border border-black/6 bg-[#fafafa] p-4">
                  <p className="text-[16px] font-semibold text-[#202020]">Admin actions</p>
                  <p className="mt-1 text-[13px] text-[#57636c]">
                    Use this panel to process a full or partial Stripe refund. Refunds remain admin-only.
                  </p>

                  {refundEligibility(activeOrder).allowed ? (
                    <>
                      <div className="mt-4 flex gap-2 rounded-[8px] bg-white p-1">
                        {(["full", "partial"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setRefundMode(mode);
                              if (mode === "full") setRefundAmount(refundEligibility(activeOrder).remaining.toFixed(2));
                            }}
                            className={`flex-1 rounded-[7px] px-3 py-2 text-[12px] font-semibold transition ${
                              refundMode === mode ? "bg-[#202020] text-white" : "text-[#57636c] hover:bg-[#fafafa]"
                            }`}
                          >
                            {mode === "full" ? "Full refund" : "Partial refund"}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-[8px] border border-black/6 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Refundable balance</p>
                        <p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#202020]">
                          {formatMoney(refundEligibility(activeOrder).remaining, toStr(activeOrder.payment?.currency || "ZAR"))}
                        </p>
                      </div>

                      {refundMode === "partial" ? (
                        <label className="mt-4 block">
                          <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Refund amount</span>
                          <input
                            value={refundAmount}
                            onChange={(event) => setRefundAmount(event.target.value)}
                            inputMode="decimal"
                            className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b]"
                            placeholder="0.00"
                          />
                        </label>
                      ) : null}

                      <label className="mt-4 block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Internal refund note</span>
                        <textarea
                          value={refundNote}
                          onChange={(event) => setRefundNote(event.target.value)}
                          rows={4}
                          className="w-full rounded-[8px] border border-black/10 px-3 py-2 text-[14px] outline-none focus:border-[#cbb26b]"
                          placeholder="Optional note for this refund action"
                        />
                      </label>

                      {refundError ? (
                        <div className="mt-3 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-2 text-[12px] text-[#b91c1c]">
                          {refundError}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void submitRefund()}
                        disabled={refundBusy}
                        className="mt-4 w-full rounded-[8px] bg-[#202020] px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {refundBusy ? "Processing refund..." : refundMode === "full" ? "Process full refund" : "Process partial refund"}
                      </button>
                    </>
                  ) : (
                    <div className="mt-4 rounded-[8px] border border-black/6 bg-white px-3 py-3 text-[13px] text-[#57636c]">
                      This order does not currently have an admin Stripe refund action available.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[90] rounded-[10px] bg-[#202020] px-4 py-3 text-[13px] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.28)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
