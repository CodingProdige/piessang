"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type OrderData = {
  docId?: string;
  invoice?: {
    invoiceId?: string;
    invoiceNumber?: string;
    status?: string;
    generatedAt?: string;
  };
  delivery_docs?: {
    invoice?: {
      url?: string;
      uploadedAt?: string;
      generatedAt?: string;
    };
  };
  order?: {
    orderNumber?: string;
  };
  lifecycle?: {
    orderStatus?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
  };
  delivery_progress?: {
    percentageDelivered?: number;
  };
  timestamps?: {
    createdAt?: string;
  };
  totals?: {
    final_payable_incl?: number;
    seller_delivery_fee_incl?: number;
    delivery_fee_incl?: number;
  };
  delivery_address?: {
    recipientName?: string;
    streetAddress?: string;
    addressLine2?: string;
    suburb?: string;
    city?: string;
    stateProvinceRegion?: string;
    postalCode?: string;
    country?: string;
    phoneNumber?: string;
  };
  items?: Array<{
    quantity?: number;
    product_snapshot?: {
      name?: string;
      media?: {
        images?: Array<{
          imageUrl?: string;
        }>;
      };
    };
    selected_variant_snapshot?: {
      label?: string;
    };
    line_totals?: {
      final_incl?: number;
    };
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value || 0));
}

