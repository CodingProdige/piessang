export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { serveSponsoredProducts } from "@/lib/campaign-serving";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const placement = toStr(body?.placement).toLowerCase();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!placement) return err(400, "Missing Placement", "placement is required.");

    const sponsoredItems = await serveSponsoredProducts({
      db,
      placement,
      organicItems: items,
      context: {
        category: toStr(body?.context?.category),
        subCategory: toStr(body?.context?.subCategory),
        search: toStr(body?.context?.search),
      },
      limit: Math.max(1, Number(body?.limit || 2)),
      sessionId: toStr(body?.sessionId),
      userId: toStr(body?.userId),
    });

    return ok({ items: sponsoredItems });
  } catch (error) {
    return err(500, "Serve Failed", error?.message || "Unable to serve sponsored products.");
  }
}
