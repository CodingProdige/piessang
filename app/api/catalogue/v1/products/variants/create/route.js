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

const ok  =(p={},s=200)=>NextResponse.json({ok:true,...p},{status:s});
const err =(s,t,m,e={})=>NextResponse.json({ok:false,title:t,message:m,...e},{status:s});

const VAT_RATE = 0.15;
const ALLOWED_VOLUME_UNITS = new Set(["kg", "ml", "lt", "g", "small", "medium", "large", "each"]);

const money2=(v)=>Number.isFinite(+v)?Math.round(+v*100)/100:0;
const toInt=(v,f=0)=>Number.isFinite(+v)?Math.trunc(+v):f;
const toNum=(v,f=0)=>Number.isFinite(+v)?+v:f;
const toStr=(v,f="")=>(v==null?f:String(v)).trim();
const toBool=(v,f=false)=>
  typeof v==="boolean"?v:
  typeof v==="number"?v!==0:
  typeof v==="string"?["true","1","yes","y"].includes(v.toLowerCase()):
  f;
const is8=(s)=>/^\d{8}$/.test(String(s??"").trim());

function hasLiveSnapshotRecord(product) {
  return Boolean(product?.live_snapshot && typeof product.live_snapshot === "object");
}

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

function getProductSellerCode(data) {
  return String(
    data?.product?.sellerCode ??
    data?.seller?.sellerCode ??
    ""
  ).trim();
}

async function collectAllCodesAndBarcodes(db) {
  const snap = await db.collection("products_v2").get();
  const ids = new Set();
  const barcodes = new Set();
  for (const d of snap.docs) {
    const data = d.data() || {};
    const sellerCode = getProductSellerCode(data).toUpperCase();
    const pCode = String(data?.product?.unique_id ?? "").trim();
    if (is8(pCode)) ids.add(pCode);
    const vars = Array.isArray(data?.variants) ? data.variants : [];
    for (const v of vars) {
      const vid = String(v?.variant_id ?? "").trim();
      const bc  = String(v?.barcode ?? "").trim();
      if (is8(vid)) ids.add(vid);
      if (bc && sellerCode) barcodes.add(`${sellerCode}::${bc.toUpperCase()}`);
    }
  }
  return { ids, barcodes };
}

