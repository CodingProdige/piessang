import { NextResponse } from "next/server";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

export async function GET() {
  try {
    const config = await loadMarketplaceFeeConfig();
    return ok({
      config,
    });
  } catch (e) {
    console.error("marketplace/fees/get failed:", e);
    return err(500, "Unexpected Error", "Failed to load marketplace fee config.", {
      details: String(e?.message ?? "").slice(0, 300),
    });
  }
}

