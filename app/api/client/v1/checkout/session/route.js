export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { ensureCheckoutSession, resolveCheckoutSession } from "@/lib/checkout/sessions";

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
    const sessionId = toStr(body?.sessionId);

    if (!cartOwnerId || !cartId) {
      return err(400, "Invalid Request", "cartOwnerId and cartId are required.");
    }

    const resolvedSession = sessionId
      ? await resolveCheckoutSession({ sessionId, cartOwnerId, cartId })
      : null;
    const session = resolvedSession || (await ensureCheckoutSession({ cartOwnerId, cartId }));

    if (!session) {
      return err(500, "Checkout Session Failed", "We could not prepare your checkout session.");
    }

    return ok({
      data: {
        session,
      },
    });
  } catch (error) {
    console.error(error);
    return err(500, "Checkout Session Failed", "Unexpected server error.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
