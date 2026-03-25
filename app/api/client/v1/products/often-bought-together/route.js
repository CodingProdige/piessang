export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function findProductDoc(db, productId) {
  const byDoc = await db.collection("products_v2").doc(productId).get();
  if (byDoc.exists) return byDoc;
  const byUniqueId = await db.collection("products_v2").where("product.unique_id", "==", productId).limit(1).get();
  return byUniqueId.empty ? null : byUniqueId.docs[0];
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const { searchParams } = new URL(req.url);
    const productId = toStr(searchParams.get("productId") || searchParams.get("product_unique_id") || searchParams.get("id"));
    if (!productId) return err(400, "Missing Product", "Provide a productId to load recommendations.");

    const sourceDoc = await findProductDoc(db, productId);
    if (!sourceDoc) return err(404, "Not Found", "We could not find that product.");
    const source = sourceDoc.data() || {};
    const sourceUniqueId = toStr(source?.product?.unique_id || productId);

    const coCounts = new Map();
    const ordersSnap = await db.collection("orders_v2").get();
    ordersSnap.forEach((docSnap) => {
      const order = docSnap.data() || {};
      const items = Array.isArray(order?.items) ? order.items : [];
      const containsSource = items.some((item) => toStr(item?.product?.unique_id || item?.product_unique_id) === sourceUniqueId);
      if (!containsSource) return;
      for (const item of items) {
        const uniqueId = toStr(item?.product?.unique_id || item?.product_unique_id);
        if (!uniqueId || uniqueId === sourceUniqueId) continue;
        coCounts.set(uniqueId, (coCounts.get(uniqueId) || 0) + Math.max(1, Number(item?.qty || item?.quantity || 1)));
      }
    });

    const rankedIds = Array.from(coCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
    const items = [];
    for (const relatedId of rankedIds) {
      const relatedDoc = await findProductDoc(db, relatedId);
      if (!relatedDoc) continue;
      const data = relatedDoc.data() || {};
      if (data?.placement?.isActive !== true) continue;
      items.push({
        id: relatedDoc.id,
        data,
        coPurchaseCount: coCounts.get(relatedId) || 0,
      });
    }

    return ok({ count: items.length, items });
  } catch (e) {
    console.error("often bought together failed:", e);
    return err(500, "Unexpected Error", "Unable to load often bought together products.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
