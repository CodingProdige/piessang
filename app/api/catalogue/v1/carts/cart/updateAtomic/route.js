/* eslint-disable import/namespace */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { updateCartAtomic } from "./functions";
import { recordLiveCommerceEvent } from "@/lib/analytics/live-commerce";

/* ------------------ HELPERS ------------------ */
const ok = (data = {}, ui = null, status = 200) =>
  NextResponse.json({ ok: true, data, ui }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error", ui = null) => {
  status = Number(status);
  if (!status || status < 200 || status > 599) status = 500;

  return NextResponse.json(
    { ok: false, title, message, ui },
    { status }
  );
};

/* ------------------ POST ------------------ */
export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return err(400, "Bad Request", "Request JSON body required");
  }

  if (!body?.customerId) {
    return err(400, "Missing Input", "customerId required");
  }

  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return err(500, "Database Unavailable", "Admin database is not configured.");
    }

    const result = await adminDb.runTransaction((tx) => updateCartAtomic(tx, body, adminDb));

    const { _ui, _generatedKey, ...clean } = result ?? {};
    const responseCart = clean?.cart || null;

    await recordLiveCommerceEvent("cart_updated", {
      customerId: String(body?.customerId || "").trim(),
      mode: String(body?.mode || "add").trim().toLowerCase(),
      itemCount: Number(responseCart?.item_count || 0),
      cartStatus: String(responseCart?.cart?.status || "").trim().toLowerCase() || null,
    });

    return ok(
      { ...clean, cart: responseCart, generatedKey: _generatedKey ?? null },
      _ui ?? null,
      200
    );
  } catch (e) {
    console.error("[updateAtomic]", e);

    return err(
      e.code ?? 500,
      e.title ?? "Transaction Failed",
      e.message ?? "Unexpected error occurred",
      e.ui ?? null
    );
  }
}

/* ------------------ NEXT CONFIG ------------------ */
export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
