// @ts-nocheck
import { getAdminDb } from "@/lib/firebase/admin";
import { createStripeOutboundPayment, getStripeOutboundPayment } from "@/lib/seller/stripe-global-payouts";

const PAYOUT_BATCH_COLLECTION = "seller_payout_batches_v1";
const SETTLEMENT_COLLECTION = "seller_settlements_v1";

const nowIso = () => new Date().toISOString();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getStripeFinancialAccountId() {
  return toStr(process.env.STRIPE_GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID || "");
}

function mapSettlementStateFromBatch(batchStatus) {
  const normalized = toStr(batchStatus).toLowerCase();
  if (normalized === "paid") {
    return { status: "paid", payoutStatus: "paid" };
  }
  if (normalized === "submission_failed") {
    return { status: "held", payoutStatus: "held" };
  }
  return { status: "processing_payout", payoutStatus: "submitted" };
}

async function updateLinkedSettlements(db, settlementIds, nextPayout, batchStatus) {
  const updatedAt = nowIso();
  const linkedState = mapSettlementStateFromBatch(batchStatus || nextPayout?.batchStatus || nextPayout?.status);

  for (const settlementId of settlementIds) {
    const id = toStr(settlementId);
    if (!id) continue;
    const settlementRef = db.collection(SETTLEMENT_COLLECTION).doc(id);
    const settlementSnap = await settlementRef.get();
    const existing = settlementSnap.exists ? settlementSnap.data() || {} : {};
    await settlementRef.set(
      {
        status: linkedState.status,
        payout: {
          ...(existing?.payout || {}),
          ...nextPayout,
          status: linkedState.payoutStatus,
        },
        updatedAt,
        lastSyncedAt: updatedAt,
      },
      { merge: true },
    );
  }
}

function mapStripeProviderStatus(value) {
  const normalized = toStr(value).toLowerCase();
  if (["posted", "paid", "completed", "succeeded"].includes(normalized)) {
    return "paid";
  }
  if (["failed", "returned", "canceled", "rejected"].includes(normalized)) {
    return "submission_failed";
  }
  return "submitted";
}

async function markBatchAwaitingConfig(db, batchRef, batch, reason, message) {
  const updatedAt = nowIso();
  await batchRef.set(
    {
      status: "awaiting_provider_config",
      updatedAt,
      provider: "stripe_global_payouts",
      providerResponse: {
        ok: false,
        reason,
        message,
      },
    },
    { merge: true },
  );
  await updateLinkedSettlements(
    db,
    batch?.settlementIds || [],
    {
      batchId: batch.batchId,
      batchStatus: "awaiting_provider_config",
    },
    "submission_failed",
  );
  return { batchId: batch.batchId, status: "awaiting_provider_config" };
}

