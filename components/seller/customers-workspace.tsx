"use client";

import { useEffect, useState } from "react";
import { formatMoneyExact } from "@/lib/money";

type SellerCustomer = {
  customer_key?: string;
  customer_id?: string | null;
  name?: string;
  email?: string | null;
  orders?: number;
  total_spent_incl?: number;
  last_order_at?: string | null;
  recent_order_number?: string | null;
  recent_status?: string | null;
};

type CustomersWorkspaceProps = {
  vendorName: string;
};

export function SellerCustomersWorkspace({ vendorName }: CustomersWorkspaceProps) {
  const [customers, setCustomers] = useState<SellerCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (vendorName.trim()) params.set("vendorName", vendorName.trim());
        const response = await fetch(`/api/client/v1/seller/customers?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          setCustomers(Array.isArray(payload?.data?.customers) ? payload.data.customers : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [vendorName]);

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="border-b border-black/5 px-4 py-4">
          <p className="mt-2 max-w-[760px] text-[13px] leading-[1.6] text-[#57636c]">
            This shows the customers who have purchased products from your vendor account, so you can track repeat
            buyers and follow-up opportunities.
          </p>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-[13px] text-[#57636c]">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[14px] font-semibold text-[#202020]">No customers yet</p>
            <p className="mt-2 text-[13px] text-[#57636c]">
              Customer records will appear here once orders are placed for your products.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="bg-[#fafafa]">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-[#7d7d7d]">
                  <th className="border-b border-black/5 px-4 py-3 font-semibold">Customer</th>
                  <th className="border-b border-black/5 px-4 py-3 font-semibold">Orders</th>
                  <th className="border-b border-black/5 px-4 py-3 font-semibold">Spent</th>
                  <th className="border-b border-black/5 px-4 py-3 font-semibold">Last order</th>
                  <th className="border-b border-black/5 px-4 py-3 font-semibold">Recent status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.customer_key || customer.email || customer.name} className="text-[13px] text-[#202020]">
                    <td className="border-b border-black/5 px-4 py-3">
                      <p className="font-semibold">{customer.name || "Unknown customer"}</p>
                      <p className="mt-0.5 text-[11px] text-[#7d7d7d]">{customer.email || customer.customer_id || "No contact details"}</p>
                    </td>
                    <td className="border-b border-black/5 px-4 py-3 text-[#57636c]">{customer.orders || 0}</td>
                    <td className="border-b border-black/5 px-4 py-3 text-[#57636c]">
                      {formatMoneyExact(Number(customer.total_spent_incl) || 0)}
                    </td>
                    <td className="border-b border-black/5 px-4 py-3 text-[#57636c]">
                      {customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="border-b border-black/5 px-4 py-3">
                      <span className="inline-flex rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#8f7531]">
                        {customer.recent_status || "completed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
