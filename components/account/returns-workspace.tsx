"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type ReturnRecord = {
  docId: string;
  return?: {
    orderId?: string;
    orderNumber?: string;
    status?: string;
    reason?: string;
    amountIncl?: number;
    ownerLabel?: string;
    createdAt?: string;
  };
  ownership?: {
    label?: string;
    sellerCode?: string;
    sellerSlug?: string;
    type?: string;
  };
  resolution?: {
    refundedAmountIncl?: number;
    refundedAt?: string;
    note?: string;
  };
  lines?: Array<{
    title?: string;
    variant?: string;
    quantity?: number;
  }>;
  timestamps?: {
    createdAt?: string;
    updatedAt?: string;
  };
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

function sentenceStatus(value?: string) {
  const normalized = toStr(value || "unknown").replace(/[_-]+/g, " ");
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function returnTone(status?: string) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "refunded" || normalized === "resolved") return "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]";
  if (normalized === "approved" || normalized === "under_review") return "border-[#fef3c7] bg-[#fff7ed] text-[#9a3412]";
  if (normalized === "rejected") return "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]";
  return "border-[#e5e7eb] bg-[#f9fafb] text-[#57636c]";
}

export function AccountReturnsWorkspace() {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReturnRecord[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/orders/returns/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load your returns.");
        if (!cancelled) setItems(Array.isArray(payload?.data) ? payload.data : []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your returns.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        Sign in to view your return requests.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#57636c]">
        <Link href="/account" className="font-semibold text-[#0f80c3]">My Account</Link>
        <span>/</span>
        <span className="text-[#202020]">Returns</span>
      </div>

      <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">Returns</h1>
        <p className="mt-2 text-[14px] text-[#57636c]">See all your submitted return requests and follow their status.</p>
      </section>

      {error ? <div className="rounded-[18px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[14px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[24px] border border-black/6 bg-white shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        {loading ? (
          <div className="px-6 py-10 text-[14px] text-[#57636c]">Loading your returns…</div>
        ) : items.length ? (
          <div className="divide-y divide-black/6">
            {items.map((item) => (
              <article key={item.docId} className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[18px] font-semibold text-[#202020]">{item.return?.orderNumber || item.return?.orderId || item.docId}</p>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${returnTone(item.return?.status)}`}>
                      {sentenceStatus(item.return?.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-[#57636c]">
                    Submitted {formatDateTime(item.timestamps?.createdAt || item.return?.createdAt)} • {item.ownership?.label || item.return?.ownerLabel || "Piessang"}
                  </p>
                  <div className="mt-3 space-y-2 text-[14px] text-[#57636c]">
                    <p>Reason: <span className="font-semibold text-[#202020]">{sentenceStatus(item.return?.reason)}</span></p>
                    <p>Requested amount: <span className="font-semibold text-[#202020]">{formatMoney(Number(item.return?.amountIncl || 0))}</span></p>
                    {item.resolution?.refundedAmountIncl ? (
                      <p>Refunded amount: <span className="font-semibold text-[#202020]">{formatMoney(Number(item.resolution.refundedAmountIncl || 0))}</span></p>
                    ) : null}
                    {item.resolution?.note ? <p>Latest note: <span className="text-[#202020]">{item.resolution.note}</span></p> : null}
                  </div>
                  {Array.isArray(item.lines) && item.lines.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.lines.map((line, index) => (
                        <span key={`${item.docId}-line-${index}`} className="inline-flex rounded-full border border-black/8 bg-[#fafafa] px-3 py-1 text-[12px] text-[#57636c]">
                          {toStr(line?.title || "Item")} {line?.quantity ? `x${line.quantity}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {item.return?.orderId ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/account/orders/${encodeURIComponent(toStr(item.return.orderId))}`}
                      className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                    >
                      View order
                    </Link>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-[14px] text-[#57636c]">You haven’t submitted any returns yet.</div>
        )}
      </section>
    </div>
  );
}
