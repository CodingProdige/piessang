"use client";

import { useEffect, useMemo, useState } from "react";

type BrandRequestRow = {
  id: string;
  brandTitle: string;
  brandSlug: string;
  status: string;
  vendorName?: string;
  productId?: string;
  productTitle?: string;
  createdAt?: string;
  updatedAt?: string;
  resolution?: {
    canonicalBrandSlug?: string;
    canonicalBrandTitle?: string;
    note?: string;
  };
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatTime(value?: string) {
  const input = toStr(value);
  if (!input) return "";
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

export function SellerBrandRequestsWorkspace() {
  const [rows, setRows] = useState<BrandRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<"pending" | "all">("pending");
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/client/v1/admin/brand-requests?status=${activeStatus}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load brand requests.");
      }
      setRows(Array.isArray(payload?.items) ? payload.items : []);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Unable to load brand requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, [activeStatus]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.brandTitle,
        row.brandSlug,
        row.vendorName,
        row.productTitle,
        row.productId,
        row.resolution?.canonicalBrandTitle,
        row.resolution?.canonicalBrandSlug,
      ]
        .map((item) => toStr(item).toLowerCase())
        .join(" ")
        .includes(needle),
    );
  }, [rows, search]);

  async function actOnRequest(row: BrandRequestRow, action: "approve" | "reject") {
    setWorkingId(row.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/admin/brand-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: row.id,
          action,
          mergeIntoBrandSlug: toStr(mergeTarget[row.id]),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update brand request.");
      }
      setMessage(payload?.message || "Brand request updated.");
      await loadRows();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("piessang:refresh-admin-badges"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update brand request.");
    } finally {
      setWorkingId(null);
    }
  }

  const renderLoadingSkeleton = () => (
    <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
      <div className="divide-y divide-black/5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-44 animate-pulse rounded-[8px] bg-black/5" />
                <div className="h-4 w-28 animate-pulse rounded-[8px] bg-black/5" />
                <div className="h-4 w-72 max-w-full animate-pulse rounded-[8px] bg-black/5" />
                <div className="h-4 w-36 animate-pulse rounded-[8px] bg-black/5" />
              </div>
              <div className="w-full rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-3 lg:w-[360px]">
                <div className="space-y-3">
                  <div className="h-10 animate-pulse rounded-[8px] bg-black/5" />
                  <div className="flex flex-wrap gap-2">
                    <div className="h-10 w-24 animate-pulse rounded-[8px] bg-black/5" />
                    <div className="h-10 w-24 animate-pulse rounded-[8px] bg-black/5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Brand requests</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Review seller-submitted brand requests, merge them into an existing canonical brand where needed, or approve them as new marketplace brands.
        </p>
      </section>

      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.1)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveStatus("pending")}
              className={`inline-flex h-10 items-center rounded-[10px] px-4 text-[13px] font-semibold ${activeStatus === "pending" ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#202020]"}`}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setActiveStatus("all")}
              className={`inline-flex h-10 items-center rounded-[10px] px-4 text-[13px] font-semibold ${activeStatus === "all" ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#202020]"}`}
            >
              All
            </button>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by brand, seller, or product"
            className="h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15 lg:max-w-[340px]"
          />
        </div>
      </section>

      {loading ? renderLoadingSkeleton() : (
      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="divide-y divide-black/5">
          {visibleRows.length ? (
            visibleRows.map((row) => {
              const resolved = toStr(row.status) !== "pending";
              return (
                <div key={row.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold text-[#202020]">{row.brandTitle || row.brandSlug || "Unknown brand"}</p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${resolved ? "bg-[rgba(57,169,107,0.1)] text-[#166534]" : "bg-[rgba(203,178,107,0.14)] text-[#8f7531]"}`}>
                          {row.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#7d7d7d]">{row.brandSlug}</p>
                      <p className="mt-2 text-[12px] text-[#57636c]">
                        Seller: <span className="font-medium text-[#202020]">{row.vendorName || "Unknown seller"}</span>
                        {row.productTitle ? ` • Product: ${row.productTitle}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-[#7d7d7d]">
                        Requested {formatTime(row.createdAt || row.updatedAt)}
                      </p>
                      {row.resolution?.canonicalBrandTitle ? (
                        <p className="mt-2 text-[12px] text-[#57636c]">
                          Canonical brand: <span className="font-medium text-[#202020]">{row.resolution.canonicalBrandTitle}</span>
                          {row.resolution?.canonicalBrandSlug ? ` (${row.resolution.canonicalBrandSlug})` : ""}
                        </p>
                      ) : null}
                    </div>
                    {!resolved ? (
                      <div className="w-full rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-3 lg:w-[360px]">
                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Merge into existing brand slug</span>
                          <input
                            value={mergeTarget[row.id] || ""}
                            onChange={(event) => setMergeTarget((current) => ({ ...current, [row.id]: event.target.value }))}
                            placeholder="Optional, e.g. coca-cola"
                            className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15"
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void actOnRequest(row, "approve")}
                            disabled={workingId === row.id}
                            className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            {workingId === row.id ? "Saving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void actOnRequest(row, "reject")}
                            disabled={workingId === row.id}
                            className="inline-flex h-10 items-center rounded-[8px] border border-[#f2c7cb] bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-[13px] text-[#57636c]">No brand requests found for this filter.</div>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
