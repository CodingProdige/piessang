export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/* ---------- response helpers ---------- */
const ok  = (p={}, s=200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e={}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

/* ---------- helpers ---------- */
const norm = (v) => String(v ?? "").trim().toUpperCase();

/** Scan all product variants and collect used barcodes */
function getProductSellerCode(data) {
  return String(
    data?.product?.sellerCode ??
    data?.seller?.sellerCode ??
    ""
  ).trim();
}

async function collectBarcodes(db) {
  const snap = await db.collection("products_v2").get();
  const seen = new Set();
  for (const d of snap.docs) {
    const data = d.data() || {};
    const sellerCode = getProductSellerCode(data).toUpperCase();
    const vars = Array.isArray(data?.variants) ? data.variants : [];
    for (const v of vars) {
      const bc = norm(v?.barcode);
      if (bc && sellerCode) seen.add(`${sellerCode}::${bc}`);
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
    const sellerCode = norm(searchParams.get("seller_code"));

    const b = norm(raw);
    const ex = norm(exclude);

    if (!b) return err(400, "Missing Barcode", "Provide 'barcode' as a query parameter.");
    if (!sellerCode) return err(400, "Missing Seller", "Provide 'seller_code' as a query parameter.");

    const seen = await collectBarcodes(db);
    if (ex) seen.delete(`${sellerCode}::${ex}`); // exclude current variant’s barcode when editing

    const unique = !seen.has(`${sellerCode}::${b}`);
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

    const { barcode, exclude_barcode, seller_code } = await req.json();
    const b = norm(barcode);
    const ex = norm(exclude_barcode);
    const sellerCode = norm(seller_code);

    if (!b) return err(400, "Missing Barcode", "Provide 'barcode' in the JSON body.");
    if (!sellerCode) return err(400, "Missing Seller", "Provide 'seller_code' in the JSON body.");

    const seen = await collectBarcodes(db);
    if (ex) seen.delete(`${sellerCode}::${ex}`);

    const unique = !seen.has(`${sellerCode}::${b}`);
    return ok({ barcode: barcode ?? "", unique });
  } catch (e) {
    console.error("checkBarcodeUnique POST failed:", e);
    return err(500, "Unexpected Error", "Failed to check barcode uniqueness.");
  }
}
