export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
 
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function POST() {
  return err(410, "Deprecated Route", "Use /api/client/v1/accounts/seller/shipping-settings-reminders instead.");
}
