export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  doc,
  collection,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { evaluateDeliveryArea } from "@/lib/deliveryAreaCheck";
import crypto from "crypto";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";
import { buildMarketplaceFeeSnapshot, normalizeMarketplaceVariantLogistics } from "@/lib/marketplace/fees";
import { getAdminDb } from "@/lib/firebase/admin";
import { consumeReservedStockLots, consumeStockLotsFifo } from "@/lib/warehouse/stock-lots";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { normalizeSellerTeamRole } from "@/lib/seller/team";

/* ───────────────── HELPERS ───────────────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status, title, message, extra = {}) =>
  NextResponse.json(
    { ok: false, title, message, ...extra },
    { status }
  );

const now = () => new Date().toISOString();
const VAT_RATE = 0.15;
const r2 = v => Number((Number(v) || 0).toFixed(2));

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function pickDefaultCard(cards = []) {
  const active = cards.filter(
    c => c?.status === "active" && c?.token?.registrationId
  );
  if (active.length === 0) return null;

  const scoreDate = c => {
    const lastCharged = Array.isArray(c.lastCharged) ? c.lastCharged.at(-1) : null;
    return lastCharged || c.updatedAt || c.createdAt || null;
  };

  active.sort((a, b) => {
    const aTime = new Date(scoreDate(a) || 0).getTime();
    const bTime = new Date(scoreDate(b) || 0).getTime();
    return bTime - aTime;
  });

  return active[0];
}

function normalizeDeliveryFee(input, currency) {
  if (!input || typeof input !== "object") {
    return {
      amountIncl: 0,
      amountExcl: 0,
      vat: 0,
      currency,
      band: null,
      distanceKm: null,
      durationMinutes: null,
      reason: "not_provided",
      raw: null
    };
  }

  const rawAmount =
    input?.fee?.amount ??
    input?.amount ??
    0;
  const normalizedAmount = Number(Number(rawAmount || 0).toFixed(2));
  const amountIncl = normalizedAmount;
  const amountExcl = amountIncl;
  const vat = 0;

  return {
    amountIncl,
    amountExcl,
    vat,
    currency: input?.fee?.currency || input?.currency || currency,
    band: input?.fee?.band || input?.band || null,
    distanceKm: input?.distance?.km ?? input?.distanceKm ?? null,
    durationMinutes: input?.duration?.minutes ?? input?.durationMinutes ?? null,
    reason: input?.fee?.reason || input?.reason || "distance_band",
    raw: input
  };
}

function normalizeCreditAllocations(raw) {
  const entries = Array.isArray(raw) ? raw : [];
  const rolled = new Map();

  for (const entry of entries) {
    const creditNoteId = String(entry?.creditNoteId || "").trim();
    const amountIncl = r2(entry?.amount_incl);
    if (!creditNoteId || amountIncl <= 0) continue;
    rolled.set(creditNoteId, r2((rolled.get(creditNoteId) || 0) + amountIncl));
  }

  return Array.from(rolled.entries()).map(([creditNoteId, amount_incl]) => ({
    creditNoteId,
    amount_incl
  }));
}

function hashCreateIntent({ customerId, cartId, finalIncl, finalPayableIncl, allocations }) {
  const payload = JSON.stringify({
    customerId: String(customerId || ""),
    cartId: String(cartId || ""),
    finalIncl: r2(finalIncl),
    finalPayableIncl: r2(finalPayableIncl),
    allocations
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function normalizeActiveCartLotReservations(entries) {
  const now = Date.now();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const lotId = String(entry?.lotId || "").trim();
    const qty = Math.max(0, Number(entry?.quantity || 0));
    const expiresAt = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    return lotId && qty > 0 && expiresAt > now;
  });
}

function applyDeliveryToTotals(rawTotals, deliveryFeeData) {
  const totals = { ...(rawTotals || {}) };

  const deliveryFeeExcl = r2(deliveryFeeData?.amountExcl || 0);
  const deliveryFeeIncl = r2(deliveryFeeData?.amountIncl || 0);
  const deliveryFeeVat = r2(
    deliveryFeeData?.vat ??
      Math.max(deliveryFeeIncl - deliveryFeeExcl, 0)
  );

  const subtotalExcl = r2(totals?.subtotal_excl || 0);
  const depositExcl = r2(totals?.deposit_total_excl || 0);
  const pricingAdjustmentExcl = r2(
    totals?.pricing_adjustment?.amount_excl ??
    totals?.pricing_savings_excl ??
    0
  );
  const discountedSubtotalExcl = r2(Math.max(subtotalExcl - pricingAdjustmentExcl, 0));

  const baseFinalExcl = r2(subtotalExcl + depositExcl + deliveryFeeExcl);
  const finalExclAfterDiscount = r2(discountedSubtotalExcl + depositExcl + deliveryFeeExcl);
  const vatTotal = r2((discountedSubtotalExcl + depositExcl) * VAT_RATE + deliveryFeeVat);
  const baseFinalIncl = r2(baseFinalExcl + r2((subtotalExcl + depositExcl) * VAT_RATE + deliveryFeeVat));
  const finalInclAfterDiscount = r2(finalExclAfterDiscount + vatTotal);

  const creditApplied = r2(totals?.credit?.applied || 0);
  const finalPayableIncl = r2(Math.max(finalInclAfterDiscount - creditApplied, 0));

  return {
    ...totals,
    delivery_fee_excl: deliveryFeeExcl,
    delivery_fee_incl: deliveryFeeIncl,
    delivery_fee_vat: deliveryFeeVat,
    pricing_savings_excl: pricingAdjustmentExcl,
    base_final_excl: baseFinalExcl,
    base_final_incl: baseFinalIncl,
    final_excl_after_discount: finalExclAfterDiscount,
    final_incl_after_discount: finalInclAfterDiscount,
    final_excl: finalExclAfterDiscount,
    final_incl: finalInclAfterDiscount,
    vat_total: vatTotal,
    final_payable_incl: finalPayableIncl,
    credit: {
      ...(totals?.credit || {}),
      applied: creditApplied,
      final_payable_incl: finalPayableIncl
    }
  };
}

function snapshotOrderItemFees(item, feeConfig) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const logistics = normalizeMarketplaceVariantLogistics(variant?.logistics || null);
  const fulfillmentMode = String(product?.fulfillment?.mode ?? "seller").toLowerCase() === "bevgo" ? "bevgo" : "seller";
  const feeSnapshot = buildMarketplaceFeeSnapshot({
    categorySlug: String(product?.grouping?.category || ""),
    subCategorySlug: String(product?.grouping?.subCategory || "") || null,
    sellingPriceIncl: Number(variant?.pricing?.selling_price_incl || 0),
    weightKg: logistics.weightKg,
    lengthCm: logistics.lengthCm,
    widthCm: logistics.widthCm,
    heightCm: logistics.heightCm,
    stockQty: Number(logistics.stockQty || 0),
    monthlySales30d: logistics.monthlySales30d,
    fulfillmentMode,
    config: feeConfig,
  });

  return {
    ...item,
    selected_variant_snapshot: {
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
    },
  };
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: String(product?.product?.sellerCode || product?.seller?.sellerCode || "").trim(),
    sellerSlug: String(product?.product?.sellerSlug || product?.seller?.sellerSlug || "").trim(),
    vendorName: String(product?.product?.vendorName || product?.seller?.vendorName || "").trim(),
  };
}

function getLineTitle(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return String(product?.product?.title || product?.title || variant?.label || "Product").trim();
}

function getLineVariantLabel(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return String(variant?.label || variant?.variant_id || "").trim();
}

function getLineQty(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getUserEmail(user = {}) {
  return (
    String(user?.email || "").trim() ||
    String(user?.account?.email || "").trim() ||
    String(user?.personal?.email || "").trim() ||
    ""
  );
}

function getUserPhone(user = {}) {
  return (
    String(user?.phoneNumber || "").trim() ||
    String(user?.account?.phoneNumber || "").trim() ||
    String(user?.account?.mobileNumber || "").trim() ||
    String(user?.personal?.phoneNumber || "").trim() ||
    String(user?.personal?.mobileNumber || "").trim() ||
    ""
  );
}

function isOperationalTeamRole(role) {
  return ["owner", "admin", "manager", "orders"].includes(normalizeSellerTeamRole(String(role || "")));
}

function buildSellerNotificationRecipients(ownerDoc) {
  const recipients = new Map();
  const ownerData = ownerDoc?.data || {};
  const seller = ownerData?.seller && typeof ownerData.seller === "object" ? ownerData.seller : {};
  const team = seller?.team && typeof seller.team === "object" ? seller.team : {};

  const collect = (userRecord, fallback = {}) => {
    const uid = String(fallback?.uid || userRecord?.uid || "").trim();
    const email = getUserEmail(userRecord);
    const phone = getUserPhone(userRecord);
    if (!uid && !email && !phone) return;
    const key = uid || email || phone;
    recipients.set(key, {
      uid: uid || null,
      email: email || null,
      phone: phone || null,
      role: String(fallback?.role || userRecord?.seller?.teamRole || "").trim() || null,
    });
  };

  collect(ownerData, { uid: ownerDoc?.id, role: seller?.teamRole || "owner" });

  const memberEntries = Array.isArray(team?.members) ? team.members : [];
  const grantEntries = Array.isArray(team?.accessGrants) ? team.accessGrants : [];

  for (const member of [...memberEntries, ...grantEntries]) {
    const status = String(member?.status || "active").trim().toLowerCase();
    const role = normalizeSellerTeamRole(String(member?.role || "manager"));
    if (status !== "active" || !isOperationalTeamRole(role)) continue;
    const uid = String(member?.uid || member?.userUid || member?.memberUid || "").trim();
    const email = String(member?.email || member?.contactEmail || "").trim();
    const phone = String(member?.phoneNumber || member?.mobileNumber || "").trim();
    const key = uid || email || phone;
    if (!key) continue;
    recipients.set(key, {
      uid: uid || null,
      email: email || null,
      phone: phone || null,
      role,
    });
  }

  return Array.from(recipients.values());
}

/* ───────────────── ENDPOINT ───────────────── */

