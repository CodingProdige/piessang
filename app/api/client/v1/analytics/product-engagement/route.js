export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { recordProductEngagementEvent } from "@/lib/analytics/product-engagement";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const productId = String(body?.productId || "").trim();

    if (!action || !productId) {
      return NextResponse.json(
        { ok: false, title: "Missing fields", message: "action and productId are required." },
        { status: 400 },
      );
    }

    await recordProductEngagementEvent(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("product engagement failed:", error);
    return NextResponse.json(
      { ok: false, title: "Server Error", message: "Unable to track product engagement right now." },
      { status: 500 },
    );
  }
}
