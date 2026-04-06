"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { formatCurrencyExact } from "@/lib/money";

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
    eligible_at?: string;
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
  return formatCurrencyExact(value, "ZAR");
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
  const [loading, setLoading] = useState(true);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [message, setMessage] = useState<{ tone?: "info" | "success" | "error"; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
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

  function showSnackbar(nextMessage: string, tone: "info" | "success" | "error" = "success") {
    if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    setMessage({ tone, message: nextMessage });
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

  const settlementRows = useMemo(() => {
    return settlements.map((record) => {
      const status = toStr(record?.status || "").toLowerCase();
      const payoutStatus = toStr(record?.payout?.status || "").toLowerCase();
      let payoutState: "On hold" | "Ready" | "Processing" | "Paid" = "On hold";
      if (status === "paid" || payoutStatus === "paid") payoutState = "Paid";
      else if (status === "ready_for_payout" || payoutStatus === "ready_for_payout") payoutState = "Ready";
      else if (status === "processing_payout" || ["pending_submission", "submitted", "in_transit"].includes(payoutStatus)) payoutState = "Processing";

      const availableDate =
        payoutState === "Paid"
          ? toStr(record?.payout?.releasedAt || record?.updatedAt || "")
          : toStr(record?.payout?.eligible_at || record?.fulfilment?.expectedFulfilmentBy || record?.updatedAt || "");

      return {
        ...record,
        payoutState,
        availableDate,
      };
    });
  }, [settlements]);

  const availableSettlements = useMemo(
    () => settlementRows.filter((record) => record.payoutState === "Ready"),
    [settlementRows],
  );

  const heldSettlements = useMemo(
    () => settlementRows.filter((record) => record.payoutState === "On hold"),
    [settlementRows],
  );

  const processingSettlements = useMemo(
    () => settlementRows.filter((record) => record.payoutState === "Processing"),
    [settlementRows],
  );

  const paidSettlements = useMemo(
    () => settlementRows.filter((record) => record.payoutState === "Paid"),
    [settlementRows],
  );

  const availableTotal = useMemo(
    () => availableSettlements.reduce((sum, record) => sum + toNum(record?.payout?.remaining_due_incl || record?.payout?.net_due_incl || 0), 0),
    [availableSettlements],
  );

  const heldTotal = useMemo(
    () => heldSettlements.reduce((sum, record) => sum + toNum(record?.payout?.remaining_due_incl || record?.payout?.net_due_incl || 0), 0),
    [heldSettlements],
  );

  const nextPayoutDate = useMemo(() => {
    const dates = availableSettlements
      .map((record) => record.availableDate)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());
    return dates[0] ? formatTime(dates[0].toISOString()) : "Not scheduled";
  }, [availableSettlements]);

  const holdReleaseDate = useMemo(() => {
    const dates = heldSettlements
      .map((record) => record.availableDate)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());
    return dates[0] ? formatTime(dates[0].toISOString()) : "Awaiting update";
  }, [heldSettlements]);

  const holdReasonSummary = useMemo(() => {
    const counts = heldSettlements.reduce(
      (acc, record) => {
        const reason = toStr(record?.payout?.hold_reason || "").toLowerCase();
        if (reason === "return_window_open") acc.push("Return window");
        else if (reason === "awaiting_delivery") acc.push("Processing");
        else if (reason === "missing_bank_details") acc.push("Payout setup");
        else if (reason) acc.push(reason.replace(/_/g, " "));
        return acc;
      },
      [] as string[],
    );
    if (!counts.length) return processingSettlements.length ? "Payout is being processed" : "No active hold";
    return Array.from(new Set(counts)).join(" • ");
  }, [heldSettlements, processingSettlements.length]);

  function toggleExpanded(settlementId: string) {
    setExpandedIds((current) =>
      current.includes(settlementId)
        ? current.filter((item) => item !== settlementId)
        : [...current, settlementId],
    );
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

  return (
    <section className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Payouts</p>
            <h2 className="mt-1 text-[22px] font-semibold text-[#202020]">See what money is available and when it will be paid out</h2>
            <p className="mt-1 max-w-[820px] text-[13px] leading-[1.6] text-[#57636c]">
              Follow your available funds, what is still on hold, and your completed payout history without the internal settlement workflow clutter.
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
                {sellerScopeLabel}
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

      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_.9fr_1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Available to payout</p>
            <p className="mt-2 text-[36px] font-semibold tracking-[-0.04em] text-[#202020]">{formatMoney(availableTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Next payout date</p>
            <p className="mt-2 text-[15px] font-semibold text-[#202020]">{nextPayoutDate}</p>
          </div>
          <div className="rounded-[12px] border border-black/8 bg-[rgba(32,32,32,0.02)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Payout method</p>
            <p className="mt-2 text-[14px] font-semibold text-[#202020]">Automatic via Stripe</p>
            <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
              Eligible funds are paid out automatically on the next Stripe payout run.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-[rgba(144,125,76,0.18)] bg-[rgba(144,125,76,0.08)] p-4 shadow-[0_8px_24px_rgba(20,24,27,0.04)]">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Total on hold</p>
            <p className="mt-2 text-[26px] font-semibold text-[#202020]">{formatMoney(heldTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Reason</p>
            <p className="mt-2 text-[13px] font-medium text-[#6f5d2d]">{holdReasonSummary}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Funds release from</p>
            <p className="mt-2 text-[13px] font-medium text-[#202020]">{holdReleaseDate}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="border-b border-black/5 px-4 py-3">
          <p className="text-[12px] font-semibold text-[#202020]">Settlement list</p>
          <p className="mt-1 text-[12px] text-[#57636c]">Each order shows how much is due, whether it is on hold, ready, processing, or already paid, and when funds become available.</p>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading settlements...</div>
        ) : settlementRows.length ? (
          <div className="divide-y divide-black/5">
            {settlementRows.map((record) => {
              const expanded = expandedIds.includes(record.settlementId);
              const payoutTone =
                record.payoutState === "Paid"
                  ? "success"
                  : record.payoutState === "Ready"
                    ? "info"
                    : record.payoutState === "Processing"
                      ? "warning"
                      : "neutral";

              return (
                <article key={record.settlementId} className="bg-white">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(record.settlementId)}
                    className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-[rgba(32,32,32,0.02)] md:grid-cols-[1.2fr_.9fr_.8fr_.9fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[#202020]">Order {record.orderNumber || record.orderId || "—"}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[#57636c]">{record.vendorName || "Seller"}</p>
                    </div>

                    <div className="text-[13px] font-semibold text-[#202020]">
                      {formatMoney(record.payout?.remaining_due_incl || record.payout?.net_due_incl || 0)}
                    </div>

                    <div>
                      <Badge tone={payoutTone}>{record.payoutState}</Badge>
                    </div>

                    <div className="text-[13px] text-[#202020]">
                      <span className="block font-semibold">{record.availableDate ? formatTime(record.availableDate) : "Awaiting update"}</span>
                      <span className="block text-[11px] text-[#57636c]">Available date</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <span className="text-[12px] text-[#57636c]">{expanded ? "Hide" : "Details"}</span>
                      <ChevronDownIcon className={`h-4 w-4 text-[#8b8b8b] transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                {expanded ? (
                  <div className="border-t border-black/5 px-4 py-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {[
                        ["Order amount", record.payout?.gross_incl || 0],
                        ["Payout due", record.payout?.remaining_due_incl || record.payout?.net_due_incl || 0],
                        ["Marketplace fee", record.payout?.success_fee_incl || 0],
                        ["Available date", record.availableDate ? formatTime(record.availableDate) : "Awaiting update"],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{label}</p>
                          <p className="mt-1 text-[13px] font-semibold text-[#202020]">
                            {typeof value === "number" ? formatMoney(value) : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-3 py-3 text-[12px] text-[#57636c]">
                      <p className="font-semibold text-[#202020]">Why this status?</p>
                      <p className="mt-1">
                        {record.payoutState === "On hold"
                          ? holdReasonSummary || "Funds are still in the hold period before payout."
                          : record.payoutState === "Processing"
                            ? "This payout is currently being processed."
                            : record.payoutState === "Paid"
                              ? `Paid out ${formatTime(record.payout?.releasedAt || record.updatedAt || "") || "recently"}.`
                              : "These funds are eligible and will be included in the next automatic Stripe payout run."}
                      </p>
                    </div>
                  </div>
                ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-10 text-[13px] text-[#57636c]">
            No settlements recorded yet.
          </div>
        )}
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="border-b border-black/5 px-4 py-3">
          <p className="text-[12px] font-semibold text-[#202020]">Payout history</p>
          <p className="mt-1 text-[12px] text-[#57636c]">Completed payouts are listed here once funds have been released.</p>
        </div>
        {paidSettlements.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-black/5 bg-[rgba(32,32,32,0.02)] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Paid date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paidSettlements.map((record) => (
                  <tr key={`paid-${record.settlementId}`} className="border-b border-black/5 last:border-b-0">
                    <td className="px-4 py-3 text-[13px] font-semibold text-[#202020]">Order {record.orderNumber || record.orderId || "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-[#57636c]">{formatTime(record.payout?.releasedAt || record.updatedAt || "") || "Not available"}</td>
                    <td className="px-4 py-3 text-[13px] text-[#57636c]">{record.payout?.releaseReference || "—"}</td>
                    <td className="px-4 py-3 text-[13px] font-semibold text-[#202020]">{formatMoney(record.payout?.released_incl || record.payout?.net_due_incl || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-[13px] text-[#57636c]">No completed payouts yet.</div>
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

      <AppSnackbar notice={message} />
    </section>
  );
}
