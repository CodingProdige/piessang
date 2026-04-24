import { NextResponse } from "next/server";

const ok = (payload: Record<string, unknown> = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });

export async function GET() {
  return ok({
    providers: [{ key: "seller_defined_zones", label: "Seller-defined shipping zones" }],
    count: 1,
    total: 1,
  });
}
