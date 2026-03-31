"use client";

import { useEffect, useMemo, useState } from "react";

type CampaignItem = {
  docId: string;
  sellerSlug?: string;
  sellerCode?: string;
  vendorName?: string;
  name?: string;
  type?: string;
  status?: string;
  budget?: {
    dailyBudget?: number;
    totalBudget?: number;
    maxCpc?: number;
  };
  targeting?: {
    placements?: string[];
  };
  promotedProducts?: string[];
  timestamps?: {
    updatedAt?: string | null;
  };
  hasPendingUpdate?: boolean;
  pendingUpdate?: {
    name?: string;
    promotedProducts?: string[];
    targeting?: {
      placements?: string[];
    };
    moderation?: {
      decision?: string | null;
      submittedAt?: string | null;
      notes?: string | null;
    };
  } | null;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatDate(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Unknown time";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export function SellerCampaignReviewsWorkspace() {
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/campaigns/list?adminMode=true", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load campaign reviews.");
      const all = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      setItems(
        all.filter((item: CampaignItem) => {
          const status = toStr(item?.status).toLowerCase();
          const pendingDecision = toStr(item?.pendingUpdate?.moderation?.decision).toLowerCase();
          return ["submitted", "in_review"].includes(status) || pendingDecision === "submitted";
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load campaign reviews.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.total += 1;
          const status = toStr(item?.status).toLowerCase();
          const pendingDecision = toStr(item?.pendingUpdate?.moderation?.decision).toLowerCase();
          if (status === "submitted" || pendingDecision === "submitted") acc.submitted += 1;
          if (status === "in_review") acc.inReview += 1;
          return acc;
        },
        { total: 0, submitted: 0, inReview: 0 },
      ),
    [items],
  );

  async function review(campaignId: string, decision: "approve" | "reject" | "request_changes") {
    setBusyId(campaignId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/campaigns/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          decision,
          notes: notesById[campaignId] || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to review campaign.");
      setMessage(decision === "approve" ? "Campaign approved." : "Campaign sent back to the seller.");
      await load();
      window.dispatchEvent(new Event("piessang:refresh-admin-badges"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review campaign.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Pending reviews</p>
          <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.total}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Submitted</p>
          <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.submitted}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">In review</p>
          <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.inReview}</p>
        </div>
      </div>

      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <p className="text-[18px] font-semibold text-[#202020]">Campaign review queue</p>
        {loading ? (
          <p className="mt-4 text-[13px] text-[#57636c]">Loading review queue...</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-[13px] text-[#57636c]">No campaigns are waiting for review right now.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {items.map((item) => (
              <div key={item.docId} className="rounded-[8px] border border-black/5 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[#202020]">{toStr(item?.name, "Campaign")}</p>
                    <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
                      {toStr(item?.vendorName || item?.sellerSlug || item?.sellerCode, "Seller")} • {toStr(item?.type).replace(/_/g, " ")} • {Number((item?.pendingUpdate?.promotedProducts || item?.promotedProducts || []).length || 0)} product{Number((item?.pendingUpdate?.promotedProducts || item?.promotedProducts || []).length || 0) === 1 ? "" : "s"}
                    </p>
                    <p className="mt-2 text-[11px] text-[#8b94a3]">
                      Placements: {Array.isArray(item?.pendingUpdate?.targeting?.placements) && item.pendingUpdate?.targeting?.placements?.length ? item.pendingUpdate.targeting.placements.join(" • ") : Array.isArray(item?.targeting?.placements) && item.targeting?.placements?.length ? item.targeting.placements.join(" • ") : "None"} • Updated {formatDate(item?.timestamps?.updatedAt)}
                    </p>
                    {item?.hasPendingUpdate ? (
                      <p className="mt-2 text-[11px] text-[#8a6a14]">This is a live campaign update. Approving it replaces the current live setup without taking the live campaign down while under review.</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-[#8b94a3]">
                      Daily budget {toStr(item?.budget?.dailyBudget, "0")} • Total budget {toStr(item?.budget?.totalBudget, "0")} • Max CPC {toStr(item?.budget?.maxCpc, "0")}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d6940]">{item?.hasPendingUpdate ? "update review" : toStr(item?.status, "submitted")}</span>
                </div>

                <textarea
                  value={notesById[item.docId] || ""}
                  onChange={(event) => setNotesById((current) => ({ ...current, [item.docId]: event.target.value }))}
                  rows={3}
                  placeholder="Review note for the seller"
                  className="mt-3 w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void review(item.docId, "approve")}
                    disabled={busyId === item.docId}
                    className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(item.docId, "request_changes")}
                    disabled={busyId === item.docId}
                    className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                  >
                    Request changes
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(item.docId, "reject")}
                    disabled={busyId === item.docId}
                    className="inline-flex h-10 items-center rounded-[8px] border border-[#e4b5b9] px-4 text-[13px] font-semibold text-[#b91c1c] disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
