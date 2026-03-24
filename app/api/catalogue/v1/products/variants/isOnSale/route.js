import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok  = (p={}, s=200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e={}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

export async function GET(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { searchParams } = new URL(req.url);
    const uniqueId = (searchParams.get("unique_id") || "").trim();

    if (!uniqueId) {
      return err(400, "Missing unique_id", "Provide 'unique_id' as a query parameter.");
    }

    const snap = await db.collection("products_v2").doc(uniqueId).get();
    if (!snap.exists) {
      return err(404, "Product Not Found", "No product with this unique_id.");
    }

    const data = snap.data() || {};
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    const onSale = variants.filter(v => v?.sale?.is_on_sale === true);

    return ok({
      unique_id: uniqueId,
      is_on_sale: onSale.length > 0,
      count: onSale.length,
      variant_ids: onSale.map(v => v?.variant_id ?? null)
    });
  } catch (e){
    console.error("variants/isOnSale GET failed:", e);
    return err(500, "Unexpected Error", "Failed to check sale status.");
  }
}
