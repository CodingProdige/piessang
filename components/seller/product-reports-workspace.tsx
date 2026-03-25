"use client";

import { useEffect, useMemo, useState } from "react";

type ProductReportItem = {
  id: string;
  status: string;
  reasonCode: string;
  reasonLabel: string;
  reportMessage: string;
  product: {
    id: string;
    title: string;
    sellerSlug: string;
    sellerCode: string;
    vendorName: string;
  };
  reporter: {
    uid: string;
    name: string;
    email: string;
  };
  dispute: {
    status: string;
    message: string;
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function SellerProductReportsWorkspace({ onQueueChanged }: { onQueueChanged?: () => void }) {
  const [items, setItems] = useState<ProductReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "blocked" | "disputed" | "all">("pending");
  const [blockTarget, setBlockTarget] = useState<ProductReportItem | null>(null);
  const [blockNote, setBlockNote] = useState("");

  async function loadItems(nextFilter = filter) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/client/v1/admin/product-reports?status=${encodeURIComponent(nextFilter)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load product reports.");
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load product reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function runAction(item: ProductReportItem, action: "dismiss" | "block" | "restore", note = "") {
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/admin/product-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: item.id, action, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update report.");
      setMessage(payload?.message || "Product report updated.");
      setBlockTarget(null);
      setBlockNote("");
      await loadItems(filter);
      onQueueChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update report.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const next = { pending: 0, blocked: 0, disputed: 0, all: items.length };
    for (const item of items) {
      const status = toStr(item.status).toLowerCase();
      if (status === "pending") next.pending += 1;
      if (status === "blocked") next.blocked += 1;
      if (status === "disputed") next.disputed += 1;
    }
    return next;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        Review customer product reports, block listings when required, and resolve seller disputes from one queue.
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "pending", label: "Pending" },
          { key: "blocked", label: "Blocked" },
          { key: "disputed", label: "Disputed" },
          { key: "all", label: "All" },
        ].map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key as typeof filter)}
              className={
                active
                  ? "rounded-full bg-[rgba(203,178,107,0.16)] px-4 py-2 text-[12px] font-semibold text-[#6b5a2d]"
                  : "rounded-full bg-[#f4f1e8] px-4 py-2 text-[12px] font-semibold text-[#57636c]"
              }
            >
              {tab.label} {tab.key === "pending" ? counts.pending : tab.key === "blocked" ? counts.blocked : tab.key === "disputed" ? counts.disputed : items.length}
            </button>
          );
        })}
      </div>

      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      {loading ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] text-[13px] text-[#57636c]">Loading product reports...</div>
      ) : items.length === 0 ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] text-[13px] text-[#57636c]">No product reports in this queue.</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const isBusy = busyId === item.id;
            return (
              <section key={item.id} className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#907d4c]">{item.status}</span>
                      <span className="rounded-full bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#57636c]">{item.reasonLabel || "Other issue"}</span>
                    </div>
                    <h3 className="text-[20px] font-semibold text-[#202020]">{item.product.title || "Untitled product"}</h3>
                    <p className="text-[13px] text-[#57636c]">{item.product.vendorName} • {item.product.sellerSlug || item.product.sellerCode}</p>
                    <p className="text-[13px] leading-[1.6] text-[#202020]">{item.reportMessage || "No additional details were submitted."}</p>
                    <p className="text-[12px] text-[#8b94a3]">
                      Reported by {item.reporter.name || item.reporter.email || item.reporter.uid || "Anonymous"} on {item.createdAt ? new Date(item.createdAt).toLocaleString() : "unknown date"}
                    </p>
                    {item.dispute?.message ? (
                      <div className="rounded-[8px] border border-[#cbb26b]/30 bg-[#fbf7ea] px-3 py-2 text-[12px] leading-[1.6] text-[#6b5a2d]">
                        <p className="font-semibold uppercase tracking-[0.08em]">Seller dispute</p>
                        <p className="mt-1">{item.dispute.message}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {item.status !== "blocked" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBlockTarget(item);
                          setBlockNote(item.reportMessage || "");
                        }}
                        disabled={isBusy}
                        className="inline-flex h-10 items-center rounded-[8px] border border-[#f0c7cb] px-4 text-[13px] font-semibold text-[#b91c1c] disabled:opacity-50"
                      >
                        Block product
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runAction(item, "restore", "Product restored after admin review.")}
                        disabled={isBusy}
                        className="inline-flex h-10 items-center rounded-[8px] border border-[#cfe8d8] px-4 text-[13px] font-semibold text-[#166534] disabled:opacity-50"
                      >
                        Restore product
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void runAction(item, "dismiss", "Report dismissed after admin review.")}
                      disabled={isBusy}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {blockTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4">
          <div className="w-full max-w-[560px] rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Block product</p>
                <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">{blockTarget.product.title}</h3>
              </div>
              <button type="button" onClick={() => setBlockTarget(null)} className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]">
                Close
              </button>
            </div>
            <label className="mt-5 block">
              <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Reason to send to the seller</span>
              <textarea
                value={blockNote}
                onChange={(event) => setBlockNote(event.target.value)}
                rows={5}
                className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                placeholder="Explain why the product is being blocked and what the seller should fix."
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setBlockTarget(null)} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runAction(blockTarget, "block", blockNote)}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
              >
                Confirm block
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
