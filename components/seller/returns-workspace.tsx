"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyExact } from "@/lib/money";

type ReturnLine = {
  lineKey: string;
  productTitle: string;
  variantLabel: string;
  quantity: number;
  amountIncl: number;
};

type ReturnCase = {
  docId: string;
  return: {
    returnId: string;
    orderId: string;
    orderNumber: string;
    status: string;
    reason: string;
    message: string;
    ownerType: string;
    ownerLabel: string;
    amountIncl: number;
  };
  ownership: {
    type: string;
    label: string;
    responsibility: string;
    sellerSlug: string;
    sellerCode: string;
  };
  lines: ReturnLine[];
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatCurrency(value: number) {
  return formatCurrencyExact(Number(value || 0), "ZAR");
}

function formatDate(value: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export function SellerReturnsWorkspace({
  sellerSlug,
  sellerCode,
  adminMode = false,
}: {
  sellerSlug?: string;
  sellerCode?: string;
  adminMode?: boolean;
}) {
  const [items, setItems] = useState<ReturnCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<"requested" | "under_review" | "approved" | "resolved" | "all">("requested");
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  async function loadReturns(status = activeStatus) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/returns/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: status === "all" ? undefined : status,
          ...(adminMode ? {} : { sellerSlug, sellerCode }),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load return requests.");
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      setItems(rows);
      setNoteById((current) => {
        const next = { ...current };
        for (const item of rows) {
          if (!(item.docId in next)) next[item.docId] = "";
        }
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load return requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReturns(activeStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, sellerSlug, sellerCode, adminMode]);

  async function runAction(item: ReturnCase, action: "under_review" | "approve" | "reject" | "refund" | "resolve") {
    setBusyId(item.docId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/orders/returns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnId: item.docId,
          action,
          note: noteById[item.docId] || "",
          amount: item?.return?.amountIncl,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update return request.");
      setMessage(payload?.data?.message || payload?.message || "Return request updated.");
      await loadReturns(activeStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update return request.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const status = toStr(item?.return?.status).toLowerCase();
        if (status in acc) acc[status as keyof typeof acc] += 1;
        acc.all += 1;
        return acc;
      },
      { requested: 0, under_review: 0, approved: 0, resolved: 0, all: 0 },
    );
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        {adminMode
          ? "Review marketplace return requests, approve or reject them, and only process refunds once a case has been approved."
          : "Review the return requests assigned to you, update their status, and keep the customer informed with clear next steps."}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "requested", label: "Requested" },
          { key: "under_review", label: "Under review" },
          { key: "approved", label: "Approved" },
          { key: "resolved", label: "Resolved" },
          { key: "all", label: "All" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveStatus(tab.key as typeof activeStatus)}
            className={
              activeStatus === tab.key
                ? "rounded-full bg-[rgba(203,178,107,0.16)] px-4 py-2 text-[12px] font-semibold text-[#6b5a2d]"
                : "rounded-full bg-[#f4f1e8] px-4 py-2 text-[12px] font-semibold text-[#57636c]"
            }
          >
            {tab.label} {counts[tab.key as keyof typeof counts]}
          </button>
        ))}
      </div>

      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      {loading ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] text-[13px] text-[#57636c]">Loading return requests...</div>
      ) : items.length === 0 ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)] text-[13px] text-[#57636c]">No return requests in this queue.</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const status = toStr(item?.return?.status).toLowerCase();
            const isBusy = busyId === item.docId;
            return (
              <section key={item.docId} className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#907d4c]">{status.replace(/_/g, " ")}</span>
                      <span className="rounded-full bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#57636c]">{item.return.ownerLabel}</span>
                      <span className="rounded-full bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#57636c]">Order {item.return.orderNumber || item.return.orderId}</span>
                    </div>
                    <h3 className="text-[20px] font-semibold text-[#202020]">{item.return.reason || "Return request"}</h3>
                    <p className="text-[13px] leading-[1.6] text-[#202020]">{item.return.message || "No additional details were submitted."}</p>
                    <p className="text-[12px] text-[#8b94a3]">
                      Requested {formatDate(item.timestamps?.createdAt)} • {item.ownership?.responsibility || "Return responsibility has been assigned from the fulfilment method."}
                    </p>
                    <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-3 text-[12px] text-[#202020]">
                      <p className="font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Items on this request</p>
                      <div className="mt-2 space-y-1.5">
                        {item.lines.map((line) => (
                          <div key={line.lineKey} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {line.productTitle}
                              {line.variantLabel ? ` • ${line.variantLabel}` : ""} x {line.quantity}
                            </span>
                            <span className="font-semibold text-[#202020]">{formatCurrency(line.amountIncl)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-[340px] space-y-3">
                    <div className="rounded-[8px] border border-black/5 bg-[#fcfcfc] px-3 py-3 text-[12px] text-[#57636c]">
                      <p className="font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Case summary</p>
                      <p className="mt-2">Responsible party: <span className="font-semibold text-[#202020]">{item.return.ownerLabel}</span></p>
                      <p className="mt-1">Return value: <span className="font-semibold text-[#202020]">{formatCurrency(item.return.amountIncl)}</span></p>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Note</span>
                      <textarea
                        value={noteById[item.docId] || ""}
                        onChange={(event) => setNoteById((current) => ({ ...current, [item.docId]: event.target.value }))}
                        rows={4}
                        className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                        placeholder="Add the decision, instructions, or resolution note for the customer."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {status === "requested" ? (
                        <button
                          type="button"
                          onClick={() => void runAction(item, "under_review")}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                        >
                          Start review
                        </button>
                      ) : null}
                      {(status === "requested" || status === "under_review") ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void runAction(item, "approve")}
                            disabled={isBusy}
                            className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void runAction(item, "reject")}
                            disabled={isBusy}
                            className="inline-flex h-10 items-center rounded-[8px] border border-[#f0c7cb] px-4 text-[13px] font-semibold text-[#b91c1c] disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {adminMode && status === "approved" ? (
                        <button
                          type="button"
                          onClick={() => void runAction(item, "refund")}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center rounded-[8px] bg-[#1f8f55] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                        >
                          Refund
                        </button>
                      ) : null}
                      {status === "approved" || status === "refunded" ? (
                        <button
                          type="button"
                          onClick={() => void runAction(item, "resolve")}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                        >
                          Mark resolved
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
