// @ts-nocheck
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeMoneyAmount } from "@/lib/money";

const SETTLEMENT_COLLECTION = "seller_settlements_v1";
const PAYOUT_BATCH_COLLECTION = "seller_payout_batches_v1";

const nowIso = () => new Date().toISOString();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function r2(value) {
  return normalizeMoneyAmount(Number(value) || 0);
}

function groupBySeller(settlements) {
  const groups = new Map();
  for (const settlement of settlements) {
    const sellerKey =
      toStr(settlement?.sellerUid) ||
      toStr(settlement?.sellerCode) ||
      toStr(settlement?.sellerSlug) ||
      toStr(settlement?.vendorName) ||
      toStr(settlement?.settlementId);
    if (!sellerKey) continue;

    const group = groups.get(sellerKey) || {
      sellerKey,
      sellerUid: toStr(settlement?.sellerUid) || null,
      sellerCode: toStr(settlement?.sellerCode) || null,
      sellerSlug: toStr(settlement?.sellerSlug) || null,
      vendorName: toStr(settlement?.vendorName) || null,
      bankProfile: settlement?.payout?.bank_profile || {},
      settlements: [],
      totals: {
        netDueIncl: 0,
        grossIncl: 0,
      },
    };
    group.settlements.push(settlement);
    group.totals.netDueIncl = r2(group.totals.netDueIncl + toNum(settlement?.payout?.remaining_due_incl ?? settlement?.payout?.net_due_incl, 0));
    group.totals.grossIncl = r2(group.totals.grossIncl + toNum(settlement?.payout?.gross_incl, 0));
    groups.set(sellerKey, group);
  }
  return Array.from(groups.values());
}

export async function createPendingSellerPayoutBatches({ createdBy = "system", provider = "stripe_global_payouts" } = {}) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  }

  const settlementsSnap = await db.collection(SETTLEMENT_COLLECTION).get();
  const eligible = settlementsSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((settlement) => {
      const status = toStr(settlement?.status).toLowerCase();
      const payoutStatus = toStr(settlement?.payout?.status).toLowerCase();
      const batchId = toStr(settlement?.payout?.batchId);
      const remaining = toNum(settlement?.payout?.remaining_due_incl ?? settlement?.payout?.net_due_incl, 0);
      const bankReady = settlement?.payout?.bank_profile?.ready === true;
      return status === "ready_for_payout" && payoutStatus === "ready_for_payout" && !batchId && remaining > 0 && bankReady;
    });

  const sellerGroups = groupBySeller(eligible);
  const created = [];
  const now = nowIso();

  for (const group of sellerGroups) {
    let sellerPayoutProfile = {};
    if (toStr(group.sellerUid)) {
      const sellerSnap = await db.collection("users").doc(group.sellerUid).get();
      if (sellerSnap.exists) {
        sellerPayoutProfile = sellerSnap.data()?.seller?.payoutProfile || {};
      }
    }

    const batchRef = db.collection(PAYOUT_BATCH_COLLECTION).doc();
    const settlementIds = group.settlements.map((row) => toStr(row?.settlementId || row?.id)).filter(Boolean);
    const batchPayload = {
      batchId: batchRef.id,
      provider,
      status: "pending_submission",
      createdAt: now,
      updatedAt: now,
      createdBy,
      seller: {
        sellerUid: group.sellerUid,
        sellerCode: group.sellerCode,
        sellerSlug: group.sellerSlug,
        vendorName: group.vendorName,
        country: toStr(sellerPayoutProfile?.bankCountry || sellerPayoutProfile?.country || ""),
      },
      bankProfile: sellerPayoutProfile && typeof sellerPayoutProfile === "object" && Object.keys(sellerPayoutProfile).length
        ? sellerPayoutProfile
        : group.bankProfile || {},
      currency: toStr(sellerPayoutProfile?.currency || group.bankProfile?.currency || "ZAR") || "ZAR",
      grossIncl: r2(group.totals.grossIncl),
      netDueIncl: r2(group.totals.netDueIncl),
      settlementIds,
      settlementCount: settlementIds.length,
      providerBatchReference: null,
      providerResponse: null,
    };

    await batchRef.set(batchPayload);

    for (const settlement of group.settlements) {
      const settlementRef = db.collection(SETTLEMENT_COLLECTION).doc(settlement.id);
      await settlementRef.set(
        {
          status: "processing_payout",
          payout: {
            ...(settlement?.payout || {}),
            status: "pending_submission",
            batchId: batchRef.id,
            batchStatus: "pending_submission",
          },
          updatedAt: now,
          lastSyncedAt: now,
        },
        { merge: true },
      );

      if (toStr(settlement?.orderId)) {
        await db.collection("orders_v2").doc(settlement.orderId).set(
          {
            settlements: {
              updatedAt: now,
            },
            timestamps: {
              updatedAt: now,
            },
          },
          { merge: true },
        );
      }
    }

    created.push(batchPayload);
  }

  await db.collection("analytics_live_commerce").doc("seller_payouts").set(
    {
      updatedAt: now,
      lastBatchRunAt: now,
      createdBatchCount: created.length,
      settlementCount: created.reduce((acc, batch) => acc + toNum(batch.settlementCount, 0), 0),
      pendingNetDueIncl: r2(created.reduce((acc, batch) => acc + toNum(batch.netDueIncl, 0), 0)),
      runCount: FieldValue.increment(1),
    },
    { merge: true },
  );

  return {
    ok: true,
    createdBatchCount: created.length,
    settlementCount: created.reduce((acc, batch) => acc + toNum(batch.settlementCount, 0), 0),
    batches: created,
  };
}
