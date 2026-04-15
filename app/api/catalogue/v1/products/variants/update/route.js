export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { collectSellerNotificationEmails, getVariantInventoryTotal, sendSellerNotificationEmails } from "@/lib/seller/notifications";
import { ensureSkuUnique, ensureUniqueProductCode } from "@/lib/catalogue/sku-uniqueness";
import {
  marketplaceVariantLogisticsComplete,
  normalizeMarketplaceVariantLogistics,
} from "@/lib/marketplace/fees";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { buildOfferGroupMetadata } from "@/lib/catalogue/offer-group";
import { enqueueGoogleSyncProducts } from "@/lib/integrations/google-sync-queue";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { buildShippingVisibilityPatch } from "@/lib/seller/shipping-product-visibility";

/* ---------- helpers ---------- */
const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

const money2 = (v) =>
  Number.isFinite(+v) ? Math.round(+v * 100) / 100 : 0;
const toInt = (v, f = 0) =>
  Number.isFinite(+v) ? Math.trunc(+v) : f;
const toNum = (v, f = 0) =>
  Number.isFinite(+v) ? +v : f;
const toStr = (v, f = "") =>
  String(v == null ? (f ?? "") : v).trim();
const toBool = (v, f = false) =>
  typeof v === "boolean"
    ? v
    : typeof v === "number"
    ? v !== 0
    : typeof v === "string"
    ? ["true", "1", "yes", "y"].includes(v.toLowerCase())
    : f;
const is8 = (s) => /^\d{8}$/.test(String(s ?? "").trim());
const VAT_RATE = 0.15;
const ALLOWED_VOLUME_UNITS = new Set(["kg", "ml", "lt", "g", "small", "medium", "large", "each"]);

function normalizeVolumeUnit(value) {
  const unit = String(value ?? "").trim().toLowerCase();
  if (["l", "lt", "liter", "litre", "liters", "litres"].includes(unit)) return "lt";
  if (["kg", "kgs", "kilogram", "kilograms"].includes(unit)) return "kg";
  if (["g", "gram", "grams"].includes(unit)) return "g";
  if (["small", "medium", "large", "ml", "each"].includes(unit)) return unit;
  return "each";
}

function moneyInclToExcl(value) {
  return money2(Number(value) / (1 + VAT_RATE));
}

function sanitizeUrl(u){
  if (u == null) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^(https?:\/\/|data:)/i.test(s)) return s;
  return null;
}

