export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { splitMarketplaceOrder } from "@/lib/marketplace/order-splitter";
import type { MarketplaceSplitOrderInput } from "@/lib/marketplace/types";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s: number, title: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status: s });

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<MarketplaceSplitOrderInput>;
    if (!body.cartId || !body.customerId || !Array.isArray(body.lines)) {
      return err(400, "Invalid Request", "cartId, customerId, and lines are required.");
    }

    const result = splitMarketplaceOrder({
      cartId: String(body.cartId),
      customerId: String(body.customerId),
      deliveryAddress: body.deliveryAddress ?? null,
      source: body.source || "web",
      currency: body.currency || "ZAR",
      lines: body.lines as MarketplaceSplitOrderInput["lines"],
    });

    return ok({ data: result });
  } catch (error) {
    return err(500, "Split Failed", "Unable to split cart into sub-orders.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
