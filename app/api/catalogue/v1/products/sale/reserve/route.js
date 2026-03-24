export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

const ok  = (p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err = (s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json();
    let { unique_id, variant_id, qty } = body || {};

    // force types
    unique_id = String(unique_id);
    variant_id = String(variant_id);
    qty = Number(qty);

    if (!unique_id || !variant_id || isNaN(qty) || qty <= 0) {
      return err(400, "Invalid Request",
        "unique_id, variant_id and qty > 0 are required."
      );
    }

    // Lookup product
    const qRef = db.collection("products_v2").doc(unique_id);
    const snap = await qRef.get();

    if (!snap.exists) {
      return err(404, "Product Not Found", "No product with this unique_id.");
    }

    const data = snap.data();
    const variant = data.variants?.find(v => String(v.variant_id) === variant_id);

    if (!variant) {
      return err(404, "Variant Not Found", "Variant does not exist.");
    }

    if (!variant.sale?.is_on_sale) {
      return err(400, "Not On Sale", "Variant is not currently on sale.");
    }

    const available = Number(variant.sale.qty_available || 0);

    if (qty > available) {
      return err(400, "Insufficient Stock",
        `Only ${available} sale units available.`
      );
    }

    // Deduct sale stock
    variant.sale.qty_available = available - qty;

    await qRef.update({
      variants: data.variants,
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    return ok({
      message: "Sale stock reserved.",
      unique_id,
      variant_id,
      qty_reserved: qty,
      qty_remaining: variant.sale.qty_available
    });

  } catch (e) {
    console.error("Reserve ERROR:", e);
    return err(500, "Reserve Failed", "Unexpected server error", {
      error: e.toString()
    });
  }
}
