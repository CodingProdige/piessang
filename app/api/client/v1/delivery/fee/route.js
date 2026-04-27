export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });

export async function POST() {
  return ok(
    {
      deprecated: true,
      supported: false,
      canPlaceOrder: false,
      code: "DEPRECATED_ENDPOINT",
      message:
        "This delivery fee endpoint has been deprecated. Use /api/checkout/shipping-options and /api/checkout/validate-shipping.",
    },
    410,
  );
}
