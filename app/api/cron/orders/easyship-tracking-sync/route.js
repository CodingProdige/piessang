export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      deprecated: true,
      skipped: true,
      message: "Easyship tracking sync has been deprecated.",
    },
    { status: 410 },
  );
}
