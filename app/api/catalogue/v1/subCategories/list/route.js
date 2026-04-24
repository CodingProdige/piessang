export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { computeCatalogueMenuCounts } from "@/lib/catalogue/menu-counts";
import { readShopperAreaFromSearchParams } from "@/lib/shipping/shopper-country";

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
    const category = (searchParams.get("category")||"").trim();
    const isActive = toBool(searchParams.get("isActive"));
    const shopperArea = readShopperAreaFromSearchParams(searchParams);

    let queryRef = db.collection("sub_categories");
    if (category) queryRef = queryRef.where("grouping.category","==", category);
    if (isActive!==null) queryRef = queryRef.where("placement.isActive","==", isActive);

    const rs   = await queryRef.get();
    const rows = rs.docs.map(d => d.data() || {});
    rows.sort((a,b)=>{
      const ap = Number(a?.placement?.position ?? Number.POSITIVE_INFINITY);
      const bp = Number(b?.placement?.position ?? Number.POSITIVE_INFINITY);
      return ap - bp;
    });
    let localizedCounts = null;
    if (shopperArea.country) {
      localizedCounts = (await computeCatalogueMenuCounts(db, shopperArea)).subCategoryCounts;
    }

    const items = rows.map(d => ({
      slug:  d?.subCategory?.slug ?? null,
      kind:  d?.subCategory?.kind ?? null,
      title: d?.subCategory?.title ?? null,
      category: d?.grouping?.category ?? null,
      isActive: d?.placement?.isActive ?? null,
      productCount: Number(
        localizedCounts?.[`${d?.grouping?.category ?? ""}::${d?.subCategory?.slug ?? ""}`] ?? d?.productCount ?? 0,
      ),
    }));

    return ok({ count: items.length, items });
  }catch(e){
    console.error("sub_categories/slugs failed:", e);
    return err(500,"Unexpected Error","Failed to fetch sub-category slugs.");
  }
}
