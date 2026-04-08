"use client";

import { useEffect, useMemo, useState } from "react";

function formatTimestamp(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toTitle(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function SellerGoogleMerchantWorkspace() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<any>({ totals: {}, jobs: [], failedJobs: [] });
  const [logs, setLogs] = useState<any[]>([]);
  const [offerIdsText, setOfferIdsText] = useState("");
  const [queueFilter, setQueueFilter] = useState("pending");
  const [queueSearch, setQueueSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/client/v1/admin/google-merchant", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load Google Merchant tools.");
      }
      setQueue(payload?.queue || { totals: {}, jobs: [], failedJobs: [] });
      setLogs(Array.isArray(payload?.logs) ? payload.logs : []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Google Merchant tools.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runAction(action: string) {
    setRunning(action);
    setMessage(null);
    setError(null);
    try {
      const body =
        action === "delete_offers"
          ? {
              action,
              offerIds: offerIdsText
                .split(/[\s,]+/g)
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : { action };
      const response = await fetch("/api/client/v1/admin/google-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to run the Google Merchant action.");
      }
      if (action === "delete_offers") setOfferIdsText("");
      setMessage(
        action === "sync_queue"
          ? "Queued Google sync started."
          : action === "full_reconcile"
            ? "Full Google reconciliation started."
            : action === "cleanup_legacy"
              ? "Legacy Google offers cleanup finished."
              : "Selected Google offers deleted.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run the Google Merchant action.");
    } finally {
      setRunning("");
    }
  }

  const visibleQueueJobs = useMemo(() => {
    const source = queueFilter === "failed" ? (Array.isArray(queue?.failedJobs) ? queue.failedJobs : []) : (Array.isArray(queue?.jobs) ? queue.jobs : []);
    const needle = queueSearch.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((job: any) => {
      const haystack = [
        job?.productId,
        job?.id,
        job?.reason,
        Array.isArray(job?.reasons) ? job.reasons.join(" ") : "",
        job?.lastError,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(needle);
    });
  }, [queue, queueFilter, queueSearch]);

  const visibleLogs = useMemo(() => {
    if (logFilter === "failed") return logs.filter((entry) => entry?.ok === false);
    if (logFilter === "success") return logs.filter((entry) => entry?.ok !== false);
    return logs;
  }, [logs, logFilter]);

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Google Merchant tools</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Monitor the Google sync queue, run manual sync jobs, clean up legacy offers, and inspect recent Merchant Center activity from one admin workspace.
        </p>
      </section>

      {message ? <div className="rounded-[8px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[#202020]">Sync queue</p>
              <p className="mt-1 text-[12px] text-[#57636c]">The next products waiting to be processed by the queue-driven Google sync.</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || Boolean(running)}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["Pending", queue?.totals?.pending || 0],
              ["Processing", queue?.totals?.processing || 0],
              ["Done", queue?.totals?.done || 0],
              ["Failed", queue?.totals?.failed || 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">{label}</p>
                <p className="mt-2 text-[22px] font-semibold text-[#202020]">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-[8px] border border-black/10">
            <div className="flex flex-wrap items-center gap-3 border-b border-black/8 bg-white px-4 py-3">
              <select
                value={queueFilter}
                onChange={(event) => setQueueFilter(event.target.value)}
                className="h-10 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
              >
                <option value="pending">Pending queue</option>
                <option value="failed">Failed jobs</option>
              </select>
              <input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Search product ID or reason"
                className="h-10 min-w-[220px] flex-1 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
              />
            </div>
            <div className="grid grid-cols-[1fr_110px_160px] gap-3 border-b border-black/8 bg-[#fafafa] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
              <span>Product</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            {loading ? (
              <div className="px-4 py-5 text-[13px] text-[#57636c]">Loading Google queue...</div>
            ) : visibleQueueJobs.length ? (
              visibleQueueJobs.map((job: any) => (
                <div key={job?.id} className="grid grid-cols-[1fr_110px_160px] gap-3 border-t border-black/6 px-4 py-3 text-[13px] text-[#202020] first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{job?.productId || job?.id}</p>
                    <p className="mt-1 truncate text-[11px] text-[#7d7d7d]">{Array.isArray(job?.reasons) ? job.reasons.join(", ") : job?.reason || "pending"}</p>
                    {job?.lastError ? <p className="mt-1 truncate text-[11px] text-[#b91c1c]">{job.lastError}</p> : null}
                  </div>
                  <span className="text-[12px] font-semibold text-[#202020]">{toTitle(job?.status || "pending")}</span>
                  <span className="text-[12px] text-[#57636c]">{formatTimestamp(job?.timestamps?.updatedAt || "")}</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-5 text-[13px] text-[#57636c]">No queued Google sync jobs right now.</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[13px] font-semibold text-[#202020]">Actions</p>
            <p className="mt-1 text-[12px] text-[#57636c]">Run queue processing, full reconciliation, or Google offer cleanup manually.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => void runAction("sync_queue")} disabled={Boolean(running)} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {running === "sync_queue" ? "Syncing queue..." : "Sync queue now"}
              </button>
              <button type="button" onClick={() => void runAction("full_reconcile")} disabled={Boolean(running)} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60">
                {running === "full_reconcile" ? "Reconciling..." : "Run full reconcile"}
              </button>
              <button type="button" onClick={() => void runAction("cleanup_legacy")} disabled={Boolean(running)} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60">
                {running === "cleanup_legacy" ? "Cleaning..." : "Cleanup legacy offers"}
              </button>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[13px] font-semibold text-[#202020]">Delete specific offers</p>
            <p className="mt-1 text-[12px] text-[#57636c]">Paste Google offer IDs separated by commas, spaces, or new lines.</p>
            <textarea
              value={offerIdsText}
              onChange={(event) => setOfferIdsText(event.target.value)}
              rows={5}
              placeholder={"27817775-26547747-ZA\n19441828-63676599-ZA"}
              className="mt-3 w-full rounded-[8px] border border-black/10 bg-white px-3 py-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            />
            <button type="button" onClick={() => void runAction("delete_offers")} disabled={Boolean(running) || !offerIdsText.trim()} className="mt-3 inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {running === "delete_offers" ? "Deleting offers..." : "Delete selected offers"}
            </button>
          </section>
        </div>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <p className="text-[13px] font-semibold text-[#202020]">Recent sync logs</p>
        <p className="mt-1 text-[12px] text-[#57636c]">Every manual action and background Google sync run recorded for quick auditing.</p>
        <div className="mt-4 overflow-hidden rounded-[8px] border border-black/10">
          <div className="grid grid-cols-[120px_150px_90px_1fr_160px] gap-3 border-b border-black/8 bg-[#fafafa] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
            <span>Source</span>
            <span>Action</span>
            <span>Status</span>
            <span>Summary</span>
            <span>Time</span>
          </div>
          <div className="border-b border-black/8 bg-white px-4 py-3">
            <select
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value)}
              className="h-10 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            >
              <option value="all">All logs</option>
              <option value="success">Successful only</option>
              <option value="failed">Failed only</option>
            </select>
          </div>
          {loading ? (
            <div className="px-4 py-5 text-[13px] text-[#57636c]">Loading sync logs...</div>
          ) : visibleLogs.length ? (
            visibleLogs.map((log: any) => (
              <div key={log?.id} className="grid grid-cols-[120px_150px_90px_1fr_160px] gap-3 border-t border-black/6 px-4 py-3 text-[13px] text-[#202020] first:border-t-0">
                <span>{toTitle(log?.source || "system")}</span>
                <span>{toTitle(log?.action || "sync")}</span>
                <span className={log?.ok === false ? "font-semibold text-[#b91c1c]" : "font-semibold text-[#166534]"}>{log?.ok === false ? "Failed" : "OK"}</span>
                <span className="truncate text-[12px] text-[#57636c]">{JSON.stringify(log?.summary || {})}</span>
                <span className="text-[12px] text-[#57636c]">{formatTimestamp(log?.createdAt || "")}</span>
              </div>
            ))
          ) : (
            <div className="px-4 py-5 text-[13px] text-[#57636c]">No Google Merchant logs yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
