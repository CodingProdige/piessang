export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

const ok  =(p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });
const toBool=v=>typeof v==="boolean"?v:v==null?null:["true","1","yes"].includes(String(v).toLowerCase())?true:["false","0","no"].includes(String(v).toLowerCase())?false:null;

export async function GET(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { searchParams } = new URL(req.url);
    const isActive = toBool(searchParams.get("isActive"));

    const filters = [];
    if (isActive!==null) filters.push(["placement.isActive", "==", isActive]);

    let queryRef = db.collection("categories");
    if (filters.length) {
      for (const [field, op, value] of filters) {
        queryRef = queryRef.where(field, op, value);
      }
    }

    const rs = await queryRef.get();
    const rows = rs.docs.map(d => d.data() || {});
    rows.sort((a,b)=>{
      const ap = Number(a?.placement?.position ?? Number.POSITIVE_INFINITY);
      const bp = Number(b?.placement?.position ?? Number.POSITIVE_INFINITY);
      return ap - bp;
    });
    const items = rows.map(d => ({
      slug:  d?.category?.slug ?? null,
      title: d?.category?.title ?? null,
      productCount: Number(d?.productCount ?? 0),
    }));

    return ok({ count: items.length, items });
  }catch(e){
    console.error("categories/slugs failed:", e);
    return err(500,"Unexpected Error","Failed to fetch category slugs.");
  }
}
