import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

try {
  process.loadEnvFile?.(".env.local");
  process.loadEnvFile?.(".env");
} catch {}

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function parseArgs(argv) {
  const args = { limit: 100, fix: false, seller: "" };
  for (const raw of argv.slice(2)) {
    if (raw === "--fix") args.fix = true;
    else if (raw.startsWith("--limit=")) args.limit = Math.max(1, Number(raw.split("=")[1]) || 100);
    else if (raw.startsWith("--seller=")) args.seller = toStr(raw.split("=")[1]);
  }
  return args;
}

function getAdminServices() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw =
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const databaseId =
    process.env.PIESSANG_FIREBASE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_DATABASE_ID;

  if (!projectId || !clientEmail || !privateKeyRaw || !databaseId) {
    throw new Error("Missing Firebase admin env for financial reconciliation.");
  }

  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;

  const app =
    getApps()[0] ||
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

  return { db: getFirestore(app, String(databaseId).trim()) };
}

function computeExpectedSettlementStatus(orderStatus, paymentStatus) {
  const normalizedOrderStatus = toLower(orderStatus);
  const normalizedPaymentStatus = toLower(paymentStatus);
  if (normalizedOrderStatus === "cancelled" || ["refunded", "partial_refund"].includes(normalizedPaymentStatus)) {
    return "cancelled";
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const { db } = getAdminServices();
  const ordersSnap = await db.collection("orders_v2").limit(args.limit).get();

  const results = [];
  let inspectedOrders = 0;
  let mismatchedOrders = 0;
  let fixedSettlements = 0;

  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data() || {};
    const orderStatus = toLower(order?.order?.status?.order || order?.lifecycle?.orderStatus);
    const paymentStatus = toLower(order?.payment?.status || order?.order?.status?.payment || order?.lifecycle?.paymentStatus);
    const expectedSettlementStatus = computeExpectedSettlementStatus(orderStatus, paymentStatus);
    if (!expectedSettlementStatus) continue;

    if (args.seller) {
      const sellerNeedle = toLower(args.seller);
      const sellerMatch = (Array.isArray(order?.seller_slices) ? order.seller_slices : []).some((slice) => {
        return [slice?.sellerCode, slice?.sellerSlug, slice?.vendorName].some((value) => toLower(value) === sellerNeedle);
      });
      if (!sellerMatch) continue;
    }

    inspectedOrders += 1;
    const settlementsSummary = Array.isArray(order?.settlements?.items) ? order.settlements.items : [];

    for (const summary of settlementsSummary) {
      const settlementId = toStr(summary?.settlementId);
      if (!settlementId) continue;
      const settlementRef = db.collection("seller_settlements_v1").doc(settlementId);
      const settlementSnap = await settlementRef.get();
      if (!settlementSnap.exists) {
        mismatchedOrders += 1;
        results.push({
          orderId: orderDoc.id,
          orderNumber: toStr(order?.order?.orderNumber || ""),
          settlementId,
          issue: "missing_settlement",
          expectedSettlementStatus,
        });
        continue;
      }

      const settlement = settlementSnap.data() || {};
      const actualStatus = toLower(settlement?.status);
      if (actualStatus === expectedSettlementStatus) continue;

      mismatchedOrders += 1;
      results.push({
        orderId: orderDoc.id,
        orderNumber: toStr(order?.order?.orderNumber || ""),
        settlementId,
        actualStatus,
        expectedSettlementStatus,
        sellerCode: toStr(settlement?.sellerCode || ""),
        sellerSlug: toStr(settlement?.sellerSlug || ""),
      });

      if (args.fix) {
        await settlementRef.set(
          {
            status: expectedSettlementStatus,
            orderStatus,
            paymentStatus,
            updatedAt: new Date().toISOString(),
            payout: {
              ...(settlement?.payout && typeof settlement.payout === "object" ? settlement.payout : {}),
              status: expectedSettlementStatus,
              net_due_incl: 0,
              remaining_due_incl: 0,
              released_incl: 0,
              hold_reason: "cancelled",
            },
          },
          { merge: true },
        );
        fixedSettlements += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        inspectedOrders,
        mismatchedOrders,
        fixedSettlements,
        sample: results.slice(0, 25),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
