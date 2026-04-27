export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      deprecated: true,
      categories: [],
      message: "Easyship customs category integration has been deprecated.",
    },
    { status: 410 },
  );
}
