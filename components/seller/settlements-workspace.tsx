"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type SettlementLine = {
  lineId?: string;
  title?: string;
  sku?: string;
  quantity?: number;
  lineTotalIncl?: number;
  successFeePercent?: number;
  successFeeIncl?: number;
  fulfilmentFeeIncl?: number;
  handlingFeeIncl?: number;
  storageAccruedIncl?: number;
  payoutDueIncl?: number;
  fulfilmentMode?: string;
  sizeBand?: string;
  weightBand?: string;
  storageBand?: string;
  expectedFulfilmentBy?: string;
  late?: boolean;
};

type SettlementRecord = {
  settlementId: string;
  orderId: string;
  orderNumber: string;
  merchantTransactionId: string;
  sellerUid: string;
  sellerCode: string;
  sellerSlug: string;
  vendorName: string;
  status: string;
  orderStatus: string | null;
  paymentStatus: string | null;
  fulfilment: {
    mode: string;
    status: string | null;
    claimStatus: string | null;
    reviewStatus: string | null;
    reviewFeedback: string;
    claimedAt: string;
    claimedBy: string;
    reviewedAt: string;
    reviewedBy: string;
    trackingNumber: string;
    courierName: string;
    proofUrl: string;
    expectedFulfilmentBy: string;
    late: boolean;
  };
  payout: {
    currency: string;
    gross_incl: number;
    success_fee_incl: number;
    fulfilment_fee_incl: number;
    handling_fee_incl: number;
    storage_accrued_incl: number;
    net_due_incl: number;
    released_incl: number;
    remaining_due_incl: number;
    status: string;
    hold_reason?: string;
    releaseReference: string;
    releasedAt: string;
    releasedBy: string;
  };
  adjustments: {
    refunded_incl: number;
    credit_note_count: number;
    credit_notes: Array<{
      creditNoteId?: string;
      creditNoteNumber?: string;
      amountIncl?: number;
      issuedAt?: string;
      status?: string;
    }>;
  };
  accountability: {
    late: boolean;
    strikeReasonCode: string;
    strikeReasonMessage: string;
  };
  lines: SettlementLine[];
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
  lineCount: number;
};

type SettlementsResponse = {
  filter?: string;
  scope?: "all" | "seller";
  sellerSlug?: string | null;
  sellerCode?: string | null;
  counts?: {
    total: number;
    pendingReview: number;
    readyForPayout: number;
    paid: number;
    blocked: number;
    cancelled: number;
    late: number;
  };
  settlements?: SettlementRecord[];
};

type SettlementsWorkspaceProps = {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
  isSystemAdmin: boolean;
  allowGlobalScope?: boolean;
};

