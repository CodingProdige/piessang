export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { releaseSellerSettlement } from "@/lib/seller/settlements";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const BATCH_COLLECTION = "seller_payout_batches_v1";
const SETTLEMENT_COLLECTION = "seller_settlements_v1";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

const nowIso = () => new Date().toISOString();

async function setLinkedSettlements(db, settlementIds, payload) {
  const updatedAt = nowIso();
  for (const settlementId of settlementIds) {
    const id = toStr(settlementId);
    if (!id) continue;
    await db.collection(SETTLEMENT_COLLECTION).doc(id).set(
      {
        ...payload,
        updatedAt,
        lastSyncedAt: updatedAt,
      },
      { merge: true },
    );
  }
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    const batchId = toStr(body?.data?.batchId || body?.batchId);
    const action = toStr(body?.data?.action || body?.action).toLowerCase();

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!batchId) return err(400, "Missing Batch", "batchId is required.");
    if (!["mark_paid", "mark_failed", "queue_retry"].includes(action)) {
      return err(400, "Invalid Action", "Unsupported payout batch action.");
    }

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only Piessang admins can update payout batches.");
    }

    const batchRef = db.collection(BATCH_COLLECTION).doc(batchId);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists) return err(404, "Batch Not Found", "Could not find that payout batch.");
    const batch = batchSnap.data() || {};
    const settlementIds = Array.isArray(batch?.settlementIds) ? batch.settlementIds : [];
    const updatedAt = nowIso();

    if (action === "mark_paid") {
      for (const settlementId of settlementIds) {
        const settlementSnap = await db.collection(SETTLEMENT_COLLECTION).doc(toStr(settlementId)).get();
        if (!settlementSnap.exists) continue;
        const settlement = settlementSnap.data() || {};
        await releaseSellerSettlement({
          settlementId: toStr(settlement.settlementId || settlementId),
          orderId: toStr(settlement.orderId || ""),
          releasedBy: uid,
          releaseReference: toStr(batch?.providerBatchReference || batch?.batchId || ""),
          amountIncl: settlement?.payout?.remaining_due_incl ?? settlement?.payout?.net_due_incl ?? 0,
        });
      }

      await batchRef.set(
        {
          status: "paid",
          updatedAt,
          paidAt: updatedAt,
          paidBy: uid,
        },
        { merge: true },
      );

      return ok({ batchId, status: "paid" });
    }

    if (action === "mark_failed") {
      await batchRef.set(
        {
          status: "submission_failed",
          updatedAt,
          failedAt: updatedAt,
          failedBy: uid,
        },
        { merge: true },
      );

      await setLinkedSettlements(db, settlementIds, {
        status: "held",
        payout: {
          status: "held",
          batchStatus: "submission_failed",
        },
      });

      return ok({ batchId, status: "submission_failed" });
    }

    await batchRef.set(
      {
        status: "pending_submission",
        updatedAt,
        retriedAt: updatedAt,
        retriedBy: uid,
      },
      { merge: true },
    );

    await setLinkedSettlements(db, settlementIds, {
      status: "processing_payout",
      payout: {
        status: "pending_submission",
        batchStatus: "pending_submission",
      },
    });

    return ok({ batchId, status: "pending_submission" });
  } catch (e) {
    console.error("seller payout batch update failed:", e);
    return err(500, "Unexpected Error", "Unable to update payout batch.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
