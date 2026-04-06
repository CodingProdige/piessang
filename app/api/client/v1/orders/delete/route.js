export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/* ───────── HELPERS ───────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function consumeRestoreRows(rows = [], quantity = 0) {
  const nextRows = Array.isArray(rows) ? rows.map((row) => ({ ...(row || {}) })) : [];
  const restoreQty = Math.max(0, Number(quantity) || 0);
  if (restoreQty <= 0) return nextRows;
  if (!nextRows.length) return [{ warehouse_id: "main", in_stock_qty: restoreQty }];
  const firstRow = { ...(nextRows[0] || {}) };
  firstRow.in_stock_qty = Math.max(0, Number(firstRow?.in_stock_qty || 0)) + restoreQty;
  nextRows[0] = firstRow;
  return nextRows;
}

async function restoreMarketplaceProductStock(db, items = []) {
  if (!db || !Array.isArray(items) || !items.length) return;

  const grouped = new Map();
  for (const item of items) {
    const product = item?.product_snapshot || item?.product || {};
    const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
    const productId = String(product?.product?.unique_id || product?.docId || product?.product?.product_id || "").trim();
    const variantId = String(variant?.variant_id || "").trim();
    const quantity = Math.max(0, Number(item?.quantity || 0));
    if (!productId || !variantId || quantity <= 0) continue;
    const key = `${productId}::${variantId}::${variant?.sale?.is_on_sale ? "sale" : "regular"}`;
    grouped.set(key, {
      productId,
      variantId,
      restoreSaleFlag: Boolean(variant?.sale?.is_on_sale),
      quantity: (grouped.get(key)?.quantity || 0) + quantity,
    });
  }

  for (const entry of grouped.values()) {
    const productRef = db.collection("products_v2").doc(entry.productId);
    await db.runTransaction(async (tx) => {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) return;
      const productData = productSnap.data() || {};
      const variants = Array.isArray(productData?.variants) ? [...productData.variants] : [];
      const variantIndex = variants.findIndex((variant) => String(variant?.variant_id || "") === entry.variantId);
      if (variantIndex < 0) return;
      const nextVariant = { ...(variants[variantIndex] || {}) };

      nextVariant.inventory = consumeRestoreRows(nextVariant.inventory, entry.quantity);
      if (entry.restoreSaleFlag && nextVariant?.sale && !nextVariant.sale.disabled_by_admin) {
        nextVariant.sale = {
          ...(nextVariant.sale || {}),
          is_on_sale: true,
        };
      }

      variants[variantIndex] = nextVariant;
      tx.set(
        productRef,
        {
          variants,
          timestamps: {
            ...(productData?.timestamps || {}),
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
    });
  }
}

async function resolveOrderRef({ orderId, orderNumber, merchantTransactionId }) {
  const db = getAdminDb();
  if (!db) return null;
  if (orderId) {
    return db.collection("orders_v2").doc(orderId);
  }

  const field = orderNumber
    ? "order.orderNumber"
    : "order.merchantTransactionId";
  const value = orderNumber || merchantTransactionId;

  const snap = await db.collection("orders_v2").where(field, "==", value).get();

  if (snap.empty) {
    return null;
  }

  if (snap.size > 1) {
    throw new Error("multiple_orders");
  }

  return snap.docs[0].ref;
}

/* ───────── ENDPOINT ───────── */

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { orderId, orderNumber, merchantTransactionId, force = false } =
      await req.json();

    if (!orderId && !orderNumber && !merchantTransactionId) {
      return err(
        400,
        "Missing Order Reference",
        "orderId, orderNumber, or merchantTransactionId is required."
      );
    }

    const ref = await resolveOrderRef({
      orderId,
      orderNumber,
      merchantTransactionId
    });

    if (!ref) {
      return err(404, "Order Not Found", "Order could not be located.");
    }

    const snap = await ref.get();

    if (!snap.exists) {
      return err(404, "Order Not Found", "Order could not be located.");
    }

    const order = snap.data();
    const paid = order?.payment?.status === "paid";
    const createIntentKey =
      typeof order?.meta?.createIntentKey === "string" ? order.meta.createIntentKey.trim() : "";

    if (paid && !force) {
      return err(
        409,
        "Order Already Paid",
        "Paid orders cannot be deleted without force=true.",
        {
          orderId: snap.id,
          orderNumber: order?.order?.orderNumber || null,
          merchantTransactionId: order?.order?.merchantTransactionId || null
        }
      );
    }

    if (!paid) {
      await restoreMarketplaceProductStock(db, Array.isArray(order?.items) ? order.items : []);
    }

    await ref.delete();

    if (createIntentKey) {
      await db.collection("idempotency_order_create_v2").doc(createIntentKey).delete().catch(() => null);
    }

    return ok({
      orderId: snap.id,
      orderNumber: order?.order?.orderNumber || null,
      merchantTransactionId: order?.order?.merchantTransactionId || null,
      deleted: true
    });
  } catch (e) {
    if (e?.message === "multiple_orders") {
      return err(
        409,
        "Multiple Orders Found",
        "Multiple orders match this reference."
      );
    }

    return err(500, "Delete Failed", e?.message || "Unexpected server error.");
  }
}