async function submitSinglePendingBatch(db, batchRef, batch) {
  const financialAccountId = getStripeFinancialAccountId();
  if (!financialAccountId) {
    return markBatchAwaitingConfig(
      db,
      batchRef,
      batch,
      "missing_stripe_financial_account",
      "STRIPE_GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID is not configured.",
    );
  }

  const stripeRecipientAccountId = toStr(batch?.bankProfile?.stripeRecipientAccountId);
  if (!stripeRecipientAccountId) {
    return markBatchAwaitingConfig(
      db,
      batchRef,
      batch,
      "missing_stripe_recipient",
      "Seller payout profile has not completed Stripe payout onboarding yet.",
    );
  }

  const amountMinor = Math.round(toNum(batch?.netDueIncl, 0) * 100);
  if (amountMinor <= 0) {
    return markBatchAwaitingConfig(
      db,
      batchRef,
      batch,
      "invalid_batch_amount",
      "Stripe payout amount must be greater than zero.",
    );
  }

  try {
    const payload = await createStripeOutboundPayment({
      financialAccountId,
      recipientAccountId: stripeRecipientAccountId,
      amountMinor,
      currency: toStr(batch?.currency || "ZAR"),
      description: `Piessang seller payout ${toStr(batch?.batchId)}`,
      metadata: {
        batch_id: toStr(batch?.batchId),
        seller_slug: toStr(batch?.seller?.sellerSlug),
        seller_code: toStr(batch?.seller?.sellerCode),
      },
    });

    const providerPayoutId = toStr(payload?.id || "");
    const providerStatus = toStr(payload?.status || "submitted");
    const batchStatus = mapStripeProviderStatus(providerStatus);
    const updatedAt = nowIso();

    await batchRef.set(
      {
        status: batchStatus,
        updatedAt,
        provider: "stripe_global_payouts",
        providerBatchReference: providerPayoutId,
        providerPayoutId,
        providerStatus,
        submittedAt: updatedAt,
        providerResponse: {
          ok: true,
          payload,
        },
      },
      { merge: true },
    );

    await updateLinkedSettlements(
      db,
      batch?.settlementIds || [],
      {
        batchId: batch.batchId,
        batchStatus,
        providerPayoutId,
        providerStatus,
        stripeRecipientAccountId,
      },
      batchStatus,
    );

    return { batchId: batch.batchId, status: batchStatus, providerPayoutId, providerStatus };
  } catch (error) {
    const updatedAt = nowIso();
    await batchRef.set(
      {
        status: "submission_failed",
        updatedAt,
        provider: "stripe_global_payouts",
        providerResponse: {
          ok: false,
          payload: error?.payload || null,
          message: error?.message || "Unable to submit Stripe payout batch.",
        },
      },
      { merge: true },
    );
    await updateLinkedSettlements(
      db,
      batch?.settlementIds || [],
      {
        batchId: batch.batchId,
        batchStatus: "submission_failed",
      },
      "submission_failed",
    );
    return { batchId: batch.batchId, status: "submission_failed", error: error?.message || "Unable to submit Stripe payout." };
  }
}

async function reconcileSubmittedBatch(db, batchRef, batch) {
  const providerPayoutId = toStr(batch?.providerPayoutId || batch?.providerBatchReference);
  if (!providerPayoutId) {
    return { batchId: batch.batchId, status: toStr(batch?.status || "submitted") };
  }

  try {
    const payload = await getStripeOutboundPayment(providerPayoutId);
    const providerStatus = toStr(payload?.status || batch?.providerStatus || "submitted");
    const batchStatus = mapStripeProviderStatus(providerStatus);
    const updatedAt = nowIso();

    await batchRef.set(
      {
        status: batchStatus,
        updatedAt,
        provider: "stripe_global_payouts",
        providerStatus,
        paidAt: batchStatus === "paid" ? updatedAt : batch?.paidAt || null,
        providerResponse: {
          ok: true,
          payload,
        },
      },
      { merge: true },
    );

    await updateLinkedSettlements(
      db,
      batch?.settlementIds || [],
      {
        batchId: batch.batchId,
        batchStatus,
        providerPayoutId,
        providerStatus,
        stripeRecipientAccountId: toStr(batch?.bankProfile?.stripeRecipientAccountId),
      },
      batchStatus,
    );

    return { batchId: batch.batchId, status: batchStatus, providerPayoutId, providerStatus };
  } catch (error) {
    return {
      batchId: batch.batchId,
      status: toStr(batch?.status || "submitted"),
      error: error?.message || "Unable to reconcile Stripe payout batch.",
    };
  }
}

export async function submitPendingStripePayoutBatches() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const snap = await db.collection(PAYOUT_BATCH_COLLECTION).get();
  const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
  const actionable = rows.filter((row) => {
    const provider = toStr(row?.provider || "");
    const status = toStr(row?.status).toLowerCase();
    return provider === "stripe_global_payouts" && (status === "pending_submission" || status === "submitted");
  });

  const results = [];
  for (const batch of actionable) {
    const batchRef = db.collection(PAYOUT_BATCH_COLLECTION).doc(batch.id);
    if (toStr(batch?.status).toLowerCase() === "submitted") {
      results.push(await reconcileSubmittedBatch(db, batchRef, batch));
    } else {
      results.push(await submitSinglePendingBatch(db, batchRef, batch));
    }
  }

  return {
    ok: true,
    processed: results.length,
    results,
  };
}