function sanitizeBlurHash(v){
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseImage(input, fallbackPos = null){
  if (!input)
    return { imageUrl: null, blurHashUrl: null, altText: null, ...(fallbackPos ? { position: fallbackPos } : {}) };

  if (typeof input === "string"){
    return { imageUrl: sanitizeUrl(input), blurHashUrl: null, altText: null, ...(fallbackPos ? { position: fallbackPos } : {}) };
  }

  if (typeof input === "object"){
    const imageUrl    = sanitizeUrl(input.imageUrl ?? input.url);
    const blurHashUrl = sanitizeBlurHash(input.blurHashUrl ?? input.blurhash ?? input.blurHash);
    const altText     = toStr(input.altText ?? input.alt ?? input.alt_text, null) || null;
    const pos = Number.isFinite(+input?.position) ? toInt(input.position) : undefined;
    const base = { imageUrl, blurHashUrl, altText };

    return pos != null ? { ...base, position: pos } :
           fallbackPos ? { ...base, position: fallbackPos } :
           base;
  }

  return { imageUrl: null, blurHashUrl: null, altText: null, ...(fallbackPos?{position:fallbackPos}:{}) };
}

function parseImages(value){
  let arr = [];

  if (Array.isArray(value)){
    arr = value.map((v,i)=>parseImage(v,i+1)).filter(o => o.imageUrl || o.blurHashUrl);
  } else if (value){
    const one = parseImage(value,1);
    if (one.imageUrl || one.blurHashUrl) arr=[one];
  }

  if (arr.length){
    arr = arr
      .map((it,i)=>({ ...it, position: Number.isFinite(+it.position) ? toInt(it.position,i+1) : (i+1) }))
      .sort((a,b)=>a.position - b.position)
      .map((it,i)=>({ ...it, position: i+1 }));
  }
  return arr;
}

function getProductSellerCode(data) {
  return String(
    data?.product?.sellerCode ??
    data?.seller?.sellerCode ??
    ""
  ).trim();
}

async function collectAllBarcodes(db) {
  const snap = await db.collection("products_v2").get();
  const list = [];
  for (const d of snap.docs) {
    const pid = d.id;
    const data = d.data() || {};
    const sellerCode = getProductSellerCode(data).toUpperCase();
    const variants = Array.isArray(data?.variants)
      ? data.variants
      : [];
    for (const v of variants) {
      const bc = String(v?.barcode ?? "")
        .trim()
        .toUpperCase();
      const vId = String(v?.variant_id ?? "").trim();
      if (bc)
        list.push({ productId: pid, variantId: vId, sellerCode, barcode: bc });
    }
  }
  return list;
}

function deepMerge(target, patch) {
  if (patch == null || typeof patch !== "object") return target;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function hasLiveSnapshotRecord(product) {
  return Boolean(product?.live_snapshot && typeof product.live_snapshot === "object");
}

function normalizeImagesForReviewCompare(images) {
  return Array.isArray(images)
    ? images
        .map((item) => ({
          imageUrl: toStr(item?.imageUrl, null) || null,
          blurHashUrl: toStr(item?.blurHashUrl, null) || null,
          altText: toStr(item?.altText, null) || null,
          position: Number.isFinite(+item?.position) ? toInt(item.position) : null,
        }))
        .filter((item) => item.imageUrl || item.blurHashUrl || item.altText)
    : [];
}

function hasVariantReviewSensitiveChanges(beforeVariant = {}, afterVariant = {}) {
  const before = beforeVariant && typeof beforeVariant === "object" ? beforeVariant : {};
  const after = afterVariant && typeof afterVariant === "object" ? afterVariant : {};

  const fieldsToCompare = [
    "variant_id",
    "label",
    "size",
    "shade",
    "scent",
    "skinType",
    "hairType",
    "flavor",
    "abv",
    "containerType",
    "storageCapacity",
    "memoryRam",
    "connectivity",
    "compatibility",
    "sizeSystem",
    "material",
    "ringSize",
    "strapLength",
    "bookFormat",
    "language",
    "ageRange",
    "modelFitment",
    "sku",
    "barcode",
    "barcodeImageUrl",
    "color",
  ];

  if (
    fieldsToCompare.some((field) => toStr(before?.[field], null) !== toStr(after?.[field], null))
  ) {
    return true;
  }

  const beforePack = before?.pack && typeof before.pack === "object" ? before.pack : {};
  const afterPack = after?.pack && typeof after.pack === "object" ? after.pack : {};
  if (
    toInt(beforePack?.unit_count, 0) !== toInt(afterPack?.unit_count, 0) ||
    toNum(beforePack?.volume, 0) !== toNum(afterPack?.volume, 0) ||
    normalizeVolumeUnit(beforePack?.volume_unit) !== normalizeVolumeUnit(afterPack?.volume_unit)
  ) {
    return true;
  }

  const beforePlacement = before?.placement && typeof before.placement === "object" ? before.placement : {};
  const afterPlacement = after?.placement && typeof after.placement === "object" ? after.placement : {};
  if (toBool(beforePlacement?.isActive) !== toBool(afterPlacement?.isActive)) return true;
  if (normalizeImagesForReviewCompare(before?.media?.images).length !== normalizeImagesForReviewCompare(after?.media?.images).length) {
    return true;
  }
  if (
    JSON.stringify(normalizeImagesForReviewCompare(before?.media?.images)) !==
    JSON.stringify(normalizeImagesForReviewCompare(after?.media?.images))
  ) {
    return true;
  }

  return false;
}

function isSaleActive(variant) {
  return Boolean(variant?.sale?.is_on_sale && !variant?.sale?.disabled_by_admin);
}

function getUnitPriceIncl(variant) {
  if (!variant) return 0;
  if (isSaleActive(variant) && Number.isFinite(Number(variant?.sale?.sale_price_incl))) {
    return money2(variant.sale.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.sale_price_incl))) {
    return money2(variant.pricing.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_incl))) {
    return money2(variant.pricing.selling_price_incl);
  }
  if (isSaleActive(variant) && Number.isFinite(Number(variant?.sale?.sale_price_excl))) {
    return money2(Number(variant.sale.sale_price_excl) * (1 + VAT_RATE));
  }
  if (Number.isFinite(Number(variant?.pricing?.sale_price_excl))) {
    return money2(Number(variant.pricing.sale_price_excl) * (1 + VAT_RATE));
  }
  return money2(Number(variant?.pricing?.selling_price_excl || 0) * (1 + VAT_RATE));
}

