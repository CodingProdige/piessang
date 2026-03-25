import { NextResponse } from "next/server";
import { recordProductViewerHeartbeat } from "@/lib/analytics/product-viewers";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const productId = String(body?.productId || "").trim();
    const sessionId = String(body?.sessionId || "").trim();

    if (!productId || !sessionId) {
      return NextResponse.json(
        { ok: false, title: "Missing product", message: "Product and session are required." },
        { status: 400 },
      );
    }

    const result = await recordProductViewerHeartbeat(productId, sessionId);
    return NextResponse.json({ ok: true, count: Number(result?.count || 0) });
  } catch (error) {
    console.error("live-viewers failed:", error);
    return NextResponse.json(
      { ok: false, title: "Server Error", message: "Unable to update live viewer count right now." },
      { status: 500 },
    );
  }
}
