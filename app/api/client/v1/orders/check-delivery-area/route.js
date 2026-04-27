export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });

export async function POST() {
  return ok(
    {
      deprecated: true,
      supported: false,
      canPlaceOrder: false,
      code: "DEPRECATED_ENDPOINT",
      message:
        "This delivery-area endpoint has been deprecated. Use /api/checkout/shipping-options and /api/checkout/validate-shipping.",
    },
    410,
  );
}