type FilterKey = "all" | "review_queue" | "ready_for_payout" | "processing_payout" | "paid" | "late" | "blocked" | "cancelled" | "held";
type ScopeMode = "seller" | "all";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatAdjustmentHint(amount: number) {
  const safe = toNum(amount || 0);
  if (safe <= 0) return "No refund adjustments";
  return `Reduced by ${formatMoney(safe)} in credit notes`;
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

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const className =
    tone === "success"
      ? "bg-[rgba(57,169,107,0.12)] text-[#166534]"
      : tone === "warning"
        ? "bg-[rgba(203,178,107,0.14)] text-[#8f7531]"
        : tone === "danger"
          ? "bg-[rgba(220,38,38,0.10)] text-[#b91c1c]"
          : tone === "info"
            ? "bg-[rgba(99,102,241,0.12)] text-[#4f46e5]"
            : "bg-[rgba(148,163,184,0.14)] text-[#475569]";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>{children}</span>;
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

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowPathIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 12h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatFilterLabel(filter: FilterKey) {
  switch (filter) {
    case "review_queue":
      return "Review queue";
    case "ready_for_payout":
      return "Ready to pay";
    case "processing_payout":
      return "Processing payout";
    case "paid":
      return "Paid";
    case "late":
      return "Late";
    case "blocked":
      return "Blocked";
    case "cancelled":
      return "Cancelled";
    case "held":
      return "Held";
    default:
      return "All";
  }
}

function matchesFilter(record: SettlementRecord, filter: FilterKey) {
  const status = toStr(record?.status || "").toLowerCase();
  const payoutStatus = toStr(record?.payout?.status || "").toLowerCase();
  const reviewStatus = toStr(record?.fulfilment?.reviewStatus || "").toLowerCase();
  const late = Boolean(record?.accountability?.late || record?.fulfilment?.late);

  switch (filter) {
    case "review_queue":
      return status === "pending_review" || reviewStatus === "pending_review";
    case "ready_for_payout":
      return status === "ready_for_payout" || payoutStatus === "ready_for_payout";
    case "processing_payout":
      return status === "processing_payout" || ["pending_submission", "submitted", "in_transit"].includes(payoutStatus);
    case "paid":
      return status === "paid" || payoutStatus === "paid";
    case "late":
      return late;
    case "blocked":
      return status === "blocked";
    case "cancelled":
      return status === "cancelled";
    case "held":
      return status === "held";
    default:
      return true;
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case "ready_for_payout":
      return "success";
    case "processing_payout":
    case "pending_review":
      return "warning";
    case "paid":
      return "info";
    case "blocked":
      return "danger";
    case "cancelled":
      return "neutral";
    case "held":
      return "neutral";
    case "awaiting_stock":
      return "info";
    default:
      return "neutral";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "pending_review":
      return "Pending review";
    case "ready_for_payout":
      return "Ready for payout";
    case "processing_payout":
      return "Processing payout";
    case "awaiting_stock":
      return "Awaiting stock";
    case "blocked":
      return "Blocked";
    case "cancelled":
      return "Cancelled";
    case "paid":
      return "Paid";
    case "held":
      return "Held";
    default:
      return status || "Unknown";
  }
}

function getPayoutLabel(status: string) {
  switch (status) {
    case "ready_for_payout":
      return "Ready";
    case "pending_submission":
    case "submitted":
    case "in_transit":
      return "Processing";
    case "paid":
      return "Paid";
    case "held":
      return "Held";
    case "blocked":
      return "Blocked";
    case "cancelled":
      return "Cancelled";
    default:
      return status || "Held";
  }
}

function getFulfilmentLabel(mode: string) {
  switch (toStr(mode).toLowerCase()) {
    case "bevgo":
      return "Piessang fulfilment";
    case "seller":
      return "Self fulfilment";
    default:
      return toStr(mode || "seller");
  }
}

function modalBackdropClass(open: boolean) {
  return `fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 ${open ? "pointer-events-auto" : "pointer-events-none"}`;
}

export function SellerSettlementsWorkspace({
  sellerSlug,
  sellerCode,
  vendorName,
  isSystemAdmin,
  allowGlobalScope = false,
}: SettlementsWorkspaceProps) {
  const { profile, refreshProfile } = useAuth();
  const canUseGlobalScope = isSystemAdmin && allowGlobalScope;
  const [scopeMode, setScopeMode] = useState<ScopeMode>(canUseGlobalScope ? "all" : "seller");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [claimTarget, setClaimTarget] = useState<SettlementRecord | null>(null);
  const [claimTrackingNumber, setClaimTrackingNumber] = useState("");
  const [claimCourierName, setClaimCourierName] = useState("");
  const [claimProofUrl, setClaimProofUrl] = useState("");
  const [claimNotes, setClaimNotes] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<SettlementRecord | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<"approved" | "rejected">("approved");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<SettlementRecord | null>(null);
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releaseReference, setReleaseReference] = useState("");
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const snackbarTimeoutRef = useRef<number | null>(null);

  const sellerScopeLabel = scopeMode === "all" ? "All sellers" : vendorName || sellerSlug || "This seller";

  function showSnackbar(nextMessage: string, tone: "success" | "error" = "success") {
    void tone;
    if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    setMessage(nextMessage);
    snackbarTimeoutRef.current = window.setTimeout(() => setMessage(null), 2200);
  }

  async function loadSettlements() {
    if (!profile?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        uid: profile.uid,
        scope: scopeMode,
        filter: "all",
      });
      if (scopeMode !== "all" || !canUseGlobalScope) {
        if (sellerCode) params.set("sellerCode", sellerCode);
        if (sellerSlug) params.set("sellerSlug", sellerSlug);
      }

      const response = await fetch(`/api/client/v1/orders/settlements/list?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load settlements.");
      }

      setSettlements(Array.isArray(payload?.data?.settlements) ? payload.data.settlements : Array.isArray(payload?.settlements) ? payload.settlements : []);
    } catch (cause) {
      setSettlements([]);
      setError(cause instanceof Error ? cause.message : "Unable to load settlements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, sellerSlug, sellerCode, scopeMode, canUseGlobalScope]);

  useEffect(() => {
    setScopeMode(canUseGlobalScope ? "all" : "seller");
  }, [canUseGlobalScope]);

  useEffect(() => {
    setExpandedIds((current) => current.filter((id) => settlements.some((item) => item.settlementId === id)));
  }, [settlements]);

  useEffect(() => {
    return () => {
      if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    };
  }, []);

  const stats = useMemo(() => {
    return settlements.reduce(
      (acc, record) => {
        const status = toStr(record?.status || "").toLowerCase();
        const payoutStatus = toStr(record?.payout?.status || "").toLowerCase();
        acc.total += 1;
        acc.gross += toNum(record?.payout?.gross_incl || 0);
        acc.net += toNum(record?.payout?.net_due_incl || 0);
        acc.adjustments += toNum(record?.adjustments?.refunded_incl || 0);
        acc.ready += status === "ready_for_payout" || payoutStatus === "ready_for_payout" ? 1 : 0;
        acc.processing += status === "processing_payout" || ["pending_submission", "submitted", "in_transit"].includes(payoutStatus) ? 1 : 0;
        acc.review += status === "pending_review" || toStr(record?.fulfilment?.reviewStatus || "").toLowerCase() === "pending_review" ? 1 : 0;
        acc.paid += status === "paid" || payoutStatus === "paid" ? 1 : 0;
        acc.late += record?.accountability?.late || record?.fulfilment?.late ? 1 : 0;
        return acc;
      },
      { total: 0, gross: 0, net: 0, adjustments: 0, ready: 0, processing: 0, review: 0, paid: 0, late: 0 },
    );
  }, [settlements]);

  const holdSummary = useMemo(
    () =>
      settlements.reduce(
        (acc, record) => {
          const reason = toStr(record?.payout?.hold_reason || "").toLowerCase();
          if (reason === "awaiting_delivery") acc.awaitingDelivery += 1;
          if (reason === "return_window_open") acc.returnWindowOpen += 1;
          if (reason === "missing_bank_details") acc.missingBankDetails += 1;
          return acc;
        },
        { awaitingDelivery: 0, returnWindowOpen: 0, missingBankDetails: 0 },
      ),
    [settlements],
  );

  const filteredSettlements = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return settlements.filter((record) => {
      if (!matchesFilter(record, filter)) return false;
      if (!needle) return true;
      const searchStack = [
        record.vendorName,
        record.orderNumber,
        record.merchantTransactionId,
        record.sellerSlug,
        record.sellerCode,
        record.status,
        record.payout?.status,
        record.fulfilment?.claimStatus,
        record.fulfilment?.reviewStatus,
        ...(Array.isArray(record.lines) ? record.lines.map((line) => `${line.title ?? ""} ${line.sku ?? ""}`) : []),
      ]
        .join(" ")
        .toLowerCase();
      return searchStack.includes(needle);
    });
  }, [filter, query, settlements]);

  function toggleExpanded(settlementId: string) {
    setExpandedIds((current) =>
      current.includes(settlementId)
        ? current.filter((item) => item !== settlementId)
        : [...current, settlementId],
    );
  }

  function openMenu(settlementId: string) {
    setActiveMenu((current) => (current === settlementId ? null : settlementId));
  }

  function isClaimable(record: SettlementRecord) {
    const status = toStr(record?.status || "").toLowerCase();
    const claimStatus = toStr(record?.fulfilment?.claimStatus || "").toLowerCase();
    return toStr(record?.fulfilment?.mode || "").toLowerCase() === "seller" && !["paid", "blocked", "cancelled"].includes(status) && claimStatus !== "pending_review";
  }

  function canReview(record: SettlementRecord) {
    return isSystemAdmin && toStr(record?.fulfilment?.claimStatus || "").toLowerCase() === "pending_review";
  }

  function canRelease(record: SettlementRecord) {
    const payoutStatus = toStr(record?.payout?.status || "").toLowerCase();
    const status = toStr(record?.status || "").toLowerCase();
    return isSystemAdmin && (status === "ready_for_payout" || payoutStatus === "ready_for_payout") && toNum(record?.payout?.remaining_due_incl || 0) > 0;
  }

  async function submitClaim() {
    if (!claimTarget || !profile?.uid) return;
    setClaimSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/fulfilment/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile.uid,
          data: {
            orderId: claimTarget.orderId,
            orderNumber: claimTarget.orderNumber,
            sellerCode: claimTarget.sellerCode || undefined,
            sellerSlug: claimTarget.sellerSlug || undefined,
            trackingNumber: claimTrackingNumber,
            courierName: claimCourierName,
            proofUrl: claimProofUrl,
            notes: claimNotes,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to submit fulfilment claim.");
      }
      setClaimTarget(null);
      setClaimTrackingNumber("");
      setClaimCourierName("");
      setClaimProofUrl("");
      setClaimNotes("");
      showSnackbar("Fulfilment claim submitted.");
      await loadSettlements();
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit fulfilment claim.");
    } finally {
      setClaimSubmitting(false);
    }
  }

  async function submitReview() {
    if (!reviewTarget || !profile?.uid) return;
    setReviewSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/orders/fulfilment/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile.uid,
          data: {
            orderId: reviewTarget.orderId,
            orderNumber: reviewTarget.orderNumber,
            sellerCode: reviewTarget.sellerCode || undefined,
            sellerSlug: reviewTarget.sellerSlug || undefined,
            approved: reviewOutcome === "approved",
            feedback: reviewFeedback,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to review fulfilment claim.");
      }
      setReviewTarget(null);
      setReviewFeedback("");
      showSnackbar(reviewOutcome === "approved" ? "Fulfilment claim approved." : "Fulfilment claim rejected.");
      await loadSettlements();
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review fulfilment claim.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function submitRelease() {
    if (!releaseTarget || !profile?.uid) return;
    setReleaseSubmitting(true);
    setError(null);
    try {
      const amount = Number(releaseAmount || releaseTarget?.payout?.remaining_due_incl || 0);
      const response = await fetch("/api/client/v1/orders/settlement/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile.uid,
          data: {
            settlementId: releaseTarget.settlementId,
            orderId: releaseTarget.orderId,
            orderNumber: releaseTarget.orderNumber,
            releasedIncl: Number.isFinite(amount) ? amount : null,
            releaseReference: releaseReference || undefined,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to release payout.");
      }
      setReleaseTarget(null);
      setReleaseAmount("");
      setReleaseReference("");
      showSnackbar("Payout released.");
      await loadSettlements();
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to release payout.");
    } finally {
      setReleaseSubmitting(false);
    }
  }

  const selectedSellerSummary = useMemo(() => {
    if (scopeMode === "all" && canUseGlobalScope) return "All sellers";
    return vendorName || sellerSlug || "This seller";
  }, [canUseGlobalScope, scopeMode, sellerSlug, vendorName]);

  const filterOptions: FilterKey[] = ["all", "review_queue", "ready_for_payout", "processing_payout", "paid", "late", "blocked", "cancelled", "held"];

  return (
    <section className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Settlement dashboard</p>
            <h2 className="mt-1 text-[22px] font-semibold text-[#202020]">Track money flowing from customer to seller</h2>
            <p className="mt-1 max-w-[820px] text-[13px] leading-[1.6] text-[#57636c]">
              Every order settlement shows the success fee, fulfilment fee, handling fee, storage accrual, and the
              amount Piessang still holds before a payout is released.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-[#57636c]">
              <ArrowPathIcon className="h-4 w-4 text-[#907d4c]" />
              Customer pays Piessang
              <span className="text-[#cbb26b]">•</span>
              Piessang takes the success fee
              <span className="text-[#cbb26b]">•</span>
              Fulfilment and storage are deducted when applicable
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canUseGlobalScope ? (
              <div className="inline-flex rounded-[8px] border border-black/10 bg-[#f6f6f6] p-1">
                <button
                  type="button"
                  onClick={() => setScopeMode("seller")}
                  className={`inline-flex h-9 items-center rounded-[6px] px-3 text-[12px] font-semibold transition-colors ${
                    scopeMode === "seller"
                      ? "bg-white text-[#202020] shadow-[0_1px_4px_rgba(20,24,27,0.1)]"
                      : "text-[#7d7d7d]"
                  }`}
                >
                  This seller
                </button>
                <button
                  type="button"
                  onClick={() => setScopeMode("all")}
                  className={`inline-flex h-9 items-center rounded-[6px] px-3 text-[12px] font-semibold transition-colors ${
                    scopeMode === "all"
                      ? "bg-white text-[#202020] shadow-[0_1px_4px_rgba(20,24,27,0.1)]"
                      : "text-[#7d7d7d]"
                  }`}
                >
                  All sellers
                </button>
              </div>
            ) : (
              <span className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-[#f6f6f6] px-3 text-[12px] font-semibold text-[#202020]">
                {selectedSellerSummary}
              </span>
            )}

            <button
              type="button"
              onClick={() => void loadSettlements()}
              className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] hover:bg-[rgba(32,32,32,0.04)]"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        {[
          { label: "Gross sales", value: formatMoney(stats.gross), tone: "neutral" as const },
          { label: "Net due", value: formatMoney(stats.net), tone: "success" as const },
          { label: "Refund adjustments", value: formatMoney(stats.adjustments), tone: "warning" as const },
          { label: "Pending review", value: String(stats.review), tone: "warning" as const },
          { label: "Ready to pay", value: String(stats.ready), tone: "info" as const },
          { label: "Processing payout", value: String(stats.processing), tone: "info" as const },
          { label: "Paid", value: String(stats.paid), tone: "success" as const },
          { label: "Late", value: String(stats.late), tone: "danger" as const },
        ].map((item) => (
          <div key={item.label} className="rounded-[8px] border border-black/5 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{item.label}</p>
            <p
              className={`mt-2 text-[20px] font-semibold ${
                item.tone === "success"
                  ? "text-[#166534]"
                  : item.tone === "warning"
                    ? "text-[#8f7531]"
                    : item.tone === "danger"
                      ? "text-[#b91c1c]"
                      : "text-[#202020]"
              }`}
            >
              {item.value}
            </p>
            {item.label === "Net due" ? <p className="mt-1 text-[11px] text-[#57636c]">After fees and any issued credit notes.</p> : null}
            {item.label === "Refund adjustments" ? <p className="mt-1 text-[11px] text-[#57636c]">Seller credit notes reducing payout.</p> : null}
          </div>
        ))}
      </div>

      {holdSummary.awaitingDelivery || holdSummary.returnWindowOpen || holdSummary.missingBankDetails ? (
        <section className="rounded-[8px] border border-[rgba(144,125,76,0.18)] bg-[rgba(144,125,76,0.08)] px-4 py-3 text-[12px] leading-[1.7] text-[#6f5d2d]">
          <p className="font-semibold text-[#202020]">What is still holding payouts back</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {holdSummary.awaitingDelivery ? <p>{holdSummary.awaitingDelivery} settlement{holdSummary.awaitingDelivery === 1 ? "" : "s"} still need delivery before payout timing can begin.</p> : null}
            {holdSummary.returnWindowOpen ? <p>{holdSummary.returnWindowOpen} settlement{holdSummary.returnWindowOpen === 1 ? "" : "s"} are still inside the 7-day return window.</p> : null}
            {holdSummary.missingBankDetails ? <p>{holdSummary.missingBankDetails} settlement{holdSummary.missingBankDetails === 1 ? "" : "s"} are waiting for payout details or Stripe setup.</p> : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {filterOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`inline-flex h-9 items-center rounded-[8px] px-3 text-[12px] font-semibold transition-colors ${
                  filter === item
                    ? "bg-[#202020] text-white"
                    : "border border-black/10 bg-white text-[#202020] hover:bg-[rgba(32,32,32,0.04)]"
                }`}
              >
                {formatFilterLabel(item)}
              </button>
            ))}
          </div>

          <label className="flex items-center rounded-[8px] border border-black/10 bg-white px-3 py-2 shadow-[0_2px_8px_rgba(20,24,27,0.05)]">
            <span className="text-[12px] text-[#8b94a3]">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settlements"
              className="ml-2 w-full min-w-[200px] bg-transparent text-[13px] outline-none placeholder:text-[#8b94a3]"
            />
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="border-b border-black/5 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
          {scopeMode === "all" && canUseGlobalScope ? "All seller settlements" : `${selectedSellerSummary} settlements`}
        </div>

        {loading ? (
          <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading settlements...</div>
        ) : filteredSettlements.length ? (
          <div className="divide-y divide-black/5">
            {filteredSettlements.map((record) => {
              const status = toStr(record.status || "").toLowerCase();
              const payoutStatus = toStr(record.payout?.status || "").toLowerCase();
              const reviewPending = toStr(record.fulfilment?.claimStatus || "").toLowerCase() === "pending_review";
              const expanded = expandedIds.includes(record.settlementId);
              const canReviewClaim = canReview(record);
              const canReleasePayout = canRelease(record);

              return (
                <article key={record.settlementId} className="bg-white">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(record.settlementId)}
                    className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-[rgba(32,32,32,0.02)] md:grid-cols-[1.4fr_.9fr_.8fr_.8fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[#202020]">{record.vendorName || "Seller"}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[#57636c]">
                        Order {record.orderNumber || record.orderId || "—"} • {record.sellerCode || record.sellerSlug || "seller"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getStatusTone(status)}>{getStatusLabel(status)}</Badge>
                      {reviewPending ? <Badge tone="warning">Claim pending</Badge> : null}
                    </div>

                    <div className="text-[13px] text-[#202020]">
                      <span className="block font-semibold">{formatMoney(record.payout?.net_due_incl || 0)}</span>
                      <span className="block text-[11px] text-[#57636c]">{record.adjustments?.refunded_incl ? formatAdjustmentHint(record.adjustments.refunded_incl) : "Net due"}</span>
                    </div>

                    <div className="text-[13px] text-[#202020]">
                      <span className="block font-semibold">{getFulfilmentLabel(record.fulfilment?.mode || "seller")}</span>
                      <span className="block text-[11px] text-[#57636c]">
                        {record.fulfilment?.expectedFulfilmentBy ? `By ${formatTime(record.fulfilment.expectedFulfilmentBy)}` : "No lead time"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <span className="text-[12px] text-[#57636c]">{expanded ? "Hide" : "Details"}</span>
                      <ChevronDownIcon className={`h-4 w-4 text-[#8b8b8b] transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {expanded ? (
                    <div className="border-t border-black/5 px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={status === "paid" ? "success" : payoutStatus === "ready_for_payout" ? "info" : "neutral"}>
                              Payout {getPayoutLabel(payoutStatus || status)}
                            </Badge>
                            {record.accountability?.late ? <Badge tone="danger">Late claim</Badge> : null}
                            {record.fulfilment?.mode ? <Badge tone="neutral">{getFulfilmentLabel(record.fulfilment.mode)}</Badge> : null}
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                              ["Gross", record.payout?.gross_incl || 0],
                              ["Success fee", record.payout?.success_fee_incl || 0],
                              ["Fulfilment fee", record.payout?.fulfilment_fee_incl || 0],
                              ["Handling fee", record.payout?.handling_fee_incl || 0],
                              ["Storage accrued", record.payout?.storage_accrued_incl || 0],
                              ["Refunded adjustments", record.adjustments?.refunded_incl || 0],
                              ["Released", record.payout?.released_incl || 0],
                              ["Remaining due", record.payout?.remaining_due_incl || 0],
                              ["Lines", record.lineCount || 0],
                            ].map(([label, value]) => (
                              <div key={String(label)} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{label}</p>
                                <p className="mt-1 text-[13px] font-semibold text-[#202020]">
                                  {typeof value === "number" && label !== "Lines" ? formatMoney(value) : String(value)}
                                </p>
                              </div>
                            ))}
                          </div>

                          {record.adjustments?.credit_note_count ? (
                            <div className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Refund adjustments</p>
                                <p className="text-[12px] text-[#57636c]">
                                  {record.adjustments.credit_note_count} credit note{record.adjustments.credit_note_count === 1 ? "" : "s"}
                                </p>
                              </div>
                              <div className="mt-2 space-y-2">
                                {record.adjustments.credit_notes.map((note) => (
                                  <div key={note.creditNoteId || note.creditNoteNumber} className="flex items-center justify-between rounded-[8px] border border-black/5 bg-white px-3 py-2 text-[12px]">
                                    <div>
                                      <p className="font-semibold text-[#202020]">{note.creditNoteNumber || "Credit note"}</p>
                                      <p className="text-[11px] text-[#57636c]">{formatTime(note.issuedAt)}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-semibold text-[#202020]">{formatMoney(note.amountIncl || 0)}</p>
                                      <p className="text-[11px] text-[#57636c]">{toStr(note.status || "issued").replace(/_/g, " ")}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Line items</p>
                              <p className="text-[12px] text-[#57636c]">
                                {record.lines.length ? `${record.lines.length} line${record.lines.length === 1 ? "" : "s"}` : "No line items"}
                              </p>
                            </div>
                            <div className="mt-2 space-y-2">
                              {record.lines.length ? (
                                record.lines.map((line) => (
                                  <div key={line.lineId || `${record.settlementId}-${line.sku || line.title}`} className="rounded-[8px] border border-black/5 bg-white px-3 py-2 text-[12px]">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-[#202020]">{line.title || "Item"}</p>
                                        <p className="text-[11px] text-[#57636c]">{line.sku || "No SKU"} • Qty {line.quantity || 0}</p>
                                      </div>
                                      <Badge tone={line.fulfilmentMode === "bevgo" ? "info" : "neutral"}>
                                        {getFulfilmentLabel(line.fulfilmentMode || "seller")}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                      {[
                                        ["Line total", line.lineTotalIncl || 0],
                                        ["Success fee", line.successFeeIncl || 0],
                                        ["Fulfilment fee", line.fulfilmentFeeIncl || 0],
                                        ["Net due", line.payoutDueIncl || 0],
                                      ].map(([label, value]) => (
                                        <div key={`${line.lineId}-${label}`} className="rounded-[8px] bg-[rgba(32,32,32,0.02)] px-2 py-1.5">
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{label}</p>
                                          <p className="text-[12px] font-semibold text-[#202020]">{formatMoney(Number(value || 0))}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c]">
                                  No line items recorded on this settlement.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 lg:w-[220px]">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openMenu(record.settlementId);
                            }}
                            className="inline-flex h-9 items-center justify-between rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                          >
                            Actions
                            <KebabIcon className="ml-2 h-4 w-4" />
                          </button>
                          {activeMenu === record.settlementId ? (
                            <div className="rounded-[8px] border border-black/10 bg-white p-1 shadow-[0_14px_32px_rgba(20,24,27,0.12)]">
                              {isClaimable(record) ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setClaimTarget(record);
                                    setClaimTrackingNumber(record.fulfilment?.trackingNumber || "");
                                    setClaimCourierName(record.fulfilment?.courierName || "");
                                    setClaimProofUrl(record.fulfilment?.proofUrl || "");
                                    setClaimNotes("");
                                    setActiveMenu(null);
                                  }}
                                  className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
                                >
                                  Mark as fulfilled
                                </button>
                              ) : null}
                              {canReviewClaim ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setReviewTarget(record);
                                    setReviewOutcome("approved");
                                    setReviewFeedback(record.fulfilment?.reviewFeedback || "");
                                    setActiveMenu(null);
                                  }}
                                  className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
                                >
                                  Review claim
                                </button>
                              ) : null}
                              {canReleasePayout ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setReleaseTarget(record);
                                    setReleaseAmount(String(record.payout?.remaining_due_incl || record.payout?.net_due_incl || 0));
                                    setReleaseReference("");
                                    setActiveMenu(null);
                                  }}
                                  className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
                                >
                                  Release payout
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleExpanded(record.settlementId);
                                  setActiveMenu(null);
                                }}
                                className="flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[12px] font-medium text-[#202020] hover:bg-[#f5f5f5]"
                              >
                                {expanded ? "Hide details" : "Show details"}
                              </button>
                            </div>
                          ) : null}
                          <div className="text-[11px] text-[#7d7d7d]">
                            <p>Order {record.orderNumber || record.orderId || "—"}</p>
                            <p>{record.fulfilment?.expectedFulfilmentBy ? `Expected by ${formatTime(record.fulfilment.expectedFulfilmentBy)}` : "No lead time set"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-10 text-[13px] text-[#57636c]">
            No settlements match this view.
          </div>
        )}
      </section>

      {claimTarget ? (
        <div className={modalBackdropClass(true)} role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close claim modal"
            onClick={() => setClaimTarget(null)}
          />
          <div
            className="relative h-[90svh] w-full max-w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Mark as fulfilled</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{claimTarget.vendorName || "Seller"}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    Capture tracking details so the claim can move into review.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClaimTarget(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
                  aria-label="Close claim modal"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] text-[#57636c]">
                  Order {claimTarget.orderNumber || claimTarget.orderId || "—"} •{" "}
                  {getFulfilmentLabel(claimTarget.fulfilment?.mode || "seller")} • Net due{" "}
                  {formatMoney(claimTarget.payout?.net_due_incl || 0)}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Courier</span>
                    <input
                      value={claimCourierName}
                      onChange={(event) => setClaimCourierName(event.target.value)}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                      placeholder="Courier name"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Tracking number</span>
                    <input
                      value={claimTrackingNumber}
                      onChange={(event) => setClaimTrackingNumber(event.target.value)}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                      placeholder="Tracking number"
                    />
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Proof URL</span>
                  <input
                    value={claimProofUrl}
                    onChange={(event) => setClaimProofUrl(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Link to shipping proof or POD"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Notes</span>
                  <textarea
                    value={claimNotes}
                    onChange={(event) => setClaimNotes(event.target.value)}
                    rows={5}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Add any relevant fulfilment notes."
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setClaimTarget(null)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitClaim()}
                  disabled={claimSubmitting}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {claimSubmitting ? "Saving..." : "Submit claim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reviewTarget ? (
        <div className={modalBackdropClass(true)} role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close review modal"
            onClick={() => setReviewTarget(null)}
          />
          <div
            className="relative h-[90svh] w-full max-w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Review claim</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{reviewTarget.vendorName || "Seller"}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    Approve or reject the fulfilment claim with feedback the seller can act on.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
                  aria-label="Close review modal"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="rounded-[8px] border border-[#f0e7c9] bg-[rgba(203,178,107,0.08)] px-4 py-3 text-[12px] text-[#6b5a26]">
                  Order {reviewTarget.orderNumber || reviewTarget.orderId || "—"} • Tracking{" "}
                  {reviewTarget.fulfilment?.trackingNumber || "not set"} • {formatMoney(reviewTarget.payout?.net_due_incl || 0)} net due
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
                    Approve claim
                    <span className="mt-1 block text-[11px] font-normal text-[#57636c]">
                      Move the settlement to ready for payout.
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
                    Reject claim
                    <span className="mt-1 block text-[11px] font-normal text-[#57636c]">
                      Keep the settlement blocked until the issue is fixed.
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
                    placeholder="Tell the seller what was reviewed or what still needs fixing."
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
                  {reviewSubmitting ? "Saving..." : reviewOutcome === "approved" ? "Approve claim" : "Reject claim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {releaseTarget ? (
        <div className={modalBackdropClass(true)} role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close release modal"
            onClick={() => setReleaseTarget(null)}
          />
          <div
            className="relative h-[90svh] w-full max-w-[760px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Release payout</p>
                  <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{releaseTarget.vendorName || "Seller"}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                    Confirm the amount and reference to mark this settlement as paid.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReleaseTarget(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
                  aria-label="Close release modal"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] text-[#57636c]">
                  Order {releaseTarget.orderNumber || releaseTarget.orderId || "—"} • Remaining due{" "}
                  {formatMoney(releaseTarget.payout?.remaining_due_incl || 0)}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Release amount</span>
                  <input
                    type="number"
                    value={releaseAmount}
                    onChange={(event) => setReleaseAmount(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    min="0"
                    step="0.01"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Release reference</span>
                  <input
                    value={releaseReference}
                    onChange={(event) => setReleaseReference(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Optional payout reference"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setReleaseTarget(null)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitRelease()}
                  disabled={releaseSubmitting}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {releaseSubmitting ? "Saving..." : "Release payout"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 px-4">
          <div className="inline-flex items-center gap-2 rounded-[8px] border border-black/5 bg-white px-4 py-3 text-[13px] font-medium text-[#202020] shadow-[0_16px_40px_rgba(20,24,27,0.16)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(57,169,107,0.14)] text-[#166534]">
              ✓
            </span>
            {message}
          </div>
        </div>
      ) : null}
    </section>
  );
}
