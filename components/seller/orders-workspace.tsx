"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";

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
  };
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
};

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

function formatMoney(value: number) {
  return `R${Number(value || 0).toFixed(2)}`;
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

function getLineQty(item: any) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLineStatus(item: any) {
  return toStr(item?.fulfillment_tracking?.label || "Not started");
}

function statusTone(status: unknown) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "delivered") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "dispatched") return "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]";
  if (normalized === "processing") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
  if (normalized === "confirmed") return "border-[#e5e7eb] bg-[#f9fafb] text-[#374151]";
  if (normalized === "cancelled") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#57636c]";
}

function statusLabelText(status: string) {
  if (status === "delivered") return "Delivered";
  if (status === "dispatched") return "Dispatched";
  if (status === "processing") return "Processing";
  if (status === "confirmed") return "Confirmed";
  return "Not started";
}

function getNextSellerActions(item: SellerOrderSlice) {
  const current = toStr(item.fulfillmentStatus || item.orderStatus).toLowerCase();
  const deliveryType = toStr(item.deliveryOption?.type).toLowerCase();
  if (current === "delivered" || item.deliveryProgress?.isComplete) return [];
  if (current === "dispatched") return ["delivered"] as const;
  if (current === "processing") return deliveryType === "shipping" ? (["dispatched", "delivered"] as const) : (["delivered"] as const);
  if (deliveryType === "collection" || deliveryType === "direct_delivery") {
    if (current === "confirmed" || current === "payment_pending") return ["processing", "delivered"] as const;
    return ["confirmed", "processing", "delivered"] as const;
  }
  if (current === "confirmed" || current === "payment_pending") return ["processing", "dispatched", "delivered"] as const;
  return ["confirmed", "processing", "dispatched", "delivered"] as const;
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

function getDeadlineState(item: SellerOrderSlice, nowTick: number) {
  const dueAt = toStr(item.fulfilmentDeadline?.dueAt);
  if (!dueAt || item.fulfilmentDeadline?.showDeadline !== true) {
    return { label: "No fulfilment deadline set", tone: "text-[#57636c]", overdue: false };
  }
  const deadline = new Date(dueAt);
  if (Number.isNaN(deadline.getTime())) {
    return { label: "Deadline unavailable", tone: "text-[#57636c]", overdue: false };
  }
  const diffMs = deadline.getTime() - nowTick;
  if (diffMs <= 0 || item.fulfilmentDeadline?.overdue) {
    const hoursLate = Math.max(1, Math.floor(Math.abs(diffMs) / (1000 * 60 * 60)));
    return {
      label: `Late by ${hoursLate}h • should have been fulfilled by ${formatTime(dueAt)}`,
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
    label: `${countdown} • fulfil by ${formatTime(dueAt)}`,
    tone: "text-[#8f7531]",
    overdue: false,
  };
}

function modalBackdropClass(open: boolean) {
  return `fixed inset-0 z-[140] flex items-center justify-center px-4 py-6 transition ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`;
}

export function SellerOrdersWorkspace({ sellerSlug = "", sellerCode = "", mode }: SellerOrdersWorkspaceProps) {
  const { authReady, isAuthenticated } = useAuth();
  const [items, setItems] = useState<SellerOrderSlice[]>([]);
  const [counts, setCounts] = useState({ all: 0, new: 0, unfulfilled: 0, fulfilled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionDrafts, setActionDrafts] = useState<Record<string, SellerActionDraft>>({});
  const [documentLoadingOrderId, setDocumentLoadingOrderId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
        const params = new URLSearchParams({ filter: mode });
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

  function getDraft(orderId: string): SellerActionDraft {
    return actionDrafts[orderId] || { courierName: "", trackingNumber: "", notes: "" };
  }

  function updateDraft(orderId: string, patch: Partial<SellerActionDraft>) {
    setActionDrafts((current) => ({
      ...current,
      [orderId]: {
        courierName: current[orderId]?.courierName || "",
        trackingNumber: current[orderId]?.trackingNumber || "",
        notes: current[orderId]?.notes || "",
        ...patch,
      },
    }));
  }

  async function updateSellerOrderStatus(item: SellerOrderSlice, nextStatus: "confirmed" | "processing" | "dispatched" | "delivered") {
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
                    },
                  })),
                  piessangFulfilment: entry.lines.piessangFulfilment,
                },
              },
        ),
      );
      setActionDrafts((current) => ({
        ...current,
        [item.orderId]: { courierName: "", trackingNumber: "", notes: "" },
      }));
      setNotice(`Order ${item.orderNumber || item.orderId} marked ${statusLabelText(nextStatus).toLowerCase()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update seller order status.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handleGenerateDocument(item: SellerOrderSlice, docType: "picking_slip" | "delivery_note" | "invoice") {
    setDocumentLoadingOrderId(item.orderId);
    setError(null);
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
      window.open(String(payload.data.url), "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate that document right now.");
    } finally {
      setDocumentLoadingOrderId(null);
    }
  }

  const summaryLabel = useMemo(() => {
    if (mode === "new") return `${counts.new} new seller orders`;
    if (mode === "fulfilled") return `${counts.fulfilled} fulfilled seller orders`;
    return `${counts.unfulfilled} unfulfilled seller orders`;
  }, [counts, mode]);

  const filteredItems = useMemo(() => {
    const needle = toStr(searchTerm).toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
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
  }, [items, searchTerm]);

  const totalUnits = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.counts.quantity || 0), 0), [filteredItems]);
  const totalValue = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.totals.subtotalIncl || 0), 0), [filteredItems]);
  const totalSelfFulfilment = useMemo(() => filteredItems.reduce((sum, item) => sum + Number(item.counts.selfFulfilment || 0), 0), [filteredItems]);
  const activeItem = useMemo(() => filteredItems.find((item) => item.orderId === activeOrderId) || null, [activeOrderId, filteredItems]);

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Seller orders</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Each order already shows only your seller slice. Open an order to see the exact fulfilment steps, deadline, and customer details you need.
        </p>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#202020]">{summaryLabel}</p>
            <p className="mt-1 text-[12px] text-[#57636c]">
              Open any order card to see the seller action plan, delivery deadline, documents, and status controls.
            </p>
          </div>
          <label className="block w-full max-w-[320px]">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Search orders</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Order number, customer, or product"
              className="h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Visible here</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{filteredItems.length}</p>
          <p className="mt-1 text-[12px] text-[#57636c]">{pluralize(filteredItems.length, "order")}</p>
        </div>
        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Units</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{totalUnits}</p>
          <p className="mt-1 text-[12px] text-[#57636c]">{pluralize(totalUnits, "unit")}</p>
        </div>
        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Seller-handled lines</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{totalSelfFulfilment}</p>
          <p className="mt-1 text-[12px] text-[#57636c]">Lines you need to action</p>
        </div>
        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Subtotal</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{formatMoney(totalValue)}</p>
          <p className="mt-1 text-[12px] text-[#57636c]">Before shipping and marketplace fees</p>
        </div>
      </section>

      {notice ? <div className="rounded-[8px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">{notice}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="divide-y divide-black/5">
          {loading ? (
            <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading seller orders...</div>
          ) : filteredItems.length ? (
            filteredItems.map((item) => {
              const deadlineState = getDeadlineState(item, nowTick);
              return (
                <button
                  key={item.orderId}
                  type="button"
                  onClick={() => setActiveOrderId(item.orderId)}
                  className="grid w-full gap-4 px-4 py-4 text-left transition hover:bg-[rgba(32,32,32,0.02)] lg:grid-cols-[1.4fr_.8fr_.85fr_1fr]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#202020]">{item.orderNumber || item.orderId}</p>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${orderStatusTone(item.orderStatus)}`}>
                        {toStr(item.orderStatus || "unknown")}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${paymentStatusTone(item.paymentStatus)}`}>
                        Payment {toStr(item.paymentStatus || "unknown")}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-[#57636c]">
                      {item.customerName || "Customer"} • {formatTime(item.createdAt)}
                    </p>
                    <p className={`mt-2 text-[12px] font-semibold ${deadlineState.tone}`}>{deadlineState.label}</p>
                  </div>

                  <div className="text-[12px] text-[#57636c]">
                    <p className="font-semibold text-[#202020]">{item.deliveryOption?.label || "Delivery method pending"}</p>
                    <p className="mt-1">{pluralize(item.counts.quantity, "unit")}</p>
                    <p>{pluralize(item.counts.items, "line")}</p>
                  </div>

                  <div className="text-[12px] text-[#57636c]">
                    <p className="font-semibold text-[#202020]">{item.actionPlan?.title || "Review fulfilment plan"}</p>
                    <p className="mt-1">{item.counts.selfFulfilment} seller-handled</p>
                    <p>{item.counts.piessangFulfilment} Piessang-handled</p>
                  </div>

                  <div className="lg:text-right">
                    <div className="text-[13px] font-semibold text-[#202020]">{formatMoney(item.totals.subtotalIncl)}</div>
                    <p className="mt-1 text-[11px] text-[#57636c]">{item.deliveryProgress?.percentageDelivered ?? 0}% delivered</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
                      <div className={`h-full rounded-full ${deadlineState.overdue ? "bg-[#b91c1c]" : "bg-[#1d4ed8]"}`} style={{ width: `${Math.max(0, Math.min(100, item.deliveryProgress?.percentageDelivered ?? 0))}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-[#907d4c]">Open order actions</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-8 text-[13px] text-[#57636c]">
              {searchTerm ? "No seller orders matched your search." : "No seller orders found for this view."}
            </div>
          )}
        </div>
      </section>

      {activeItem ? (
        <div className={modalBackdropClass(true)} role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close seller order details" onClick={() => setActiveOrderId(null)} />
          <div className="relative h-[92svh] w-full max-w-[1120px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller order</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{activeItem.orderNumber || activeItem.orderId}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    {activeItem.customerName || "Customer"} • {formatTime(activeItem.createdAt)} • {activeItem.deliveryOption?.label || "Delivery method pending"}
                  </p>
                </div>
                <button type="button" onClick={() => setActiveOrderId(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]" aria-label="Close seller order details">
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                  <div className="space-y-4">
                    <section className={`rounded-[10px] border p-4 ${getDeadlineState(activeItem, nowTick).overdue ? "border-[#fecaca] bg-[#fff5f5]" : "border-[#f0e7c9] bg-[rgba(203,178,107,0.08)]"}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">What you need to do now</p>
                      <h4 className="mt-2 text-[20px] font-semibold text-[#202020]">{activeItem.actionPlan?.title || "Review this order and action the next fulfilment step"}</h4>
                      <p className="mt-2 text-[13px] leading-[1.7] text-[#3f3f46]">{activeItem.actionPlan?.summary || activeItem.deliveryOption?.instructions || "Use the saved delivery method for this order."}</p>
                      <div className="mt-4 rounded-[8px] border border-black/5 bg-white/80 px-4 py-3">
                        <p className={`text-[13px] font-semibold ${getDeadlineState(activeItem, nowTick).tone}`}>{getDeadlineState(activeItem, nowTick).label}</p>
                      </div>
                      {Array.isArray(activeItem.actionPlan?.checklist) && activeItem.actionPlan.checklist.length ? (
                        <div className="mt-4 space-y-2">
                          {activeItem.actionPlan.checklist.map((step, index) => (
                            <div key={`${activeItem.orderId}-check-${index}`} className="flex gap-3 rounded-[8px] bg-white/80 px-4 py-3 text-[13px] text-[#202020]">
                              <span className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#202020] text-[11px] font-semibold text-white">{index + 1}</span>
                              <span className="leading-[1.6]">{step}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-[10px] border border-black/5 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[12px] font-semibold text-[#202020]">Delivery progress</p>
                          <p className="mt-1 text-[11px] text-[#57636c]">
                            {activeItem.deliveryProgress?.deliveredUnits ?? 0} of {activeItem.deliveryProgress?.totalUnits ?? 0} units delivered across this seller order.
                          </p>
                        </div>
                        <span className="text-[13px] font-semibold text-[#202020]">{activeItem.deliveryProgress?.percentageDelivered ?? 0}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
                        <div className={`h-full rounded-full ${getDeadlineState(activeItem, nowTick).overdue ? "bg-[#b91c1c]" : "bg-[#1d4ed8]"}`} style={{ width: `${Math.max(0, Math.min(100, activeItem.deliveryProgress?.percentageDelivered ?? 0))}%` }} />
                      </div>
                      <div className="mt-3 grid gap-3 text-[11px] text-[#57636c] md:grid-cols-3">
                        <p>{activeItem.deliveryProgress?.deliveredLines ?? 0} delivered lines</p>
                        <p>{activeItem.deliveryProgress?.pendingLines ?? 0} pending lines</p>
                        <p>{activeItem.deliveryProgress?.isComplete ? "Order fully delivered" : "Awaiting remaining deliveries"}</p>
                      </div>
                    </section>

                    <section className="rounded-[10px] border border-black/5 bg-white p-4">
                      <p className="text-[12px] font-semibold text-[#202020]">Customer delivery details</p>
                      <p className="mt-1 text-[11px] text-[#57636c]">Use these details exactly as saved when you need to call the customer, arrange delivery, or prepare collection.</p>
                      <div className="mt-4 grid gap-3 text-[12px] text-[#57636c] md:grid-cols-3">
                        <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Recipient</p>
                          <p className="mt-1 font-semibold text-[#202020]">{activeItem.customerContact?.recipientName || activeItem.customerName || "Customer"}</p>
                        </div>
                        <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Phone</p>
                          <p className="mt-1 font-semibold text-[#202020]">{activeItem.customerContact?.phone || "Not provided yet"}</p>
                        </div>
                        <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Address</p>
                          <p className="mt-1 font-semibold text-[#202020]">{activeItem.customerContact?.destination || "No address saved on this order"}</p>
                        </div>
                      </div>
                      {activeItem.customerContact?.notes ? (
                        <div className="mt-3 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[12px] text-[#57636c]">
                          <span className="font-semibold text-[#202020]">Delivery notes:</span> {activeItem.customerContact.notes}
                        </div>
                      ) : null}
                    </section>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <section className="rounded-[10px] border border-black/5 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-semibold text-[#202020]">Self fulfilment</p>
                            <p className="mt-1 text-[11px] text-[#57636c]">These are the lines you must action yourself.</p>
                          </div>
                          <span className="text-[11px] font-semibold text-[#8f7531]">{activeItem.counts.selfFulfilment}</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {activeItem.lines.selfFulfilment.length ? activeItem.lines.selfFulfilment.map((line, index) => (
                            <div key={`${activeItem.orderId}-self-${index}`} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-[13px] font-semibold text-[#202020]">{getLineTitle(line)}</p>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(line?.fulfillment_tracking?.status)}`}>
                                  {getLineStatus(line)}
                                </span>
                              </div>
                              {getLineSubtitle(line) ? <p className="mt-1 text-[11px] text-[#7d7d7d]">{getLineSubtitle(line)}</p> : null}
                              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                                <p>Qty: {getLineQty(line)}</p>
                                <p>Seller action required</p>
                              </div>
                            </div>
                          )) : <div className="text-[12px] text-[#57636c]">No self-fulfilment lines on this order.</div>}
                        </div>
                      </section>

                      <section className="rounded-[10px] border border-black/5 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-semibold text-[#202020]">Piessang fulfilment</p>
                            <p className="mt-1 text-[11px] text-[#57636c]">These lines are handled by Piessang. Use them as visibility only.</p>
                          </div>
                          <span className="text-[11px] font-semibold text-[#166534]">{activeItem.counts.piessangFulfilment}</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {activeItem.lines.piessangFulfilment.length ? activeItem.lines.piessangFulfilment.map((line, index) => (
                            <div key={`${activeItem.orderId}-piessang-${index}`} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-[13px] font-semibold text-[#202020]">{getLineTitle(line)}</p>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(line?.fulfillment_tracking?.status)}`}>
                                  {getLineStatus(line)}
                                </span>
                              </div>
                              {getLineSubtitle(line) ? <p className="mt-1 text-[11px] text-[#7d7d7d]">{getLineSubtitle(line)}</p> : null}
                              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                                <p>Qty: {getLineQty(line)}</p>
                                <p>Piessang is handling this line</p>
                              </div>
                            </div>
                          )) : <div className="text-[12px] text-[#57636c]">No Piessang-fulfilled lines on this order.</div>}
                        </div>
                      </section>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <section className="rounded-[10px] border border-black/5 bg-white p-4">
                      <p className="text-[12px] font-semibold text-[#202020]">Order actions</p>
                      <p className="mt-1 text-[11px] text-[#57636c]">Keep status updates, courier details, and seller documents in one place here.</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {getNextSellerActions(activeItem).map((nextStatus) => (
                          <button
                            key={nextStatus}
                            type="button"
                            onClick={() => void updateSellerOrderStatus(activeItem, nextStatus)}
                            disabled={updatingOrderId === activeItem.orderId}
                            className="rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)] disabled:opacity-50"
                          >
                            {updatingOrderId === activeItem.orderId ? "Updating..." : `Mark ${statusLabelText(nextStatus).toLowerCase()}`}
                          </button>
                        ))}
                        <Link href={`/account/orders/${encodeURIComponent(activeItem.orderId)}`} className="rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)]">
                          Customer order view
                        </Link>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {(["picking_slip", "delivery_note", "invoice"] as const).map((docType) => (
                          <button
                            key={docType}
                            type="button"
                            onClick={() => void handleGenerateDocument(activeItem, docType)}
                            disabled={documentLoadingOrderId === activeItem.orderId}
                            className="rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2 text-[12px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)] disabled:opacity-50"
                          >
                            {documentLoadingOrderId === activeItem.orderId
                              ? "Preparing..."
                              : docType === "picking_slip"
                                ? "Packing slip"
                                : docType === "delivery_note"
                                  ? "Delivery note"
                                  : "Invoice"}
                          </button>
                        ))}
                      </div>
                    </section>

                    {toStr(activeItem.deliveryOption?.trackingMode).toLowerCase() === "courier" ? (
                      <section className="rounded-[10px] border border-black/5 bg-white p-4">
                        <p className="text-[12px] font-semibold text-[#202020]">Courier details</p>
                        <p className="mt-1 text-[11px] text-[#57636c]">Add these before you mark the order dispatched.</p>
                        <div className="mt-4 grid gap-3">
                          <label className="block">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Courier name</span>
                            <input value={getDraft(activeItem.orderId).courierName} onChange={(event) => updateDraft(activeItem.orderId, { courierName: event.target.value })} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="The Courier Guy" />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Tracking number</span>
                            <input value={getDraft(activeItem.orderId).trackingNumber} onChange={(event) => updateDraft(activeItem.orderId, { trackingNumber: event.target.value })} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="Tracking reference" />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Dispatch note</span>
                            <textarea value={getDraft(activeItem.orderId).notes} onChange={(event) => updateDraft(activeItem.orderId, { notes: event.target.value })} rows={4} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-3 text-[13px] outline-none" placeholder="Optional note for this dispatch." />
                          </label>
                        </div>
                      </section>
                    ) : null}

                    {toStr(activeItem.deliveryOption?.trackingMode).toLowerCase() === "direct" ? (
                      <div className="rounded-[10px] border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[12px] text-[#1d4ed8]">
                        This is a direct-delivery order. Do not wait for courier tracking here. Use the saved address and phone number to arrange delivery yourself.
                      </div>
                    ) : null}

                    {toStr(activeItem.deliveryOption?.type).toLowerCase() === "collection" ? (
                      <div className="rounded-[10px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">
                        This is a collection order. Prepare the items for pickup and only mark the order delivered after the customer has collected them.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
                <button type="button" onClick={() => setActiveOrderId(null)} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SellerOrdersWorkspace;
