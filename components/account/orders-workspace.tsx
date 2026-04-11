"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getFrozenOrderPayableIncl } from "@/lib/orders/frozen-money";
import { formatMoneyExact } from "@/lib/money";
import { PlatformPortalPopover, PopoverHintTrigger } from "@/components/ui/platform-popover";

type CustomerOrdersPayload = {
  items?: CustomerOrder[];
};

type CustomerOrder = {
  docId?: string;
  order?: {
    orderNumber?: string;
    channel?: string;
  };
  lifecycle?: {
    orderStatus?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
  };
  delivery_progress?: {
    percentageDelivered?: number;
    percentageProgress?: number;
  };
  cancellation?: {
    status?: string;
  };
  timestamps?: {
    createdAt?: string;
    deliveredAt?: string;
  };
  totals?: {
    final_payable_incl?: number;
  };
  payment?: {
    paid_amount_incl?: number;
  };
  seller_slices?: Array<{
    sellerCode?: string;
    sellerSlug?: string;
    vendorName?: string;
  }>;
  items?: Array<{
    quantity?: number;
    seller_snapshot?: {
      vendorName?: string;
      sellerSlug?: string;
      sellerCode?: string;
    };
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
    line_totals?: {
      final_incl?: number;
    };
  }>;
};

type FilterKey = "all" | "active" | "delivered" | "cancelled" | "refunded" | "unpaid";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number) {
  return formatMoneyExact(value);
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
  return `${new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric" }).format(date)} at ${timeLabel}`;
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

function cancellationTone(status?: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "requested") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
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

function getOrderItemCount(order: CustomerOrder) {
  return Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0) : 0;
}

function getOrderPreviewLabel(order: CustomerOrder) {
  const first = Array.isArray(order.items) ? order.items[0] : null;
  const title = toStr(first?.product_snapshot?.name || "");
  if (!title) return "Products in order";
  const extra = Math.max(0, (Array.isArray(order.items) ? order.items.length : 0) - 1);
  return extra > 0 ? `${title} +${extra} more` : title;
}

