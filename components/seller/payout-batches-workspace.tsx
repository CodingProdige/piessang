"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { formatCurrencyExact } from "@/lib/money";

type PayoutBatch = {
  batchId: string;
  provider: string;
  status: string;
  currency: string;
  grossIncl: number;
  netDueIncl: number;
  settlementIds: string[];
  settlementCount: number;
  providerBatchReference: string;
  providerResponse: any;
  blockingReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  seller: {
    sellerUid: string;
    sellerCode: string;
    sellerSlug: string;
    vendorName: string;
  };
  bankProfile: {
    ready: boolean;
    payoutMethod: string;
    verificationStatus: string;
    bankName: string;
    bankCountry: string;
    accountHolderName: string;
    currency: string;
    accountLast4: string;
    ibanLast4: string;
    stripeRecipientAccountId: string;
    wiseRecipientId: string;
  };
};

type BatchCounts = {
  total: number;
  pendingSubmission: number;
  awaitingProviderConfig: number;
  awaitingManualPayout: number;
  submissionFailed: number;
  submitted: number;
  paid: number;
  netDueIncl: number;
};

type FilterKey =
  | "all"
  | "pending_submission"
  | "awaiting_provider_config"
  | "awaiting_manual_payout"
  | "submission_failed"
  | "submitted"
  | "paid";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number, currency = "ZAR") {
  return formatCurrencyExact(Number.isFinite(value) ? value : 0, currency || "ZAR");
}

function formatDateTime(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Not available";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string) {
  switch (toStr(status).toLowerCase()) {
    case "paid":
      return "bg-[rgba(57,169,107,0.12)] text-[#166534]";
    case "submitted":
      return "bg-[rgba(99,102,241,0.12)] text-[#4338ca]";
    case "pending_submission":
      return "bg-[rgba(203,178,107,0.14)] text-[#8f7531]";
    case "awaiting_provider_config":
    case "awaiting_manual_payout":
    case "submission_failed":
      return "bg-[rgba(220,38,38,0.10)] text-[#b91c1c]";
    default:
      return "bg-[rgba(148,163,184,0.14)] text-[#475569]";
  }
}

function statusLabel(status: string) {
  return toStr(status || "pending_submission").replace(/_/g, " ");
}

function buildBankLabel(batch: PayoutBatch) {
  const name = toStr(batch.bankProfile.bankName);
  const country = toStr(batch.bankProfile.bankCountry);
  const tail = toStr(batch.bankProfile.accountLast4 || batch.bankProfile.ibanLast4);
  return [name, country, tail ? `•••• ${tail}` : ""].filter(Boolean).join(" • ");
}

function buildInlineStatusDetail(batch: PayoutBatch) {
  const reason = toStr(batch.blockingReason);
  if (reason) return reason;
  if (toStr(batch.status).toLowerCase() === "submitted" && toStr(batch.providerBatchReference)) {
    return `Provider reference: ${toStr(batch.providerBatchReference)}`;
  }
  return "";
}

