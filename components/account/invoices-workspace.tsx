"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CustomerSellerInvoiceDrawer } from "@/components/account/customer-seller-invoice-drawer";
import { collectCustomerSellerInvoiceGroups, getCustomerBusinessDetails } from "@/lib/orders/customer-seller-invoices";

type InvoiceOrder = {
  docId?: string;
  order?: {
    orderNumber?: string;
  };
  timestamps?: {
    createdAt?: string;
  };
  totals?: {
    final_payable_incl?: number;
  };
  payment?: {
    paid_amount_incl?: number;
  };
  delivery_docs?: {
    invoice?: {
      url?: string;
    };
  };
  items?: any[];
  seller_slices?: any[];
  customer_snapshot?: any;
  delivery_snapshot?: any;
  delivery?: any;
  delivery_address?: any;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number) {
  return `R${Number(value || 0).toFixed(2)}`;
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

export function CustomerInvoicesWorkspace() {
  const { uid } = useAuth();
  const [items, setItems] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<InvoiceOrder | null>(null);
  const [customerBusiness, setCustomerBusiness] = useState({
    companyName: "",
    vatNumber: "",
    registrationNumber: "",
    businessType: "",
    phoneNumber: "",
  });

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/orders/customer/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load your invoices.");
        }
        const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
        if (!cancelled) {
          setItems(Array.isArray(data?.data) ? data.data : []);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your invoices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

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
        setCustomerBusiness(getCustomerBusinessDetails(payload?.data || {}, selectedOrder || {}));
      } catch {}
    }
    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [selectedOrder, uid]);

  async function handleSaveBusinessDetails(details: typeof customerBusiness) {
    const response = await fetch("/api/client/v1/accounts/account/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        data: {
          business: details,
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

  if (!uid) {
    return (
      <section className="rounded-[18px] border border-black/6 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">Invoices</h1>
        <p className="mt-3 text-[14px] text-[#57636c]">Sign in to view your order invoices.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <CustomerSellerInvoiceDrawer
        open={Boolean(selectedOrder)}
        orderId={toStr(selectedOrder?.docId)}
        orderNumber={toStr(selectedOrder?.order?.orderNumber || selectedOrder?.docId)}
        orderDate={formatDateTime(selectedOrder?.timestamps?.createdAt)}
        sellers={collectCustomerSellerInvoiceGroups(selectedOrder || {})}
        initialBusiness={customerBusiness}
        onClose={() => setSelectedOrder(null)}
        onSaveBusiness={handleSaveBusinessDetails}
      />

      <section className="rounded-[18px] border border-black/6 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">Invoices</h1>
        <p className="mt-3 max-w-[760px] text-[14px] leading-7 text-[#57636c]">
          Open an order to view and download seller-specific invoices, add business details, and keep those details saved for next time.
        </p>
      </section>

      <section className="rounded-[18px] border border-black/6 bg-white shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
        {error ? (
          <div className="border-b border-[#f0c7cb] bg-[#fff7f8] px-5 py-4 text-[13px] text-[#b91c1c]">{error}</div>
        ) : null}

        {loading ? (
          <div className="px-5 py-8 text-[14px] text-[#57636c]">Loading your invoices…</div>
        ) : !items.length ? (
          <div className="px-5 py-8 text-[14px] text-[#57636c]">You don’t have any orders with invoices yet.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[840px] w-full border-collapse">
                <thead>
                  <tr className="border-b border-black/6 text-left text-[13px] text-[#6b7280]">
                    <th className="px-5 py-4 font-semibold">Order</th>
                    <th className="px-5 py-4 font-semibold">Placed</th>
                    <th className="px-5 py-4 font-semibold">Total</th>
                    <th className="px-5 py-4 font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const orderId = toStr(item.docId);
                    const total = Number(item?.payment?.paid_amount_incl || item?.totals?.final_payable_incl || 0);
                    return (
                      <tr key={orderId} className="border-b border-black/6 last:border-b-0">
                        <td className="px-5 py-4 text-[15px] font-semibold text-[#202020]">{item?.order?.orderNumber || orderId}</td>
                        <td className="px-5 py-4 text-[14px] text-[#57636c]">{formatDateTime(item?.timestamps?.createdAt)}</td>
                        <td className="px-5 py-4 text-[15px] font-semibold text-[#202020]">{formatMoney(total)}</td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(item)}
                            className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-[#f6f7f8] px-4 text-[13px] font-semibold text-[#202020]"
                          >
                            View invoice
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {items.map((item) => {
                const orderId = toStr(item.docId);
                const total = Number(item?.payment?.paid_amount_incl || item?.totals?.final_payable_incl || 0);
                return (
                  <article key={orderId} className="rounded-[16px] border border-black/6 p-4">
                    <p className="text-[16px] font-semibold text-[#202020]">{item?.order?.orderNumber || orderId}</p>
                    <p className="mt-1 text-[13px] text-[#57636c]">{formatDateTime(item?.timestamps?.createdAt)}</p>
                    <p className="mt-3 text-[18px] font-semibold text-[#202020]">{formatMoney(total)}</p>
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(item)}
                      className="mt-4 inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-[#f6f7f8] px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      View invoice
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
