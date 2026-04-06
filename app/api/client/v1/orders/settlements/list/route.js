export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { canAccessSellerSettlement, getPrimarySellerSettlementIdentifier, isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

const COLLECTION = "seller_settlements_v1";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeFilter(value) {
  const normalized = toStr(value, "all").toLowerCase();
  if (["all", "pending_review", "ready_for_payout", "processing_payout", "paid", "blocked", "cancelled", "held", "late", "review_queue", "payouts"].includes(normalized)) {
    return normalized;
  }
  return "all";
}

function normalizeScope(value) {
  const normalized = toStr(value, "seller").toLowerCase();
  return normalized === "all" ? "all" : "seller";
}

function normalizeSettlement(docSnap) {
  const data = docSnap.data() || {};
  const payout = data?.payout && typeof data.payout === "object" ? data.payout : {};
  const fulfilment = data?.fulfilment && typeof data.fulfilment === "object" ? data.fulfilment : {};
  const accountability = data?.accountability && typeof data.accountability === "object" ? data.accountability : {};
  const lines = Array.isArray(data?.lines) ? data.lines : [];

  return {
    settlementId: toStr(data.settlementId || docSnap.id),
    orderId: toStr(data.orderId || ""),
    orderNumber: toStr(data.orderNumber || ""),
    merchantTransactionId: toStr(data.merchantTransactionId || ""),
    sellerUid: toStr(data.sellerUid || ""),
    sellerCode: toStr(data.sellerCode || ""),
    sellerSlug: toStr(data.sellerSlug || ""),
    vendorName: toStr(data.vendorName || ""),
    status: toStr(data.status || "held").toLowerCase(),
    orderStatus: toStr(data.orderStatus || "").toLowerCase() || null,
    paymentStatus: toStr(data.paymentStatus || "").toLowerCase() || null,
    fulfilment: {
      mode: toStr(fulfilment.mode || "seller").toLowerCase() || "seller",
      status: toStr(fulfilment.status || "").toLowerCase() || null,
      claimStatus: toStr(fulfilment.claimStatus || "").toLowerCase() || null,
      reviewStatus: toStr(fulfilment.reviewStatus || "").toLowerCase() || null,
      reviewFeedback: toStr(fulfilment.reviewFeedback || ""),
      claimedAt: toStr(fulfilment.claimedAt || ""),
      claimedBy: toStr(fulfilment.claimedBy || ""),
      reviewedAt: toStr(fulfilment.reviewedAt || ""),
      reviewedBy: toStr(fulfilment.reviewedBy || ""),
      trackingNumber: toStr(fulfilment.trackingNumber || ""),
      courierName: toStr(fulfilment.courierName || ""),
      proofUrl: toStr(fulfilment.proofUrl || ""),
      expectedFulfilmentBy: toStr(fulfilment.expectedFulfilmentBy || ""),
      late: Boolean(fulfilment.late === true),
    },
    payout: {
      currency: toStr(payout.currency || "ZAR"),
      gross_incl: toNum(payout.gross_incl || 0),
      success_fee_incl: toNum(payout.success_fee_incl || 0),
      fulfilment_fee_incl: toNum(payout.fulfilment_fee_incl || 0),
      handling_fee_incl: toNum(payout.handling_fee_incl || 0),
      storage_accrued_incl: toNum(payout.storage_accrued_incl || 0),
      net_due_incl: toNum(payout.net_due_incl || 0),
      released_incl: toNum(payout.released_incl || 0),
      remaining_due_incl: toNum(payout.remaining_due_incl || 0),
      status: toStr(payout.status || "held").toLowerCase() || "held",
      eligible_at: toStr(payout.eligible_at || ""),
      delivered_at: toStr(payout.delivered_at || ""),
      hold_reason: toStr(payout.hold_reason || ""),
      hold_days: toNum(payout.hold_days || 0),
      bank_profile: payout.bank_profile && typeof payout.bank_profile === "object" ? payout.bank_profile : {},
      batchId: toStr(payout.batchId || ""),
      batchStatus: toStr(payout.batchStatus || "").toLowerCase() || "",
      releaseReference: toStr(payout.releaseReference || ""),
      releasedAt: toStr(payout.releasedAt || ""),
      releasedBy: toStr(payout.releasedBy || ""),
    },
    adjustments: {
      refunded_incl: 0,
      credit_note_count: 0,
      credit_notes: [],
    },
    accountability: {
      late: Boolean(accountability.late === true),
      strikeReasonCode: toStr(accountability.strikeReasonCode || ""),
      strikeReasonMessage: toStr(accountability.strikeReasonMessage || ""),
    },
    lines: lines.map((line, index) => ({
      lineId: toStr(line?.lineId || line?.variantId || line?.productUniqueId || `${index + 1}`),
      title: toStr(line?.title || "Item"),
      sku: toStr(line?.sku || ""),
      quantity: Math.max(0, Math.trunc(Number(line?.quantity || 0))),
      lineTotalIncl: toNum(line?.lineTotalIncl || 0),
      successFeePercent: toNum(line?.successFeePercent || 0),
      successFeeIncl: toNum(line?.successFeeIncl || 0),
      fulfilmentFeeIncl: toNum(line?.fulfilmentFeeIncl || 0),
      handlingFeeIncl: toNum(line?.handlingFeeIncl || 0),
      storageAccruedIncl: toNum(line?.storageAccruedIncl || 0),
      payoutDueIncl: toNum(line?.payoutDueIncl || 0),
      fulfilmentMode: toStr(line?.fulfilmentMode || "seller").toLowerCase() || "seller",
      sizeBand: toStr(line?.sizeBand || ""),
      weightBand: toStr(line?.weightBand || ""),
      storageBand: toStr(line?.storageBand || ""),
      expectedFulfilmentBy: toStr(line?.expectedFulfilmentBy || ""),
      late: Boolean(line?.late === true),
    })),
    createdAt: toStr(data.createdAt || ""),
    updatedAt: toStr(data.updatedAt || ""),
    lastSyncedAt: toStr(data.lastSyncedAt || ""),
    lineCount: lines.length,
  };
}

async function attachSettlementAdjustments(db, record) {
  const orderId = toStr(record?.orderId);
  if (!orderId) return record;
  const orderSnap = await db.collection("orders_v2").doc(orderId).get();
  if (!orderSnap.exists) return record;
  const order = orderSnap.data() || {};
  const notesMap =
    order?.credit_notes?.seller_notes && typeof order.credit_notes.seller_notes === "object"
      ? order.credit_notes.seller_notes
      : {};
  const sellerCode = toStr(record?.sellerCode).toLowerCase();
  const sellerSlug = toStr(record?.sellerSlug).toLowerCase();
  const notes = Object.values(notesMap)
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => {
      const entryCode = toStr(entry?.sellerCode).toLowerCase();
      const entrySlug = toStr(entry?.sellerSlug).toLowerCase();
      return Boolean((sellerCode && entryCode === sellerCode) || (sellerSlug && entrySlug === sellerSlug));
    })
    .map((entry) => ({
      creditNoteId: toStr(entry?.creditNoteId || entry?.docId),
      creditNoteNumber: toStr(entry?.creditNoteNumber),
      amountIncl: toNum(entry?.amountIncl || 0),
      issuedAt: toStr(entry?.issuedAt || entry?.createdAt || ""),
      status: toStr(entry?.status || "issued").toLowerCase() || "issued",
    }))
    .sort((left, right) => toStr(right.issuedAt).localeCompare(toStr(left.issuedAt)));

  return {
    ...record,
    adjustments: {
      refunded_incl: toNum(notes.reduce((sum, entry) => sum + toNum(entry.amountIncl || 0), 0)),
      credit_note_count: notes.length,
      credit_notes: notes,
    },
  };
}