function getOrderImage(order: CustomerOrder) {
  const first = Array.isArray(order.items) ? order.items[0] : null;
  return (
    toStr(first?.selected_variant_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(first?.product_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl)
  );
}

function getOrderImages(order: CustomerOrder) {
  return (Array.isArray(order.items) ? order.items : [])
    .map((item) =>
      toStr(
        item?.selected_variant_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl ||
          item?.product_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl,
      ),
    )
    .filter(Boolean)
    .slice(0, 3);
}

function getOrderProductEntries(order: CustomerOrder) {
  return (Array.isArray(order.items) ? order.items : []).slice(0, 4).map((item, index) => ({
    key: `${order.docId || "order"}-item-${index}`,
    image:
      toStr(
        item?.selected_variant_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl ||
          item?.product_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl,
      ) || "",
    title: toStr(item?.product_snapshot?.name || "Product", "Product"),
    variant: toStr(item?.selected_variant_snapshot?.label || ""),
    quantity: Math.max(0, Number(item?.quantity || 0)),
  }));
}

function getCombinedFulfillmentProgress(order: CustomerOrder) {
  return Math.max(0, Math.min(100, Number(order.delivery_progress?.percentageProgress || order.delivery_progress?.percentageDelivered || 0)));
}

function getOrderLifecycleDisplay(order: CustomerOrder) {
  const orderStatus = toStr(order.lifecycle?.orderStatus).toLowerCase();
  const paymentStatus = toStr(order.lifecycle?.paymentStatus).toLowerCase();
  const cancellationStatus = toStr(order.cancellation?.status).toLowerCase();
  const rawProgress = getCombinedFulfillmentProgress(order);

  if (paymentStatus === "refunded" || paymentStatus === "partial_refund") {
    return {
      label: paymentStatus === "partial_refund" ? "Partially refunded" : "Refunded",
      progress: 100,
      tone: "refund" as const,
      showBar: false,
      pill: paymentStatus === "partial_refund" ? "Partial refund issued" : "Refund issued",
    };
  }

  if (orderStatus === "cancelled" || cancellationStatus === "cancelled") {
    return {
      label: "Cancelled",
      progress: 100,
      tone: "cancelled" as const,
      showBar: false,
      pill: "Order cancelled",
    };
  }

  if (cancellationStatus === "requested") {
    return {
      label: "Cancellation requested",
      progress: rawProgress,
      tone: "requested" as const,
      showBar: true,
      pill: "Cancellation requested",
    };
  }

  return {
    label: sentenceStatus(order.lifecycle?.fulfillmentStatus || order.lifecycle?.orderStatus),
    progress: rawProgress,
    tone: rawProgress >= 100 ? ("complete" as const) : rawProgress >= 50 ? ("active" as const) : ("idle" as const),
    showBar: true,
    pill: null,
  };
}

function getSellerCount(order: CustomerOrder) {
  const sellerSlices = Array.isArray(order.seller_slices) ? order.seller_slices : [];
  const sliceSellers = sellerSlices
    .map((slice) => toStr(slice?.vendorName || slice?.sellerSlug || slice?.sellerCode))
    .filter(Boolean);
  if (sliceSellers.length) return new Set(sliceSellers).size;

  const itemSellers = (order.items || [])
    .map((item) => toStr(item?.seller_snapshot?.vendorName || item?.seller_snapshot?.sellerSlug || item?.seller_snapshot?.sellerCode))
    .filter(Boolean);
  if (itemSellers.length) return new Set(itemSellers).size;

  return Array.isArray(order.items) && order.items.length > 0 ? 1 : 0;
}

function OrderProductsPopover({ order }: { order: CustomerOrder }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320, caretLeft: 32 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const entries = getOrderProductEntries(order);

  const updatePosition = () => {
    const element = triggerRef.current;
    if (!element || typeof window === "undefined") return;
    const rect = element.getBoundingClientRect();
    const desiredWidth = 340;
    const viewportPadding = 16;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - desiredWidth - viewportPadding);
    const left = Math.min(Math.max(viewportPadding, rect.left), maxLeft);
    const caretLeft = Math.min(Math.max(24, rect.left - left + rect.width / 2), desiredWidth - 24);
    setPosition({
      top: rect.bottom + 14,
      left,
      width: desiredWidth,
      caretLeft,
    });
  };

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimeout();
    updatePosition();
    setOpen(true);
  };

  const queueClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => setOpen(false), 100);
  };

  useEffect(() => {
    if (!open) return;
    const handleWindowUpdate = () => updatePosition();
    const handleClickOutside = (event: MouseEvent) => {
      if (!triggerRef.current) return;
      const target = event.target as Node | null;
      if (target && triggerRef.current.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", handleWindowUpdate);
    window.addEventListener("scroll", handleWindowUpdate, true);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("resize", handleWindowUpdate);
      window.removeEventListener("scroll", handleWindowUpdate, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const remainingCount = Math.max(0, (order.items || []).length - entries.length);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          openPopover();
        }}
        onMouseEnter={(event) => {
          event.stopPropagation();
          openPopover();
        }}
        onMouseLeave={queueClose}
        className="text-left"
      >
        <PopoverHintTrigger active={open} className="font-medium">
          <span>{getOrderPreviewLabel(order)}</span>
        </PopoverHintTrigger>
      </button>
      <PlatformPortalPopover open={open} top={position.top} left={position.left} width={position.width} caretLeft={position.caretLeft}>
        <div onMouseEnter={openPopover} onMouseLeave={queueClose}>
          <p className="text-[20px] font-semibold tracking-[-0.02em] text-[#202020]">Order products</p>
          <p className="mt-1 text-[13px] text-[#57636c]">
            {getOrderItemCount(order)} item{getOrderItemCount(order) === 1 ? "" : "s"} across {getSellerCount(order)} seller{getSellerCount(order) === 1 ? "" : "s"}.
          </p>
          <div className="mt-4 space-y-3">
            {entries.map((entry) => (
              <div key={entry.key} className="flex items-center gap-3 rounded-[16px] border border-black/6 bg-[#fcfcfc] p-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border border-black/6 bg-[#f6f7f8]">
                  {entry.image ? (
                    <Image src={entry.image} alt={entry.title} fill className="object-cover" sizes="56px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#907d4c]">Item</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#202020]">{entry.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[#57636c]">{entry.variant || "Selected option unavailable"}</p>
                </div>
                <div className="shrink-0 text-[12px] font-semibold text-[#202020]">x{entry.quantity}</div>
              </div>
            ))}
          </div>
          {remainingCount > 0 ? <p className="mt-3 text-[12px] text-[#57636c]">+{remainingCount} more product{remainingCount === 1 ? "" : "s"} in this order</p> : null}
        </div>
      </PlatformPortalPopover>
    </>
  );
}

export function CustomerOrdersWorkspace({ payload, loading, error }: { uid: string; payload: CustomerOrdersPayload; loading: boolean; error: string | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const items = Array.isArray(payload.items) ? payload.items : [];

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((order) => {
      const orderStatus = toStr(order.lifecycle?.orderStatus).toLowerCase();
      const paymentStatus = toStr(order.lifecycle?.paymentStatus).toLowerCase();
      const fulfillmentStatus = toStr(order.lifecycle?.fulfillmentStatus).toLowerCase();
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && !["completed", "cancelled"].includes(orderStatus) && fulfillmentStatus !== "delivered") ||
        (filter === "delivered" && (fulfillmentStatus === "delivered" || orderStatus === "completed")) ||
        (filter === "cancelled" && orderStatus === "cancelled") ||
        (filter === "refunded" && ["refunded", "partial_refund"].includes(paymentStatus)) ||
        (filter === "unpaid" && paymentStatus !== "paid");
      if (!matchesFilter) return false;
      if (!query) return true;
      const haystack = [
        order.order?.orderNumber,
        order.order?.channel,
        getOrderPreviewLabel(order),
        ...((order.items || []).map((item) => item?.selected_variant_snapshot?.label || "")),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, items, search]);

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-[#202020]">Your orders</h1>
          <p className="mt-2 text-[14px] text-[#57636c]">See all of your current and past orders in one place.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-black/6 bg-white shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        <div className="border-b border-black/6 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "delivered", label: "Delivered" },
              { key: "cancelled", label: "Cancelled" },
              { key: "refunded", label: "Refunded" },
              { key: "unpaid", label: "Unpaid" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key as FilterKey)}
                className={`rounded-[14px] px-4 py-2 text-[14px] font-semibold transition ${filter === item.key ? "bg-[#f1f2f4] text-[#202020]" : "text-[#57636c] hover:bg-[#f6f7f8]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-4 max-w-[520px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order number, product, or variant"
              className="h-12 w-full rounded-[16px] border border-black/10 bg-white px-4 text-[15px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
            />
          </div>
        </div>

        {error ? <div className="border-b border-[#f0c7cb] bg-[#fff7f8] px-5 py-4 text-[13px] text-[#b91c1c]">{error}</div> : null}

        {loading ? (
          <div className="px-5 py-10 text-[14px] text-[#57636c]">Loading your orders…</div>
        ) : !filteredItems.length ? (
          <div className="px-5 py-10 text-[14px] text-[#57636c]">No orders match this view yet.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left text-[14px]">
                <thead className="text-[#6b7280]">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Order</th>
                    <th className="px-2 py-4 font-semibold">Date</th>
                    <th className="px-2 py-4 font-semibold">Order products</th>
                    <th className="px-2 py-4 font-semibold">Total</th>
                    <th className="px-2 py-4 font-semibold">Payment status</th>
                    <th className="px-2 py-4 font-semibold">Fulfilment progress</th>
                    <th className="px-5 py-4 font-semibold">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((order) => {
                    const href = `/account/orders/${encodeURIComponent(toStr(order.docId))}`;
                    const lifecycleDisplay = getOrderLifecycleDisplay(order);
                    return (
                      <tr key={order.docId} className="cursor-pointer border-t border-black/6 text-[#202020] hover:bg-[#fcfcfc]" onClick={() => router.push(href)}>
                        <td className="px-5 py-4 font-semibold">{order.order?.orderNumber || order.docId || "Order"}</td>
                        <td className="px-2 py-4 text-[#57636c]">{formatRelativeOrderDate(order.timestamps?.createdAt)}</td>
                        <td className="px-2 py-4">
                          <div className="min-w-0">
                            <OrderProductsPopover order={order} />
                            <p className="mt-1 text-[12px] text-[#57636c]">{getSellerCount(order)} seller{getSellerCount(order) === 1 ? "" : "s"}</p>
                          </div>
                        </td>
                        <td className="px-2 py-4 font-semibold">{formatMoney(getFrozenOrderPayableIncl(order || {}))}</td>
                        <td className="px-2 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[13px] font-semibold ${paymentTone(order.lifecycle?.paymentStatus)}`}>
                            {sentenceStatus(order.lifecycle?.paymentStatus)}
                          </span>
                        </td>
                        <td className="px-2 py-4">
                          <div className="min-w-[170px]">
                            <div className="flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                              <span>{lifecycleDisplay.label}</span>
                              <span className="font-semibold text-[#202020]">{lifecycleDisplay.progress}%</span>
                            </div>
                            {lifecycleDisplay.showBar ? (
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eceff3]">
                                <div
                                  className={`h-full rounded-full ${
                                    lifecycleDisplay.tone === "complete"
                                      ? "bg-[#1f8f55]"
                                      : lifecycleDisplay.tone === "active"
                                        ? "bg-[#57a6ff]"
                                        : "bg-[#202020]"
                                  }`}
                                  style={{ width: `${lifecycleDisplay.progress}%` }}
                                />
                              </div>
                            ) : null}
                            {lifecycleDisplay.pill ? (
                              <span
                                className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${
                                  lifecycleDisplay.tone === "refund"
                                    ? paymentTone(order.lifecycle?.paymentStatus)
                                    : lifecycleDisplay.tone === "cancelled"
                                      ? cancellationTone("cancelled")
                                      : cancellationTone(order.cancellation?.status)
                                }`}
                              >
                                {lifecycleDisplay.pill}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[#57636c]">{getOrderItemCount(order)} items</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {filteredItems.map((order) => {
                const href = `/account/orders/${encodeURIComponent(toStr(order.docId))}`;
                const image = getOrderImage(order);
                const lifecycleDisplay = getOrderLifecycleDisplay(order);
                return (
                  <button key={order.docId} type="button" onClick={() => router.push(href)} className="w-full rounded-[18px] border border-black/6 bg-white p-4 text-left shadow-[0_6px_18px_rgba(20,24,27,0.04)]">
                    <div className="flex items-start gap-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border border-black/6 bg-[#f8f8f8]">
                        {image ? <Image src={image} alt={getOrderPreviewLabel(order)} fill className="object-cover" sizes="64px" /> : <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[#907d4c]">Order</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-semibold text-[#202020]">{order.order?.orderNumber || order.docId || "Order"}</p>
                        <p className="mt-1 text-[13px] text-[#57636c]">{getOrderPreviewLabel(order)}</p>
                        <p className="mt-1 text-[13px] text-[#57636c]">{formatRelativeOrderDate(order.timestamps?.createdAt)}</p>
                        <p className="mt-1 text-[13px] text-[#57636c]">{getSellerCount(order)} seller{getSellerCount(order) === 1 ? "" : "s"} fulfilling</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${paymentTone(order.lifecycle?.paymentStatus)}`}>{sentenceStatus(order.lifecycle?.paymentStatus)}</span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${
                          lifecycleDisplay.tone === "refund"
                            ? paymentTone(order.lifecycle?.paymentStatus)
                            : lifecycleDisplay.tone === "cancelled"
                              ? cancellationTone("cancelled")
                              : fulfillmentTone(order.lifecycle?.fulfillmentStatus || order.lifecycle?.orderStatus)
                        }`}
                      >
                        {lifecycleDisplay.showBar ? `${lifecycleDisplay.progress}% fulfilment` : lifecycleDisplay.label}
                      </span>
                      {lifecycleDisplay.pill && lifecycleDisplay.tone === "requested" ? (
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${cancellationTone(order.cancellation?.status)}`}>{lifecycleDisplay.pill}</span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-[14px]">
                      <span className="text-[#57636c]">{getOrderItemCount(order)} items</span>
                      <span className="font-semibold text-[#202020]">{formatMoney(getFrozenOrderPayableIncl(order || {}))}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
