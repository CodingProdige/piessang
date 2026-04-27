export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { findBrandRecord, findOrCreatePendingBrandRequest } from "@/lib/catalogue/brand-upsert";
import { ensureSkuUnique, ensureUniqueProductCode } from "@/lib/catalogue/sku-uniqueness";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getVariantInventoryTotal } from "@/lib/seller/notifications";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { ensureSellerCode } from "@/lib/seller/seller-code";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";
import { buildOfferGroupMetadata } from "@/lib/catalogue/offer-group";
import { enqueueGoogleSyncProducts } from "@/lib/integrations/google-sync-queue";
import {
  buildMarketplaceFeeSnapshot,
  deriveMarketplaceVolumeCm3,
  describeMarketplaceFeeRule,
  estimateMarketplaceSuccessFeePercent,
  marketplaceVariantLogisticsComplete,
  resolveMarketplaceSuccessFeeRule,
  normalizeMarketplaceVariantLogistics,
} from "@/lib/marketplace/fees";

/* ---------------- response helpers ---------------- */
const ok  = (p={},s=201)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err = (s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });

/* ---------------- type helpers ---------------- */
const is8  = (s)=>/^\d{8}$/.test(String(s ?? "").trim());
const toStr=(v,f="")=>{
  if (v==null) return f;
  return String(v).trim();
};
const toBool=(v,f=false)=>
  typeof v==="boolean"?v
  :typeof v==="number"?v!==0
  :typeof v==="string"?["true","1","yes","y"].includes(v.toLowerCase())
  :f;
const toInt=(v,f=0)=>Number.isFinite(+v)?Math.trunc(+v):f;
const money2=(v)=>Number((Number(v) || 0).toFixed(2));

/* ---------------- NEW: Title Normalizer ---------------- */
function normalizeTitleSlug(title){
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")  // remove spaces, punctuation, symbols
    .trim();
}

async function nextPositionInGrouping(db, category, subCategory, brand) {
  const snap = await db
    .collection("products_v2")
    .where("grouping.category","==", category)
    .where("grouping.subCategory","==", subCategory)
    .where("grouping.brand","==", brand)
    .get();
  let max = 0;
  for (const docSnap of snap.docs) {
    const pos = Number(docSnap.data()?.placement?.position ?? 0);
    if (Number.isFinite(pos)) {
      max = Math.max(max, pos);
    }
  }
  return max + 1;
}

/* ---------------- field sanitizers ---------------- */
// (unchanged — keeping your entire stack)
function parseKeywords(value){
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return String(raw)
    .split(",")
    .map(s => s.replace(/\s+/g," ").trim())
    .filter(Boolean)
    .map(s => s.toLowerCase())
    .filter((v,i,a)=>a.indexOf(v)===i)
    .slice(0, 100);
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
  if (!input) return { imageUrl:null, blurHashUrl:null, altText:null, ...(fallbackPos?{position:fallbackPos}:{}) };
  if (typeof input==="string"){
    return { imageUrl:sanitizeUrl(input), blurHashUrl:null, altText:null, ...(fallbackPos?{position:fallbackPos}:{}) };
  }
  if (typeof input === "object"){
    const imageUrl    = sanitizeUrl(input.imageUrl ?? input.url);
    const blurHashUrl = sanitizeBlurHash(input.blurHashUrl ?? input.blurhash ?? input.blurHash);
    const altText     = toStr(input.altText ?? input.alt ?? input.alt_text, null) || null;
    const pos = Number.isFinite(+input?.position)?toInt(input.position):undefined;
    const base = { imageUrl, blurHashUrl, altText };
    return pos!=null ? {...base,position:pos} : (fallbackPos?{...base,position:fallbackPos}:base);
  }
  return { imageUrl:null, blurHashUrl:null, altText:null, ...(fallbackPos?{position:fallbackPos}:{}) };
}

function parseImages(value){
  let arr=[];
  if (Array.isArray(value)){
    arr=value.map((v,i)=>parseImage(v,i+1)).filter(o=>o.imageUrl||o.blurHashUrl);
  } else if (value){
    const one=parseImage(value,1);
    if (one.imageUrl||one.blurHashUrl) arr=[one];
  }
  if (arr.length){
    arr = arr
      .map((it,i)=>({...it,position:Number.isFinite(+it.position)?toInt(it.position,i+1):(i+1)}))
      .sort((a,b)=>a.position-b.position)
      .map((it,i)=>({...it,position:i+1}));
  }
  return arr;
}

