export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const COLLECTION = "seller_payout_batches_v1";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeStatus(value) {
  const normalized = toStr(value, "all").toLowerCase();
  if (
    [
      "all",
      "pending_submission",
      "awaiting_provider_config",
      "awaiting_manual_payout",
      "submission_failed",
      "submitted",
      "paid",
    ].includes(normalized)
  ) {
    return normalized;
  }
  return "all";
}

function matchesStatus(record, status) {
  if (status === "all") return true;
  return toStr(record?.status).toLowerCase() === status;
}

function buildBlockingReason(data, bankProfile) {
  const status = toStr(data?.status).toLowerCase();
  const provider = toStr(data?.provider || "stripe_global_payouts");
  const providerMessage = toStr(data?.providerResponse?.message || "");
  const providerReason = toStr(data?.providerResponse?.reason || "");
  const verificationStatus = toStr(bankProfile?.verificationStatus).toLowerCase();
  const stripeRecipientAccountId = toStr(bankProfile?.stripeRecipientAccountId || "");

  if (status === "awaiting_provider_config") {
    if (providerReason === "missing_stripe_financial_account") {
      return "Stripe financial account is not configured on Piessang yet.";
    }
    if (providerReason === "missing_stripe_recipient" || !stripeRecipientAccountId) {
      return "Stripe recipient is not connected for this seller yet.";
    }
    return providerMessage || "This payout batch is missing provider setup before it can be submitted.";
  }

  if (status === "submission_failed") {
    return providerMessage || "The last payout submission failed. Review the provider response and retry when ready.";
  }

  if (status === "pending_submission") {
    if (!stripeRecipientAccountId && provider === "stripe_global_payouts") {
      return "Stripe recipient is not connected for this seller yet.";
    }
    if (verificationStatus && verificationStatus !== "verified") {
      return `Seller payout verification is ${verificationStatus.replace(/_/g, " ")}.`;
    }
  }

  return "";
}

function normalizeBatch(docSnap) {
  const data = docSnap.data() || {};
  const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
  const bankProfile = data?.bankProfile && typeof data.bankProfile === "object" ? data.bankProfile : {};

  return {
    batchId: toStr(data.batchId || docSnap.id),
    provider: toStr(data.provider || ""),
    status: toStr(data.status || "pending_submission").toLowerCase(),
    currency: toStr(data.currency || "ZAR"),
    grossIncl: toNum(data.grossIncl || 0),
    netDueIncl: toNum(data.netDueIncl || 0),
    settlementIds: Array.isArray(data.settlementIds) ? data.settlementIds.map((item) => toStr(item)).filter(Boolean) : [],
    settlementCount: Math.max(0, Math.trunc(toNum(data.settlementCount || 0))),
    providerBatchReference: toStr(data.providerBatchReference || ""),
    providerResponse: data?.providerResponse || null,
    blockingReason: buildBlockingReason(data, bankProfile),
    createdAt: toStr(data.createdAt || ""),
    updatedAt: toStr(data.updatedAt || ""),
    createdBy: toStr(data.createdBy || ""),
    seller: {
      sellerUid: toStr(seller.sellerUid || ""),
      sellerCode: toStr(seller.sellerCode || ""),
      sellerSlug: toStr(seller.sellerSlug || ""),
      vendorName: toStr(seller.vendorName || ""),
    },
    bankProfile: {
      ready: bankProfile?.ready === true,
      payoutMethod: toStr(bankProfile.payoutMethod || ""),
      verificationStatus: toStr(bankProfile.verificationStatus || ""),
      bankName: toStr(bankProfile.bankName || ""),
      bankCountry: toStr(bankProfile.bankCountry || ""),
      accountHolderName: toStr(bankProfile.accountHolderName || ""),
      currency: toStr(bankProfile.currency || data.currency || "ZAR"),
      accountLast4: toStr(bankProfile.accountLast4 || ""),
      ibanLast4: toStr(bankProfile.ibanLast4 || ""),
      stripeRecipientAccountId: toStr(bankProfile.stripeRecipientAccountId || data?.bankProfile?.stripeRecipientAccountId || ""),
    },
  };
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const { searchParams } = new URL(req.url);
    const uid = toStr(searchParams.get("uid"));
    const status = normalizeStatus(searchParams.get("status"));

    if (!uid) return err(400, "Missing UID", "uid is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only Piessang admins can view payout batches.");
    }

    const snap = await db.collection(COLLECTION).get();
    const all = snap.docs.map(normalizeBatch);
    const batches = all
      .filter((item) => matchesStatus(item, status))
      .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());

    const counts = all.reduce(
      (acc, item) => {
        acc.total += 1;
        const itemStatus = toStr(item.status).toLowerCase();
        if (itemStatus === "pending_submission") acc.pendingSubmission += 1;
        if (itemStatus === "awaiting_provider_config") acc.awaitingProviderConfig += 1;
        if (itemStatus === "awaiting_manual_payout") acc.awaitingManualPayout += 1;
        if (itemStatus === "submission_failed") acc.submissionFailed += 1;
        if (itemStatus === "submitted") acc.submitted += 1;
        if (itemStatus === "paid") acc.paid += 1;
        acc.netDueIncl += toNum(item.netDueIncl || 0);
        return acc;
      },
      {
        total: 0,
        pendingSubmission: 0,
        awaitingProviderConfig: 0,
        awaitingManualPayout: 0,
        submissionFailed: 0,
        submitted: 0,
        paid: 0,
        netDueIncl: 0,
      },
    );

    return ok({ status, batches, counts });
  } catch (e) {
    console.error("seller payout batches list failed:", e);
    return err(500, "Unexpected Error", "Unable to load payout batches.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
