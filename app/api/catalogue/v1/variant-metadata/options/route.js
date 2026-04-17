export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { loadVariantMetadataSelectOptionsConfig } from "@/lib/catalogue/variant-metadata-options-store";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET() {
  try {
    const config = await loadVariantMetadataSelectOptionsConfig();
    return ok({ config });
  } catch (e) {
    console.error("variant-metadata/options get failed:", e);
    return err(500, "Unexpected Error", "Unable to load variant metadata options.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