function parseVideo(input, fallbackPos){
  if (typeof input === "string") {
    const sourceUrl = toStr(input, null) || null;
    return { videoUrl: sourceUrl, sourceUrl, previewUrl: null, posterUrl: null, fileName: null, processingStatus: sourceUrl ? "ready" : null, ...(fallbackPos ? { position: fallbackPos } : {}) };
  }
  if (input && typeof input === "object") {
    const sourceUrl = toStr(input.sourceUrl ?? input.originalUrl ?? input.videoUrl ?? input.url ?? input.video, null) || null;
    const videoUrl = toStr(input.videoUrl ?? input.url ?? input.video, null) || sourceUrl;
    const previewUrl = toStr(input.previewUrl, null) || null;
    const posterUrl = toStr(input.posterUrl, null) || null;
    const fileName = toStr(input.fileName ?? input.name ?? input.altText, null) || null;
    const processingStatus = toStr(input.processingStatus ?? input.status, null) || (previewUrl && videoUrl && sourceUrl && videoUrl !== sourceUrl ? "ready" : "pending");
    const pos = Number.isFinite(+input?.position) ? toInt(input.position) : undefined;
    const base = { videoUrl, sourceUrl, previewUrl, posterUrl, fileName, processingStatus };
    return pos != null ? { ...base, position: pos } : fallbackPos ? { ...base, position: fallbackPos } : base;
  }
  return { videoUrl: null, sourceUrl: null, previewUrl: null, posterUrl: null, fileName: null, processingStatus: null, ...(fallbackPos ? { position: fallbackPos } : {}) };
}

function parseVideos(value){
  let arr = [];
  if (Array.isArray(value)) {
    arr = value.map((v, i) => parseVideo(v, i + 1)).filter((o) => o.videoUrl);
  } else if (value) {
    const one = parseVideo(value, 1);
    if (one.videoUrl) arr = [one];
  }
  if (arr.length) {
    arr = arr
      .map((it, i) => ({ ...it, position: Number.isFinite(+it.position) ? toInt(it.position, i + 1) : i + 1 }))
      .sort((a, b) => a.position - b.position)
      .map((it, i) => ({ ...it, position: i + 1 }));
  }
  return arr;
}

function normalizeTimestamps(obj){
  if (!obj || typeof obj !== "object") return obj;
  const out={...obj};
  const ts=out?.timestamps;
  if (ts && typeof ts==="object"){
    const toIso=(v)=>v && typeof v?.toDate==="function" ? v.toDate().toISOString() : v;
    out.timestamps = {
      createdAt: toIso(ts.createdAt),
      updatedAt: toIso(ts.updatedAt)
    };
  }
  return out;
}

