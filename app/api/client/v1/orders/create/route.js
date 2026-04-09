export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";
import { buildMarketplaceFeeSnapshot, normalizeMarketplaceVariantLogistics } from "@/lib/marketplace/fees";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolvePlatformDeliveryOption } from "@/lib/platform/delivery-settings";
import { consumeReservedStockLots, consumeStockLotsFifo } from "@/lib/warehouse/stock-lots";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { normalizeSellerTeamRole } from "@/lib/seller/team";
import { normalizeMoneyAmount } from "@/lib/money";
import { buildPlatformOrderDocument } from "@/lib/orders/platform-order";

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
const r2 = v => normalizeMoneyAmount(Number(v) || 0);

function buildShopperArea(address = null) {
  if (!address || typeof address !== "object") return null;
  return {
    city: address?.city || address?.suburb || "",
    suburb: address?.suburb || "",
    province: address?.province || address?.stateProvinceRegion || "",
    stateProvinceRegion: address?.stateProvinceRegion || address?.province || "",
    postalCode: address?.postalCode || "",
    country: address?.country || "South Africa",
    latitude: address?.latitude == null ? null : Number(address.latitude),
    longitude: address?.longitude == null ? null : Number(address.longitude),
  };
}

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

function consumeInventoryRows(rows = [], quantity = 0) {
  let remaining = Math.max(0, Number(quantity) || 0);
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const nextRow = { ...(row || {}) };
    const current = Math.max(0, Number(nextRow?.in_stock_qty || 0));
    if (remaining <= 0 || current <= 0) return nextRow;
    const take = Math.min(current, remaining);
    nextRow.in_stock_qty = current - take;
    remaining -= take;
    return nextRow;
  });
}

function restoreInventoryRows(rows = [], quantity = 0) {
  const nextRows = Array.isArray(rows) ? rows.map((row) => ({ ...(row || {}) })) : [];
  const restoreQty = Math.max(0, Number(quantity) || 0);
  if (restoreQty <= 0) return nextRows;
  if (!nextRows.length) {
    return [{ warehouse_id: "main", in_stock_qty: restoreQty }];
  }
  const firstRow = { ...(nextRows[0] || {}) };
  firstRow.in_stock_qty = Math.max(0, Number(firstRow?.in_stock_qty || 0)) + restoreQty;
  nextRows[0] = firstRow;
  return nextRows;
}

async function consumeMarketplaceProductStock(adminDb, items = []) {
  if (!adminDb || !Array.isArray(items) || !items.length) return;

  const grouped = new Map();
  for (const item of items) {
    const product = item?.product_snapshot || item?.product || {};
    const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
    const productId =
      String(product?.product?.unique_id || product?.docId || product?.product?.product_id || "").trim();
    const variantId = String(variant?.variant_id || "").trim();
    const quantity = Math.max(0, Number(item?.quantity || 0));
    if (!productId || !variantId || quantity <= 0) continue;
    const key = `${productId}::${variantId}::${variant?.sale?.is_on_sale ? "sale" : "regular"}`;
    grouped.set(key, {
      productId,
      variantId,
      quantity: (grouped.get(key)?.quantity || 0) + quantity,
    });
  }

  for (const entry of grouped.values()) {
    const productRef = adminDb.collection("products_v2").doc(entry.productId);
    await adminDb.runTransaction(async (tx) => {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) return;
      const productData = productSnap.data() || {};
      const variants = Array.isArray(productData?.variants) ? [...productData.variants] : [];
      const variantIndex = variants.findIndex((variant) => String(variant?.variant_id || "") === entry.variantId);
      if (variantIndex < 0) return;
      const nextVariant = { ...(variants[variantIndex] || {}) };

      nextVariant.inventory = consumeInventoryRows(nextVariant.inventory, entry.quantity);
      const remainingInventory =
        Array.isArray(nextVariant.inventory)
          ? nextVariant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty || 0)), 0)
          : 0;
      if (nextVariant?.sale && !nextVariant.sale.disabled_by_admin && remainingInventory <= 0) {
        nextVariant.sale = {
          ...(nextVariant.sale || {}),
          is_on_sale: false,
        };
      }

      variants[variantIndex] = nextVariant;
      tx.set(
        productRef,
        {
          variants,
          timestamps: {
            ...(productData?.timestamps || {}),
            updatedAt: now(),
          },
        },
        { merge: true },
      );
    });
  }
}