function hasSaleImprovement(beforeVariant, afterVariant) {
  const wasOnSale = isSaleActive(beforeVariant);
  const isNowOnSale = isSaleActive(afterVariant);
  const previousPriceIncl = getUnitPriceIncl(beforeVariant);
  const currentPriceIncl = getUnitPriceIncl(afterVariant);
  return isNowOnSale && (!wasOnSale || currentPriceIncl < previousPriceIncl);
}

/** Sanitize inventory array (replaces full array) */
function parseInventory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((it) => it && typeof it === "object")
    .map((it) => ({
      in_stock_qty: toInt(it.in_stock_qty, 0),
      location_id:
        toStr(it.location_id ?? it.warehouse_id, null) || null,
    }))
    .filter((it) => it.location_id !== null);
}

/* ---------- Sanitize patch ---------- */
function sanitizePatch(patch) {
  const out = {};

  if ("sku" in patch) out.sku = toStr(patch.sku);
  if ("label" in patch) out.label = toStr(patch.label);
  if ("size" in patch) out.size = toStr(patch.size, null) || null;
  if ("shade" in patch) out.shade = toStr(patch.shade, null) || null;
  if ("scent" in patch) out.scent = toStr(patch.scent, null) || null;
  if ("skinType" in patch) out.skinType = toStr(patch.skinType, null) || null;
  if ("hairType" in patch) out.hairType = toStr(patch.hairType, null) || null;
  if ("flavor" in patch) out.flavor = toStr(patch.flavor, null) || null;
  if ("abv" in patch) out.abv = toStr(patch.abv, null) || null;
  if ("containerType" in patch) out.containerType = toStr(patch.containerType, null) || null;
  if ("storageCapacity" in patch) out.storageCapacity = toStr(patch.storageCapacity, null) || null;
  if ("memoryRam" in patch) out.memoryRam = toStr(patch.memoryRam, null) || null;
  if ("connectivity" in patch) out.connectivity = toStr(patch.connectivity, null) || null;
  if ("compatibility" in patch) out.compatibility = toStr(patch.compatibility, null) || null;
  if ("sizeSystem" in patch) out.sizeSystem = toStr(patch.sizeSystem, null) || null;
  if ("material" in patch) out.material = toStr(patch.material, null) || null;
  if ("ringSize" in patch) out.ringSize = toStr(patch.ringSize, null) || null;
  if ("strapLength" in patch) out.strapLength = toStr(patch.strapLength, null) || null;
  if ("bookFormat" in patch) out.bookFormat = toStr(patch.bookFormat, null) || null;
  if ("language" in patch) out.language = toStr(patch.language, null) || null;
  if ("ageRange" in patch) out.ageRange = toStr(patch.ageRange, null) || null;
  if ("modelFitment" in patch) out.modelFitment = toStr(patch.modelFitment, null) || null;
  if ("barcode" in patch) out.barcode = toStr(patch.barcode);
  if ("barcodeImageUrl" in patch)
    out.barcodeImageUrl =
      toStr(patch.barcodeImageUrl, null) || null;
  if ("color" in patch) out.color = toStr(patch.color, null) || null;

  if ("placement" in patch) {
    const src = patch.placement || {};
    out.placement = {};
    if ("position" in src)
      out.placement.position = Number.isFinite(+src.position)
        ? Math.trunc(+src.position)
        : undefined;
    if ("isActive" in src)
      out.placement.isActive = toBool(src.isActive);
    if ("isFeatured" in src)
      out.placement.isFeatured = toBool(src.isFeatured);
    if ("is_default" in src)
      out.placement.is_default = toBool(src.is_default);
    if ("is_loyalty_eligible" in src)
      out.placement.is_loyalty_eligible = toBool(
        src.is_loyalty_eligible
      );
    if ("track_inventory" in src)
      out.placement.track_inventory = toBool(src.track_inventory);
    if ("continue_selling_out_of_stock" in src)
      out.placement.continue_selling_out_of_stock = toBool(
        src.continue_selling_out_of_stock
      );
  }

  if ("media" in patch) {
    const src = patch.media || {};
    out.media = {};
    if ("images" in src) out.media.images = parseImages(src.images);
  }

  if ("pricing" in patch) {
    const src = patch.pricing || {};
    out.pricing = {};
    if ("supplier_price_excl" in src)
      out.pricing.supplier_price_excl = money2(
        src.supplier_price_excl
      );
    if ("selling_price_incl" in src)
      out.pricing.selling_price_incl = money2(
        src.selling_price_incl
      );
    if ("selling_price_excl" in src)
      out.pricing.selling_price_excl = money2(
        src.selling_price_excl
      );
    if ("cost_price_excl" in src)
      out.pricing.cost_price_excl = money2(
        src.cost_price_excl
      );
    if (
      !("cost_price_excl" in out.pricing) &&
      "base_price_excl" in src
    )
      out.pricing.cost_price_excl = money2(
        src.base_price_excl
      );
    if ("rebate_eligible" in src)
      out.pricing.rebate_eligible = toBool(
        src.rebate_eligible
      );
  }

  if ("sale" in patch) {
    const src = patch.sale || {};
    out.sale = {};
    if ("is_on_sale" in src)
      out.sale.is_on_sale = toBool(src.is_on_sale);
    if ("disabled_by_admin" in src)
      out.sale.disabled_by_admin = toBool(src.disabled_by_admin);
    if ("discount_percent" in src)
      out.sale.discount_percent = Math.max(0, Math.min(100, toNum(src.discount_percent, 0)));
    if ("sale_price_incl" in src)
      out.sale.sale_price_incl = money2(
        src.sale_price_incl
      );
    if ("sale_price_excl" in src)
      out.sale.sale_price_excl = money2(
        src.sale_price_excl
      );
    if ("qty_available" in src)
      out.sale.qty_available = toInt(
        src.qty_available,
        0
      );
  }

  if ("pack" in patch) {
    const src = patch.pack || {};
    out.pack = {};
    if ("unit_count" in src)
      out.pack.unit_count = toInt(src.unit_count, 1);
    if ("volume" in src)
      out.pack.volume = toNum(src.volume, 0);
    if ("volume_unit" in src)
      out.pack.volume_unit = ALLOWED_VOLUME_UNITS.has(normalizeVolumeUnit(src.volume_unit))
        ? normalizeVolumeUnit(src.volume_unit)
        : "each";
  }

  if ("inventory" in patch) {
    out.inventory = parseInventory(patch.inventory);
  }

  if ("logistics" in patch) {
    out.logistics = normalizeMarketplaceVariantLogistics(patch.logistics);
  }

  return out;
}

