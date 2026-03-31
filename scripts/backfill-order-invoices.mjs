import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizePrivateKey(value = "") {
  return String(value).replace(/\\n/g, "\n").trim();
}

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function getAdminDb() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID ||
    "";
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    "";
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  );
  const databaseId = process.env.PIESSANG_FIREBASE_DATABASE_ID || "";

  if (!projectId || !clientEmail || !privateKey || !databaseId) {
    throw new Error("Missing Firebase admin env for invoice backfill.");
  }

  const app =
    getApps().find((entry) => entry.name === "piessang-backfill") ||
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
      },
      "piessang-backfill",
    );

  return getFirestore(app, databaseId);
}

async function ensureOrderInvoice(db, orderId, generatedBy = "script_backfill") {
  const orderRef = db.collection("orders_v2").doc(orderId);
  const counterRef = db.collection("system_counters").doc("invoices");
  let result = null;

  await db.runTransaction(async (tx) => {
    const [orderSnap, counterSnap] = await Promise.all([tx.get(orderRef), tx.get(counterRef)]);
    if (!orderSnap.exists) throw new Error(`Order ${orderId} not found.`);

    const order = orderSnap.data() || {};
    const existingInvoice = order?.invoice && typeof order.invoice === "object" ? order.invoice : null;
    if (existingInvoice?.invoiceId && existingInvoice?.invoiceNumber) {
      result = { status: "already_created", invoiceId: existingInvoice.invoiceId, invoiceNumber: existingInvoice.invoiceNumber };
      return;
    }

    const last = Number(counterSnap.exists ? counterSnap.data()?.last : 0) || 0;
    const next = last + 1;
    const invoiceNumber = `INV-${String(next).padStart(6, "0")}`;
    const invoiceId = `inv_${next}_${orderId}`;
    const issuedAt = toStr(order?.lifecycle?.paidAt || order?.timestamps?.updatedAt || order?.timestamps?.createdAt) || nowIso();
    const invoiceRef = db.collection("invoices").doc(invoiceId);

    tx.set(counterRef, { last: next }, { merge: true });
    tx.set(invoiceRef, {
      docId: invoiceId,
      invoice: {
        invoiceId,
        invoiceNumber,
        orderId,
        status: "issued",
      },
      order_snapshot: {
        docId: order.docId || orderId,
        order: order.order || {},
        items: Array.isArray(order.items) ? order.items : [],
        totals: order.totals || {},
        customer_snapshot: order.customer_snapshot || {},
        delivery: order.delivery || {},
        meta: order.meta || {},
      },
      timestamps: {
        issuedAt,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      meta: {
        generatedBy,
      },
    });

    tx.set(
      orderRef,
      {
        invoice: {
          invoiceId,
          invoiceNumber,
          status: "issued",
          generatedAt: issuedAt,
          generatedBy,
        },
        order: {
          editable: false,
          editable_reason: "Order is locked because an invoice was issued.",
        },
        timestamps: {
          updatedAt: issuedAt,
          lockedAt: issuedAt,
        },
        lifecycle: {
          updatedAt: issuedAt,
        },
      },
      { merge: true },
    );

    result = { status: "created", invoiceId, invoiceNumber };
  });

  return result;
}

async function main() {
  const db = getAdminDb();
  const snap = await db.collection("orders_v2").get();
  let created = 0;
  let existing = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const order = docSnap.data() || {};
    const orderStatus = toStr(order?.order?.status?.order || order?.lifecycle?.orderStatus).toLowerCase();
    const paymentStatus = toStr(order?.payment?.status || order?.order?.status?.payment || order?.lifecycle?.paymentStatus).toLowerCase();

    if (!["confirmed", "processing", "dispatched", "completed"].includes(orderStatus) && paymentStatus !== "paid") {
      skipped += 1;
      continue;
    }

    const result = await ensureOrderInvoice(db, docSnap.id);
    if (result?.status === "created") created += 1;
    else existing += 1;
  }

  console.log(JSON.stringify({ totalOrders: snap.size, created, existing, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
