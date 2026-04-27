export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { GET as getPlatformShipping, POST as postPlatformShipping } from "@/app/api/client/v1/admin/platform-shipping/route";

export async function GET() {
  const response = await getPlatformShipping();
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(
    {
      deprecated: true,
      replacement: "/api/client/v1/admin/platform-shipping",
      ...payload,
    },
    response.status,
  );
}

export async function POST(req) {
  const response = await postPlatformShipping(req);
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(
    {
      deprecated: true,
      replacement: "/api/client/v1/admin/platform-shipping",
      ...payload,
    },
    response.status,
  );
}