function matchesFilter(record, filter) {
  const status = toStr(record?.status || "").toLowerCase();
  const payoutStatus = toStr(record?.payout?.status || "").toLowerCase();
  const reviewStatus = toStr(record?.fulfilment?.reviewStatus || "").toLowerCase();
  const late = Boolean(record?.accountability?.late === true || record?.fulfilment?.late === true);

  switch (filter) {
    case "pending_review":
    case "review_queue":
      return status === "pending_review" || reviewStatus === "pending_review";
    case "ready_for_payout":
      return status === "ready_for_payout" || payoutStatus === "ready_for_payout";
    case "processing_payout":
      return status === "processing_payout" || ["pending_submission", "submitted", "in_transit"].includes(payoutStatus);
    case "payouts":
      return ["ready_for_payout", "processing_payout", "paid"].includes(status) || ["ready_for_payout", "pending_submission", "submitted", "paid"].includes(payoutStatus);
    case "paid":
      return status === "paid" || payoutStatus === "paid";
    case "blocked":
      return status === "blocked";
    case "cancelled":
      return status === "cancelled";
    case "held":
      return status === "held";
    case "late":
      return late;
    default:
      return true;
  }
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const { searchParams } = new URL(req.url);
    const uid = toStr(searchParams.get("uid"));
    const filter = normalizeFilter(searchParams.get("filter"));
    const scope = normalizeScope(searchParams.get("scope"));
    const sellerSlug = toStr(searchParams.get("sellerSlug"));
    const sellerCode = toStr(searchParams.get("sellerCode"));

    if (!uid) return err(400, "Missing UID", "uid is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    const systemAdmin = isSystemAdminUser(requester);

    const fallbackSellerIdentifier = getPrimarySellerSettlementIdentifier(requester);
    const targetSellerSlug = sellerSlug || (!systemAdmin ? fallbackSellerIdentifier : "");
    const targetSellerCode = sellerCode || "";

    if (!systemAdmin && !canAccessSellerSettlement(requester, targetSellerSlug, targetSellerCode)) {
      return err(403, "Access Denied", "You do not have access to this seller settlement data.");
    }

    const settlementsSnap = await db.collection(COLLECTION).get();
    const scopedSettlements = [];
    const settlements = [];

    for (const docSnap of settlementsSnap.docs) {
      let record = normalizeSettlement(docSnap);
      const sellerMatch =
        scope === "all" && systemAdmin
          ? true
          : Boolean(
              (targetSellerCode && toStr(record.sellerCode).toLowerCase() === targetSellerCode.toLowerCase()) ||
                (targetSellerSlug && toStr(record.sellerSlug).toLowerCase() === targetSellerSlug.toLowerCase()),
            );

      if (!sellerMatch) continue;
      record = await attachSettlementAdjustments(db, record);
      scopedSettlements.push(record);
      if (!matchesFilter(record, filter)) continue;
      settlements.push(record);
    }

    const counts = scopedSettlements.reduce(
      (acc, item) => {
        acc.total += 1;
        const status = toStr(item?.status || "").toLowerCase();
        const payoutStatus = toStr(item?.payout?.status || "").toLowerCase();
        const reviewStatus = toStr(item?.fulfilment?.reviewStatus || "").toLowerCase();
        if (status === "pending_review" || reviewStatus === "pending_review") acc.pendingReview += 1;
        if (status === "ready_for_payout" || payoutStatus === "ready_for_payout") acc.readyForPayout += 1;
        if (status === "processing_payout" || ["pending_submission", "submitted", "in_transit"].includes(payoutStatus)) acc.processingPayout += 1;
        if (status === "paid" || payoutStatus === "paid") acc.paid += 1;
        if (status === "blocked") acc.blocked += 1;
        if (status === "cancelled") acc.cancelled += 1;
        if (item?.accountability?.late === true || item?.fulfilment?.late === true) acc.late += 1;
        return acc;
      },
      { total: 0, pendingReview: 0, readyForPayout: 0, processingPayout: 0, paid: 0, blocked: 0, cancelled: 0, late: 0 },
    );

    settlements.sort((left, right) => {
      const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });

    return ok({
      filter,
      scope: systemAdmin && scope === "all" ? "all" : "seller",
      sellerSlug: targetSellerSlug || null,
      sellerCode: targetSellerCode || null,
      settlements,
      counts,
    });
  } catch (e) {
    console.error("seller settlements list failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller settlements.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
