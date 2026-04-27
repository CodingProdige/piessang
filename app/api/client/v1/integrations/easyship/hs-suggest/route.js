export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: true,
      deprecated: true,
      suggestion: null,
      source: "deprecated",
      message: "Easyship HS suggestion integration has been deprecated.",
    },
    { status: 410 },
  );
}
