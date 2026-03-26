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

export function SellerOrdersWorkspace({ sellerSlug = "", sellerCode = "", mode }: SellerOrdersWorkspaceProps) {
  const { authReady, isAuthenticated } = useAuth();
  const [items, setItems] = useState<SellerOrderSlice[]>([]);
  const [counts, setCounts] = useState({ all: 0, new: 0, unfulfilled: 0, fulfilled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionDrafts, setActionDrafts] = useState<Record<string, SellerActionDraft>>({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [documentLoadingOrderId, setDocumentLoadingOrderId] = useState<string | null>(null);

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
        setSelectedOrderIds([]);
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

  async function handleBulkStatusUpdate(nextStatus: "confirmed" | "processing" | "dispatched" | "delivered") {
    const selectedItems = filteredItems.filter((item) => selectedOrderIds.includes(item.orderId));
    if (!selectedItems.length) return;
    setBulkUpdating(true);
    setError(null);
    setNotice(null);
    try {
      for (const item of selectedItems) {
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
          throw new Error(payload?.message || `Unable to update ${item.orderNumber || item.orderId}.`);
        }
      }

      setItems((current) =>
        current.map((entry) =>
          selectedOrderIds.includes(entry.orderId)
            ? {
                ...entry,
                orderStatus: nextStatus === "delivered" ? "completed" : nextStatus,
                fulfillmentStatus: nextStatus === "delivered" ? "delivered" : nextStatus,
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
              }
            : entry,
        ),
      );
      setSelectedOrderIds([]);
      setNotice(`${selectedItems.length} order${selectedItems.length === 1 ? "" : "s"} marked ${statusLabelText(nextStatus).toLowerCase()}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update the selected orders.");
    } finally {
      setBulkUpdating(false);
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to generate that document right now.");
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
  const selectedCount = selectedOrderIds.length;

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Seller orders</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Each order here already shows only your seller items. Inside each order, your items are grouped into the lines you handle yourself and the lines Piessang handles.
        </p>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#202020]">{summaryLabel}</p>
            <p className="mt-1 text-[12px] text-[#57636c]">
              You only see the order lines, delivery progress, and actions that belong to your seller account.
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

      {selectedCount ? (
        <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[13px] font-semibold text-[#202020]">
              {selectedCount} selected order{selectedCount === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["processing", "dispatched", "delivered"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void handleBulkStatusUpdate(status)}
                  disabled={bulkUpdating}
                  className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkUpdating ? "Updating..." : `Mark ${statusLabelText(status).toLowerCase()}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedOrderIds([])}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)]"
              >
                Clear selection
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="divide-y divide-black/5">
          {loading ? (
            <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading seller orders...</div>
          ) : filteredItems.length ? (
            filteredItems.map((item) => {
              const open = expandedOrderId === item.orderId;
              const nextActions = getNextSellerActions(item);
              return (
                <div key={item.orderId} className="px-4 py-4">
                  <div className="grid gap-3 md:grid-cols-[auto_1.4fr_.9fr_1fr_auto] md:items-center">
                    <label className="inline-flex items-center justify-center pt-1 md:pt-0">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(item.orderId)}
                        onChange={(event) =>
                          setSelectedOrderIds((current) =>
                            event.target.checked
                              ? current.includes(item.orderId)
                                ? current
                                : [...current, item.orderId]
                              : current.filter((id) => id !== item.orderId),
                          )
                        }
                        className="h-4 w-4 rounded border-black/20"
                        aria-label={`Select order ${item.orderNumber || item.orderId}`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId((current) => (current === item.orderId ? null : item.orderId))}
                      className="grid w-full gap-3 text-left md:col-span-4 md:grid-cols-[1.4fr_.9fr_1fr_auto] md:items-center"
                    >
                    <div>
                      <p className="text-[14px] font-semibold text-[#202020]">{item.orderNumber || item.orderId}</p>
                      <p className="mt-1 text-[12px] text-[#57636c]">
                        {item.customerName || "Customer"} • {formatTime(item.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${orderStatusTone(item.orderStatus)}`}>
                          {toStr(item.orderStatus || "unknown")}
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${paymentStatusTone(item.paymentStatus)}`}>
                          Payment {toStr(item.paymentStatus || "unknown")}
                        </span>
                      </div>
                    </div>
                    <div className="text-[12px] text-[#57636c]">
                      <p>{pluralize(item.counts.quantity, "unit")}</p>
                      <p>{pluralize(item.counts.items, "line")}</p>
                    </div>
                    <div className="text-[12px] text-[#57636c]">
                      <p>{item.counts.selfFulfilment} seller-handled</p>
                      <p>{item.counts.piessangFulfilment} Piessang-handled</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold text-[#202020]">{formatMoney(item.totals.subtotalIncl)}</div>
                      <p className="mt-1 text-[11px] text-[#57636c]">{item.deliveryProgress?.percentageDelivered ?? 0}% delivered</p>
                    </div>
                    </button>
                  </div>

                  {open ? (
                    <div className="mt-4 space-y-4 rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
                      <section className="rounded-[10px] border border-black/5 bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[#202020]">Delivery progress</p>
                            <p className="mt-1 text-[11px] text-[#57636c]">
                              {item.deliveryProgress?.deliveredUnits ?? 0} of {item.deliveryProgress?.totalUnits ?? 0} units delivered across this seller order.
                            </p>
                          </div>
                          <span className="text-[13px] font-semibold text-[#202020]">{item.deliveryProgress?.percentageDelivered ?? 0}%</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {nextActions.map((nextStatus) => (
                            <button
                              key={nextStatus}
                              type="button"
                              onClick={() => updateSellerOrderStatus(item, nextStatus)}
                              disabled={updatingOrderId === item.orderId}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingOrderId === item.orderId ? "Updating..." : `Mark ${statusLabelText(nextStatus).toLowerCase()}`}
                            </button>
                          ))}
                          <Link
                            href={`/account?section=orders&orderNumber=${encodeURIComponent(item.orderNumber || item.orderId)}`}
                            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)]"
                          >
                            Customer view
                          </Link>
                          {(["picking_slip", "delivery_note", "invoice"] as const).map((docType) => (
                            <button
                              key={docType}
                              type="button"
                              onClick={() => void handleGenerateDocument(item, docType)}
                              disabled={documentLoadingOrderId === item.orderId}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.04)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {documentLoadingOrderId === item.orderId
                                ? "Preparing..."
                                : docType === "picking_slip"
                                  ? "Packing slip"
                                  : docType === "delivery_note"
                                    ? "Delivery note"
                                    : "Invoice"}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
                          <div
                            className="h-full rounded-full bg-[#1d4ed8]"
                            style={{ width: `${Math.max(0, Math.min(100, item.deliveryProgress?.percentageDelivered ?? 0))}%` }}
                          />
                        </div>
                        <div className="mt-3 grid gap-3 text-[11px] text-[#57636c] md:grid-cols-3">
                          <p>{item.deliveryProgress?.deliveredLines ?? 0} delivered lines</p>
                          <p>{item.deliveryProgress?.pendingLines ?? 0} pending lines</p>
                          <p>{item.deliveryProgress?.isComplete ? "Order fully delivered" : "Awaiting remaining deliveries"}</p>
                        </div>
                      </section>

                      <section className="rounded-[10px] border border-black/5 bg-white p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-[12px] font-semibold text-[#202020]">How you should fulfil this order</p>
                            <p className="mt-1 text-[11px] text-[#57636c]">
                              {item.deliveryOption?.instructions || "Use the delivery method saved on this order when you fulfil it."}
                            </p>
                          </div>
                          <span className="inline-flex rounded-full border border-black/10 bg-[#f9fafb] px-3 py-1 text-[11px] font-semibold text-[#202020]">
                            {item.deliveryOption?.label || "Delivery method pending"}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 text-[12px] text-[#57636c] md:grid-cols-4">
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Delivery type</p>
                            <p className="mt-1 font-semibold text-[#202020]">{item.deliveryOption?.label || "Pending"}</p>
                          </div>
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Customer paid</p>
                            <p className="mt-1 font-semibold text-[#202020]">{formatMoney(Number(item.deliveryOption?.amountIncl || 0))}</p>
                          </div>
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Expected timing</p>
                            <p className="mt-1 font-semibold text-[#202020]">
                              {item.deliveryOption?.leadTimeDays ? `${item.deliveryOption.leadTimeDays} day${item.deliveryOption.leadTimeDays === 1 ? "" : "s"}` : "Not set"}
                            </p>
                          </div>
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Destination</p>
                            <p className="mt-1 font-semibold text-[#202020]">{item.deliveryOption?.destination || "No destination saved"}</p>
                          </div>
                        </div>

                        {toStr(item.deliveryOption?.trackingMode).toLowerCase() === "courier" ? (
                          <div className="mt-4 grid gap-3 rounded-[8px] border border-black/5 bg-[#fafafa] p-4 md:grid-cols-3">
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Courier name</label>
                              <input
                                value={getDraft(item.orderId).courierName}
                                onChange={(event) => updateDraft(item.orderId, { courierName: event.target.value })}
                                className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                                placeholder="The Courier Guy"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Tracking number</label>
                              <input
                                value={getDraft(item.orderId).trackingNumber}
                                onChange={(event) => updateDraft(item.orderId, { trackingNumber: event.target.value })}
                                className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                                placeholder="Tracking reference"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery note</label>
                              <input
                                value={getDraft(item.orderId).notes}
                                onChange={(event) => updateDraft(item.orderId, { notes: event.target.value })}
                                className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                                placeholder="Optional note"
                              />
                            </div>
                          </div>
                        ) : toStr(item.deliveryOption?.trackingMode).toLowerCase() === "direct" ? (
                          <div className="mt-4 rounded-[8px] border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[12px] text-[#1d4ed8]">
                            This order is inside your direct delivery coverage, so courier tracking fields are hidden here.
                          </div>
                        ) : toStr(item.deliveryOption?.type).toLowerCase() === "collection" ? (
                          <div className="mt-4 rounded-[8px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">
                            The customer chose collection. Prepare the items for pickup and mark the order delivered once collection is complete.
                          </div>
                        ) : null}
                      </section>

                      <section className="rounded-[10px] border border-black/5 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-semibold text-[#202020]">Customer delivery details</p>
                            <p className="mt-1 text-[11px] text-[#57636c]">
                              Use these details when you need to call the customer, arrange delivery, or prepare collection.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 text-[12px] text-[#57636c] md:grid-cols-3">
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Recipient</p>
                            <p className="mt-1 font-semibold text-[#202020]">{item.customerContact?.recipientName || item.customerName || "Customer"}</p>
                          </div>
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Phone</p>
                            <p className="mt-1 font-semibold text-[#202020]">{item.customerContact?.phone || "Not provided yet"}</p>
                          </div>
                          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Address</p>
                            <p className="mt-1 font-semibold text-[#202020]">{item.customerContact?.destination || "No address saved on this order"}</p>
                          </div>
                        </div>
                        {item.customerContact?.notes ? (
                          <div className="mt-3 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[12px] text-[#57636c]">
                            <span className="font-semibold text-[#202020]">Delivery notes:</span> {item.customerContact.notes}
                          </div>
                        ) : null}
                      </section>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-[10px] border border-black/5 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[12px] font-semibold text-[#202020]">Self fulfilment</p>
                              <p className="mt-1 text-[11px] text-[#57636c]">Your seller-managed lines that you need to prepare and fulfil.</p>
                            </div>
                            <span className="text-[11px] font-semibold text-[#8f7531]">{item.counts.selfFulfilment}</span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {item.lines.selfFulfilment.length ? item.lines.selfFulfilment.map((line, index) => (
                              <div key={`${item.orderId}-self-${index}`} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-[13px] font-semibold text-[#202020]">{getLineTitle(line)}</p>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(line?.fulfillment_tracking?.status)}`}>
                                    {getLineStatus(line)}
                                  </span>
                                </div>
                                {getLineSubtitle(line) ? <p className="mt-1 text-[11px] text-[#7d7d7d]">{getLineSubtitle(line)}</p> : null}
                                <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                                  <p>Qty: {getLineQty(line)}</p>
                                  <p>{line?.fulfillment_tracking?.actionOwner === "seller" ? "Actioned by seller" : "Tracked by Piessang"}</p>
                                </div>
                              </div>
                            )) : <div className="text-[12px] text-[#57636c]">No self-fulfilment lines on this order.</div>}
                          </div>
                        </section>

                        <section className="rounded-[10px] border border-black/5 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[12px] font-semibold text-[#202020]">Piessang fulfilment</p>
                              <p className="mt-1 text-[11px] text-[#57636c]">Piessang-managed lines are shown here so you can follow the full customer order.</p>
                            </div>
                            <span className="text-[11px] font-semibold text-[#166534]">{item.counts.piessangFulfilment}</span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {item.lines.piessangFulfilment.length ? item.lines.piessangFulfilment.map((line, index) => (
                              <div key={`${item.orderId}-piessang-${index}`} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-[13px] font-semibold text-[#202020]">{getLineTitle(line)}</p>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(line?.fulfillment_tracking?.status)}`}>
                                    {getLineStatus(line)}
                                  </span>
                                </div>
                                {getLineSubtitle(line) ? <p className="mt-1 text-[11px] text-[#7d7d7d]">{getLineSubtitle(line)}</p> : null}
                                <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                                  <p>Qty: {getLineQty(line)}</p>
                                  <p>Tracked from Piessang fulfilment</p>
                                </div>
                              </div>
                            )) : <div className="text-[12px] text-[#57636c]">No Piessang-fulfilled lines on this order.</div>}
                          </div>
                        </section>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-[13px] text-[#57636c]">
              {searchTerm ? "No seller orders matched your search." : "No seller orders found for this view."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
