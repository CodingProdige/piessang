export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";
import { buildMarketplaceFeeSnapshot, normalizeMarketplaceVariantLogistics } from "@/lib/marketplace/fees";
import { resolvePlatformDeliveryOption } from "@/lib/platform/delivery-settings";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { formatMoneyExact, normalizeMoneyAmount } from "@/lib/money";
import { buildShipmentParcelFromVariant } from "@/lib/shipping/contracts";
import { resolveDeliveryQuote } from "@/lib/shipping/rating";
import { getVariantAvailableQuantity as getGuardedVariantAvailableQuantity } from "@/lib/cart/interaction-guards";

/* ------------------ HELPERS ------------------- */

const ok  = (p={},s=200)=>NextResponse.json({ ok:true, data:p },{ status:s });
const err = (s,t,m,e={})=>NextResponse.json({ ok:false,title:t,message:m,...e },{ status:s });

const now = () => new Date().toISOString();
const VAT = 0.15;
const r2 = v => normalizeMoneyAmount(Number(v) || 0);
const REBATE_TIER_MAX_CAP = 5;
const CREDIT_NOTE_OPEN_STATUSES = new Set(["open", "partially_used"]);
const sellerOwnerCache = new Map();

function buildDeliveryOwnershipMeta(resolved = null) {
  const kind = String(resolved?.kind || "").trim().toLowerCase();
  if (kind === "courier_live_rate") {
    return {
      delivery_owner: "platform",
      tracking_owner: "platform",
      tracking_mode: "courier",
      rate_mode: "live_rate",
      courier_key: "easyship",
      courier_carrier: resolved?.matchedRule?.courierCarrier || null,
      courier_service: resolved?.matchedRule?.courierService || null,
    };
  }
  if (kind === "shipping") {
    return {
      delivery_owner: "seller",
      tracking_owner: "seller",
      tracking_mode: "courier",
      rate_mode: "flat",
      courier_key: null,
      courier_carrier: null,
      courier_service: null,
    };
  }
  if (kind === "direct_delivery") {
    return {
      delivery_owner: "seller",
      tracking_owner: "seller",
      tracking_mode: "direct",
      rate_mode: "seller_direct",
      courier_key: null,
      courier_carrier: null,
      courier_service: null,
    };
  }
  return {
    delivery_owner: "seller",
    tracking_owner: "seller",
    tracking_mode: "hidden",
    rate_mode: "manual",
    courier_key: null,
    courier_carrier: null,
    courier_service: null,
  };
}

function getVariantInventoryTotal(variant){
  const rows = Array.isArray(variant?.inventory) ? variant.inventory : [];
  return rows.reduce((sum, row) => {
    const qty = Number(row?.in_stock_qty ?? row?.unit_stock_qty ?? row?.quantity ?? row?.qty ?? 0);
    return Number.isFinite(qty) && qty > 0 ? sum + qty : sum;
  }, 0);
}

function getVariantAvailableQuantity(variant){
  const guardedQuantity = getGuardedVariantAvailableQuantity(variant);
  if (typeof guardedQuantity === "number") return Math.max(0, guardedQuantity);
  return null;
}

function isCheckoutCart(cart) {
  return String(cart?.cart?.status || "").trim().toLowerCase() === "checkout";
}

function refreshVariantMarketplaceFees(product, variant, feeConfig){
  const fulfillmentMode = String(product?.fulfillment?.mode ?? "seller").toLowerCase() === "bevgo" ? "bevgo" : "seller";
  const logistics = normalizeMarketplaceVariantLogistics(variant?.logistics || null);
  const feeSnapshot = buildMarketplaceFeeSnapshot({
    categorySlug: String(product?.grouping?.category || ""),
    subCategorySlug: String(product?.grouping?.subCategory || "") || null,
    sellingPriceIncl: Number(variant?.pricing?.selling_price_incl || 0),
    weightKg: logistics.weightKg,
    lengthCm: logistics.lengthCm,
    widthCm: logistics.widthCm,
    heightCm: logistics.heightCm,
    stockQty: getVariantInventoryTotal(variant),
    monthlySales30d: logistics.monthlySales30d,
    fulfillmentMode,
    config: feeConfig,
  });
  return {
    ...variant,
    fees: {
      ...(variant?.fees || {}),
      success_fee_percent: feeSnapshot.successFeePercent,
      success_fee_incl: feeSnapshot.successFeeIncl,
      fulfilment_fee_incl: feeSnapshot.fulfilmentFeeIncl,
      handling_fee_incl: feeSnapshot.handlingFeeIncl,
      storage_fee_incl: feeSnapshot.storageFeeIncl,
      total_fees_incl: feeSnapshot.totalFeesIncl,
      size_band: feeSnapshot.sizeBand,
      weight_band: feeSnapshot.weightBand,
      storage_band: feeSnapshot.storageBand,
      stock_cover_days: feeSnapshot.stockCoverDays,
      overstocked: feeSnapshot.overstocked,
      fulfilment_mode: feeSnapshot.fulfillmentMode,
      config_version: feeSnapshot.configVersion,
    },
  };
}

