export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const CACHE_KEY = "display_currency_rates";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const SUPPORTED_CODES = ["USD", "EUR", "GBP", "AED"];

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

async function fetchLiveRates() {
  const endpoint = `https://api.frankfurter.app/latest?from=ZAR&to=${SUPPORTED_CODES.join(",")}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 * 60 * 6 },
  });
  if (!response.ok) {
    throw new Error("Unable to load live currency rates right now.");
  }
  const payload = await response.json().catch(() => ({}));
  const rates = payload?.rates && typeof payload.rates === "object" ? payload.rates : {};
  return {
    base: "ZAR",
    rates: {
      ZAR: 1,
      USD: Number(rates?.USD || 0),
      EUR: Number(rates?.EUR || 0),
      GBP: Number(rates?.GBP || 0),
      AED: Number(rates?.AED || 0),
    },
    fetchedAt: new Date().toISOString(),
    provider: "frankfurter.app",
  };
}

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Database Unavailable", "Admin database is not configured.");

    const ref = db.collection("app_cache").doc(CACHE_KEY);
    const snap = await ref.get();
    const cached = snap.exists ? snap.data() || null : null;
    const updatedAtMs = cached?.updatedAt ? Date.parse(String(cached.updatedAt)) : 0;
    if (cached?.rates && updatedAtMs && Date.now() - updatedAtMs < CACHE_TTL_MS) {
      return ok(cached);
    }

    const live = await fetchLiveRates();
    await ref.set(
      {
        ...live,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return ok(live);
  } catch (error) {
    return err(500, "Currency Rates Failed", error instanceof Error ? error.message : "Unable to load currency rates.");
  }
}

