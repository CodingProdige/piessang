export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { resolveSharedCart } from "@/lib/cart/shares";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value) {
  return String(value || "").trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const shareToken = toStr(body?.shareToken);
    const viewerCartOwnerId = toStr(body?.cartOwnerId || body?.customerId || body?.uid);
    if (!shareToken) {
      return err(400, "Invalid Request", "shareToken is required.");
    }

    const shared = await resolveSharedCart({ shareToken });
    if (!shared?.cart) {
      return err(404, "Shared Cart Not Found", "This shared cart is no longer available.");
    }

    return ok({
      data: {
        shareToken,
        cart: shared.cart,
        cartId: shared.cartId,
        isOwner: Boolean(viewerCartOwnerId && viewerCartOwnerId === shared.cartOwnerId),
      },
    });
  } catch (error) {
    console.error(error);
    return err(500, "Shared Cart Failed", "Unexpected server error.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