function firstSellerIdentity(data) {
  return String(
    data?.seller?.sellerCode ||
      data?.seller?.activeSellerCode ||
      data?.seller?.groupSellerCode ||
      data?.seller?.sellerSlug ||
      data?.product?.sellerCode ||
      data?.product?.sellerSlug ||
      data?.product?.vendorSlug ||
      "",
  ).trim();
}

function applySellerDisplayData(data, sellerOwner) {
  if (!sellerOwner?.data) return data;
  const seller = sellerOwner.data?.seller && typeof sellerOwner.data.seller === "object" ? sellerOwner.data.seller : {};
  const sellerCode = String(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || "").trim();
  const vendorName = String(seller?.vendorName || seller?.groupVendorName || "").trim();
  const vendorDescription = String(seller?.vendorDescription || seller?.description || "").trim();
  const deliveryProfile = normalizeSellerDeliveryProfile(
    seller?.deliveryProfile && typeof seller.deliveryProfile === "object" ? seller.deliveryProfile : {},
  );
  const courierProfile =
    seller?.courierProfile && typeof seller.courierProfile === "object" ? seller.courierProfile : {};

  return {
    ...data,
    seller: {
      ...(data?.seller && typeof data.seller === "object" ? data.seller : {}),
      sellerCode: sellerCode || null,
      vendorName: vendorName || null,
      vendorDescription: vendorDescription || null,
      baseLocation: String(seller?.baseLocation || data?.seller?.baseLocation || "").trim() || null,
      sellerSlug: String(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.seller?.sellerSlug || "").trim() || null,
      activeSellerSlug: String(seller?.activeSellerSlug || seller?.sellerSlug || data?.seller?.activeSellerSlug || "").trim() || null,
      groupSellerSlug: String(seller?.groupSellerSlug || seller?.sellerSlug || data?.seller?.groupSellerSlug || "").trim() || null,
      deliveryProfile,
      courierProfile,
    },
    product: {
      ...(data?.product && typeof data.product === "object" ? data.product : {}),
      vendorName: vendorName || data?.product?.vendorName || null,
      vendorDescription: vendorDescription || data?.product?.vendorDescription || null,
      sellerCode: sellerCode || data?.product?.sellerCode || null,
      sellerSlug: String(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || data?.product?.sellerSlug || "").trim() || null,
    },
  };
}

async function enrichCartProductSnapshot(data) {
  const sellerIdentity = firstSellerIdentity(data);
  if (!sellerIdentity) return data;
  const cacheKey = sellerIdentity.toLowerCase();
  if (!sellerOwnerCache.has(cacheKey)) {
    const sellerOwner = sellerIdentity.toUpperCase().startsWith("SC-")
      ? await findSellerOwnerByCode(sellerIdentity)
      : await findSellerOwnerBySlug(sellerIdentity);
    sellerOwnerCache.set(cacheKey, sellerOwner || null);
  }
  return applySellerDisplayData(data, sellerOwnerCache.get(cacheKey));
}

function computeLineTotals(v, qty){
  qty = Number(qty);

  let unitPriceIncl = 0;
  if (v?.sale?.is_on_sale && Number.isFinite(Number(v?.sale?.sale_price_incl))){
    unitPriceIncl = r2(v.sale.sale_price_incl);
  } else if (Number.isFinite(Number(v?.pricing?.selling_price_incl))) {
    unitPriceIncl = r2(v.pricing.selling_price_incl);
  } else if (v?.sale?.is_on_sale && Number.isFinite(Number(v?.sale?.sale_price_excl))) {
    unitPriceIncl = r2(Number(v.sale.sale_price_excl) * (1 + VAT));
  } else {
    unitPriceIncl = r2(Number(v?.pricing?.selling_price_excl || 0) * (1 + VAT));
  }

  const baseIncl = r2(unitPriceIncl * qty);
  const base = r2(baseIncl / (1 + VAT));
  const baseVat = r2(baseIncl - base);

  return {
    unit_price_excl: r2(unitPriceIncl / (1 + VAT)),
    unit_price_incl: unitPriceIncl,
    line_subtotal_excl: base,
    line_subtotal_incl: baseIncl,
    returnable_excl: 0,
    total_vat: baseVat,
    final_excl: base,
    final_incl: baseIncl,
    sale_savings_excl: 0
  };
}

