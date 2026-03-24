export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/* ───────── HELPERS ───────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error") =>
  NextResponse.json({ ok: false, title, message }, { status });

/* ───────── ENDPOINT ───────── */

export async function POST() {
  try {
    return ok({ businesses: [] });
  } catch (e) {
    return err(
      500,
      "Fetch Businesses Failed",
      e?.message || "Unexpected error fetching business accounts."
    );
  }
}
