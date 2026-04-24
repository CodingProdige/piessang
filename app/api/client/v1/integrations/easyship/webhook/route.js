export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

export async function POST(req) {
  return ok({
    received: true,
    ignored: true,
    message: "Easyship webhook processing has been deprecated.",
  });
}
