"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import {
  getSellerBlockReasonFix,
  getSellerBlockReasonLabel,
  SELLER_BLOCK_REASONS,
  normalizeSellerBlockReasonCode,
} from "@/lib/seller/account-status";

type SellerRow = {
  uid: string;
  email: string;
  vendorName: string;
  sellerSlug: string;
  role: string;
  status: string;
  blockedReasonCode?: string | null;
  blockedReasonMessage?: string | null;
  blockedAt?: string | null;
  blockedBy?: string | null;
  reviewStatus?: string | null;
  reviewRequestedAt?: string | null;
  reviewRequestedBy?: string | null;
  reviewRequestMessage?: string | null;
  reviewResponseStatus?: string | null;
  reviewResponseAt?: string | null;
  reviewResponseBy?: string | null;
  reviewResponseMessage?: string | null;
  teamMembers?: number;
  accessGrants?: number;
  isOwner?: boolean;
};

type SellerAccountsWorkspaceProps = {
  activeSellerSlug: string;
  activeSellerLabel: string;
  activeSellerRoleLabel: string;
  onSwitchSeller: (sellerSlug: string) => void;
  onBackToMySeller?: () => void;
};

type BlockTarget = SellerRow | null;
type ReviewTarget = SellerRow | null;

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatTime(value?: string | null) {
  const input = toStr(value);
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusBadge({ status }: { status: string }) {
  const value = toStr(status).toLowerCase();
  const label =
    value === "blocked"
      ? "Blocked"
      : value === "pending" || value === "requested"
        ? "Review requested"
        : value === "active"
          ? "Active"
          : value || "Unknown";
  const className =
    value === "blocked"
      ? "bg-[#fff1f2] text-[#b91c1c]"
      : value === "pending" || value === "requested"
        ? "bg-[rgba(203,178,107,0.16)] text-[#8f7531]"
        : "bg-[rgba(57,169,107,0.12)] text-[#166534]";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>{label}</span>;
}

function KebabIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

function SellerActionsMenu({
  sellerSlug,
  reviewPending,
  open,
  onToggle,
  onOpenSeller,
  onBlockSeller,
  onReviewRequest,
}: {
  sellerSlug: string;
  reviewPending: boolean;
  open: boolean;
  onToggle: (sellerSlug: string) => void;
  onOpenSeller: (sellerSlug: string) => void;
  onBlockSeller: () => void;
  onReviewRequest: () => void;
}) {
  return (
    <div data-seller-account-actions className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(sellerSlug);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020] transition-colors hover:bg-[rgba(32,32,32,0.04)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Seller actions"
      >
        <KebabIcon className="h-4 w-4" />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-52 rounded-[8px] border border-black/10 bg-white p-1 shadow-[0_16px_36px_rgba(20,24,27,0.12)]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onOpenSeller(sellerSlug)}
            className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
          >
            Open seller dashboard
          </button>
          <button
            type="button"
            onClick={onBlockSeller}
            className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
          >
            Block seller account
          </button>
          {reviewPending ? (
            <button
              type="button"
              onClick={onReviewRequest}
              className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
            >
              Review request
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SellerAccountsWorkspace({
  activeSellerSlug,
  activeSellerLabel,
  activeSellerRoleLabel,
  onSwitchSeller,
  onBackToMySeller,
}: SellerAccountsWorkspaceProps) {
  const { profile, refreshProfile } = useAuth();
  const [filter, setFilter] = useState<"all" | "blocked" | "review" | "active">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget>(null);
  const [blockReasonCode, setBlockReasonCode] = useState("other");
  const [blockReasonMessage, setBlockReasonMessage] = useState("");
  const [blocking, setBlocking] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>(null);
  const [reviewOutcome, setReviewOutcome] = useState<"approved" | "rejected">("approved");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [selectedSellerSlugs, setSelectedSellerSlugs] = useState<string[]>([]);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);

  const activeSeller = useMemo(
    () => rows.find((item) => item.sellerSlug === activeSellerSlug) ?? null,
    [activeSellerSlug, rows],
  );

  async function loadRows() {
    if (!profile?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        uid: profile.uid,
        filter: "all",
      });
      const response = await fetch(`/api/client/v1/accounts/seller/list?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load seller accounts.");
      }
      setRows(Array.isArray(payload?.sellers) ? payload.sellers : []);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Unable to load seller accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  useOutsideDismiss(
    bulkMenuOpen || activeActionMenu !== null,
    () => {
      setBulkMenuOpen(false);
      setActiveActionMenu(null);
    },
    {
      refs: [bulkMenuRef],
      selectors: ["[data-seller-account-actions]"],
    },
  );

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, item) => {
        const status = toStr(item.status).toLowerCase();
        const review = toStr(item.reviewStatus).toLowerCase();
        if (status === "blocked") acc.blocked += 1;
        if (status === "active") acc.active += 1;
        if (review === "pending" || review === "requested") acc.review += 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, blocked: 0, review: 0, active: 0 },
    );
  }, [rows]);

  const visibleRows = rows.filter((item) => {
    const status = toStr(item.status).toLowerCase();
    const review = toStr(item.reviewStatus).toLowerCase();
    const needle = searchQuery.trim().toLowerCase();
    const statusMatch =
      filter === "blocked"
        ? status === "blocked"
        : filter === "review"
          ? review === "pending" || review === "requested"
          : filter === "active"
            ? status !== "blocked" && !(review === "pending" || review === "requested")
            : true;
    const searchMatch =
      !needle ||
      [
        item.vendorName,
        item.email,
        item.sellerSlug,
        item.role,
        item.status,
        item.reviewStatus,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    return statusMatch && searchMatch;
  });

  const selectedRows = useMemo(
    () => visibleRows.filter((item) => selectedSellerSlugs.includes(item.sellerSlug)),
    [selectedSellerSlugs, visibleRows],
  );

  const selectedCount = selectedRows.length;
  const allVisibleSelected = visibleRows.length > 0 && selectedCount === visibleRows.length;

  function toggleSelectedSeller(sellerSlug: string) {
    setSelectedSellerSlugs((current) =>
      current.includes(sellerSlug)
        ? current.filter((item) => item !== sellerSlug)
        : [...current, sellerSlug],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedSellerSlugs((current) => {
      if (allVisibleSelected) return [];
      return Array.from(new Set([...current, ...visibleRows.map((item) => item.sellerSlug)]));
    });
  }

  function clearSelection() {
    setSelectedSellerSlugs([]);
    setBulkMenuOpen(false);
  }

  function handleSwitchSeller(sellerSlug: string) {
    setActiveActionMenu(null);
    onSwitchSeller(sellerSlug);
  }

  async function openSelectedSeller() {
    if (selectedRows.length === 0) return;
    handleSwitchSeller(selectedRows[0].sellerSlug);
    clearSelection();
  }

  function openBlockSelected() {
    if (selectedRows.length === 0) return;
    setBlockTarget(selectedRows[0]);
    setBulkMenuOpen(false);
  }

  function openReviewSelected() {
    if (selectedRows.length === 0) return;
    setReviewTarget(selectedRows[0]);
    setBulkMenuOpen(false);
  }

  function toggleActionMenu(sellerSlug: string) {
    setActiveActionMenu((current) => (current === sellerSlug ? null : sellerSlug));
  }

  async function backfillSellerCodes() {
    if (!profile?.uid) return;
    setBackfilling(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: profile.uid }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to backfill seller codes.");
      }
      setMessage(
        `Backfilled seller codes for ${payload?.sellersUpdated || 0} sellers and ${payload?.productsUpdated || 0} products.`,
      );
      await loadRows();
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to backfill seller codes.");
    } finally {
      setBackfilling(false);
    }
  }

  async function submitBlock() {
    if (!blockTarget) return;
    setBlocking(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          data: {
            sellerSlug: blockTarget.sellerSlug,
            reasonCode: normalizeSellerBlockReasonCode(blockReasonCode),
            reasonMessage: blockReasonMessage,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to block seller.");
      }
      setBlockTarget(null);
      await loadRows();
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to block seller.");
    } finally {
      setBlocking(false);
    }
  }

  async function submitReview() {
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/review/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          data: {
            sellerSlug: reviewTarget.sellerSlug,
            approved: reviewOutcome === "approved",
            feedback: reviewFeedback,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update seller review.");
      }
      setReviewTarget(null);
      setReviewFeedback("");
      await loadRows();
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update seller review.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[8px] bg-[#171717] px-3 py-3 text-white shadow-[0_8px_24px_rgba(20,24,27,0.08)] md:px-4 md:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f2dfaa]">
              Seller context settings
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-white md:text-[20px]">Seller accounts</h3>
            <p className="mt-1 hidden max-w-[760px] text-[13px] leading-[1.6] text-white/72 md:block">
              You are managing seller contexts from here. Switch between sellers, block access, or review blocked
              accounts without leaving this page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-[12px]">
            <span className="rounded-[8px] bg-white/10 px-3 py-2 font-semibold text-white/90">
              {profile?.email || "Signed in"}
            </span>
            <span className="rounded-[8px] bg-white/10 px-3 py-2 font-semibold text-white/90">
              {activeSellerRoleLabel}
            </span>
            <span className="rounded-[8px] bg-white/10 px-3 py-2 font-semibold text-white/90">
              {activeSellerLabel || activeSellerSlug || "Seller account"}
            </span>
            {onBackToMySeller ? (
              <button
                type="button"
                onClick={onBackToMySeller}
                className="inline-flex h-9 items-center rounded-[8px] border border-white/15 bg-white/10 px-3 font-semibold text-white transition-colors hover:bg-white/15"
              >
                Back to my seller dashboard
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <section className="rounded-[8px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-[20px] font-semibold text-[#202020]">
              All seller accounts ({counts.total})
            </h3>
            <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
              Tap a seller row to switch context. Use the checkboxes for bulk actions.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center rounded-[8px] border border-black/10 bg-white px-3 py-2 shadow-[0_2px_8px_rgba(20,24,27,0.05)]">
              <span className="text-[12px] text-[#8b94a3]">⌕</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sellers"
                className="ml-2 w-full min-w-[180px] bg-transparent text-[13px] outline-none placeholder:text-[#8b94a3]"
              />
            </div>

            <div className="inline-flex rounded-[8px] border border-black/10 bg-[#f6f6f6] p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`inline-flex h-9 items-center rounded-[6px] px-3 text-[12px] font-semibold transition-colors ${
                  viewMode === "list" ? "bg-white text-[#202020] shadow-[0_1px_4px_rgba(20,24,27,0.1)]" : "text-[#7d7d7d]"
                }`}
              >
                List view
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`inline-flex h-9 items-center rounded-[6px] px-3 text-[12px] font-semibold transition-colors ${
                  viewMode === "card" ? "bg-white text-[#202020] shadow-[0_1px_4px_rgba(20,24,27,0.1)]" : "text-[#7d7d7d]"
                }`}
              >
                Card view
              </button>
            </div>

            {profile?.systemAccessType === "admin" ? (
              <button
                type="button"
                onClick={() => void backfillSellerCodes()}
                disabled={backfilling}
                className="inline-flex h-10 items-center rounded-[8px] border border-[#cbb26b]/30 bg-[rgba(203,178,107,0.12)] px-3 text-[12px] font-semibold text-[#8f7531] transition-colors hover:bg-[rgba(203,178,107,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {backfilling ? "Backfilling..." : "Backfill seller codes"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {[
          ["all", `All ${counts.total}`],
          ["active", `Active ${counts.active}`],
          ["blocked", `Blocked ${counts.blocked}`],
          ["review", `Review requests ${counts.review}`],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as typeof filter)}
            className={`inline-flex h-9 items-center rounded-[8px] px-3 text-[12px] font-semibold transition-colors ${
              filter === value
                ? "bg-[#202020] text-white"
                : "border border-black/10 bg-white text-[#202020] hover:bg-[rgba(32,32,32,0.04)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-[8px] border border-[#c8e9d2] bg-[#f4fbf6] px-4 py-3 text-[12px] text-[#166534]">
          {message}
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <section className="rounded-[8px] border border-black/5 bg-[rgba(203,178,107,0.08)] px-4 py-3 text-[13px] text-[#202020]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">
              {selectedCount} seller{selectedCount === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void openSelectedSeller()}
                disabled={selectedCount !== 1}
                className="inline-flex h-8 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open selected
              </button>
              <button
                type="button"
                onClick={openBlockSelected}
                disabled={selectedCount !== 1}
                className="inline-flex h-8 items-center rounded-[8px] border border-[#b91c1c]/20 bg-white px-3 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Block selected
              </button>
              <div ref={bulkMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setBulkMenuOpen((current) => !current)}
                  className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                  aria-haspopup="menu"
                  aria-expanded={bulkMenuOpen}
                >
                  More actions
                  <span className="text-[10px]">⌄</span>
                </button>
                {bulkMenuOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-[8px] border border-black/10 bg-white p-1 shadow-[0_16px_36px_rgba(20,24,27,0.12)]">
                    <button
                      type="button"
                      onClick={() => void openSelectedSeller()}
                      disabled={selectedCount !== 1}
                      className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5] disabled:opacity-60"
                    >
                      Open seller dashboard
                    </button>
                    <button
                      type="button"
                      onClick={openBlockSelected}
                      disabled={selectedCount !== 1}
                      className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5] disabled:opacity-60"
                    >
                      Block seller account
                    </button>
                    <button
                      type="button"
                      onClick={openReviewSelected}
                      disabled={selectedCount !== 1}
                      className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5] disabled:opacity-60"
                    >
                      Review request
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#b91c1c] hover:bg-[#fff4f4]"
                    >
                      Clear selection
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Clear
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {viewMode === "card" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="rounded-[8px] border border-black/5 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)] sm:col-span-2 xl:col-span-3">
              Loading seller accounts...
            </div>
          ) : visibleRows.length ? (
            visibleRows.map((row) => {
              const isActive = row.sellerSlug === activeSellerSlug;
              const reviewPending =
                toStr(row.reviewStatus).toLowerCase() === "pending" ||
                toStr(row.reviewStatus).toLowerCase() === "requested";
              return (
                <article
                  key={`card-${row.sellerSlug}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSwitchSeller(row.sellerSlug)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSwitchSeller(row.sellerSlug);
                    }
                  }}
                  className={`rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)] ${
                    isActive ? "ring-1 ring-[rgba(203,178,107,0.22)]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <label
                        className="mt-0.5 inline-flex items-center justify-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSellerSlugs.includes(row.sellerSlug)}
                          onChange={() => toggleSelectedSeller(row.sellerSlug)}
                          className="h-4 w-4 rounded border-black/20 text-[#907d4c] focus:ring-[#907d4c]"
                          aria-label={`Select seller ${row.vendorName}`}
                        />
                      </label>
                      <div className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-[#202020]">{row.vendorName}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#7d7d7d]">
                          {row.email || row.uid || "Seller account"}
                        </span>
                      </div>
                    </div>
                    <SellerActionsMenu
                      sellerSlug={row.sellerSlug}
                      reviewPending={reviewPending}
                      open={activeActionMenu === row.sellerSlug}
                      onToggle={toggleActionMenu}
                      onOpenSeller={handleSwitchSeller}
                      onBlockSeller={() => setBlockTarget(row)}
                      onReviewRequest={() => setReviewTarget(row)}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <StatusBadge status={row.status || (reviewPending ? "pending" : "active")} />
                    <span className="text-[12px] text-[#57636c]">{row.isOwner ? "Owner" : "Team"}</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-[8px] border border-black/5 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)] sm:col-span-2 xl:col-span-3">
              No seller accounts match this filter.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {loading ? (
              <div className="rounded-[8px] border border-black/5 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
                Loading seller accounts...
              </div>
            ) : visibleRows.length ? (
              visibleRows.map((row) => {
                const isActive = row.sellerSlug === activeSellerSlug;
                const reviewPending =
                  toStr(row.reviewStatus).toLowerCase() === "pending" ||
                  toStr(row.reviewStatus).toLowerCase() === "requested";
                return (
                  <article
                    key={`mobile-${row.sellerSlug}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSwitchSeller(row.sellerSlug)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSwitchSeller(row.sellerSlug);
                      }
                    }}
                    className={`rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)] ${
                      isActive ? "ring-1 ring-[rgba(203,178,107,0.22)]" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label
                        className="mt-0.5 inline-flex items-center justify-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSellerSlugs.includes(row.sellerSlug)}
                          onChange={() => toggleSelectedSeller(row.sellerSlug)}
                          className="h-4 w-4 rounded border-black/20 text-[#907d4c] focus:ring-[#907d4c]"
                          aria-label={`Select seller ${row.vendorName}`}
                        />
                      </label>
                      <div className="min-w-0 text-left">
                        <span className="block truncate text-[14px] font-semibold text-[#202020]">{row.vendorName}</span>
                        <span className="mt-0.5 block text-[11px] text-[#7d7d7d]">
                          {row.email || row.uid || "Seller account"}
                        </span>
                      </div>
                      <StatusBadge status={row.status || (reviewPending ? "pending" : "active")} />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[12px] text-[#57636c]">{row.isOwner ? "Owner" : "Team"}</span>
                      <SellerActionsMenu
                        sellerSlug={row.sellerSlug}
                        reviewPending={reviewPending}
                        open={activeActionMenu === row.sellerSlug}
                        onToggle={toggleActionMenu}
                        onOpenSeller={handleSwitchSeller}
                        onBlockSeller={() => setBlockTarget(row)}
                        onReviewRequest={() => setReviewTarget(row)}
                      />
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[8px] border border-black/5 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
                No seller accounts match this filter.
              </div>
            )}
          </div>

          <div className="hidden overflow-visible rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)] md:block">
          <div className="grid grid-cols-[auto_1.5fr_.9fr_auto] gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
            <div>
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="h-4 w-4 rounded border-black/20 text-[#907d4c] focus:ring-[#907d4c]"
                  aria-label="Select all visible seller accounts"
                />
              </label>
            </div>
            <div>Seller</div>
            <div>Status</div>
            <div className="text-right">Menu</div>
          </div>

          <div className="divide-y divide-black/5">
            {loading ? (
              <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading seller accounts...</div>
            ) : visibleRows.length ? (
              visibleRows.map((row) => {
                const isActive = row.sellerSlug === activeSellerSlug;
                const reviewPending =
                  toStr(row.reviewStatus).toLowerCase() === "pending" ||
                  toStr(row.reviewStatus).toLowerCase() === "requested";
                return (
                  <div
                    key={row.sellerSlug}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSwitchSeller(row.sellerSlug)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSwitchSeller(row.sellerSlug);
                      }
                    }}
                    className={`grid grid-cols-[auto_1.5fr_.9fr_auto] items-center gap-3 px-4 py-3 text-[13px] transition-colors ${
                      isActive ? "bg-[rgba(203,178,107,0.08)]" : "bg-white"
                    }`}
                  >
                    <div onClick={(event) => event.stopPropagation()}>
                      <label className="inline-flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedSellerSlugs.includes(row.sellerSlug)}
                          onChange={() => toggleSelectedSeller(row.sellerSlug)}
                          className="h-4 w-4 rounded border-black/20 text-[#907d4c] focus:ring-[#907d4c]"
                          aria-label={`Select seller ${row.vendorName}`}
                        />
                      </label>
                    </div>
                    <div className="min-w-0 text-left">
                      <span className="block truncate font-semibold text-[#202020]">{row.vendorName}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#7d7d7d]">
                        {row.email || row.uid || "Seller account"}
                      </span>
                    </div>
                    <div className="flex items-start">
                      <StatusBadge status={row.status || (reviewPending ? "pending" : "active")} />
                    </div>
                    <div className="flex justify-end">
                      <SellerActionsMenu
                        sellerSlug={row.sellerSlug}
                        reviewPending={reviewPending}
                        open={activeActionMenu === row.sellerSlug}
                        onToggle={toggleActionMenu}
                        onOpenSeller={handleSwitchSeller}
                        onBlockSeller={() => setBlockTarget(row)}
                        onReviewRequest={() => setReviewTarget(row)}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-10 text-[13px] text-[#57636c]">No seller accounts match this filter.</div>
            )}
          </div>
        </div>
        </>
      )}

      {blockTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setBlockTarget(null)}
        >
          <div
            className="relative h-[90svh] w-full max-w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Block seller</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{blockTarget.vendorName}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    Choose a reason and leave a note so the seller knows exactly what needs to be fixed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBlockTarget(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
                  aria-label="Close block dialog"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Reason</span>
                  <select
                    value={blockReasonCode}
                    onChange={(event) => {
                      const next = event.target.value;
                      setBlockReasonCode(next);
                      const preset = SELLER_BLOCK_REASONS.find((item) => item.value === normalizeSellerBlockReasonCode(next));
                      if (!blockReasonMessage.trim() && preset) {
                        setBlockReasonMessage(preset.fix);
                      }
                    }}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  >
                    {SELLER_BLOCK_REASONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] text-[#57636c]">
                  {getSellerBlockReasonFix(blockReasonCode)}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Explain the issue</span>
                  <textarea
                    value={blockReasonMessage}
                    onChange={(event) => setBlockReasonMessage(event.target.value)}
                    rows={5}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Add a short note for the seller."
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setBlockTarget(null)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitBlock()}
                  disabled={blocking}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {blocking ? "Blocking..." : "Block seller"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reviewTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setReviewTarget(null)}
        >
          <div
            className="relative h-[90svh] w-full max-w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Review request</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{reviewTarget.vendorName}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    Approve or reject the seller&apos;s review request with feedback they can act on.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
                  aria-label="Close review dialog"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="rounded-[8px] border border-[#f0e7c9] bg-[rgba(203,178,107,0.08)] px-4 py-3 text-[12px] text-[#6b5a26]">
                  {reviewTarget.reviewRequestMessage || "The seller has requested a review of their blocked account."}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setReviewOutcome("approved")}
                    className={`rounded-[8px] border px-4 py-3 text-left text-[13px] font-semibold ${
                      reviewOutcome === "approved"
                        ? "border-[#39a96b] bg-[rgba(57,169,107,0.08)] text-[#166534]"
                        : "border-black/10 bg-white text-[#202020]"
                    }`}
                  >
                    Approve review
                    <span className="mt-1 block text-[11px] font-normal text-[#57636c]">
                      Restore seller access and mark the account active.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewOutcome("rejected")}
                    className={`rounded-[8px] border px-4 py-3 text-left text-[13px] font-semibold ${
                      reviewOutcome === "rejected"
                        ? "border-[#d11c1c] bg-[#fff7f8] text-[#b91c1c]"
                        : "border-black/10 bg-white text-[#202020]"
                    }`}
                  >
                    Reject review
                    <span className="mt-1 block text-[11px] font-normal text-[#57636c]">
                      Keep the account blocked and explain what still needs fixing.
                    </span>
                  </button>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Feedback</span>
                  <textarea
                    value={reviewFeedback}
                    onChange={(event) => setReviewFeedback(event.target.value)}
                    rows={5}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Tell the seller what was reviewed or what still needs to be fixed."
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitReview()}
                  disabled={reviewSubmitting}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewSubmitting ? "Saving..." : reviewOutcome === "approved" ? "Approve review" : "Reject review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