export function SellerPayoutBatchesWorkspace() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [counts, setCounts] = useState<BatchCounts>({
    total: 0,
    pendingSubmission: 0,
    awaitingProviderConfig: 0,
    awaitingManualPayout: 0,
    submissionFailed: 0,
    submitted: 0,
    paid: 0,
    netDueIncl: 0,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  function showMessage(next: string) {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setMessage(next);
    timeoutRef.current = window.setTimeout(() => setMessage(null), 2400);
    window.dispatchEvent(new Event("piessang:refresh-admin-badges"));
  }

  async function loadBatches() {
    if (!profile?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ uid: profile.uid, status: "all" });
      const response = await fetch(`/api/client/v1/orders/settlement/payout-batches/list?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load payout batches.");
      setBatches(Array.isArray(payload?.data?.batches) ? payload.data.batches : []);
      setCounts(payload?.data?.counts || {
        total: 0,
        pendingSubmission: 0,
        awaitingProviderConfig: 0,
        awaitingManualPayout: 0,
        submissionFailed: 0,
        submitted: 0,
        paid: 0,
        netDueIncl: 0,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load payout batches.");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBatches();
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [profile?.uid]);

  const filteredBatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return batches.filter((batch) => {
      if (filter !== "all" && toStr(batch.status).toLowerCase() !== filter) return false;
      if (!needle) return true;
      const stack = [
        batch.batchId,
        batch.seller.vendorName,
        batch.seller.sellerCode,
        batch.seller.sellerSlug,
        batch.provider,
        batch.providerBatchReference,
        batch.bankProfile.bankName,
        batch.bankProfile.bankCountry,
      ]
        .join(" ")
        .toLowerCase();
      return stack.includes(needle);
    });
  }, [batches, filter, query]);

  async function runBatchPreparation() {
    if (!profile?.uid) return;
    setBusyAction("prepare");
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/settlement/payout-batches/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: profile.uid }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to prepare payout batches.");
      showMessage("Eligible settlements were grouped into payout batches.");
      await loadBatches();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare payout batches.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitPendingBatches() {
    if (!profile?.uid) return;
    setBusyAction("submit");
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/settlement/payout-batches/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: profile.uid }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to submit payout batches.");
      showMessage("Pending payout batches were sent to the payout provider.");
      await loadBatches();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit payout batches.");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateBatch(batchId: string, action: "mark_paid" | "mark_failed" | "queue_retry") {
    if (!profile?.uid) return;
    setBusyAction(`${action}:${batchId}`);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/settlement/payout-batches/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: profile.uid, data: { batchId, action } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update payout batch.");
      showMessage(action === "mark_paid" ? "Payout batch marked as paid." : action === "mark_failed" ? "Payout batch marked as failed." : "Payout batch queued for retry.");
      await loadBatches();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update payout batch.");
    } finally {
      setBusyAction(null);
    }
  }

  const cards = [
    { label: "Queued", value: counts.pendingSubmission, detail: "Ready to be submitted to the payout provider." },
    { label: "Needs attention", value: counts.awaitingProviderConfig + counts.awaitingManualPayout + counts.submissionFailed, detail: "Batches blocked by config, unsupported routing, or failed submission." },
    { label: "Submitted", value: counts.submitted, detail: "Already sent and waiting for payout confirmation." },
    { label: "Net due", value: formatMoney(counts.netDueIncl || 0), detail: "Total seller money currently represented by these payout batches." },
  ];

  return (
    <section className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Admin payout queue</p>
            <h2 className="mt-1 text-[22px] font-semibold text-[#202020]">Review and move seller payout batches forward</h2>
            <p className="mt-1 max-w-[860px] text-[13px] leading-[1.6] text-[#57636c]">
              Prepare eligible seller settlements into payout batches, submit them to the payout provider, and resolve any seller profiles that still need payout setup before money can be released.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runBatchPreparation()}
              disabled={busyAction === "prepare"}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "prepare" ? "Preparing..." : "Prepare payout batches"}
            </button>
            <button
              type="button"
              onClick={() => void submitPendingBatches()}
              disabled={busyAction === "submit"}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "submit" ? "Submitting..." : "Submit pending batches"}
            </button>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-4 py-3 text-[13px] text-[#166534]">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">{error}</div>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{card.label}</p>
            <p className="mt-2 text-[22px] font-semibold text-[#202020]">{loading ? "..." : card.value}</p>
            <p className="mt-2 text-[12px] leading-[1.6] text-[#57636c]">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "pending_submission", "awaiting_provider_config", "awaiting_manual_payout", "submission_failed", "submitted", "paid"] as FilterKey[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`inline-flex h-9 items-center rounded-full px-3 text-[12px] font-semibold ${
                  filter === item ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#4a4545]"
                }`}
              >
                {item === "all" ? "All" : statusLabel(item)}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by batch, seller, bank, or provider ref"
            className="h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] outline-none lg:max-w-[360px]"
          />
        </div>
      </section>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-[8px] border border-black/5 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">Loading payout batches...</div>
        ) : filteredBatches.length ? (
          filteredBatches.map((batch) => {
            const bankLabel = buildBankLabel(batch);
            const providerMessage = toStr(batch.providerResponse?.message || batch.providerResponse?.payload?.error?.message || "");
            const inlineStatusDetail = buildInlineStatusDetail(batch);
            return (
              <article key={batch.batchId} className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-[#202020]">{batch.seller.vendorName || batch.seller.sellerSlug || batch.seller.sellerCode || "Seller payout batch"}</p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(batch.status)}`}>
                        {statusLabel(batch.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#57636c]">Batch {batch.batchId} • {batch.settlementCount} settlement{batch.settlementCount === 1 ? "" : "s"} • {batch.provider.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-[12px] text-[#57636c]">{bankLabel || "Bank details still need to be confirmed."}</p>
                    {inlineStatusDetail ? <p className="mt-2 text-[12px] text-[#7a5d15]">{inlineStatusDetail}</p> : null}
                    {providerMessage ? <p className="mt-2 text-[12px] text-[#b91c1c]">{providerMessage}</p> : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
                    <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Net payout</p>
                      <p className="mt-1 text-[18px] font-semibold text-[#202020]">{formatMoney(batch.netDueIncl, batch.currency)}</p>
                    </div>
                    <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Updated</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#202020]">{formatDateTime(batch.updatedAt || batch.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {batch.status !== "paid" ? (
                    <button
                      type="button"
                      onClick={() => void updateBatch(batch.batchId, "mark_paid")}
                      disabled={busyAction === `mark_paid:${batch.batchId}`}
                      className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyAction === `mark_paid:${batch.batchId}` ? "Saving..." : "Mark as paid"}
                    </button>
                  ) : null}
                  {["submission_failed", "awaiting_provider_config", "awaiting_manual_payout"].includes(toStr(batch.status).toLowerCase()) ? (
                    <button
                      type="button"
                      onClick={() => void updateBatch(batch.batchId, "queue_retry")}
                      disabled={busyAction === `queue_retry:${batch.batchId}`}
                      className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyAction === `queue_retry:${batch.batchId}` ? "Queuing..." : "Queue retry"}
                    </button>
                  ) : null}
                  {!["paid", "submission_failed"].includes(toStr(batch.status).toLowerCase()) ? (
                    <button
                      type="button"
                      onClick={() => void updateBatch(batch.batchId, "mark_failed")}
                      disabled={busyAction === `mark_failed:${batch.batchId}`}
                      className="inline-flex h-9 items-center rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyAction === `mark_failed:${batch.batchId}` ? "Saving..." : "Mark as failed"}
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
                  <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] leading-[1.7] text-[#57636c]">
                    <p><span className="font-semibold text-[#202020]">Seller code:</span> {batch.seller.sellerCode || "Not available"}</p>
                    <p><span className="font-semibold text-[#202020]">Wise recipient:</span> {batch.bankProfile.wiseRecipientId || "Setup not completed yet"}</p>
                    <p><span className="font-semibold text-[#202020]">Verification:</span> {statusLabel(batch.bankProfile.verificationStatus || "not_submitted")}</p>
                    <p><span className="font-semibold text-[#202020]">Provider reference:</span> {batch.providerBatchReference || "Not submitted yet"}</p>
                  </div>
                  <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] leading-[1.7] text-[#57636c]">
                    <p className="font-semibold text-[#202020]">Settlement ids</p>
                    <p className="mt-1 break-all">{batch.settlementIds.length ? batch.settlementIds.join(", ") : "No linked settlements."}</p>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-[8px] border border-black/5 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            No payout batches match this view yet.
          </div>
        )}
      </div>
    </section>
  );
}