function collectLineQuoteItems(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const quantity = Math.max(0, Number(item?.qty ?? item?.quantity ?? 0));
  if (quantity <= 0) return [];
  const lineTotal = Number(item?.line_totals?.final_incl || 0);
  const unitValue = quantity > 0 ? r2(lineTotal / quantity) : 0;
  const productShipping = product?.product?.shipping || product?.shipping || {};
  return [
    {
      description: String(product?.product?.title || variant?.label || "Marketplace item").trim(),
      quantity,
      unitValue,
      customsCategory: productShipping?.customsCategory || null,
      hsCode: productShipping?.hsCode || null,
      countryOfOrigin: productShipping?.countryOfOrigin || null,
    },
  ];
}

function isLineCourierEligible(item) {
  const product = item?.product_snapshot || item?.product || {};
  return product?.product?.shipping?.courierEnabled === true;
}

async function computeSellerDeliveryFees(items, deliveryAddress = null, pickupSelections = [], courierSelections = {}){
  const groups = new Map();
  const pickupSet = new Set(
    (Array.isArray(pickupSelections) ? pickupSelections : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const shopperArea = deliveryAddress
    ? {
        city: deliveryAddress?.city || deliveryAddress?.suburb || "",
        suburb: deliveryAddress?.suburb || "",
        province: deliveryAddress?.province || deliveryAddress?.stateProvinceRegion || "",
        stateProvinceRegion: deliveryAddress?.stateProvinceRegion || deliveryAddress?.province || "",
        postalCode: deliveryAddress?.postalCode || "",
        country: deliveryAddress?.country || "South Africa",
        latitude: deliveryAddress?.latitude == null ? null : Number(deliveryAddress.latitude),
        longitude: deliveryAddress?.longitude == null ? null : Number(deliveryAddress.longitude),
      }
    : null;

  for (const item of Array.isArray(items) ? items : []) {
    const product = item?.product_snapshot || {};
    const seller = product?.seller || {};
    const fulfillmentMode = String(product?.fulfillment?.mode || "").trim().toLowerCase();
    const sellerKey =
      String(product?.product?.sellerCode || seller?.sellerCode || seller?.sellerSlug || product?.product?.sellerSlug || "").trim();
    if (!sellerKey || fulfillmentMode !== "seller") continue;

    const existing = groups.get(sellerKey) || {
      sellerKey,
      sellerName: String(seller?.vendorName || product?.product?.vendorName || "Seller").trim(),
      sellerBase: String(seller?.baseLocation || "").trim(),
      deliveryProfile: seller?.deliveryProfile && typeof seller.deliveryProfile === "object" ? seller.deliveryProfile : {},
      courierProfile: seller?.courierProfile && typeof seller.courierProfile === "object" ? seller.courierProfile : {},
      items: [],
      subtotalIncl: 0,
      productCourierEligible: true,
      quoteItems: [],
      parcels: [],
    };
    existing.items.push(item);
    existing.subtotalIncl = r2(existing.subtotalIncl + Number(item?.line_totals?.final_incl || 0));
    existing.productCourierEligible = existing.productCourierEligible && isLineCourierEligible(item);
    existing.quoteItems.push(...collectLineQuoteItems(item));
    const parcel = buildShipmentParcelFromVariant(item?.selected_variant_snapshot || item?.selected_variant || item?.variant || null);
    const quantity = Math.max(0, Number(item?.qty ?? item?.quantity ?? 0));
    if (parcel && quantity > 0) {
      for (let index = 0; index < quantity; index += 1) existing.parcels.push(parcel);
    }
    groups.set(sellerKey, existing);
  }

  const breakdown = [];
  let totalIncl = 0;

  for (const group of groups.values()) {
    if (pickupSet.has(group.sellerKey) && group?.deliveryProfile?.pickup?.enabled === true) {
      breakdown.push({
        seller_key: group.sellerKey,
        seller_name: group.sellerName,
        label: "Collection from seller",
        applicable: true,
        delivery_type: "collection",
        lead_time_days: group?.deliveryProfile?.pickup?.leadTimeDays ?? null,
        matched_rule_id: null,
        matched_rule_label: "pickup",
        amount_incl: 0,
        amount_excl: 0,
        currency: "ZAR",
        delivery_owner: "seller",
        tracking_owner: "seller",
        tracking_mode: "hidden",
        rate_mode: "collection",
      });
      continue;
    }

    const resolved = await resolveDeliveryQuote({
      profile: group.deliveryProfile || {},
      courierProfile: group.courierProfile || {},
      productCourierEligible: group.productCourierEligible === true,
      quoteItems: group.quoteItems,
      selectedCourierQuoteId: String(courierSelections?.[group.sellerKey] || "").trim(),
      sellerBaseLocation: group.sellerBase,
      shopperArea,
      subtotalIncl: group.subtotalIncl,
      parcels: group.parcels,
      currency: "ZAR",
    });
    const amount = r2(Number(resolved?.amountIncl || 0));
    const label = String(resolved?.label || "Seller delivery unavailable for this address");
    const applicable = resolved?.available === true;

    totalIncl = r2(totalIncl + amount);
    breakdown.push({
      seller_key: group.sellerKey,
      seller_name: group.sellerName,
      label,
      applicable,
      delivery_type: resolved?.kind || "unavailable",
      lead_time_days: resolved?.leadTimeDays ?? null,
      matched_rule_id: resolved?.matchedRule?.id || null,
      matched_rule_label: resolved?.matchedRule?.label || null,
      amount_incl: amount,
      amount_excl: amount,
      currency: "ZAR",
      available_courier_quotes:
        Array.isArray(resolved?.metadata?.availableQuotes) ? resolved.metadata.availableQuotes : [],
      selected_courier_quote_id:
        String(resolved?.metadata?.selectedQuoteId || resolved?.matchedRule?.id || "").trim() || null,
      shipment_summary: resolved?.shipmentSummary || null,
      ...buildDeliveryOwnershipMeta(resolved),
    });
  }

  return {
    total_incl: totalIncl,
    total_excl: totalIncl,
    breakdown,
  };
}

function computeCartTotals(items, deliveryFee = 0, sellerDelivery = { total_excl: 0, total_incl: 0, breakdown: [] }){
  let subtotal = 0;
  let savings  = 0;
  let vat_total = 0;
  const delivery = Number(deliveryFee) || 0;
  const sellerDeliveryExcl = Number(sellerDelivery?.total_excl || 0) || 0;

  for (const it of items){
    const v = it.selected_variant_snapshot;
    const qty = it.quantity;
    const lt = computeLineTotals(v, qty);

    subtotal += lt.line_subtotal_excl;
    vat_total+= lt.total_vat;

    // track possible sale saving
    if (v?.sale?.is_on_sale){
      const normalIncl = Number(v?.pricing?.selling_price_incl) || (Number(v?.pricing?.selling_price_excl) || 0) * (1 + VAT);
      const saleIncl = Number(v?.sale?.sale_price_incl) || (Number(v?.sale?.sale_price_excl) || 0) * (1 + VAT);
      if (normalIncl > saleIncl){
        savings += r2(((normalIncl - saleIncl) * qty) / (1 + VAT));
      }
    }
  }

  const final_excl = r2(subtotal + delivery + sellerDeliveryExcl);
  const final_incl = r2(final_excl + vat_total);

  return {
    subtotal_excl: r2(subtotal),
    deposit_total_excl: 0,
    delivery_fee_excl: r2(delivery),
    delivery_fee_incl: r2(delivery),
    seller_delivery_fee_excl: r2(sellerDeliveryExcl),
    seller_delivery_fee_incl: r2(Number(sellerDelivery?.total_incl || sellerDeliveryExcl)),
    seller_delivery_breakdown: Array.isArray(sellerDelivery?.breakdown) ? sellerDelivery.breakdown : [],
    sale_savings_excl: r2(savings),
    vat_total: r2(vat_total),
    final_excl,
    final_incl
  };
}

function buildEmptySellerDelivery() {
  return {
    total_excl: 0,
    total_incl: 0,
    breakdown: [],
  };
}

const REBATE_TIERS = [
  { min: 0,     percent: 1 },
  { min: 3000,  percent: 2 },
  { min: 10000, percent: 3 },
  { min: 30000, percent: 4 },
  { min: 60000, percent: 5 }
];

function resolveVolumeRebatePercent(subtotalExcl){
  const total = Number(subtotalExcl) || 0;
  let pct = 0;
  for (const t of REBATE_TIERS){
    if (total >= t.min) pct = t.percent;
  }
  return pct;
}

function nextRebateTierInfo(subtotalExcl){
  const total = Number(subtotalExcl) || 0;
  for (const t of REBATE_TIERS){
    if (total < t.min){
      return {
        next_tier_min_excl: r2(t.min),
        next_tier_percent: t.percent,
        remaining_to_next_tier_excl: r2(t.min - total)
      };
    }
  }
  return {
    next_tier_min_excl: null,
    next_tier_percent: null,
    remaining_to_next_tier_excl: r2(0)
  };
}

function computePricingAdjustments(subtotalExcl, pricing){
  const discountPercentage = Number(pricing?.discountPercentage) || 0;
  const rebateEligible = Boolean(pricing?.rebate?.rebateEligible);
  const tierLocked = Boolean(pricing?.rebate?.tierLocked);
  const tierValue = Number(pricing?.rebate?.tier) || 0;

  if (discountPercentage > 0){
    const pct = Math.min(discountPercentage, 100);
    return { type: "discount", percent: pct, amountExcl: r2(subtotalExcl * (pct / 100)) };
  }

  if (!rebateEligible){
    return { type: "none", percent: 0, amountExcl: 0 };
  }

  const tierCap = tierValue > 0 ? Math.min(tierValue, REBATE_TIER_MAX_CAP) : REBATE_TIER_MAX_CAP;
  const volumePercent = resolveVolumeRebatePercent(subtotalExcl);
  const pct = tierLocked ? tierCap : Math.min(volumePercent, tierCap);

  return { type: "rebate", percent: pct, amountExcl: r2(subtotalExcl * (pct / 100)) };
}

function hasDeliveryAddress(address){
  if (!address || typeof address !== "object") return false;
  return Object.values(address).some((v) => {
    if (typeof v === "string") return v.trim().length > 0;
    return v != null;
  });
}

async function fetchDeliveryFee(address, userId){
  if (!hasDeliveryAddress(address)) {
    return { amount: 0, meta: null };
  }

  try {
    const shopperArea = {
      city: address?.city || address?.suburb || "",
      suburb: address?.suburb || "",
      province: address?.province || address?.stateProvinceRegion || "",
      stateProvinceRegion: address?.stateProvinceRegion || address?.province || "",
      postalCode: address?.postalCode || "",
      country: address?.country || "South Africa",
      latitude: address?.latitude == null ? null : Number(address.latitude),
      longitude: address?.longitude == null ? null : Number(address.longitude),
    };
    const resolved = await resolvePlatformDeliveryOption({ shopperArea, subtotalIncl: 0 });
    if (!resolved?.available) {
      return {
        amount: 0,
        meta: {
          ok: false,
          supported: false,
          canPlaceOrder: false,
          reasonCode: "OUTSIDE_SERVICE_AREA",
          message: "Delivery is not available for this address.",
        }
      };
    }

    return {
      amount: r2(Number(resolved?.amountIncl || 0)),
      meta: {
        ok: true,
        supported: true,
        canPlaceOrder: true,
        fee: {
          amount: r2(Number(resolved?.amountIncl || 0)),
          currency: "ZAR",
          band: resolved?.matchedRule?.label || resolved?.kind || null,
          reason: resolved?.kind || null,
        },
        leadTimeDays: resolved?.leadTimeDays ?? null,
        cutoffTime: resolved?.cutoffTime || null,
        matchedRule: resolved?.matchedRule || null,
      }
    };
  } catch (e) {
    return {
      amount: 0,
      meta: {
        ok: false,
        error: String(e)
      }
    };
  }
}

const tsToMillis = (v) => {
  if (v && typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
};

function shouldIncludeCreditNote(note) {
  const statusRaw = String(note?.status ?? "").trim().toLowerCase();
  if (!statusRaw) return true;
  return CREDIT_NOTE_OPEN_STATUSES.has(statusRaw);
}

async function fetchAvailableCreditNotes(customerId) {
  const db = getAdminDb();
  if (!db) return { notes: [], available_incl: 0, notes_summary: { count: 0, total_available_incl: 0, credit_note_ids: [] } };
  const rs = await db.collection("credit_notes_v2").where("customerId", "==", String(customerId)).get();

  const notes = rs.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter(shouldIncludeCreditNote)
    .map((n) => ({
      creditNoteId: n.id,
      remaining_amount_incl: r2(Math.max(0, Number(n?.remaining_amount_incl) || 0)),
      status: String(n?.status ?? "").trim() || null,
      created_at_ms: tsToMillis(n?.timestamps?.createdAt ?? n?.createdAt ?? n?.allocatedAt)
    }))
    .filter((n) => n.remaining_amount_incl > 0)
    .sort((a, b) => a.created_at_ms - b.created_at_ms);

  const available_incl = r2(notes.reduce((sum, n) => sum + n.remaining_amount_incl, 0));
  const notes_summary = {
    count: notes.length,
    total_available_incl: available_incl,
    credit_note_ids: notes.map((n) => n.creditNoteId)
  };

  return { notes, available_incl, notes_summary };
}

function computeCreditApplication({ payableIncl = 0, useCredit = false, notes = [] }) {
  const payable = r2(Math.max(0, Number(payableIncl) || 0));
  if (!useCredit || payable <= 0) {
    return {
      applied: 0,
      notes_applied_incl: 0,
      final_payable_incl: payable,
      applied_allocations: []
    };
  }

  let remainingPayable = payable;
  const allocations = [];

  for (const n of notes) {
    if (remainingPayable <= 0) break;
    const available = r2(Math.max(0, Number(n?.remaining_amount_incl) || 0));
    if (available <= 0) continue;
    const take = r2(Math.min(available, remainingPayable));
    if (take <= 0) continue;
    allocations.push({ creditNoteId: n.creditNoteId, amount_incl: take });
    remainingPayable = r2(Math.max(0, remainingPayable - take));
  }

  const notesApplied = r2(payable - remainingPayable);
  const applied = notesApplied;

  return {
    applied,
    notes_applied_incl: notesApplied,
    final_payable_incl: r2(Math.max(0, payable - applied)),
    applied_allocations: allocations
  };
}

/* ------------------ MAIN ENDPOINT ------------------- */

export async function POST(req){
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500,"Database Unavailable","Admin database is not configured.");
    }
    const marketplaceFeeConfig = await loadMarketplaceFeeConfig();
    const {
      customerId,
      deliveryAddress,
      useCredit,
      onBehalfOfUid,
      pickupSelections,
      courierSelections,
      includeDelivery,
    } = await req.json();
    if (!customerId)
      return err(400,"Invalid Request","customerId is required.");

    const shouldIncludeDelivery = includeDelivery !== false;

    const pricingProfileUid = String(onBehalfOfUid || customerId).trim();

    const { amount: deliveryFee, meta: deliveryMeta } = shouldIncludeDelivery
      ? await fetchDeliveryFee(
          deliveryAddress,
          customerId
        )
      : { amount: 0, meta: {} };

    const userRef = db.collection("users").doc(pricingProfileUid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : null;
    const useCreditFlag = true;
    const creditSnapshot = await fetchAvailableCreditNotes(customerId);

    const cartRef = db.collection("carts").doc(customerId);
    const cartSnap = await cartRef.get();

    /* ------------------------------------------
       🎯 CART DOES NOT EXIST → NEW EMPTY
    ------------------------------------------- */
    if (!cartSnap.exists){
      const emptyCart = {
        docId: customerId,
        cart: {
          cartId: customerId,
          customerId,
          channel: "unknown"
        },
        items: [],
        item_count: 0,
        cart_corrected: false,
        meta: {
          lastAction: "",
          notes: null,
          source: "api"
        },
        timestamps: {
          createdAt: now(),
          updatedAt: now()
        }
      };

      const sellerDelivery = shouldIncludeDelivery
        ? await computeSellerDeliveryFees([], deliveryAddress, pickupSelections, courierSelections)
        : buildEmptySellerDelivery();
      const emptyTotals = computeCartTotals([], deliveryFee, sellerDelivery);
      const adjust = computePricingAdjustments(emptyTotals.subtotal_excl, userData?.pricing);
      const rebateNextTier = (
        adjust.type === "rebate" && !userData?.pricing?.rebate?.tierLocked
      ) ? nextRebateTierInfo(emptyTotals.subtotal_excl) : {
        next_tier_min_excl: null,
        next_tier_percent: null,
        remaining_to_next_tier_excl: r2(0)
      };
      const discountedProductsExcl = r2(emptyTotals.subtotal_excl - adjust.amountExcl);
      const discountedExcl = r2(
        discountedProductsExcl +
          emptyTotals.deposit_total_excl +
          emptyTotals.delivery_fee_excl +
          r2(emptyTotals.seller_delivery_fee_excl || 0)
      );
      const discountedIncl = r2(discountedExcl + emptyTotals.vat_total);
      const creditCalc = computeCreditApplication({
        payableIncl: discountedIncl,
        useCredit: useCreditFlag,
        notes: creditSnapshot.notes
      });

      const emptyCartWithPricing = {
        ...emptyCart,
        totals: {
          ...emptyTotals,
          base_final_excl: emptyTotals.final_excl,
          base_final_incl: emptyTotals.final_incl,
          pricing_adjustment: {
            type: adjust.type,
            percent: adjust.percent,
            amount_excl: adjust.amountExcl,
            tier_locked: Boolean(userData?.pricing?.rebate?.tierLocked),
            next_tier_min_excl: rebateNextTier.next_tier_min_excl,
            next_tier_percent: rebateNextTier.next_tier_percent,
            remaining_to_next_tier_excl: rebateNextTier.remaining_to_next_tier_excl
          },
          pricing_savings_excl: adjust.amountExcl,
          final_excl_after_discount: discountedExcl,
          final_incl_after_discount: discountedIncl,
          credit: {
            available_incl: creditSnapshot.available_incl,
            applied: creditCalc.applied,
            applied_formatted: formatMoneyExact(creditCalc.applied, { currencySymbol: "", space: false }),
            notes_available_incl: creditSnapshot.available_incl,
            notes_applied_incl: creditCalc.notes_applied_incl,
            applied_allocations: creditCalc.applied_allocations,
            notes_summary: creditSnapshot.notes_summary
          },
          final_excl: discountedExcl,
          final_incl: creditCalc.final_payable_incl,
          final_payable_incl: creditCalc.final_payable_incl
        }
      };

      await cartRef.set(emptyCartWithPricing);

      return ok({
        cart: emptyCartWithPricing,
        pricing_profile_uid: pricingProfileUid,
        credit: {
          available_incl: creditSnapshot.available_incl,
          applied_formatted: formatMoneyExact(creditCalc.applied, { currencySymbol: "", space: false }),
          notes_available_incl: creditSnapshot.available_incl,
          notes_applied_incl: creditCalc.notes_applied_incl,
          notes_summary: creditSnapshot.notes_summary,
          applied_allocations: creditCalc.applied_allocations
        },
        delivery_fee: { amount: r2(deliveryFee), meta: deliveryMeta },
        warnings: { global: [], items: [] }
      });
    }

    /* ------------------------------------------
       🎯 CART EXISTS
    ------------------------------------------- */
    const cart = cartSnap.data();
    const checkoutLockedCart = isCheckoutCart(cart);
    const items = Array.isArray(cart.items) ? cart.items : [];

    // Track warnings and removals
    const warnings = { global: [], items: [] };
    const productCache = new Map();
    const kept = [];

    /* ------------------------------------------
       🔥 VALIDATE AGAINST ADMIN DISABLED SALES
       (preserve stored snapshots otherwise)
    ------------------------------------------- */
    for (const it of items){
      const vSnap = it?.selected_variant_snapshot;
      const pSnap = it?.product_snapshot;
      if (!vSnap || !pSnap) {
        kept.push(it);
        continue;
      }

      const productId = pSnap.product?.unique_id;
      if (!productId) {
        kept.push(it);
        continue;
      }

      let liveProd = productCache.get(productId);
      if (!liveProd) {
        const productRef = db.collection("products_v2").doc(String(productId));
        const prodSnap = await productRef.get();
        liveProd = prodSnap.exists ? prodSnap.data() : null;
        productCache.set(productId, liveProd);
      }
      if (!liveProd) {
        kept.push(it);
        continue;
      }

      const liveVar = (Array.isArray(liveProd.variants) ? liveProd.variants : []).find(v =>
        String(v?.variant_id) === String(vSnap.variant_id)
      );

      // If sale disabled by admin and item was on sale in cart, drop it with warning
      if (liveVar?.sale?.disabled_by_admin && vSnap?.sale?.is_on_sale){
        warnings.items.push({
          cart_item_key: it.cart_item_key || null,
          variant_id: vSnap.variant_id || null,
          message: "Removed sale item; sale has ended (disabled by admin)."
        });
        continue;
      }

      const enrichedProductSnapshot = await enrichCartProductSnapshot(liveProd);
      const clean = {
        ...it,
        product_snapshot: enrichedProductSnapshot,
      };

      const continueSellingOutOfStock = Boolean(liveVar?.placement?.continue_selling_out_of_stock);
      const availableQuantity = getVariantAvailableQuantity(liveVar);
      const moderationStatus = String(liveProd?.moderation?.status || "").trim().toLowerCase();
      const productNotLive =
        !liveVar ||
        liveProd?.placement?.isActive === false ||
        ["draft", "rejected", "blocked"].includes(moderationStatus);
      const stockUnavailable =
        !productNotLive &&
        !continueSellingOutOfStock &&
        typeof availableQuantity === "number" &&
        availableQuantity <= 0;

      if (productNotLive || stockUnavailable) {
        const noLongerLive =
          !liveVar ||
          liveProd?.placement?.isActive === false ||
          ["draft", "rejected"].includes(moderationStatus);
        const availabilityMessage = noLongerLive
          ? "This item is no longer available and must be removed from your cart before checkout."
          : moderationStatus === "blocked"
            ? "This item is no longer available and must be removed from your cart before checkout."
            : "This item is now out of stock. Remove it from your cart before continuing to checkout.";

        clean.availability = {
          status: noLongerLive ? "unavailable" : "out_of_stock",
          message: availabilityMessage,
        };
        clean.line_totals = computeLineTotals(clean.selected_variant_snapshot, clean.quantity);
        kept.push(clean);
        warnings.items.push({
          cart_item_key: it.cart_item_key || null,
          variant_id: vSnap.variant_id || null,
          message: availabilityMessage,
        });
        continue;
      }

      // If item was on sale in cart, preserve its snapshot/pricing
      if (vSnap?.sale?.is_on_sale) {
        clean.availability = {
          status: "available",
          message: ""
        };
        clean.line_totals = computeLineTotals(clean.selected_variant_snapshot, clean.quantity);
        kept.push(clean);
        continue;
      }

      // During checkout, keep the existing snapshot stable while payment is in progress.
      if (checkoutLockedCart) {
        clean.availability = {
          status: "available",
          message: ""
        };
        clean.line_totals = computeLineTotals(clean.selected_variant_snapshot, clean.quantity);
        kept.push(clean);
        continue;
      }

      // For active carts, refresh variant pricing and sale state from live data.
      if (liveVar) {
        const mergedVariant = refreshVariantMarketplaceFees(enrichedProductSnapshot, {
          ...vSnap,
          ...liveVar,
          pricing: liveVar.pricing ?? vSnap.pricing,
          sale: liveVar.sale ?? vSnap.sale,
          pack: liveVar.pack ?? vSnap.pack
        }, marketplaceFeeConfig);

        // Detect price change
        const prevPrice = Number(vSnap?.pricing?.selling_price_incl) || (Number(vSnap?.pricing?.selling_price_excl) || 0) * (1 + VAT);
        const newPrice = Number(mergedVariant?.pricing?.selling_price_incl) || (Number(mergedVariant?.pricing?.selling_price_excl) || 0) * (1 + VAT);
        if (newPrice !== prevPrice) {
          warnings.items.push({
            cart_item_key: it.cart_item_key || null,
            variant_id: vSnap.variant_id || null,
            message: `Price updated from ${r2(prevPrice)} to ${r2(newPrice)}.`
          });
        }

        clean.selected_variant_snapshot = mergedVariant;
        clean.availability = {
          status: "available",
          message: ""
        };
        clean.line_totals = computeLineTotals(mergedVariant, clean.quantity);
        kept.push(clean);
        continue;
      }

      // Fallback: keep as-is
      clean.availability = {
        status: "available",
        message: ""
      };
      clean.line_totals = computeLineTotals(clean.selected_variant_snapshot, clean.quantity);
      kept.push(clean);
    }

    /* ------------------------------------------
       🔄 RECOMPUTE CART TOTALS
    ------------------------------------------- */
    const sellerDelivery = shouldIncludeDelivery
      ? await computeSellerDeliveryFees(kept, deliveryAddress, pickupSelections, courierSelections)
      : buildEmptySellerDelivery();
    const totals = computeCartTotals(kept, deliveryFee, sellerDelivery);
    const adjust = computePricingAdjustments(totals.subtotal_excl, userData?.pricing);
    const rebateNextTier = (
      adjust.type === "rebate" && !userData?.pricing?.rebate?.tierLocked
    ) ? nextRebateTierInfo(totals.subtotal_excl) : {
      next_tier_min_excl: null,
      next_tier_percent: null,
      remaining_to_next_tier_excl: r2(0)
    };
    const discountedProductsExcl = r2(totals.subtotal_excl - adjust.amountExcl);
    const discountedExcl = r2(
      discountedProductsExcl +
        totals.deposit_total_excl +
        totals.delivery_fee_excl +
        r2(totals.seller_delivery_fee_excl || 0)
    );
    const discountedIncl = r2(discountedExcl + totals.vat_total);
    const creditCalc = computeCreditApplication({
      payableIncl: discountedIncl,
      useCredit: useCreditFlag,
      notes: creditSnapshot.notes
    });
    const finalCart = {
      ...cart,
      items: kept,
      totals: {
        ...totals,
        base_final_excl: totals.final_excl,
        base_final_incl: totals.final_incl,
        pricing_adjustment: {
          type: adjust.type,
          percent: adjust.percent,
          amount_excl: adjust.amountExcl,
          tier_locked: Boolean(userData?.pricing?.rebate?.tierLocked),
          next_tier_min_excl: rebateNextTier.next_tier_min_excl,
          next_tier_percent: rebateNextTier.next_tier_percent,
          remaining_to_next_tier_excl: rebateNextTier.remaining_to_next_tier_excl
        },
        pricing_savings_excl: adjust.amountExcl,
        final_excl_after_discount: discountedExcl,
        final_incl_after_discount: discountedIncl,
        credit: {
          available_incl: creditSnapshot.available_incl,
          applied: creditCalc.applied,
          applied_formatted: formatMoneyExact(creditCalc.applied, { currencySymbol: "", space: false }),
          notes_available_incl: creditSnapshot.available_incl,
          notes_applied_incl: creditCalc.notes_applied_incl,
          applied_allocations: creditCalc.applied_allocations,
          notes_summary: creditSnapshot.notes_summary
        },
        final_excl: discountedExcl,
        final_incl: creditCalc.final_payable_incl,
        final_payable_incl: creditCalc.final_payable_incl
      },
      item_count: kept.reduce((a,it)=>a+(Number(it.quantity)||0),0),
      cart_corrected: warnings.items.length>0,
      warnings,
      timestamps: {
        ...cart.timestamps,
        updatedAt: now()
      }
    };

    await cartRef.set(finalCart);

    return ok({
      cart: finalCart,
      pricing_profile_uid: pricingProfileUid,
      credit: {
        available_incl: creditSnapshot.available_incl,
        applied_formatted: formatMoneyExact(creditCalc.applied, { currencySymbol: "", space: false }),
        notes_available_incl: creditSnapshot.available_incl,
        notes_applied_incl: creditCalc.notes_applied_incl,
        notes_summary: creditSnapshot.notes_summary,
        applied_allocations: creditCalc.applied_allocations
      },
      delivery_fee: { amount: r2(deliveryFee), meta: deliveryMeta },
      warnings
    });

  } catch (e){
    console.error("FETCH CART ERROR:", e);
    return err(500,"Fetch Cart Failed","Unexpected server error.",{
      error: String(e)
    });
  }
}
