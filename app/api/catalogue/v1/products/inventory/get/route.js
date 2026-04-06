export const runtime = "nodejs";
export const preferredRegion = "fra1";

// app/api/products_v2/inventory/get/route.js
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok  =(p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });
const is8 =(s)=>/^\d{8}$/.test(String(s||"").trim());

export async function GET(req){
  try{
    const { searchParams } = new URL(req.url);
    const pid = (searchParams.get("unique_id")||"").trim();
    const wh  = (searchParams.get("warehouse_id")||"").trim();

    if (!is8(pid)) return err(400,"Invalid Product Id","'unique_id' must be an 8-digit string.");

    const db = getAdminDb();
    if (!db) return err(500,"Firebase Not Configured","Server Firestore access is not configured.");
    const snap = await db.collection("products_v2").doc(pid).get();
    if (!snap.exists) return err(404,"Not Found","Product not found.");

    const inv = Array.isArray(snap.data()?.inventory) ? snap.data().inventory : [];

    if (!wh) return ok({ count: inv.length, items: inv });

    const row = inv.find(r => String(r?.warehouse_id||"").trim() === wh);
    if (!row) return err(404,"Not Found","No inventory row for that warehouse_id.");
    return ok({ item: row });
  }catch(e){
    console.error("inventory/get failed:", e);
    return err(500,"Unexpected Error","Failed to fetch inventory.");
  }
}
