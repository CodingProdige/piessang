// @ts-nocheck
import { getAdminDb } from "@/lib/firebase/admin";
import { createWisePayoutForBatch, getWisePayoutStatusForBatch } from "@/lib/seller/wise-payouts";

const PAYOUT_BATCH_COLLECTION = "seller_payout_batches_v1";
const SETTLEMENT_COLLECTION = "seller_settlements_v1";

const nowIso = () => new Date().toISOString();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
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

async function markBatchAwaitingConfig(db, batchRef, batch, reason, message) {
  const updatedAt = nowIso();
  await batchRef.set(
    {
      status: "awaiting_provider_config",
      updatedAt,
      provider: "wise",
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
  const wiseRecipientId = toStr(batch?.bankProfile?.wiseRecipientId);
  if (!wiseRecipientId) {
    return markBatchAwaitingConfig(
      db,
      batchRef,
      batch,
      "missing_wise_recipient",
      "Seller payout profile has not completed Wise recipient setup yet.",
    );
  }

  try {
    const payload = await createWisePayoutForBatch(batch);
    const providerPayoutId = toStr(payload?.transferId || "");
    const providerStatus = toStr(payload?.providerStatus || "submitted");
    const batchStatus = toStr(payload?.batchStatus || "submitted");
    const updatedAt = nowIso();

    await batchRef.set(
      {
        status: batchStatus,
        updatedAt,
        provider: "wise",
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
        wiseRecipientId,
      },
      batchStatus,
    );

    return { batchId: batch.batchId, status: batchStatus, providerPayoutId, providerStatus };
  } catch (error) {
    const updatedAt = nowIso();
    const reason = toStr(error?.reason || "");
    const status = reason ? "awaiting_provider_config" : "submission_failed";
    await batchRef.set(
      {
        status,
        updatedAt,
        provider: "wise",
        providerResponse: {
          ok: false,
          reason,
          payload: error?.payload || null,
          message: error?.message || "Unable to submit Wise payout batch.",
        },
      },
      { merge: true },
    );
    await updateLinkedSettlements(
      db,
      batch?.settlementIds || [],
      {
        batchId: batch.batchId,
        batchStatus: status,
      },
      "submission_failed",
    );
    return { batchId: batch.batchId, status, error: error?.message || "Unable to submit Wise payout." };
  }
}

async function reconcileSubmittedBatch(db, batchRef, batch) {
  const providerPayoutId = toStr(batch?.providerPayoutId || batch?.providerBatchReference);
  if (!providerPayoutId) {
    return { batchId: batch.batchId, status: toStr(batch?.status || "submitted") };
  }

  try {
    const payload = await getWisePayoutStatusForBatch(providerPayoutId);
    const providerStatus = toStr(payload?.providerStatus || batch?.providerStatus || "submitted");
    const batchStatus = toStr(payload?.batchStatus || "submitted");
    const updatedAt = nowIso();

    await batchRef.set(
      {
        status: batchStatus,
        updatedAt,
        provider: "wise",
        providerStatus,
        paidAt: batchStatus === "paid" ? updatedAt : batch?.paidAt || null,
        providerResponse: {
          ok: true,
          payload: payload?.payload || null,
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
        wiseRecipientId: toStr(batch?.bankProfile?.wiseRecipientId),
      },
      batchStatus,
    );

    return { batchId: batch.batchId, status: batchStatus, providerPayoutId, providerStatus };
  } catch (error) {
    return {
      batchId: batch.batchId,
      status: toStr(batch?.status || "submitted"),
      error: error?.message || "Unable to reconcile Wise payout batch.",
    };
  }
}

export async function submitPendingWisePayoutBatches() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const snap = await db.collection(PAYOUT_BATCH_COLLECTION).get();
  const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
  const actionable = rows.filter((row) => {
    const provider = toStr(row?.provider || "wise");
    const status = toStr(row?.status).toLowerCase();
    return provider === "wise" && (status === "pending_submission" || status === "submitted");
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