async function restoreMarketplaceProductStock(adminDb, items = []) {
  if (!adminDb || !Array.isArray(items) || !items.length) return;

  const grouped = new Map();
  for (const item of items) {
    const product = item?.product_snapshot || item?.product || {};
    const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
    const productId =
      String(product?.product?.unique_id || product?.docId || product?.product?.product_id || "").trim();
    const variantId = String(variant?.variant_id || "").trim();
    const quantity = Math.max(0, Number(item?.quantity || 0));
    if (!productId || !variantId || quantity <= 0) continue;
    const key = `${productId}::${variantId}::${variant?.sale?.is_on_sale ? "sale" : "regular"}`;
    grouped.set(key, {
      productId,
      variantId,
      restoreSaleFlag: Boolean(variant?.sale?.is_on_sale),
      quantity: (grouped.get(key)?.quantity || 0) + quantity,
    });
  }

  for (const entry of grouped.values()) {
    const productRef = adminDb.collection("products_v2").doc(entry.productId);
    await adminDb.runTransaction(async (tx) => {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) return;
      const productData = productSnap.data() || {};
      const variants = Array.isArray(productData?.variants) ? [...productData.variants] : [];
      const variantIndex = variants.findIndex((variant) => String(variant?.variant_id || "") === entry.variantId);
      if (variantIndex < 0) return;
      const nextVariant = { ...(variants[variantIndex] || {}) };

      nextVariant.inventory = restoreInventoryRows(nextVariant.inventory, entry.quantity);
      if (entry.restoreSaleFlag && nextVariant?.sale && !nextVariant.sale.disabled_by_admin) {
        nextVariant.sale = {
          ...(nextVariant.sale || {}),
          is_on_sale: true,
        };
      }

      variants[variantIndex] = nextVariant;
      tx.set(
        productRef,
        {
          variants,
          timestamps: {
            ...(productData?.timestamps || {}),
            updatedAt: now(),
          },
        },
        { merge: true },
      );
    });
  }
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
    const adminDb = getAdminDb();
    if (!adminDb) {
      return err(500, "Database Unavailable", "Admin database is not configured.");
    }
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
      onBehalfOfCustomerId = null,
      pickupSelections = [],
    } = await req.json();

    const safeOnBehalfOf = String(onBehalfOfCustomerId || "").trim();
    const targetCustomerId = safeOnBehalfOf ? safeOnBehalfOf : customerId;

    if (!cartId || !customerId) {
      return err(400, "Missing Parameters", "cartId and customerId are required.");
    }

    /* ───── Load Customer ───── */

    const userRef = adminDb.collection("users").doc(targetCustomerId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return err(404, "User Not Found", "Customer does not exist.");
    }

    const user = userSnap.data();
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

    /* ───── Load Cart from Catalogue Service ───── */

    const res = await fetch(
      new URL("/api/catalogue/v1/carts/cart/fetchCart", origin),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: cartId,
          deliveryAddress: resolvedDeliveryAddress,
          pickupSelections: Array.isArray(pickupSelections) ? pickupSelections : [],
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

    const sellerDeliveryBreakdown = Array.isArray(cart?.totals?.seller_delivery_breakdown)
      ? cart.totals.seller_delivery_breakdown
      : [];
    const unavailableSellerDeliveries = sellerDeliveryBreakdown.filter(
      (entry) => entry?.applicable === false && String(entry?.delivery_type || "").trim().toLowerCase() === "unavailable",
    );
    if (!inStoreCollection && unavailableSellerDeliveries.length > 0) {
      const sellerNames = unavailableSellerDeliveries
        .map((entry) => String(entry?.seller_name || "Seller").trim())
        .filter(Boolean);
      return err(
        400,
        "Seller Delivery Unavailable",
        sellerNames.length
          ? `Delivery is not available for ${sellerNames.join(", ")} to this address.`
          : "One or more seller-delivered items are not available for this address.",
        {
          supported: false,
          canPlaceOrder: false,
          reasonCode: "SELLER_DELIVERY_UNAVAILABLE",
          sellers: sellerNames,
        }
      );
    }

    /* ───── Validate 50-minute eligibility ───── */

    const isEligibleFor50 = cart.meta?.delivery_50min_eligible === true;

    if (deliverySpeed === "express_50" && !isEligibleFor50) {
      return err(400, "Delivery Not Eligible", "This cart is not eligible for 50-minute delivery.");
    }

    /* ───── Validate general delivery area support ───── */

    if (!inStoreCollection) {
      const cartItems = Array.isArray(cart?.items) ? cart.items : [];
      const hasPiessangFulfilledItems = cartItems.some(
        (item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase() === "bevgo",
      );
      const platformDelivery = hasPiessangFulfilledItems
        ? await resolvePlatformDeliveryOption({
            shopperArea: buildShopperArea(resolvedDeliveryAddress),
            subtotalIncl: Number(cart?.totals?.final_incl || 0),
          })
        : null;
      if (hasPiessangFulfilledItems && !platformDelivery?.available) {
        return err(
          400,
          "Delivery Area Not Supported",
          "Delivery is not available for this address.",
          {
            supported: false,
            canPlaceOrder: false,
            reasonCode: "OUTSIDE_SERVICE_AREA"
          }
        );
      }
    }

    const timestamp = now();

    /* ───── Build Order Document ───── */

    const platformDeliveryAmount = r2(
      cart?.totals?.delivery_fee_incl ??
        cart?.totals?.delivery_fee_excl ??
        0
    );
    const sellerDeliveryAmount = r2(
      cart?.totals?.seller_delivery_fee_incl ??
        cart?.totals?.seller_delivery_fee_excl ??
        0
    );
    const deliveryFeeData = {
      amountIncl: platformDeliveryAmount,
      amountExcl: platformDeliveryAmount,
      vat: 0,
      currency: "ZAR",
      band: null,
      distanceKm: null,
      durationMinutes: null,
      reason: "distance_band",
      raw: deliveryFee || null,
      sellerAmountIncl: sellerDeliveryAmount,
      sellerBreakdown: Array.isArray(cart?.totals?.seller_delivery_breakdown) ? cart.totals.seller_delivery_breakdown : [],
    };

    const totals = { ...(cart.totals || {}) };
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

    const transactionResult = await adminDb.runTransaction(async tx => {
      const idemRef = adminDb.collection("idempotency_order_create_v2").doc(createIntentKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const idem = idemSnap.data() || {};
        const existingOrderId = typeof idem.orderId === "string" ? idem.orderId.trim() : "";
        if (existingOrderId) {
          const existingOrderRef = adminDb.collection("orders_v2").doc(existingOrderId);
          const existingOrderSnap = await tx.get(existingOrderRef);
          if (existingOrderSnap.exists) {
            return {
              replayed: true,
              orderId: idem.orderId || null,
              orderNumber: idem.orderNumber || null,
              merchantTransactionId: idem.merchantTransactionId || null,
              status: idem.status || "payment_pending"
            };
          }
        }
      }

      const counterRef = adminDb.collection("system_counters").doc("orders");
      const snap = await tx.get(counterRef);
      const last = snap.exists ? snap.data().last : 0;
      const next = last + 1;

      orderNumber = `PSS-${String(next)}`;
      merchantTransactionId = orderNumber.replace("-", "");

      const orderDoc = buildPlatformOrderDocument({
        orderId,
        orderNumber,
        merchantTransactionId,
        customerId: targetCustomerId,
        customerSnapshot: {
          ...user,
          account: {
            ...(user?.account || {}),
            accountName: resolvedAccountName
          },
          customerId: targetCustomerId
        },
        items: cart.items,
        totals,
        creditAppliedIncl,
        creditAllocations,
        deliveryAddress: resolvedDeliveryAddress || null,
        deliverySpeed,
        isEligibleFor50,
        customerNote,
        source: cart.cart?.channel || source,
        cartId,
        createdBy: customerId,
        orderedFor: targetCustomerId,
        normalizedOrderType,
        timestamp,
        deliveryFeeData,
      });
      orderDoc.meta.createIntentKey = createIntentKey;

      const noteUpdates = [];
      if (creditAllocations.length > 0) {
        const noteRefs = creditAllocations.map(allocation => ({
          creditNoteId: String(allocation?.creditNoteId || "").trim(),
          amountIncl: r2(allocation?.amount_incl),
          ref: adminDb.collection("credit_notes_v2").doc(String(allocation?.creditNoteId || "").trim())
        }));

        const noteSnaps = await Promise.all(noteRefs.map(entry => tx.get(entry.ref)));

        for (let idx = 0; idx < noteRefs.length; idx += 1) {
          const entry = noteRefs[idx];
          const noteSnap = noteSnaps[idx];
          const creditNoteId = entry.creditNoteId;
          const amountIncl = entry.amountIncl;
          if (!creditNoteId || amountIncl <= 0) continue;

          if (!noteSnap.exists) {
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
              _updatedAt: FieldValue.serverTimestamp()
            }
          });
        }
      }

      tx.set(counterRef, { last: next }, { merge: true });
      for (const update of noteUpdates) {
        tx.update(update.ref, update.payload);
      }

      tx.set(adminDb.collection("orders_v2").doc(orderId), orderDoc);
      tx.set(
        idemRef,
        {
          orderId,
          orderNumber,
          merchantTransactionId,
          status: orderDoc?.order?.status?.order || "payment_pending",
          customerId: targetCustomerId,
          cartId,
          createIntentKey,
          createdAt: timestamp,
          _createdAt: FieldValue.serverTimestamp()
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
      if (adminDb) {
        await consumeMarketplaceProductStock(adminDb, cart.items);

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

    return ok({
      orderId: createdOrderId,
      orderNumber,
      merchantTransactionId,
      status: transactionResult?.status || "payment_pending",
      replayed
    });

  } catch (e) {
    return err(500, "Server Error", e?.message || "Unexpected server error.");
  }
}
