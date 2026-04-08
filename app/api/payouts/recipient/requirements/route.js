export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getWiseRecipientRequirements } from "@/lib/seller/wise-payouts";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const payoutProfile = body?.payoutProfile && typeof body.payoutProfile === "object" ? body.payoutProfile : {};
    const requirements = await getWiseRecipientRequirements({
      payoutProfile,
      sourceCurrency: toStr(body?.sourceCurrency),
      targetCurrency: toStr(body?.targetCurrency),
    });
    return ok(requirements);
  } catch (e) {
    return err(e?.status || 500, "Requirements Failed", e?.message || "Unable to load payout requirements.", {
      details:
        typeof e?.payload === "object" && e?.payload
          ? JSON.stringify(e.payload).slice(0, 1500)
          : String(e?.message || "").slice(0, 1500),
    });
  }
}
