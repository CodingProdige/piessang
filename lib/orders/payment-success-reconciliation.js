import https from "https";
import { getAdminDb } from "@/lib/firebase/admin";

const HOST = "oppwa.com";
const ACCESS_TOKEN = process.env.PEACH_S2S_ACCESS_TOKEN;
const ENTITY_ID = process.env.PEACH_S2S_ENTITY_ID;

const nowIso = () => new Date().toISOString();

function mapStatus(code = "") {
  if (!code) return "unknown";
  if (code.startsWith("000.000") || code.startsWith("000.100.1")) return "succeeded";
  if (code.startsWith("000.200.000")) return "pending";
  if (!code.startsWith("000.")) return "failed";
  return "pending";
}

function peachGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        port: 443,
        host: HOST,
        path,
        method: "GET",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(raw));
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function finalizeSuccess(originBase, redirectData) {
  const payment = redirectData?.payment && typeof redirectData.payment === "object"
    ? redirectData.payment
    : null;
  const orderId = String(redirectData?.orderId || "").trim();
  if (!originBase || !payment || !orderId) {
    return { ok: false, reason: "missing_finalize_context" };
  }

  const response = await fetch(`${originBase}/api/client/v1/orders/payment-success`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      payment,
    }),
  }).catch(() => null);

  if (!response?.ok) {
    let reason = "payment_success_failed";
    try {
      const payload = await response?.json();
      if (payload?.message) reason = String(payload.message);
    } catch {
      // Ignore parsing errors.
    }
    return { ok: false, reason };
  }

  return { ok: true };
}

async function deletePendingOrder(db, redirectData) {
  const orderId = String(redirectData?.orderId || "").trim();
  if (!orderId) return;
  const orderRef = db.collection("orders_v2").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return;
  const order = orderSnap.data() || {};
  const paymentStatus = String(order?.payment?.status || order?.order?.status?.payment || "").trim().toLowerCase();
  if (paymentStatus === "paid") return;
  await orderRef.delete().catch(() => null);
}

export async function reconcilePeachRedirectPayments({
  originBase,
  limit = 50,
  minAgeMinutes = 2,
} = {}) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Admin database is not configured.");
  }
  if (!ACCESS_TOKEN || !ENTITY_ID) {
    throw new Error("Peach credentials are not configured.");
  }

  const cutoff = Date.now() - minAgeMinutes * 60 * 1000;
  const snap = await db.collection("peach_redirects").limit(limit).get();

  const summary = {
    scanned: 0,
    finalized: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    errors: 0,
  };

  for (const doc of snap.docs) {
    summary.scanned += 1;
    const data = doc.data() || {};
    const createdAtRaw = data?.createdAt;
    const createdAtMs = createdAtRaw ? Date.parse(String(createdAtRaw)) : NaN;
    if (Number.isFinite(createdAtMs) && createdAtMs > cutoff) {
      summary.skipped += 1;
      continue;
    }

    const paymentId = String(data?.paymentId || "").trim();
    const merchantTransactionId = String(data?.merchantTransactionId || doc.id || "").trim();
    if (!paymentId || !merchantTransactionId) {
      summary.skipped += 1;
      continue;
    }

    try {
      const statusPayload = await peachGet(
        `/v1/payments/${encodeURIComponent(paymentId)}?entityId=${encodeURIComponent(ENTITY_ID)}`,
      );
      const resultCode = String(statusPayload?.result?.code || "").trim();
      const paymentStatus = mapStatus(resultCode);

      await doc.ref.set(
        {
          lastReconciledAt: nowIso(),
          lastResultCode: resultCode || null,
          lastGatewayStatus: paymentStatus,
          updatedAt: nowIso(),
        },
        { merge: true },
      );

      if (paymentStatus === "succeeded") {
        const finalize = await finalizeSuccess(originBase, data);
        if (finalize.ok) {
          summary.finalized += 1;
          await doc.ref.set(
            {
              reconciledAt: nowIso(),
              reconciledStatus: "paid",
              updatedAt: nowIso(),
            },
            { merge: true },
          );
        } else {
          summary.errors += 1;
          await doc.ref.set(
            {
              reconciledStatus: "finalize_failed",
              reconcileError: finalize.reason,
              updatedAt: nowIso(),
            },
            { merge: true },
          );
        }
        continue;
      }

      if (paymentStatus === "failed") {
        summary.failed += 1;
        await deletePendingOrder(db, data);
        await doc.ref.set(
          {
            reconciledAt: nowIso(),
            reconciledStatus: "failed",
            updatedAt: nowIso(),
          },
          { merge: true },
        );
        continue;
      }

      summary.pending += 1;
    } catch (error) {
      summary.errors += 1;
      await doc.ref.set(
        {
          lastReconciledAt: nowIso(),
          reconciledStatus: "error",
          reconcileError: error?.message || "Unknown reconciliation error",
          updatedAt: nowIso(),
        },
        { merge: true },
      ).catch(() => null);
    }
  }

  return summary;
}
