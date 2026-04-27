export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: true,
      deprecated: true,
      ignored: true,
      message: "Easyship webhook processing has been deprecated.",
    },
    { status: 410 },
  );
}