function parseInventory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(it => it && typeof it === "object")
    .map(it => ({
      in_stock_qty: toInt(it.in_stock_qty, 0),
      warehouse_id: toStr(it.warehouse_id, null) || null
    }))
    .filter(it => it.warehouse_id !== null);
}

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { unique_id, data } = await req.json();
    const pid = toStr(unique_id);
    if (!is8(pid)) return err(400,"Invalid Product ID","'unique_id' must be an 8-digit string.");
    if (!data || typeof data!=="object") return err(400,"Invalid Variant","Provide a valid 'data' object.");

    const vId = toStr(data?.variant_id);
    if (!is8(vId)) return err(400,"Invalid Variant ID","'data.variant_id' must be an 8-digit string.");

    await ensureUniqueProductCode(vId);
    await ensureSkuUnique(toStr(data?.sku), { excludeProductId: pid, excludeVariantId: vId });

    const pref = db.collection("products_v2").doc(pid);
    const psnap=await pref.get();
    if(!psnap.exists)return err(404,"Product Not Found",`No product exists with unique_id ${pid}.`);

    const { ids, barcodes } = await collectAllCodesAndBarcodes(db);
    if (ids.has(vId)) return err(409,"Duplicate Code",`variant_id ${vId} already in use.`);
    const barcode = toStr(data?.barcode);
    const current = psnap.data()||{};
    const sellerCode = getProductSellerCode(current).toUpperCase();
    if (barcode && sellerCode && barcodes.has(`${sellerCode}::${barcode.toUpperCase()}`))
      return err(409,"Duplicate Barcode",`Barcode '${barcode}' is already assigned to another variant in your catalogue.`);
    const productFulfillmentMode = toStr(current?.fulfillment?.mode, "seller") === "bevgo" ? "bevgo" : "seller";
    if (!barcode) {
      return err(400, "Missing Barcode", "A barcode is required for every variant.");
    }
    const variants = Array.isArray(current.variants)?[...current.variants]:[];
    const nextPos=(variants.length
      ?Math.max(...variants.map(v=>Number.isFinite(+v?.placement?.position)?+v.placement.position:0))
      :0)+1;
    const inventoryRows = parseInventory(data?.inventory);
    const logistics = normalizeMarketplaceVariantLogistics(data?.logistics);
    const isTrackedInventory = productFulfillmentMode === "bevgo" || Boolean(data?.placement?.track_inventory) || inventoryRows.length > 0;
    const requiresLogistics = productFulfillmentMode === "bevgo";
    if (requiresLogistics && !marketplaceVariantLogisticsComplete(logistics)) {
      return err(
        400,
        "Missing Logistics",
        "Weight, dimensions, stock and monthly sales estimates are required for Piessang fulfilment variants."
      );
    }
    if (requiresLogistics && inventoryRows.length === 0) {
      return err(
        400,
        "Missing Stock",
        "Piessang fulfilment variants require stock quantities."
      );
    }

    const sellingPriceInclRaw = Number(data?.pricing?.selling_price_incl);
    if (!Number.isFinite(sellingPriceInclRaw) || sellingPriceInclRaw <= 0) {
      return err(400, "Missing Price", "VAT-inclusive selling price is required for every variant.");
    }

    const discountPercent = Math.max(0, Math.min(100, toNum(data?.sale?.discount_percent, 0)));
    const saleEnabled = toBool(data?.sale?.is_on_sale,false) || discountPercent > 0 || Number.isFinite(+data?.sale?.sale_price_incl);
    const sellingPriceIncl = money2(sellingPriceInclRaw);
    const variant={
      variant_id:vId,
      sku:toStr(data?.sku),
      label:toStr(data?.label),
      size:toStr(data?.size, null) || null,
      shade:toStr(data?.shade, null) || null,
      scent:toStr(data?.scent, null) || null,
      skinType:toStr(data?.skinType, null) || null,
      hairType:toStr(data?.hairType, null) || null,
      flavor:toStr(data?.flavor, null) || null,
      abv:toStr(data?.abv, null) || null,
      containerType:toStr(data?.containerType, null) || null,
      storageCapacity:toStr(data?.storageCapacity, null) || null,
      memoryRam:toStr(data?.memoryRam, null) || null,
      connectivity:toStr(data?.connectivity, null) || null,
      compatibility:toStr(data?.compatibility, null) || null,
      sizeSystem:toStr(data?.sizeSystem, null) || null,
      material:toStr(data?.material, null) || null,
      ringSize:toStr(data?.ringSize, null) || null,
      strapLength:toStr(data?.strapLength, null) || null,
      bookFormat:toStr(data?.bookFormat, null) || null,
      language:toStr(data?.language, null) || null,
      ageRange:toStr(data?.ageRange, null) || null,
      modelFitment:toStr(data?.modelFitment, null) || null,
      barcode:barcode,
      barcodeImageUrl: toStr(data?.barcodeImageUrl, null) || null,
      color: toStr(data?.color, null) || null,
      media: {
        images: parseImages(data?.media?.images),
      },

      placement:{
        position:Number.isFinite(+data?.placement?.position)
          ?Math.trunc(+data.placement.position)
          :nextPos,
        isActive:toBool(data?.placement?.isActive,true),
        isFeatured:toBool(data?.placement?.isFeatured,false),
        is_default:toBool(data?.placement?.is_default,variants.length===0),
        is_loyalty_eligible:toBool(data?.placement?.is_loyalty_eligible,true),
        track_inventory: isTrackedInventory,
        continue_selling_out_of_stock: isTrackedInventory
          ? false
          : toBool(data?.placement?.continue_selling_out_of_stock, false),
      },

      pricing:{
        supplier_price_excl:money2(data?.pricing?.supplier_price_excl),
        selling_price_incl: sellingPriceIncl,
        selling_price_excl:money2(moneyInclToExcl(sellingPriceIncl)),
        cost_price_excl:Number.isFinite(+data?.pricing?.cost_price_excl)
          ?money2(data.pricing.cost_price_excl)
          :money2(data?.pricing?.base_price_excl),
        rebate_eligible:toBool(data?.pricing?.rebate_eligible,true),
      },

      sale:{
        is_on_sale:saleEnabled && discountPercent > 0,
        disabled_by_admin:toBool(data?.sale?.disabled_by_admin,false),
        discount_percent: discountPercent,
        sale_price_incl:money2(
          data?.sale?.sale_price_incl ??
            (() => {
              const priceIncl = sellingPriceIncl;
              const discount = discountPercent;
              return discount > 0 ? priceIncl * (1 - discount / 100) : 0;
            })()
        ),
        sale_price_excl:money2(moneyInclToExcl(
          data?.sale?.sale_price_incl ??
            (() => {
              const priceIncl = sellingPriceIncl;
              const discount = Math.max(0, Math.min(100, toNum(data?.sale?.discount_percent, 0)));
              return discount > 0 ? priceIncl * (1 - discount / 100) : 0;
            })()
        )),
        qty_available:toInt(data?.sale?.qty_available,0),
      },

      pack:{
        unit_count:toInt(data?.pack?.unit_count,1),
        volume:toNum(data?.pack?.volume,0),
        volume_unit: ALLOWED_VOLUME_UNITS.has(normalizeVolumeUnit(data?.pack?.volume_unit)) ? normalizeVolumeUnit(data?.pack?.volume_unit) : "each",
      },
      logistics: {
        parcel_preset: toStr(data?.logistics?.parcelPreset ?? data?.logistics?.parcel_preset, null) || null,
        shipping_class: toStr(data?.logistics?.shippingClass ?? data?.logistics?.shipping_class, null) || null,
        weight_kg: logistics.weightKg,
        length_cm: logistics.lengthCm,
        width_cm: logistics.widthCm,
        height_cm: logistics.heightCm,
        volumetric_weight_kg: Number.isFinite(+data?.logistics?.volumetricWeightKg)
          ? money2(data.logistics.volumetricWeightKg)
          : (Number.isFinite(+data?.logistics?.volumetric_weight_kg) ? money2(data.logistics.volumetric_weight_kg) : null),
        billable_weight_kg: Number.isFinite(+data?.logistics?.billableWeightKg)
          ? money2(data.logistics.billableWeightKg)
          : (Number.isFinite(+data?.logistics?.billable_weight_kg) ? money2(data.logistics.billable_weight_kg) : null),
        monthly_sales_30d: logistics.monthlySales30d,
        stock_qty: getVariantInventoryTotal({ inventory: inventoryRows }),
        warehouse_id: logistics.warehouseId,
        volume_cm3: Number((logistics.lengthCm * logistics.widthCm * logistics.heightCm).toFixed(2)),
      },

      inventory: parseInventory(data?.inventory)
    };

    /* Ensure only one is_default */
    if(variant.placement.is_default){
      for(let i=0;i<variants.length;i++){
        if(variants[i]?.placement) variants[i].placement.is_default=false;
      }
    }

    variants.push(variant);

    const preserveLiveVersionDuringReview =
      toStr(current?.moderation?.status).toLowerCase() === "published" || hasLiveSnapshotRecord(current);

    const updatePayload = {
      variants,
      marketplace: {
        ...(current?.marketplace && typeof current.marketplace === "object" ? current.marketplace : {}),
        ...buildOfferGroupMetadata({
          sellerCode: getProductSellerCode(current),
          variants,
        }),
      },
      moderation: {
        ...(current?.moderation || {}),
        status: preserveLiveVersionDuringReview ? "in_review" : "draft",
        reason: "variant_changed",
        notes: preserveLiveVersionDuringReview
          ? "Variant updates are in review. The current live version stays visible until the changes are approved."
          : "Variant updates require the listing to be reviewed again before it goes live.",
        reviewedAt: null,
        reviewedBy: null,
      },
      placement: {
        ...(current?.placement || {}),
        isActive: preserveLiveVersionDuringReview ? Boolean(current?.placement?.isActive) : false,
      },
      "timestamps.updatedAt":FieldValue.serverTimestamp()
    };
    const sellerIdentifier = toStr(
      current?.product?.sellerSlug ||
      current?.seller?.sellerSlug ||
      current?.product?.sellerCode ||
      current?.seller?.sellerCode
    );
    const sellerOwner = sellerIdentifier ? await findSellerOwnerByIdentifier(sellerIdentifier) : null;
    const sellerDeliveryProfile =
      sellerOwner?.data?.seller?.deliveryProfile && typeof sellerOwner.data.seller.deliveryProfile === "object"
        ? sellerOwner.data.seller.deliveryProfile
        : {};
    const visibilityPatch = buildShippingVisibilityPatch({
      currentProduct: current,
      nextProduct: {
        ...current,
        variants,
        placement: updatePayload.placement,
      },
      sellerDeliveryProfile,
    });
    if (visibilityPatch) {
      updatePayload.placement = visibilityPatch.placement;
      updatePayload.listing_block_reason_code = visibilityPatch.listing_block_reason_code;
      updatePayload.listing_block_reason_message = visibilityPatch.listing_block_reason_message;
    }
    if (preserveLiveVersionDuringReview && !hasLiveSnapshotRecord(current)) {
      updatePayload.live_snapshot = current;
    }
    await pref.update(updatePayload);
    if (preserveLiveVersionDuringReview) {
      await enqueueGoogleSyncProducts({
        productIds: [pid],
        reason: "variant_created",
        metadata: { source: "variant_create", variantId: vId },
      });
    }

    const sellerSlug = toStr(
      current?.seller?.sellerSlug ||
        current?.seller?.groupSellerSlug ||
        toSellerSlug(current?.product?.vendorName || current?.product?.brandTitle || current?.product?.brand || current?.product?.vendorName),
    );
    const stockTotal = getVariantInventoryTotal(variant);
    if (
      sellerSlug &&
      stockTotal > 0 &&
      stockTotal <= 10 &&
      process.env.SENDGRID_API_KEY?.startsWith("SG.")
    ) {
      const recipients = await collectSellerNotificationEmails({
        sellerSlug,
        fallbackEmails: [current?.seller?.contactEmail, current?.email, current?.product?.vendorEmail].filter(Boolean),
      });
      if (recipients.length) {
        await sendSellerNotificationEmails({
          origin: new URL(req.url).origin,
          type: "seller-low-stock",
          to: recipients,
          data: {
            vendorName: current?.product?.vendorName || current?.seller?.vendorName || "Piessang seller",
            productTitle: current?.product?.title || "your product",
            variantLabel: variant.label || "variant",
            currentStock: String(stockTotal),
          },
        });
      }
    }

    return ok({
      message:"Variant added.",
      unique_id:pid,
      variant_id:vId,
      resubmissionRequired: true,
      liveVersionKept: preserveLiveVersionDuringReview,
      variant
    });

  }catch(e){
    console.error("variant create failed:",e);
    return err(500,"Unexpected Error","Failed to add variant.");
  }
}
