// app/api/brands/create/route.js
import { NextResponse } from "next/server";
import { ensureBrandRecord } from "@/lib/catalogue/brand-upsert";

const ok  =(p={},s=200)=>NextResponse.json({ ok:true,  ...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });

export async function POST(req){
  try{
    const { data } = await req.json();
    if (!data || typeof data !== "object") return err(400,"Invalid Data","Provide a 'data' object.");

    const title = String(data?.brand?.title ?? data?.brand?.name ?? "").trim();
    const slug = String(data?.brand?.slug ?? "").trim();
    const record = await ensureBrandRecord({ title, slug });
    return ok(
      {
        id: record.id,
        slug: record.slug,
        code: record.code,
        created: record.created,
        message: record.created ? "Brand created." : "Brand already exists.",
      },
      record.created ? 201 : 200,
    );
  }catch(e){
    console.error("brands/create failed:", e);
    return err(500,"Unexpected Error","Something went wrong while creating the brand.");
  }
}
