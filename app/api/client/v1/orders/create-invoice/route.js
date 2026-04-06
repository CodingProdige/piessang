export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensureOrderInvoice } from "@/lib/orders/invoices";

/* ───────────────── HELPERS ───────────────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status, title, message, extra = {}) =>
  NextResponse.json(
    { ok: false, title, message, ...extra },
    { status }
  );

const now = () => new Date().toISOString();

/* ───────────────── ENDPOINT ───────────────── */

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { orderId, generatedBy = "system" } = await req.json();

    if (!orderId) {
      return err(400, "Missing Order ID", "orderId is required.");
    }

    const result = await ensureOrderInvoice({
      db,
      orderId,
      generatedBy,
      issuedAt: now(),
    });

    return ok({
      orderId,
      invoiceId: result?.invoiceId || null,
      invoiceNumber: result?.invoiceNumber || null,
      locked: true,
      status: result?.status || "created",
    });

  } catch (e) {
    return err(500, "Server Error", e.message);
  }
}
