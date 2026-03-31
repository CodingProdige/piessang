function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

export async function ensureOrderInvoice({
  db,
  orderId,
  generatedBy = "system",
  issuedAt = null,
} = {}) {
  if (!db) throw new Error("Admin database is required.");
  const safeOrderId = toStr(orderId);
  if (!safeOrderId) throw new Error("orderId is required.");

  const orderRef = db.collection("orders_v2").doc(safeOrderId);
  const existingOrderSnap = await orderRef.get();
  if (!existingOrderSnap.exists) {
    throw new Error("Order Not Found");
  }

  const existingOrder = existingOrderSnap.data() || {};
  const existingInvoice = existingOrder?.invoice && typeof existingOrder.invoice === "object" ? existingOrder.invoice : null;
  if (existingInvoice?.invoiceId && existingInvoice?.invoiceNumber) {
    return {
      status: "already_created",
      invoiceId: existingInvoice.invoiceId,
      invoiceNumber: existingInvoice.invoiceNumber,
      orderId: safeOrderId,
    };
  }

  const counterRef = db.collection("system_counters").doc("invoices");
  const nextIssuedAt = issuedAt || nowIso();
  let createdInvoice = null;

  await db.runTransaction(async (tx) => {
    const [orderSnap, counterSnap] = await Promise.all([tx.get(orderRef), tx.get(counterRef)]);
    if (!orderSnap.exists) {
      throw new Error("Order Not Found");
    }

    const order = orderSnap.data() || {};
    const invoice = order?.invoice && typeof order.invoice === "object" ? order.invoice : null;
    if (invoice?.invoiceId && invoice?.invoiceNumber) {
      createdInvoice = {
        status: "already_created",
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        orderId: safeOrderId,
      };
      return;
    }

    const last = Number(counterSnap.exists ? counterSnap.data()?.last : 0) || 0;
    const next = last + 1;
    const invoiceNumber = `INV-${String(next).padStart(6, "0")}`;
    const invoiceId = `inv_${next}_${safeOrderId}`;
    const invoiceRef = db.collection("invoices").doc(invoiceId);

    tx.set(counterRef, { last: next }, { merge: true });
    tx.set(invoiceRef, {
      docId: invoiceId,
      invoice: {
        invoiceId,
        invoiceNumber,
        orderId: safeOrderId,
        status: "issued",
      },
      order_snapshot: {
        docId: order.docId || safeOrderId,
        order: order.order || {},
        items: Array.isArray(order.items) ? order.items : [],
        totals: order.totals || {},
        customer_snapshot: order.customer_snapshot || {},
        delivery: order.delivery || {},
        meta: order.meta || {},
      },
      timestamps: {
        issuedAt: nextIssuedAt,
        createdAt: nextIssuedAt,
        updatedAt: nextIssuedAt,
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
          generatedAt: nextIssuedAt,
          generatedBy,
        },
        order: {
          editable: false,
          editable_reason: "Order is locked because an invoice was issued.",
        },
        timestamps: {
          updatedAt: nextIssuedAt,
          lockedAt: nextIssuedAt,
        },
        lifecycle: {
          updatedAt: nextIssuedAt,
        },
      },
      { merge: true },
    );

    createdInvoice = {
      status: "created",
      invoiceId,
      invoiceNumber,
      orderId: safeOrderId,
    };
  });

  return createdInvoice;
}

export async function backfillMissingOrderInvoices({
  db,
  generatedBy = "system_backfill",
} = {}) {
  if (!db) throw new Error("Admin database is required.");

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

    const result = await ensureOrderInvoice({
      db,
      orderId: docSnap.id,
      generatedBy,
      issuedAt: toStr(order?.lifecycle?.paidAt || order?.timestamps?.updatedAt || order?.timestamps?.createdAt) || nowIso(),
    });

    if (result?.status === "created") created += 1;
    else if (result?.status === "already_created") existing += 1;
  }

  return {
    totalOrders: snap.size,
    created,
    existing,
    skipped,
  };
}
