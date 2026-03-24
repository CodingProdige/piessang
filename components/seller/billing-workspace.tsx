// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  return `R${amount.toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string | null | undefined) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "settled" || value === "paid") return "bg-[rgba(57,169,107,0.1)] text-[#166534] border-[#cfe8d8]";
  if (value === "overdue") return "bg-[#fff7f8] text-[#b91c1c] border-[#f2c7cb]";
  return "bg-[rgba(203,178,107,0.12)] text-[#8f7531] border-[#eadfb8]";
}

export function SellerBillingWorkspace({
  sellerSlug,
  sellerCode,
  vendorName,
}: {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (sellerSlug) params.set("sellerSlug", sellerSlug);
        if (sellerCode) params.set("sellerCode", sellerCode);
        if (vendorName) params.set("vendorName", vendorName);
        params.set("months", "6");

        const response = await fetch(`/api/client/v1/accounts/seller/billing/get?${params.toString()}`, { cache: "no-store" });
        const next = await response.json().catch(() => ({}));
        if (!response.ok || next?.ok === false) {
          throw new Error(next?.message || "Unable to load seller billing.");
        }
        if (!cancelled) setPayload(next?.data || null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load seller billing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sellerCode, sellerSlug, vendorName]);

  const current = payload?.current || null;
  const cycles = Array.isArray(payload?.cycles) ? payload.cycles : [];
  const guide = payload?.guide || {};

  const cards = useMemo(
    () => [
      {
        label: "Amount due",
        value: formatMoney(current?.totals?.amountDueIncl || 0),
        detail: current?.status === "overdue" ? "Overdue and requires settlement." : "Current warehouse charges due.",
      },
      {
        label: "Fulfilment fees",
        value: formatMoney(current?.totals?.fulfilmentFeeIncl || 0),
        detail: "Charged on Piessang-fulfilled orders using the VAT-exclusive fulfilment fee matrix.",
      },
      {
        label: "Storage fees",
        value: formatMoney(current?.totals?.storageFeeIncl || 0),
        detail: "Charged when stock cover stays above the storage threshold. VAT exclusive.",
      },
      {
        label: "Success fees",
        value: formatMoney(current?.totals?.successFeeIncl || 0),
        detail: "Shown for reporting and marketplace charge visibility.",
      },
    ],
    [current],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Seller billing</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          This workspace shows the monthly seller billing summary, what is currently due to Piessang, and the fee guide for
          how warehouse and marketplace charges are being tracked.
        </p>
      </section>

      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="grid gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{card.label}</p>
            <p className="mt-2 text-[22px] font-semibold text-[#202020]">{loading ? "..." : card.value}</p>
            <p className="mt-2 text-[12px] leading-[1.6] text-[#57636c]">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#202020]">Current billing cycle</p>
              <p className="mt-1 text-[12px] text-[#57636c]">
                {loading ? "Loading..." : current?.billingMonthLabel || "No billing period available"}
              </p>
            </div>
            {current ? (
              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(current?.status)}`}>
                {String(current?.status || "due").replace(/_/g, " ")}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Issued</p>
              <p className="mt-1 text-[14px] font-semibold text-[#202020]">{formatDateTime(current?.issuedAt)}</p>
            </div>
            <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Due by</p>
              <p className="mt-1 text-[14px] font-semibold text-[#202020]">{formatDateTime(current?.dueDate)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[8px] border border-[#eadfb8] bg-[rgba(203,178,107,0.08)] px-4 py-3 text-[12px] leading-[1.6] text-[#725c21]">
            Billing payment modal and seller self-settlement flow are the next layer to wire in here. The monthly charge summary is now ready for that payment step.
          </div>
        </article>

        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] font-semibold text-[#202020]">Fee guide</p>
          <div className="mt-3 space-y-3 text-[12px] leading-[1.7] text-[#57636c]">
            <p><span className="font-semibold text-[#202020]">Success fee:</span> {guide?.successFee || "Charged on order creation using the current category fee."}</p>
            <p><span className="font-semibold text-[#202020]">Fulfilment fee:</span> {guide?.handlingFee || "Charged when Piessang fulfils the order."}</p>
            <p><span className="font-semibold text-[#202020]">Storage fee:</span> {guide?.storageFee || "Charged when Piessang-held stock exceeds the storage threshold."}</p>
            <p><span className="font-semibold text-[#202020]">Invoice rule:</span> {guide?.invoiceRule || "Warehouse charges form the seller bill, while success fees remain visible for reporting."}</p>
          </div>
        </article>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="grid grid-cols-[1fr_.8fr_.8fr_.8fr_.8fr] gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
          <div>Month</div>
          <div>Amount due</div>
          <div>Fulfilment</div>
          <div>Storage</div>
          <div>Status</div>
        </div>

        <div className="divide-y divide-black/5">
          {loading ? (
            <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading billing cycles...</div>
          ) : cycles.length ? (
            cycles.map((cycle: any) => (
              <div key={cycle.monthKey} className="grid grid-cols-[1fr_.8fr_.8fr_.8fr_.8fr] items-center gap-3 px-4 py-3 text-[13px]">
                <div>
                  <p className="font-semibold text-[#202020]">{cycle.billingMonthLabel}</p>
                  <p className="mt-0.5 text-[11px] text-[#7d7d7d]">{cycle.invoice?.invoiceNumber || cycle.monthKey}</p>
                </div>
                <div className="font-semibold text-[#202020]">{formatMoney(cycle?.totals?.amountDueIncl || 0)}</div>
                <div className="text-[#57636c]">{formatMoney(cycle?.totals?.fulfilmentFeeIncl || 0)}</div>
                <div className="text-[#57636c]">{formatMoney(cycle?.totals?.storageFeeIncl || 0)}</div>
                <div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(cycle?.status)}`}>
                    {String(cycle?.status || "due").replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-[13px] text-[#57636c]">No billing cycles found yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