export async function POST(req) {
  try {
    const marketplaceFeeConfig = await loadMarketplaceFeeConfig();
    const origin = new URL(req.url).origin;
    const {
      cartId,
      customerId,
      type = null,
      source = "web",
      customerNote = null,
      deliverySpeed = "standard",
      deliveryFee = null,
      inStoreCollection = false,
      deliveryAddress = null,
      onBehalfOfCustomerId = null
    } = await req.json();

    const safeOnBehalfOf = String(onBehalfOfCustomerId || "").trim();
    const targetCustomerId = safeOnBehalfOf ? safeOnBehalfOf : customerId;

    if (!cartId || !customerId) {
      return err(400, "Missing Parameters", "cartId and customerId are required.");
    }

    /* ───── Load Cart from Catalogue Service ───── */

    const res = await fetch(
      new URL("/api/catalogue/v1/carts/cart/fetchCart", origin),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: cartId,
          ...(safeOnBehalfOf ? { onBehalfOfUid: targetCustomerId } : {})
        })
      }
    );

    if (!res.ok) {
      return err(502, "Cart Service Error", "Unable to fetch cart from catalogue service.");
    }

    const json = await res.json();
    if (!json?.ok || !json?.data?.cart) {
      return err(400, "Invalid Cart", "Cart could not be loaded.");
    }

    const cart = json.data.cart;
    if (Array.isArray(cart?.items)) {
      cart.items = cart.items.map((item) => snapshotOrderItemFees(item, marketplaceFeeConfig));
    }

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return err(400, "Empty Cart", "Cannot create order from empty cart.");
    }

    /* ───── Validate 50-minute eligibility ───── */

    const isEligibleFor50 = cart.meta?.delivery_50min_eligible === true;

    if (deliverySpeed === "express_50" && !isEligibleFor50) {
      return err(400, "Delivery Not Eligible", "This cart is not eligible for 50-minute delivery.");
    }

    /* ───── Load Customer ───── */

    const userRef = doc(db, "users", targetCustomerId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return err(404, "User Not Found", "Customer does not exist.");
    }

    const user = userSnap.data();
    if (user?.account?.onboardingComplete !== true) {
      return err(
        403,
        "Onboarding Incomplete",
        "Customer onboarding must be completed before placing an order."
      );
    }
    const resolvedAccountName = firstNonEmptyString(
      user?.account?.accountName,
      user?.business?.companyName,
      user?.personal?.fullName
    );
    if (!resolvedAccountName) {
      return err(
        400,
        "Missing Account Name",
        "Customer must have account.accountName, business.companyName, or personal.fullName."
      );
    }
    const normalizedOrderType =
      (typeof type === "string" && type.trim() !== ""
        ? type.trim()
        : null) ||
      user?.account?.accountType ||
      "customer";
    const defaultLocation = (user?.deliveryLocations || []).find(
      loc => loc && loc.is_default === true
    );
    const placeholderAddress = {
      streetAddress: "____________________",
      city: "",
      province: "",
      postalCode: "",
      instructions: ""
    };
    const resolvedDeliveryAddress =
      deliveryAddress ||
      defaultLocation ||
      placeholderAddress;

    /* ───── Validate general delivery area support ───── */

    if (!inStoreCollection) {
      const deliveryAreaCheck = evaluateDeliveryArea(resolvedDeliveryAddress);
      if (!deliveryAreaCheck.supported) {
        return err(
          400,
          "Delivery Area Not Supported",
          deliveryAreaCheck.message,
          {
            supported: false,
            canPlaceOrder: false,
            reasonCode: deliveryAreaCheck.reasonCode
          }
        );
      }
    }

    const timestamp = now();

    /* ───── Build Order Document ───── */

    const deliveryFeeData = normalizeDeliveryFee(
      deliveryFee,
      "ZAR"
    );

    const totals = applyDeliveryToTotals(cart.totals || {}, deliveryFeeData);
    const finalInclForValidation = r2(
      totals?.final_incl ??
        cart?.totals?.final_incl ??
        0
    );
    const creditAppliedIncl = r2(
      totals?.credit?.applied ??
        cart?.totals?.credit?.applied ??
        0
    );
    const expectedFinalPayableIncl = r2(
      Math.max(finalInclForValidation - creditAppliedIncl, 0)
    );
    const providedFinalPayableIncl = r2(
      totals?.final_payable_incl ??
        cart?.totals?.final_payable_incl ??
        expectedFinalPayableIncl
    );
    if (creditAppliedIncl > finalInclForValidation + 0.01) {
      return err(
        400,
        "Invalid Credit Application",
        "Applied credit cannot exceed order final total."
      );
    }
    if (Math.abs(providedFinalPayableIncl - expectedFinalPayableIncl) > 0.01) {
      return err(
        400,
        "Invalid Totals",
        "final_payable_incl does not match final_incl minus applied credit."
      );
    }
    const creditAllocations = normalizeCreditAllocations(
      totals?.credit?.applied_allocations ??
        cart?.totals?.credit?.applied_allocations ??
        []
    );
    const creditAllocationsTotal = r2(
      creditAllocations.reduce((sum, entry) => sum + r2(entry?.amount_incl), 0)
    );
    const hasCreditApplied = creditAppliedIncl > 0;
    if (hasCreditApplied && creditAllocations.length === 0) {
      return err(
        400,
        "Invalid Credit Allocations",
        "credit.applied_allocations are required when credit is applied."
      );
    }
    if (Math.abs(creditAllocationsTotal - creditAppliedIncl) > 0.01) {
      return err(
        400,
        "Credit Allocation Mismatch",
        "Sum of applied_allocations must match totals.credit.applied."
      );
    }

    const createIntentKey = hashCreateIntent({
      customerId: targetCustomerId,
      cartId,
      finalIncl: totals?.final_incl || 0,
      finalPayableIncl: totals?.final_payable_incl || 0,
      allocations: creditAllocations
    });

    const orderId = crypto.randomUUID(); // internal, never exposed to Peach

    let orderNumber = null;
    let merchantTransactionId = null;
    let createdOrderId = orderId;
    let replayed = false;

    const transactionResult = await runTransaction(db, async tx => {
      const idemRef = doc(db, "idempotency_order_create_v2", createIntentKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
        const idem = idemSnap.data() || {};
        return {
          replayed: true,
          orderId: idem.orderId || null,
          orderNumber: idem.orderNumber || null,
          merchantTransactionId: idem.merchantTransactionId || null,
          status: idem.status || "draft"
        };
      }

      const counterRef = doc(db, "system_counters", "orders");
      const snap = await tx.get(counterRef);
      const last = snap.exists() ? snap.data().last : 0;
      const next = last + 1;

      orderNumber = `BVG-${String(next).padStart(6, "0")}`;
      merchantTransactionId = orderNumber.replace("-", "");

      const orderDoc = {
      docId: orderId,

      order: {
        orderId,
        orderNumber,
        merchantTransactionId,
        customerId: targetCustomerId,
        type: normalizedOrderType,
        channel: cart.cart?.channel || source,
        editable: true,
        editable_reason: "Order is editable.",
        status: {
          order: "draft",
          payment: "unpaid",
          fulfillment: "not_started"
        }
      },

      items: cart.items,
      totals: {
        ...totals,
        final_payable_incl: expectedFinalPayableIncl,
        credit: {
          ...(totals?.credit || {}),
          applied: creditAppliedIncl,
          applied_allocations: creditAllocations
        }
      },

      customer_snapshot: {
        ...user,
        account: {
          ...(user?.account || {}),
          accountName: resolvedAccountName
        },
        customerId: targetCustomerId
      },

      payment: {
        method: null,
        currency: "ZAR",
        required_amount_incl: expectedFinalPayableIncl,
        paid_amount_incl: 0,
        status: "unpaid",
        attempts: [],
        credit_applied_incl: creditAppliedIncl,
        credit_allocations: creditAllocations
      },

      delivery: {
        method: "delivery",
        in_store_collection: Boolean(inStoreCollection),
        speed: {
          type: deliverySpeed,
          eligible: isEligibleFor50,
          sla_minutes: deliverySpeed === "express_50" ? 50 : null
        },
        address_snapshot: resolvedDeliveryAddress || null,
        fee: {
          amount: deliveryFeeData.amountIncl,
          currency: deliveryFeeData.currency,
          band: deliveryFeeData.band,
          distance_km: deliveryFeeData.distanceKm,
          duration_minutes: deliveryFeeData.durationMinutes,
          reason: deliveryFeeData.reason,
          raw: deliveryFeeData.raw
        },
        scheduledDate: null,
        notes: customerNote || null
      },

      delivery_docs: {
        picking_slip: { url: null, generatedAt: null },
        delivery_note: { url: null, generatedAt: null },
        proof_of_delivery: { url: null, uploadedAt: null },
        invoice: { url: null, uploadedAt: null }
      },

      audit: { edits: [] },

      meta: {
        source,
        customerNote,
        createdFromCartId: cartId,
        createIntentKey,
        createdBy: customerId,
        orderedFor: targetCustomerId
      },

      timestamps: {
        createdAt: timestamp,
        updatedAt: timestamp,
        lockedAt: null
      }
      };

      const noteUpdates = [];
      if (creditAllocations.length > 0) {
        const noteRefs = creditAllocations.map(allocation => ({
          creditNoteId: String(allocation?.creditNoteId || "").trim(),
          amountIncl: r2(allocation?.amount_incl),
          ref: doc(db, "credit_notes_v2", String(allocation?.creditNoteId || "").trim())
        }));

        const noteSnaps = await Promise.all(noteRefs.map(entry => tx.get(entry.ref)));

        for (let idx = 0; idx < noteRefs.length; idx += 1) {
          const entry = noteRefs[idx];
          const noteSnap = noteSnaps[idx];
          const creditNoteId = entry.creditNoteId;
          const amountIncl = entry.amountIncl;
          if (!creditNoteId || amountIncl <= 0) continue;

          if (!noteSnap.exists()) {
            throw new Error(`Credit note not found: ${creditNoteId}`);
          }

          const note = noteSnap.data() || {};
          const noteCustomerId = note?.customerId || null;
          if (noteCustomerId !== targetCustomerId) {
            throw new Error(`Credit note ${creditNoteId} does not belong to this customer.`);
          }

          const noteStatus = String(note?.status || "").toLowerCase();
          if (noteStatus && !["open", "partially_used"].includes(noteStatus)) {
            throw new Error(`Credit note ${creditNoteId} is not available for allocation.`);
          }

          const currentRemaining = r2(note?.remaining_amount_incl || 0);
          if (currentRemaining + 0.0001 < amountIncl) {
            throw new Error(`Insufficient remaining balance on credit note ${creditNoteId}.`);
          }

          const nextRemaining = r2(currentRemaining - amountIncl);
          const currentUsed = r2(
            note?.used_amount_incl ??
              Math.max(r2(note?.issued_amount_incl || 0) - currentRemaining, 0)
          );
          const nextUsed = r2(currentUsed + amountIncl);
          const nextStatus = nextRemaining <= 0 ? "fully_used" : "partially_used";
          const existingAllocations = Array.isArray(note?.allocations)
            ? note.allocations
            : [];
          const allocationEntry = {
            orderId,
            orderNumber,
            amount_incl: amountIncl,
            allocatedAt: timestamp,
            idempotencyKey: createIntentKey
          };

          noteUpdates.push({
            ref: entry.ref,
            payload: {
              remaining_amount_incl: nextRemaining,
              used_amount_incl: nextUsed,
              status: nextStatus,
              allocations: [...existingAllocations, allocationEntry],
              updatedAt: timestamp,
              _updatedAt: serverTimestamp()
            }
          });
        }
      }

      tx.set(counterRef, { last: next }, { merge: true });
      for (const update of noteUpdates) {
        tx.update(update.ref, update.payload);
      }

      tx.set(doc(db, "orders_v2", orderId), orderDoc);
      tx.set(
        idemRef,
        {
          orderId,
          orderNumber,
          merchantTransactionId,
          status: orderDoc?.order?.status?.order || "draft",
          customerId: targetCustomerId,
          cartId,
          createIntentKey,
          createdAt: timestamp,
          _createdAt: serverTimestamp()
        },
        { merge: true }
      );

      return {
        replayed: false,
        orderId,
        orderNumber,
        merchantTransactionId,
        status: orderDoc.order.status.order
      };
    });

    if (transactionResult?.orderId) createdOrderId = transactionResult.orderId;
    if (transactionResult?.orderNumber) orderNumber = transactionResult.orderNumber;
    if (transactionResult?.merchantTransactionId) {
      merchantTransactionId = transactionResult.merchantTransactionId;
    }
    replayed = transactionResult?.replayed === true;

    if (!replayed && createdOrderId && Array.isArray(cart?.items) && cart.items.length) {
      const adminDb = getAdminDb();
      if (adminDb) {
        const lotAllocationsByVariant = new Map();

        for (const item of cart.items) {
          const product = item?.product_snapshot || item?.product || {};
          const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
          const fulfillmentMode = String(product?.fulfillment?.mode || "").trim().toLowerCase();
          const qty = Math.max(0, Number(item?.quantity || 0));
          const variantIdForLots = String(variant?.variant_id || "").trim();
          if (fulfillmentMode !== "bevgo" || !variantIdForLots || qty <= 0) continue;

          const sellerSlug = String(product?.product?.sellerSlug || product?.seller?.sellerSlug || "").trim();
          const sellerCode = String(product?.product?.sellerCode || product?.seller?.sellerCode || "").trim();
          const reservedAllocations = normalizeActiveCartLotReservations(variant?.warehouse_lot_reservations);
          const reservedConsumption = reservedAllocations.length
            ? await consumeReservedStockLots({
                reservations: reservedAllocations,
                orderId: createdOrderId,
              })
            : null;
          const consumption = reservedConsumption
            ? null
            : await consumeStockLotsFifo({
                sellerSlug,
                sellerCode,
                variantId: variantIdForLots,
                quantity: qty,
                orderId: createdOrderId,
              });

          lotAllocationsByVariant.set(variantIdForLots, {
            ok: reservedConsumption?.ok ?? consumption?.ok ?? false,
            allocations: reservedConsumption?.allocations ?? consumption?.allocations ?? [],
            unallocatedQty: reservedConsumption ? 0 : consumption?.unallocatedQty ?? 0,
          });
        }

        if (lotAllocationsByVariant.size) {
          const orderRef = adminDb.collection("orders_v2").doc(createdOrderId);
          const orderSnap = await orderRef.get();
          if (orderSnap.exists) {
            const orderData = orderSnap.data() || {};
            const nextItems = Array.isArray(orderData?.items)
              ? orderData.items.map((item) => {
                  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
                  const variantIdForLots = String(variant?.variant_id || "").trim();
                  const lotMeta = lotAllocationsByVariant.get(variantIdForLots);
                  if (!lotMeta) return item;
                  return {
                    ...item,
                    selected_variant_snapshot: {
                      ...variant,
                      warehouse_lot_allocations: lotMeta.allocations,
                      warehouse_fifo_ok: lotMeta.ok,
                      warehouse_unallocated_qty: lotMeta.unallocatedQty,
                    },
                  };
                })
              : [];

            await orderRef.set(
              {
                items: nextItems,
                timestamps: {
                  updatedAt: timestamp,
                },
              },
              { merge: true },
            );
          }
        }
      }
    }

    if (!replayed && orderNumber && Array.isArray(cart?.items) && cart.items.length) {
      const originBase = new URL(req.url).origin;
      const sellerGroups = new Map();

      for (const item of cart.items) {
        const identity = getLineSellerIdentity(item);
        const sellerKey = identity.sellerCode || identity.sellerSlug;
        if (!sellerKey) continue;
        if (!sellerGroups.has(sellerKey)) {
          sellerGroups.set(sellerKey, {
            ...identity,
            items: [],
          });
        }
        sellerGroups.get(sellerKey).items.push({
          title: getLineTitle(item),
          variant: getLineVariantLabel(item),
          quantity: getLineQty(item),
        });
      }

      await Promise.all(
        Array.from(sellerGroups.values()).map(async (group) => {
          const sellerOwner =
            (group.sellerCode ? await findSellerOwnerByCode(group.sellerCode) : null) ||
            (group.sellerSlug ? await findSellerOwnerBySlug(group.sellerSlug) : null);
          const sellerData = sellerOwner?.data || {};
          const vendorName = group.vendorName || sellerData?.seller?.vendorName || "Seller";
          const customerName = resolvedAccountName || "Customer";
          const recipients = buildSellerNotificationRecipients(sellerOwner);
          const jobs = [];

          for (const recipient of recipients) {
            let recipientEmail = recipient.email || "";
            let recipientPhone = recipient.phone || "";

            if ((!recipientEmail || !recipientPhone) && recipient.uid) {
              try {
                const memberSnap = await getDoc(doc(db, "users", recipient.uid));
                if (memberSnap.exists()) {
                  const memberData = memberSnap.data() || {};
                  recipientEmail = recipientEmail || getUserEmail(memberData);
                  recipientPhone = recipientPhone || getUserPhone(memberData);
                }
              } catch {
                // Ignore recipient enrichment failures.
              }
            }

            if (recipientEmail) {
              jobs.push(
                fetch(`${originBase}/api/client/v1/notifications/email`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "seller-order-received",
                    to: recipientEmail,
                    data: {
                      vendorName,
                      orderNumber,
                      customerName,
                      items: group.items,
                    },
                  }),
                }).catch(() => null),
              );
            }

            if (recipientPhone) {
              jobs.push(
                fetch(`${originBase}/api/client/v1/notifications/sms`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "seller-new-order",
                    to: recipientPhone,
                    data: {
                      orderNumber,
                    },
                  }),
                }).catch(() => null),
              );
            }
          }

          await Promise.all(jobs);
        }),
      );
    }

    return ok({
      orderId: createdOrderId,
      orderNumber,
      merchantTransactionId,
      status: transactionResult?.status || "draft",
      replayed
    });

  } catch (e) {
    return err(500, "Server Error", e?.message || "Unexpected server error.");
  }
}
