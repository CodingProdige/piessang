import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/* ---------- response helpers ---------- */
const ok  = (p={}, s=200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e={}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

/* ---------- helpers ---------- */
const norm = (v) => String(v ?? "").trim().toUpperCase();

/** Scan all product variants and collect used barcodes */
async function collectBarcodes(db) {
  const snap = await db.collection("products_v2").get();
  const seen = new Set();
  for (const d of snap.docs) {
    const data = d.data() || {};
    const vars = Array.isArray(data?.variants) ? data.variants : [];
    for (const v of vars) {
      const bc = norm(v?.barcode);
      if (bc) seen.add(bc);
    }
  }
  return seen;
}

/* ---------- GET ---------- */
export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("barcode");
    const exclude = searchParams.get("exclude_barcode");

    const b = norm(raw);
    const ex = norm(exclude);

    if (!b) return err(400, "Missing Barcode", "Provide 'barcode' as a query parameter.");

    const seen = await collectBarcodes(db);
    if (ex) seen.delete(ex); // exclude current variant’s barcode when editing

    const unique = !seen.has(b);
    return ok({ barcode: raw ?? "", unique });
  } catch (e) {
    console.error("checkBarcodeUnique GET failed:", e);
    return err(500, "Unexpected Error", "Failed to check barcode uniqueness.");
  }
}

/* ---------- POST ---------- */
export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { barcode, exclude_barcode } = await req.json();
    const b = norm(barcode);
    const ex = norm(exclude_barcode);

    if (!b) return err(400, "Missing Barcode", "Provide 'barcode' in the JSON body.");

    const seen = await collectBarcodes(db);
    if (ex) seen.delete(ex);

    const unique = !seen.has(b);
    return ok({ barcode: barcode ?? "", unique });
  } catch (e) {
    console.error("checkBarcodeUnique POST failed:", e);
    return err(500, "Unexpected Error", "Failed to check barcode uniqueness.");
  }
}
