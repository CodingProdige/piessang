import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

const toStr = (v, f = "") => (v == null ? f : String(v)).trim();

function slugifyPart(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/&/g, "AND")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase() || "NA";
}

function extractVolume(title) {
  const text = String(title || "").toLowerCase();
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|lt|liter|litre|liters|litres|kg|g)\b/i);
  if (!match) return "";

  const amount = match[1].replace(",", ".");
  const unit = match[2].toLowerCase();

  if (unit === "kg") {
    const kg = Number.parseFloat(amount);
    return Number.isFinite(kg) && kg > 0 ? `${Math.round(kg * 1000)}G` : "";
  }

  if (unit === "g") {
    const g = Number.parseFloat(amount);
    return Number.isFinite(g) && g > 0 ? `${Math.round(g)}G` : "";
  }

  const ml = unit === "ml" ? Number.parseFloat(amount) : Number.parseFloat(amount) * 1000;
  if (!Number.isFinite(ml) || ml <= 0) return "";
  return ml % 1000 === 0 ? `${ml / 1000}L` : `${Math.round(ml)}ML`;
}

function inferType(title) {
  const text = String(title || "").toLowerCase();
  const types = [
    ["can", "CAN"],
    ["cans", "CAN"],
    ["glass", "GLASS"],
    ["bottle", "BOTTLE"],
    ["bottles", "BOTTLE"],
    ["crate", "CRATE"],
    ["pet", "PET"],
    ["box", "BOX"],
    ["pack", "PACK"],
  ];

  for (const [needle, label] of types) {
    if (text.includes(needle)) return label;
  }

  return "";
}

function inferFlavor(title) {
  const text = String(title || "").toLowerCase();
  const flavors = [
    ["no sugar", "ZERO"],
    ["sugar free", "ZERO"],
    ["zero", "ZERO"],
    ["original", "ORIGINAL"],
    ["regular", "ORIGINAL"],
    ["classic", "ORIGINAL"],
    ["diet", "DIET"],
    ["vanilla", "VANILLA"],
    ["cherry", "CHERRY"],
    ["lemon-lime", "LEMON-LIME"],
    ["lemon", "LEMON"],
    ["lime", "LIME"],
    ["orange", "ORANGE"],
    ["grape", "GRAPE"],
    ["ginger", "GINGER"],
    ["peach", "PEACH"],
    ["apple", "APPLE"],
    ["tonic", "TONIC"],
    ["berry", "BERRY"],
    ["mango", "MANGO"],
    ["strawberry", "STRAWBERRY"],
    ["watermelon", "WATERMELON"],
  ];

  for (const [needle, label] of flavors) {
    if (text.includes(needle)) return label;
  }

  return "";
}

function inferUnits(title) {
  const text = String(title || "");
  const packMatch = text.match(/(\d+)\s*(?:x|×|\-?\s*pack|\s*pk|\s*crate|\s*case)\b/i)
    || text.match(/(?:^|\s)(\d{1,3})(?:\s*pack|\s*pk|\s*crate|\s*case)\b/i);
  if (packMatch) return String(Math.max(1, Number.parseInt(packMatch[1], 10) || 1));

  if (/single/i.test(text)) return "1";

  return "";
}

function cleanProductTokens(title) {
  const stop = new Set([
    "the", "and", "or", "of", "for", "with", "to", "in", "on", "by", "from",
    "pack", "case", "crate", "single", "bottle", "bottles", "can", "cans",
    "glass", "pet", "box", "ml", "l", "lt", "liter", "litre", "liters", "litres",
    "kg", "g", "each", "zero", "original", "regular", "classic", "diet",
    "vanilla", "cherry", "lemon-lime", "lemon", "lime", "orange", "grape",
    "ginger", "peach", "apple", "tonic", "berry", "mango", "strawberry", "watermelon",
  ]);

  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s+&/-]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !stop.has(part))
    .slice(0, 3);
}

function buildBaseSku({ brand, title }) {
  const prefix = slugifyPart(brand || "BEVGO");
  const productPart = cleanProductTokens(title).map(slugifyPart).join("-");
  const volumePart = extractVolume(title);
  const typePart = inferType(title);
  const flavorPart = inferFlavor(title);
  const unitsPart = inferUnits(title);

  const parts = [
    prefix,
    productPart || "PRODUCT",
    volumePart,
    typePart,
    flavorPart,
    unitsPart,
  ].filter(Boolean);

  return parts.join("-");
}

async function collectUsedSkus() {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_NOT_CONFIGURED");
  const snap = await db.collection("products_v2").get();
  const used = new Set();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const productSku = toStr(data?.product?.sku).toUpperCase();
    if (productSku) used.add(productSku);
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    for (const variant of variants) {
      const variantSku = toStr(variant?.sku).toUpperCase();
      if (variantSku) used.add(variantSku);
    }
  }
  return used;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = toStr(body?.product_title || body?.title);
    const variantLabel = toStr(body?.variant_label || body?.variantLabel);
    const brand = toStr(body?.brand_slug || body?.brand || body?.vendor_name || body?.vendorName);

    if (!title) {
      return err(400, "Missing Title", "Provide a product_title or title.");
    }

    const used = await collectUsedSkus();
    const sourceTitle = [title, variantLabel].filter(Boolean).join(" ");
    const base = buildBaseSku({ brand, title: sourceTitle });

    let sku = base;
    let counter = 2;
    while (used.has(sku.toUpperCase())) {
      sku = `${base}-${counter}`;
      counter += 1;
      if (counter > 9999) break;
    }

    return ok({
      title,
      variantLabel,
      brand,
      sku,
      source: "generated",
      example_format: "BRAND-PRODUCT-VOLUME-TYPE-FLAVOR-UNITS",
    });
  } catch (e) {
    console.error("products/sku/generate failed:", e);
    return err(500, "Unexpected Error", "Unable to generate a unique SKU.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
