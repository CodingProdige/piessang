"use client";

import { useEffect, useMemo, useState } from "react";

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

export function SellerOrdersWorkspace({ sellerSlug = "", sellerCode = "", mode }: SellerOrdersWorkspaceProps) {
  const [items, setItems] = useState<SellerOrderSlice[]>([]);
  const [counts, setCounts] = useState({ all: 0, new: 0, unfulfilled: 0, fulfilled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOrders() {
      setLoading(true);
      setError(null);
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
  }, [mode, sellerCode, sellerSlug]);

  async function updateSellerOrderStatus(item: SellerOrderSlice, nextStatus: "confirmed" | "processing" | "dispatched" | "delivered") {
    setUpdatingOrderId(item.orderId);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/seller/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          sellerCode: sellerCode || item.sellerCode,
          sellerSlug: sellerSlug || item.sellerSlug,
          status: nextStatus,
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update seller order status.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  const summaryLabel = useMemo(() => {
    if (mode === "new") return `${counts.new} new seller orders`;
    if (mode === "fulfilled") return `${counts.fulfilled} fulfilled seller orders`;
    return `${counts.unfulfilled} unfulfilled seller orders`;
  }, [counts, mode]);

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Seller orders</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Each order here is already scoped to this seller only. Inside each order, your items are grouped into self-fulfilment and Piessang-fulfilment sections.
        </p>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <p className="text-[12px] font-semibold text-[#202020]">{summaryLabel}</p>
        <p className="mt-1 text-[12px] text-[#57636c]">
          Sellers only see their own order slice, while Piessang admins still retain full marketplace visibility.
        </p>
      </section>

      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="divide-y divide-black/5">
          {loading ? (
            <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading seller orders...</div>
          ) : items.length ? (
            items.map((item) => {
              const open = expandedOrderId === item.orderId;
              return (
                <div key={item.orderId} className="px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedOrderId((current) => (current === item.orderId ? null : item.orderId))}
                    className="grid w-full gap-3 text-left md:grid-cols-[1.3fr_.8fr_.8fr_auto] md:items-center"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-[#202020]">{item.orderNumber || item.orderId}</p>
                      <p className="mt-1 text-[12px] text-[#57636c]">
                        {item.customerName || "Customer"} • {formatTime(item.createdAt)}
                      </p>
                    </div>
                    <div className="text-[12px] text-[#57636c]">
                      <p>{item.counts.quantity} units</p>
                      <p>{item.counts.items} lines</p>
                    </div>
                    <div className="text-[12px] text-[#57636c]">
                      <p>Order: {item.orderStatus || "unknown"}</p>
                      <p>Payment: {item.paymentStatus || "unknown"}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold text-[#202020]">{formatMoney(item.totals.subtotalIncl)}</div>
                      <p className="mt-1 text-[11px] text-[#57636c]">{item.deliveryProgress?.percentageDelivered ?? 0}% delivered</p>
                    </div>
                  </button>

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
                          {(["confirmed", "processing", "dispatched", "delivered"] as const).map((nextStatus) => (
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

                      <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-[10px] border border-black/5 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[12px] font-semibold text-[#202020]">Self fulfilment</p>
                              <p className="mt-1 text-[11px] text-[#57636c]">Seller-managed lines you need to pack and dispatch.</p>
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
                              <p className="mt-1 text-[11px] text-[#57636c]">Warehouse-managed lines visible here for tracking only.</p>
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
            <div className="px-4 py-8 text-[13px] text-[#57636c]">No seller orders found for this view.</div>
          )}
        </div>
      </section>
    </div>
  );
}
