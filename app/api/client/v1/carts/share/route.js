export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { ensureCartShareToken } from "@/lib/cart/shares";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value) {
  return String(value || "").trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const cartOwnerId = toStr(body?.cartOwnerId || body?.customerId || body?.uid);
    const cartId = toStr(body?.cartId);
    if (!cartOwnerId || !cartId) {
      return err(400, "Invalid Request", "cartOwnerId and cartId are required.");
    }

    const share = await ensureCartShareToken({ cartOwnerId, cartId });
    if (!share?.shareToken) {
      return err(500, "Share Link Failed", "We could not generate a shareable cart link.");
    }

    const origin = new URL(req.url).origin;
    return ok({
      data: {
        shareToken: share.shareToken,
        shareUrl: `${origin}/cart?share=${encodeURIComponent(share.shareToken)}`,
        cartId,
      },
    });
  } catch (error) {
    console.error(error);
    return err(500, "Share Link Failed", "Unexpected server error.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
