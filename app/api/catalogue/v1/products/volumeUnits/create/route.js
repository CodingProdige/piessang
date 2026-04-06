export const runtime = "nodejs";
export const preferredRegion = "fra1";

// app/api/catalogue/v1/volumeUnits/create/route.js
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok  =(p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });

const norm = (v)=>String(v??"").trim();
const idOf = (symbol)=>norm(symbol).toLowerCase();

async function createOne(db, symbolRaw){
  const symbol = norm(symbolRaw);
  if (!symbol) return { ok:false, title:"Invalid Symbol", message:"Provide a non-empty 'symbol'." };

  const id = idOf(symbol);
  const ref = db.collection("volume_units").doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    return { ok:false, title:"Already Exists", message:`Volume unit '${symbol}' already exists.` };
  }
  await ref.set({ symbol }); // schema stays { symbol }
  return { ok:true, id, symbol, message:"Volume unit created." };
}

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json().catch(()=> ({}));
    // Accept:
    // 1) { symbol: "ml" }  OR { data: { symbol: "ml" } }
    // 2) { items: [{symbol:"ml"}, {symbol:"L"}, ...] }
    if (Array.isArray(body?.items)) {
      const results = [];
      for (const it of body.items) {
        const symbol = it?.symbol;
        try {
          results.push(await createOne(db, symbol));
        } catch(e){
          results.push({ ok:false, title:"Unexpected Error", message:"Failed to create symbol.", symbol, error:String(e) });
        }
      }
      const created   = results.filter(r=>r.ok).length;
      const failed    = results.length - created;
      return ok({ message:"Batch processed.", created, failed, results }, created>0?201:207);
    }

    const symbol = body?.data?.symbol ?? body?.symbol ?? null;
    const res = await createOne(db, symbol);
    return res.ok ? ok(res, 201) : NextResponse.json(res, { status: res.title==="Already Exists" ? 409 : 400 });
  }catch(e){
    console.error("volumeUnits/create failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while creating the volume unit.");
  }
}