function formatDate(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

function sentenceStatus(value?: string) {
  return String(value || "unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function progressBarTone(percent: number) {
  if (percent >= 100) return "bg-[#1f8f55]";
  if (percent >= 50) return "bg-[#e3c52f]";
  return "bg-[#202020]";
}

export default function AccountOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { uid } = useAuth();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedOrderId, setResolvedOrderId] = useState("");
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  useEffect(() => {
    let active = true;
    params.then((value) => {
      if (active) setResolvedOrderId(String(value?.orderId || ""));
    });
    return () => {
      active = false;
    };
  }, [params]);

  useEffect(() => {
    if (!uid || !resolvedOrderId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/orders/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, orderId: resolvedOrderId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load that order.");
        }
        if (!cancelled) {
          const data = payload?.data?.data || payload?.data || null;
          setOrder(data);
        }
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
  }, [resolvedOrderId, uid]);

  async function handleViewInvoice() {
    if (!uid || !resolvedOrderId || invoiceBusy) return;
    setInvoiceBusy(true);
    setError(null);
    try {
      let invoiceUrl = String(order?.delivery_docs?.invoice?.url || "").trim();

      if (!invoiceUrl) {
        const ensureResponse = await fetch("/api/client/v1/orders/create-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: resolvedOrderId, generatedBy: "customer_order_view" }),
        });
        const ensurePayload = await ensureResponse.json().catch(() => ({}));
        if (!ensureResponse.ok || ensurePayload?.ok === false) {
          throw new Error(ensurePayload?.message || "Unable to prepare the invoice.");
        }

        const docResponse = await fetch("/api/client/v1/orders/generate-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: resolvedOrderId,
            docType: "invoice",
            force: false,
          }),
        });
        const docPayload = await docResponse.json().catch(() => ({}));
        if (!docResponse.ok || docPayload?.ok === false) {
          throw new Error(docPayload?.message || "Unable to generate the invoice PDF.");
        }
        invoiceUrl = String(docPayload?.data?.url || docPayload?.url || "").trim();
      }

      if (!invoiceUrl) {
        throw new Error("Invoice document is not available yet.");
      }

      window.open(invoiceUrl, "_blank", "noopener,noreferrer");
      setOrder((current) =>
        current
          ? {
              ...current,
              delivery_docs: {
                ...(current.delivery_docs || {}),
                invoice: {
                  ...(current.delivery_docs?.invoice || {}),
                  url: invoiceUrl,
                },
              },
            }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open the invoice.");
    } finally {
      setInvoiceBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10">
      <section className="rounded-[10px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Your order</p>
            <h1 className="mt-2 text-[30px] font-semibold text-[#202020]">
              {order?.order?.orderNumber || resolvedOrderId || "Order"}
            </h1>
            <p className="mt-2 text-[14px] leading-7 text-[#57636c]">
              Placed on {formatDate(order?.timestamps?.createdAt)}
            </p>
          </div>
          <Link href="/account/orders" className="text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2">
            Back to orders
          </Link>
        </div>

        {loading ? <p className="mt-6 text-[14px] text-[#57636c]">Loading your order...</p> : null}
        {error ? <p className="mt-6 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</p> : null}

        {!loading && !error && order ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-[10px] border border-black/5 px-5 py-5">
                <p className="text-[16px] font-semibold text-[#202020]">Items</p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[13px] text-[#57636c]">
                    <span>Delivery progress</span>
                    <span className="font-semibold text-[#202020]">{Number(order?.delivery_progress?.percentageDelivered || 0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eceff3]">
                    <div
                      className={`h-full rounded-full transition-all ${progressBarTone(Number(order?.delivery_progress?.percentageDelivered || 0))}`}
                      style={{ width: `${Math.max(0, Math.min(100, Number(order?.delivery_progress?.percentageDelivered || 0)))}%` }}
                    />
                  </div>
                </div>
                {Array.isArray(order.items) && order.items.length ? (
                  <div className="mt-4">
                    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Products in this order</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {order.items.map((item, index) => (
                        <div
                          key={`scroll-${item?.product_snapshot?.name || "item"}-${index}`}
                          className="relative min-w-[110px] overflow-hidden rounded-[12px] border border-black/5 bg-[#faf8f2]"
                        >
                          {String(item?.product_snapshot?.media?.images?.[0]?.imageUrl || "").trim() ? (
                            <img
                              src={String(item?.product_snapshot?.media?.images?.[0]?.imageUrl || "").trim()}
                              alt={item?.product_snapshot?.name || "Product"}
                              className="h-[110px] w-[110px] object-cover"
                            />
                          ) : (
                            <div className="flex h-[110px] w-[110px] items-center justify-center bg-[linear-gradient(135deg,#f6ecd0,#f1f3f6)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
                              Product
                            </div>
                          )}
                          <span className="absolute bottom-2 right-2 inline-flex min-w-[30px] items-center justify-center rounded-full bg-[#202020] px-2 py-1 text-[11px] font-semibold text-white shadow-[0_6px_16px_rgba(20,24,27,0.2)]">
                            {Number(item?.quantity || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 space-y-3">
                  {(Array.isArray(order.items) ? order.items : []).map((item, index) => (
                    <div key={`${item?.product_snapshot?.name || "item"}-${index}`} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold text-[#202020]">{item?.product_snapshot?.name || "Product"}</p>
                        <p className="mt-1 text-[12px] text-[#57636c]">
                          {item?.selected_variant_snapshot?.label || "Default option"} • Qty {Number(item?.quantity || 0)}
                        </p>
                      </div>
                      <p className="text-[14px] font-semibold text-[#202020]">{formatCurrency(Number(item?.line_totals?.final_incl || 0))}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[10px] border border-black/5 px-5 py-5">
                <p className="text-[16px] font-semibold text-[#202020]">Order status</p>
                <div className="mt-4 space-y-2 text-[14px] text-[#57636c]">
                  <p>Order: <span className="font-semibold text-[#202020]">{sentenceStatus(order?.lifecycle?.orderStatus)}</span></p>
                  <p>Payment: <span className="font-semibold text-[#202020]">{sentenceStatus(order?.lifecycle?.paymentStatus)}</span></p>
                  <p>Fulfilment: <span className="font-semibold text-[#202020]">{sentenceStatus(order?.lifecycle?.fulfillmentStatus)}</span></p>
                </div>
              </div>

              <div className="rounded-[10px] border border-black/5 px-5 py-5">
                <p className="text-[16px] font-semibold text-[#202020]">Delivery details</p>
                <div className="mt-4 text-[14px] leading-7 text-[#57636c]">
                  <p className="font-semibold text-[#202020]">{order?.delivery_address?.recipientName || "Recipient"}</p>
                  <p>{[
                    order?.delivery_address?.streetAddress,
                    order?.delivery_address?.addressLine2,
                    order?.delivery_address?.suburb,
                    order?.delivery_address?.city,
                    order?.delivery_address?.stateProvinceRegion,
                    order?.delivery_address?.postalCode,
                    order?.delivery_address?.country,
                  ].filter(Boolean).join(", ")}</p>
                  {order?.delivery_address?.phoneNumber ? <p className="mt-1">{order.delivery_address.phoneNumber}</p> : null}
                </div>
              </div>

              <div className="rounded-[10px] border border-black/5 px-5 py-5">
                <p className="text-[16px] font-semibold text-[#202020]">Payment summary</p>
                <div className="mt-4 space-y-2 text-[14px] text-[#57636c]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Invoice</span>
                    <span className="font-semibold text-[#202020]">{order?.invoice?.invoiceNumber || "Pending"}</span>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => void handleViewInvoice()}
                      disabled={invoiceBusy}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                    >
                      {invoiceBusy ? "Preparing invoice..." : "View invoice"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Total paid</span>
                    <span className="font-semibold text-[#202020]">{formatCurrency(Number(order?.totals?.final_payable_incl || 0))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Seller delivery</span>
                    <span className="font-semibold text-[#202020]">{formatCurrency(Number(order?.totals?.seller_delivery_fee_incl || 0))}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