function isLowStockQty(qty) {
  return Number.isFinite(qty) && qty > 0 && qty <= 10;
}

/* ---------- MAIN ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { unique_id, variant_id, data, adminReviewEdit } = body;
    const pid = toStr(unique_id);
    if (!is8(pid))
      return err(
        400,
        "Invalid Product ID",
        "'unique_id' must be an 8-digit string."
      );
    const vid = toStr(variant_id);
    if (!is8(vid))
      return err(
        400,
        "Invalid Variant ID",
        "'variant_id' must be an 8-digit string."
      );
    if (!data || typeof data !== "object")
      return err(
        400,
        "Invalid Data",
        "Provide a 'data' object."
      );

    if ("variant_id" in data && toStr(data.variant_id) !== vid)
      return err(
        409,
        "Mismatched Variant ID",
        "data.variant_id must match the target variant."
      );

    const ref = db.collection("products_v2").doc(pid);
    const snap = await ref.get();
    if (!snap.exists)
      return err(
        404,
        "Product Not Found",
        `No product exists with unique_id ${pid}.`
      );

    const docData = snap.data() || {};
    const productFulfillmentMode = toStr(docData?.fulfillment?.mode, "seller") === "bevgo" ? "bevgo" : "seller";
    const list = Array.isArray(docData.variants)
      ? [...docData.variants]
      : [];
    const idx = list.findIndex(
      (v) => toStr(v?.variant_id) === vid
    );
    if (idx < 0)
      return err(
        404,
        "Variant Not Found",
        `No variant with variant_id ${vid}.`
      );
    const beforeVariant = list[idx];

    const incomingBC = toStr(data?.barcode);
    if (incomingBC) {
      const allBCs = await collectAllBarcodes(db);
      const normalized = incomingBC.toUpperCase();
      const currentSellerCode = getProductSellerCode(docData).toUpperCase();
      const conflict = allBCs.find(
        (b) =>
          b.barcode === normalized &&
          b.sellerCode === currentSellerCode &&
          !(b.productId === pid && b.variantId === vid)
      );
      if (conflict) {
        return err(
          409,
          "Duplicate Barcode",
          `Barcode '${incomingBC}' already exists on another variant in your catalogue.`
        );
      }
    }

    const patch = sanitizePatch(data);
    const logistics = normalizeMarketplaceVariantLogistics(patch?.logistics || list[idx]?.logistics || null);
    const incomingInventory = Array.isArray(patch.inventory)
      ? patch.inventory
      : Array.isArray(list[idx]?.inventory)
        ? list[idx].inventory
        : [];
    const requiresLogistics = productFulfillmentMode === "bevgo";
    if (requiresLogistics && !marketplaceVariantLogisticsComplete(logistics)) {
      return err(
        400,
        "Missing Logistics",
        "Weight, dimensions, stock and monthly sales estimates are required for Piessang fulfilment variants."
      );
    }
    if (requiresLogistics && incomingInventory.length === 0) {
      return err(
        400,
        "Missing Stock",
        "Piessang fulfilment variants require stock quantities."
      );
    }
    const nextBarcode = toStr(data?.barcode ?? list[idx]?.barcode);
    if (!nextBarcode) {
      return err(
        400,
        "Missing Barcode",
        "A barcode is required for every variant."
      );
    }

    await ensureUniqueProductCode(vid, { excludeProductId: pid, excludeVariantId: vid });
    await ensureSkuUnique(toStr(patch?.sku ?? data?.sku ?? list[idx]?.sku), {
      excludeProductId: pid,
      excludeVariantId: vid,
    });

    // Always replace inventory fully if present
    if (Object.prototype.hasOwnProperty.call(data, "inventory")) {
      list[idx].inventory = patch.inventory || [];
    }

    let updated = deepMerge(list[idx], patch);
    if (updated?.pricing && typeof updated.pricing === "object") {
      delete updated.pricing.deposit_included;
    }
    if (Object.prototype.hasOwnProperty.call(updated, "rental")) {
      delete updated.rental;
    }
    if (Object.prototype.hasOwnProperty.call(updated, "returnable")) {
      delete updated.returnable;
    }
    const priceIncl = Number.isFinite(+updated?.pricing?.selling_price_incl)
      ? money2(updated.pricing.selling_price_incl)
      : 0;
    if (!updated.pricing) updated.pricing = {};
    if (Object.prototype.hasOwnProperty.call(patch, "pricing") && patch.pricing) {
      if (Object.prototype.hasOwnProperty.call(patch.pricing, "selling_price_incl")) {
        updated.pricing.selling_price_incl = money2(patch.pricing.selling_price_incl);
        updated.pricing.selling_price_excl = money2(moneyInclToExcl(updated.pricing.selling_price_incl));
      }
    }
    if (!Number.isFinite(Number(updated.pricing.selling_price_incl)) || Number(updated.pricing.selling_price_incl) <= 0) {
      return err(400, "Missing Price", "VAT-inclusive selling price is required for every variant.");
    }
    updated.pricing.selling_price_excl = money2(moneyInclToExcl(updated.pricing.selling_price_incl));
    if (!updated.sale) updated.sale = {};
    const isTrackedInventory = productFulfillmentMode === "bevgo" || Boolean(updated?.placement?.track_inventory) || (Array.isArray(updated?.inventory) && updated.inventory.length > 0);
    if (isTrackedInventory) {
      updated.placement = updated.placement || {};
      updated.placement.continue_selling_out_of_stock = false;
      updated.placement.track_inventory = true;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "sale") && patch.sale) {
      if (Object.prototype.hasOwnProperty.call(patch.sale, "discount_percent")) {
        const pct = Math.max(0, Math.min(100, Number(updated.sale.discount_percent || 0)));
        updated.sale.discount_percent = pct;
        updated.sale.is_on_sale = pct > 0 ? true : toBool(updated.sale.is_on_sale, false);
        if (pct > 0) {
          updated.sale.sale_price_incl = money2(updated.pricing.selling_price_incl * (1 - pct / 100));
          updated.sale.sale_price_excl = money2(moneyInclToExcl(updated.sale.sale_price_incl));
        }
      } else if (Object.prototype.hasOwnProperty.call(patch.sale, "sale_price_incl")) {
        const saleIncl = money2(updated.sale.sale_price_incl || 0);
        const pct = updated.pricing.selling_price_incl > 0
          ? Math.max(0, Math.min(100, Math.round((1 - saleIncl / updated.pricing.selling_price_incl) * 100)))
          : 0;
        updated.sale.discount_percent = pct;
        updated.sale.is_on_sale = pct > 0 ? true : toBool(updated.sale.is_on_sale, false);
        updated.sale.sale_price_incl = saleIncl;
        updated.sale.sale_price_excl = money2(moneyInclToExcl(saleIncl));
      }
    } else if (typeof updated.sale.discount_percent === "number" && updated.sale.discount_percent > 0) {
      const pct = Math.max(0, Math.min(100, updated.sale.discount_percent));
      updated.sale.discount_percent = pct;
      updated.sale.is_on_sale = true;
      updated.sale.sale_price_incl = money2(updated.pricing.selling_price_incl * (1 - pct / 100));
      updated.sale.sale_price_excl = money2(moneyInclToExcl(updated.sale.sale_price_incl));
    }

    if (Object.prototype.hasOwnProperty.call(patch, "media") && patch.media) {
      updated.media = updated.media || {};
      if (Object.prototype.hasOwnProperty.call(patch.media, "images")) {
        updated.media.images = patch.media.images || [];
      }
    }

    updated.logistics = {
      parcel_preset: toStr(patch?.logistics?.parcelPreset ?? patch?.logistics?.parcel_preset ?? updated?.logistics?.parcel_preset, null) || null,
      shipping_class: toStr(patch?.logistics?.shippingClass ?? patch?.logistics?.shipping_class ?? updated?.logistics?.shipping_class, null) || null,
      weight_kg: logistics.weightKg,
      length_cm: logistics.lengthCm,
      width_cm: logistics.widthCm,
      height_cm: logistics.heightCm,
      volumetric_weight_kg: Number.isFinite(+patch?.logistics?.volumetricWeightKg)
        ? money2(patch.logistics.volumetricWeightKg)
        : (Number.isFinite(+patch?.logistics?.volumetric_weight_kg)
          ? money2(patch.logistics.volumetric_weight_kg)
          : (Number.isFinite(+updated?.logistics?.volumetric_weight_kg) ? money2(updated.logistics.volumetric_weight_kg) : null)),
      billable_weight_kg: Number.isFinite(+patch?.logistics?.billableWeightKg)
        ? money2(patch.logistics.billableWeightKg)
        : (Number.isFinite(+patch?.logistics?.billable_weight_kg)
          ? money2(patch.logistics.billable_weight_kg)
          : (Number.isFinite(+updated?.logistics?.billable_weight_kg) ? money2(updated.logistics.billable_weight_kg) : null)),
      monthly_sales_30d: logistics.monthlySales30d,
      stock_qty: getVariantInventoryTotal({ inventory: incomingInventory }),
      warehouse_id: logistics.warehouseId,
      volume_cm3: Number((logistics.lengthCm * logistics.widthCm * logistics.heightCm).toFixed(2)),
    };

    const askedFlip =
      "placement" in patch &&
      "is_default" in patch.placement;
    if (askedFlip) {
      const makeDefault = !!patch.placement.is_default;
      if (makeDefault) {
        for (let i = 0; i < list.length; i++) {
          if (i !== idx && list[i]?.placement)
            list[i].placement.is_default = false;
        }
        updated.placement = updated.placement || {};
        updated.placement.is_default = true;
      } else {
        updated.placement = updated.placement || {};
        updated.placement.is_default = false;
      }
    }

    list[idx] = updated;

    const pendingSaleRefreshes = Array.isArray(docData?.meta?.pendingSaleRefreshes)
      ? [...docData.meta.pendingSaleRefreshes]
      : [];
    if (hasSaleImprovement(beforeVariant, list[idx])) {
      const variantId = toStr(list[idx]?.variant_id);
      const filtered = pendingSaleRefreshes.filter((entry) => toStr(entry?.variantId) !== variantId);
      filtered.push({
        variantId,
        variantBefore: beforeVariant,
        variantAfter: list[idx],
        queuedAt: new Date().toISOString(),
      });
      pendingSaleRefreshes.splice(0, pendingSaleRefreshes.length, ...filtered);
    }

    const preserveLiveVersionDuringReview =
      toStr(docData?.moderation?.status).toLowerCase() === "published" || hasLiveSnapshotRecord(docData);
    const reviewSensitiveVariantChange = hasVariantReviewSensitiveChanges(beforeVariant, list[idx]);
    const keepAdminEditedReviewInQueue =
      toBool(adminReviewEdit) &&
      toStr(docData?.moderation?.status).toLowerCase() === "in_review";

    const updatePayload = {
      variants: list,
      marketplace: {
        ...(docData?.marketplace && typeof docData.marketplace === "object" ? docData.marketplace : {}),
        ...buildOfferGroupMetadata({
          sellerCode: getProductSellerCode(docData),
          variants: list,
        }),
      },
      moderation: {
        ...(docData?.moderation || {}),
        ...(reviewSensitiveVariantChange
          ? {
              status: preserveLiveVersionDuringReview ? "in_review" : "draft",
              status:
                preserveLiveVersionDuringReview || keepAdminEditedReviewInQueue
                  ? "in_review"
                  : "draft",
              reason: "variant_changed",
              notes: keepAdminEditedReviewInQueue
                ? "Updated by Piessang during review. The listing remains in the review queue until approval or rejection."
                : preserveLiveVersionDuringReview
                ? "Variant updates are in review. The current live version stays visible until the changes are approved."
                : "Variant updates require the listing to be reviewed again before it goes live.",
              reviewedAt: null,
              reviewedBy: null,
            }
          : {}),
      },
      placement: {
        ...(docData?.placement || {}),
        isActive: reviewSensitiveVariantChange
          ? preserveLiveVersionDuringReview || keepAdminEditedReviewInQueue
            ? Boolean(docData?.placement?.isActive)
            : false
          : Boolean(docData?.placement?.isActive),
      },
      meta: {
        ...(docData?.meta || {}),
        pendingSaleRefreshes,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    };
    const sellerIdentifier = toStr(
      docData?.product?.sellerSlug ||
      docData?.seller?.sellerSlug ||
      docData?.product?.sellerCode ||
      docData?.seller?.sellerCode
    );
    const sellerOwner = sellerIdentifier ? await findSellerOwnerByIdentifier(sellerIdentifier) : null;
    const sellerDeliveryProfile =
      sellerOwner?.data?.seller?.deliveryProfile && typeof sellerOwner.data.seller.deliveryProfile === "object"
        ? sellerOwner.data.seller.deliveryProfile
        : {};
    const visibilityPatch = buildShippingVisibilityPatch({
      currentProduct: docData,
      nextProduct: {
        ...docData,
        variants: list,
        placement: updatePayload.placement,
      },
      sellerDeliveryProfile,
    });
    if (visibilityPatch) {
      updatePayload.placement = visibilityPatch.placement;
      updatePayload.listing_block_reason_code = visibilityPatch.listing_block_reason_code;
      updatePayload.listing_block_reason_message = visibilityPatch.listing_block_reason_message;
    }
    if (reviewSensitiveVariantChange && preserveLiveVersionDuringReview && !hasLiveSnapshotRecord(docData)) {
      updatePayload.live_snapshot = docData;
    }
    await ref.update(updatePayload);
    if (preserveLiveVersionDuringReview) {
      await enqueueGoogleSyncProducts({
        productIds: [pid],
        reason: "variant_updated",
        metadata: { source: "variant_update", variantId: vid },
      });
    }

    const default_variant_id =
      (
        list.find((v) => v?.placement?.is_default) ||
        {}
      ).variant_id ?? null;

    const previousStock = getVariantInventoryTotal(beforeVariant);
    const nextStock = getVariantInventoryTotal(list[idx]);
    const sellerSlug = toStr(
      docData?.seller?.sellerSlug ||
        docData?.seller?.groupSellerSlug ||
        toSellerSlug(docData?.product?.vendorName || docData?.product?.brandTitle || docData?.product?.brand || docData?.product?.vendorName),
    );

    if (
      sellerSlug &&
      nextStock !== previousStock &&
      isLowStockQty(nextStock) &&
      process.env.SENDGRID_API_KEY?.startsWith("SG.")
    ) {
      try {
        const recipients = await collectSellerNotificationEmails({
          sellerSlug,
          fallbackEmails: [docData?.seller?.contactEmail, docData?.email, docData?.product?.vendorEmail].filter(Boolean),
        });

        if (recipients.length) {
          await sendSellerNotificationEmails({
            origin: new URL(req.url).origin,
            type: "seller-low-stock",
            to: recipients,
            data: {
              vendorName: docData?.product?.vendorName || docData?.seller?.vendorName || "Piessang seller",
              productTitle: docData?.product?.title || "your product",
              variantLabel: list[idx]?.label || "variant",
              currentStock: String(nextStock),
            },
          });
        }
      } catch (notificationError) {
        console.warn("variant update low-stock notification failed:", notificationError);
      }
    }

    return ok({
      message: "Variant updated.",
      unique_id: pid,
      variant_id: vid,
      default_variant_id,
      resubmissionRequired: reviewSensitiveVariantChange,
      liveVersionKept: reviewSensitiveVariantChange && (preserveLiveVersionDuringReview || keepAdminEditedReviewInQueue),
      variant: list[idx],
    });
  } catch (e) {
    console.error("variant update failed:", e);
    return err(
      Number.isFinite(Number(e?.status)) ? Number(e.status) : 500,
      Number.isFinite(Number(e?.status)) ? "Variant Update Failed" : "Unexpected Error",
      e?.message || "Failed to update variant.",
      {
        error: e.message,
        stack: e.stack,
      }
    );
  }
}