/* ---------------- route ---------------- */
export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { data } = await req.json();
    if (!data || typeof data !== "object")
      return err(400,"Invalid Data","Provide a 'data' object.");

    const uniqueId = toStr(data?.product?.unique_id);
    if (!is8(uniqueId))
      return err(400,"Invalid Unique Id","'product.unique_id' must be an 8-digit string.");

    const category    = toStr(data?.grouping?.category);
    const subCategory = toStr(data?.grouping?.subCategory);
    const brand       = toStr(data?.grouping?.brand);
    const titleRaw    = toStr(data?.product?.title);
    const titleSlug   = normalizeTitleSlug(titleRaw);
    const brandTitle  = toStr(data?.product?.brandTitle || data?.brand?.title || data?.brandTitle || brand, "");
    const vendorName  = toStr(data?.product?.vendorName || data?.seller?.vendorName || data?.shopify?.vendorName, "");
    const vendorDescription = toStr(data?.product?.vendorDescription || data?.seller?.vendorDescription || "", null) || null;
    const sellerSlug  = toStr(data?.seller?.sellerSlug || data?.product?.sellerSlug || toSellerSlug(vendorName), "");
    const sellerCodeFromPayload = toStr(data?.seller?.sellerCode || data?.product?.sellerCode || "");
    const fulfillmentMode = toStr(data?.fulfillment?.mode, "seller") || "seller";

    if (!category || !subCategory || !brand)
      return err(400,"Missing Grouping","category, subCategory and brand are required.");

    if (!titleRaw)
      return err(400,"Invalid Title","product.title is required.");
    let sellerOwner = null;
    const sellerIdentifier = sellerCodeFromPayload || sellerSlug;
    if (sellerIdentifier) {
      sellerOwner = await findSellerOwnerByIdentifier(sellerIdentifier);
      if (sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) {
        return err(403, "Seller Account Blocked", "This seller account is unavailable and cannot create products.");
      }
    }

    await ensureUniqueProductCode(uniqueId);
    await ensureSkuUnique(toStr(data?.product?.sku), {
      excludeProductId: uniqueId,
    });

    /* --- Check duplicate unique_id --- */
    const ref = db.collection("products_v2").doc(uniqueId);
    const existing = await ref.get();
    if (existing.exists)
      return err(409,"Already Exists",`Product ${uniqueId} already exists.`);

    /* --- Check duplicate titleSlug inside grouping --- */
    const dupSnap = await db
      .collection("products_v2")
      .where("grouping.category","==",category)
      .where("grouping.subCategory","==",subCategory)
      .where("grouping.brand","==",brand)
      .where("product.titleSlug","==",titleSlug)
      .get();
    if (!dupSnap.empty){
      return err(409,"Duplicate Title",
        `A product with a similar title already exists in this grouping.`
      );
    }

    const brandRecord = await findBrandRecord({
      title: brandTitle || brand,
      slug: brand,
    });
    const pendingBrandResult = brandRecord
      ? null
      : await findOrCreatePendingBrandRequest({
          title: brandTitle || brand,
          slug: brand,
          requestedByUid: sellerOwner?.id || "",
          vendorName,
          productId: uniqueId,
          productTitle: titleRaw,
        });
    const resolvedBrand = brandRecord || pendingBrandResult?.brand || {
      slug: brand,
      title: brandTitle || brand,
      code: null,
    };
    const sellerCode = ensureSellerCode(
      sellerOwner?.data?.seller?.sellerCode || sellerOwner?.data?.seller?.activeSellerCode || sellerCodeFromPayload,
      sellerOwner?.id || uniqueId,
    );
    const marketplaceFeeConfig = await loadMarketplaceFeeConfig();
    const successFeeRule = resolveMarketplaceSuccessFeeRule(category, subCategory, marketplaceFeeConfig?.categories);
    const successFeePercent = estimateMarketplaceSuccessFeePercent(successFeeRule.rule, 0);
    const successFeeLabel = describeMarketplaceFeeRule(successFeeRule.rule);

    /* --- Determine position --- */
    const requestedPos =
      Number.isFinite(+data?.placement?.position) ? toInt(data.placement.position) : null;

    const position = requestedPos ?? await nextPositionInGrouping(db, category, subCategory, brand);

    const stagedVariants = Array.isArray(data?.variants) ? data.variants : [];
    const normalizedVariants = [];
    for (const variant of stagedVariants) {
      const logistics = normalizeMarketplaceVariantLogistics(variant?.logistics || null);
      const inventoryRows = Array.isArray(variant?.inventory) ? variant.inventory : [];
      const barcode = toStr(variant?.barcode);
      const variantPriceIncl = Number.isFinite(+variant?.pricing?.selling_price_incl)
        ? money2(variant.pricing.selling_price_incl)
        : 0;
      if (!(variantPriceIncl > 0)) {
        return err(400, "Missing Price", "VAT-inclusive selling price is required for every variant.");
      }
      const salePriceIncl = Number.isFinite(+variant?.sale?.sale_price_incl)
        ? money2(variant.sale.sale_price_incl)
        : 0;
      if (fulfillmentMode === "bevgo" && !marketplaceVariantLogisticsComplete(logistics)) {
        return err(400, "Missing Logistics", "Each Piessang-fulfilled variant requires weight, dimensions, monthly sales and stock metadata.");
      }
      if (!barcode) {
        return err(400, "Missing Barcode", "A barcode is required for every variant.");
      }
      const trackInventory = fulfillmentMode === "bevgo" || Boolean(variant?.placement?.track_inventory) || inventoryRows.length > 0;

      const normalizedVariant = {
        ...variant,
        pricing: {
          ...(variant?.pricing || {}),
          selling_price_incl: variantPriceIncl,
          selling_price_excl: money2(variantPriceIncl / 1.15),
        },
        sale: {
          ...(variant?.sale || {}),
          sale_price_incl: salePriceIncl,
          sale_price_excl: salePriceIncl > 0 ? money2(salePriceIncl / 1.15) : 0,
        },
        placement: {
          ...(variant?.placement || {}),
          track_inventory: trackInventory,
          continue_selling_out_of_stock: trackInventory
            ? false
            : Boolean(variant?.placement?.continue_selling_out_of_stock),
        },
        logistics: {
          weight_kg: logistics.weightKg,
          length_cm: logistics.lengthCm,
          width_cm: logistics.widthCm,
          height_cm: logistics.heightCm,
          monthly_sales_30d: logistics.monthlySales30d,
          stock_qty: getVariantInventoryTotal({ inventory: inventoryRows }),
          warehouse_id: logistics.warehouseId,
          volume_cm3: deriveMarketplaceVolumeCm3({
            lengthCm: logistics.lengthCm,
            widthCm: logistics.widthCm,
            heightCm: logistics.heightCm,
          }),
        },
      };
      normalizedVariants.push(normalizedVariant);
    }

    /* --- Build product body --- */
    const body = {
      docId: uniqueId,
      grouping: { category, subCategory, brand: resolvedBrand.slug },
      placement: {
        position,
        isActive: toBool(data?.placement?.isActive,false),
        isFeatured: toBool(data?.placement?.isFeatured,false),
        supplier_out_of_stock: toBool(data?.placement?.supplier_out_of_stock,false),
        in_stock: toBool(data?.placement?.in_stock,true),
        inventory_tracking:
          toBool(data?.placement?.inventory_tracking,false) ||
          toStr(data?.fulfillment?.mode, "seller") === "bevgo",
      },
      media: {
        color: toStr(data?.media?.color,null) || null,
        images: parseImages(data?.media?.images),
        videos: parseVideos(data?.media?.videos),
        video: toStr(data?.media?.video,null) || parseVideos(data?.media?.videos)?.[0]?.videoUrl || null,
        icon:  toStr(data?.media?.icon, null) || null
      },
      product: {
        unique_id: uniqueId,
        sku: toStr(data?.product?.sku, null) || null,
        title: titleRaw,
        titleSlug: titleSlug,       // <--- NEW FIELD STORED
        brand: resolvedBrand.slug,
        brandTitle: resolvedBrand.title,
        brandCode: resolvedBrand.code || null,
        brandStatus: pendingBrandResult?.pending ? "pending" : "approved",
        brandRequestId: pendingBrandResult?.request?.id || null,
        sellerSlug: sellerSlug || null,
        sellerCode,
        overview: toStr(data?.product?.overview, null) || null,
        description: toStr(data?.product?.description,null) || null,
        condition: toStr(data?.product?.condition, null) || null,
        vendorDescription,
        keywords: parseKeywords(data?.product?.keywords),
        ...(vendorName ? { vendorName } : {})
      },
      seller: {
        sellerSlug: sellerSlug || null,
        sellerCode,
        shippingSettings:
          sellerOwner?.data?.seller?.shippingSettings && typeof sellerOwner.data.seller.shippingSettings === "object"
            ? sellerOwner.data.seller.shippingSettings
            : {},
      },
      moderation: {
        status: "draft",
        reason: null,
        notes: null,
        reviewedAt: null,
        reviewedBy: null,
      },
      fulfillment: {
        mode: fulfillmentMode,
        commission_rate: null,
        lead_time_days: null,
        cutoff_time: null,
        locked: true,
        change_request: null,
      },
      variants: normalizedVariants,
      inventory: Array.isArray(data?.inventory)?data.inventory:[],
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      marketplace: {
        ...buildOfferGroupMetadata({
          sellerCode,
          variants: normalizedVariants,
        }),
      },
    };

    await ref.set(body);

    if (pendingBrandResult?.created && process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const emailOrigin = new URL(req.url).origin;
      fetch(`${emailOrigin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "brand-request-internal",
          to: "admin@piessang.com",
          data: {
            brandTitle: resolvedBrand.title,
            brandSlug: resolvedBrand.slug,
            vendorName,
            productTitle: titleRaw,
            productId: uniqueId,
            requestId: pendingBrandResult?.request?.id || "",
          },
        }),
      }).catch(() => {});
    }

    const createdSnap = await ref.get();
    const createdData = normalizeTimestamps(createdSnap.data() || {});
    const product = { id: createdSnap.id, ...createdData };
    if (String(createdData?.moderation?.status || "").trim().toLowerCase() === "published") {
      await enqueueGoogleSyncProducts({
        productIds: [uniqueId],
        reason: "product_published",
        metadata: { source: "product_create" },
      });
    }

    return ok({
      unique_id: uniqueId,
      position,
      message: "Product created.",
      brandCreated: Boolean(brandRecord?.created),
      brandPending: pendingBrandResult?.pending === true,
      brand: {
        slug: resolvedBrand.slug,
        title: resolvedBrand.title,
        code: resolvedBrand.code || null,
      },
      brandRequestId: pendingBrandResult?.request?.id || null,
      product,
    }, 201);

  } catch(e){
    console.error("products_v2/create failed:", e);
    return err(500,"Unexpected Error","Something went wrong while creating the product.",{
      details:e.message
    });
  }
}
