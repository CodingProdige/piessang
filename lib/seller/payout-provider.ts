// @ts-nocheck
import { getAdminDb } from "@/lib/firebase/admin";
import { PEACH_LIVE_PAYOUT_COUNTRIES, PEACH_LIVE_PAYOUT_CURRENCIES } from "@/lib/seller/payout-config";

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

function buildPeachBatchPayload(batch) {
  return {
    batchId: batch?.batchId,
    currency: toStr(batch?.currency || "ZAR"),
    amount: Number(toNum(batch?.netDueIncl, 0).toFixed(2)),
    beneficiary: {
      accountHolderName: toStr(batch?.bankProfile?.accountHolderName),
      bankName: toStr(batch?.bankProfile?.bankName),
      bankCountry: toStr(batch?.bankProfile?.bankCountry),
      accountType: toStr(batch?.bankProfile?.accountType),
      accountNumber: toStr(batch?.bankProfile?.accountLast4 ? "" : batch?.bankProfile?.accountNumber),
      branchCode: toStr(batch?.bankProfile?.branchCode),
      iban: toStr(batch?.bankProfile?.iban),
      swiftBic: toStr(batch?.bankProfile?.swiftBic),
      routingNumber: toStr(batch?.bankProfile?.routingNumber),
      beneficiaryReference: toStr(batch?.bankProfile?.beneficiaryReference),
    },
    seller: {
      sellerUid: toStr(batch?.seller?.sellerUid),
      sellerCode: toStr(batch?.seller?.sellerCode),
      sellerSlug: toStr(batch?.seller?.sellerSlug),
      vendorName: toStr(batch?.seller?.vendorName),
    },
    settlementIds: Array.isArray(batch?.settlementIds) ? batch.settlementIds : [],
  };
}

async function updateLinkedSettlements(db, settlementIds, nextPayout) {
  const updatedAt = nowIso();
  for (const settlementId of settlementIds) {
    if (!toStr(settlementId)) continue;
    const settlementRef = db.collection(SETTLEMENT_COLLECTION).doc(settlementId);
    const settlementSnap = await settlementRef.get();
    const existing = settlementSnap.exists ? settlementSnap.data() || {} : {};
    await settlementRef.set(
      {
        status: nextPayout.status === "paid" ? "paid" : nextPayout.status === "submitted" ? "processing_payout" : "held",
        payout: {
          ...(existing?.payout || {}),
          ...nextPayout,
        },
        updatedAt,
        lastSyncedAt: updatedAt,
      },
      { merge: true },
    );
  }
}

export async function submitPendingPeachPayoutBatches() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const baseUrl = toStr(process.env.PEACH_PAYOUTS_BASE_URL);
  const accessToken = toStr(process.env.PEACH_PAYOUTS_ACCESS_TOKEN);
  const endpointPath = toStr(process.env.PEACH_PAYOUTS_ENDPOINT || "/payouts");

  const snap = await db.collection(PAYOUT_BATCH_COLLECTION).where("provider", "==", "peach_payouts").get();
  const pendingBatches = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((row) => toStr(row?.status).toLowerCase() === "pending_submission");

  const results = [];

  for (const batch of pendingBatches) {
    const batchRef = db.collection(PAYOUT_BATCH_COLLECTION).doc(batch.id);
    const bankCountry = toStr(batch?.bankProfile?.bankCountry || batch?.seller?.country || "").toUpperCase();
    const currency = toStr(batch?.currency || "").toUpperCase();
    const supportedByPeach = PEACH_LIVE_PAYOUT_COUNTRIES.has(bankCountry) && PEACH_LIVE_PAYOUT_CURRENCIES.has(currency);

    if (!supportedByPeach) {
      const updatedAt = nowIso();
      await batchRef.set(
        {
          status: "awaiting_manual_payout",
          updatedAt,
          providerResponse: {
            ok: false,
            reason: "unsupported_country_or_currency",
            message: "This payout batch is not currently supported by the live Peach payout network.",
          },
        },
        { merge: true },
      );
      await updateLinkedSettlements(db, batch?.settlementIds || [], {
        ...(batch?.bankProfile || {}),
        status: "held",
        batchId: batch.batchId,
        batchStatus: "awaiting_manual_payout",
      });
      results.push({ batchId: batch.batchId, status: "awaiting_manual_payout" });
      continue;
    }

    if (!baseUrl || !accessToken) {
      const updatedAt = nowIso();
      await batchRef.set(
        {
          status: "awaiting_provider_config",
          updatedAt,
          providerResponse: {
            ok: false,
            reason: "missing_provider_config",
            message: "Peach payout credentials are not configured.",
          },
        },
        { merge: true },
      );
      results.push({ batchId: batch.batchId, status: "awaiting_provider_config" });
      continue;
    }

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildPeachBatchPayload(batch)),
    });

    const payload = await response.json().catch(() => ({}));
    const updatedAt = nowIso();

    if (!response.ok) {
      await batchRef.set(
        {
          status: "submission_failed",
          updatedAt,
          providerResponse: {
            ok: false,
            status: response.status,
            payload,
          },
        },
        { merge: true },
      );
      results.push({ batchId: batch.batchId, status: "submission_failed" });
      continue;
    }

    await batchRef.set(
      {
        status: "submitted",
        updatedAt,
        providerBatchReference: toStr(payload?.id || payload?.batchId || payload?.reference || ""),
        providerResponse: {
          ok: true,
          payload,
        },
      },
      { merge: true },
    );

    await updateLinkedSettlements(db, batch?.settlementIds || [], {
      status: "submitted",
      batchId: batch.batchId,
      batchStatus: "submitted",
    });

    results.push({ batchId: batch.batchId, status: "submitted" });
  }

  return {
    ok: true,
    processed: results.length,
    results,
  };
}
