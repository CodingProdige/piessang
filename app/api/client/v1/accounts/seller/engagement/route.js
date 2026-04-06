import { NextResponse } from "next/server";
import { summarizeSellerProductEngagement } from "@/lib/analytics/product-engagement";

export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerCode = String(searchParams.get("sellerCode") || "").trim();
    const sellerSlug = String(searchParams.get("sellerSlug") || "").trim();
    const vendorName = String(searchParams.get("vendorName") || "").trim();
    const days = Number(searchParams.get("days") || 30);
    const offsetDays = Number(searchParams.get("offsetDays") || 0);

    const summary = await summarizeSellerProductEngagement({ sellerCode, sellerSlug, vendorName, days, offsetDays });
    return ok(summary);
  } catch (error) {
    console.error("seller engagement summary failed:", error);
    return NextResponse.json(
      { ok: false, title: "Server Error", message: "Unable to load seller engagement analytics right now." },
      { status: 500 },
    );
  }
}
