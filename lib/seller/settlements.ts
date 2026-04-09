// @ts-nocheck
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeMoneyAmount } from "@/lib/money";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";

const SETTLEMENT_COLLECTION = "seller_settlements_v1";
const STRIKE_THRESHOLD = 3;
const PAYOUT_HOLD_DAYS = Math.max(0, Math.trunc(Number(process.env.SELLER_PAYOUT_HOLD_DAYS || 7)));

const now = () => new Date().toISOString();
const r2 = (value) => normalizeMoneyAmount(Number(value) || 0);

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeStoredPayoutMethod(source = {}) {
  const payoutCountry = toStr(source.bankCountry || source.beneficiaryCountry || source.country).toUpperCase();
  const candidate = toStr(source.payoutMethod || "same_country_bank").toLowerCase();
  if (candidate === "other_country_bank" || candidate === "international_bank") return "other_country_bank";
  if (payoutCountry) return "other_country_bank";
  return "same_country_bank";
}

function addDays(iso, days) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Math.max(0, Math.trunc(Number(days) || 0)));
  return date.toISOString();
}

function parseDate(value) {
  const input = toStr(value, "");
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrNull(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function normalizeKey(value) {
  return toStr(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function getItemSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const seller = product?.seller || item?.seller || {};

  const sellerCode = firstNonEmptyString(
    product?.sellerCode,
    seller?.sellerCode,
    seller?.activeSellerCode,
    seller?.groupSellerCode,
    variant?.sellerCode,
    variant?.fees?.sellerCode,
  );
  const sellerSlug = firstNonEmptyString(
    product?.sellerSlug,
    seller?.sellerSlug,
    seller?.activeSellerSlug,
    seller?.groupSellerSlug,
    variant?.sellerSlug,
  );
  const vendorName = firstNonEmptyString(
    product?.vendorName,
    seller?.vendorName,
    seller?.groupVendorName,
    variant?.vendorName,
  );

  return {
    sellerCode: sellerCode || null,
    sellerSlug: sellerSlug || null,
    vendorName: vendorName || null,
  };
}

function getItemQty(item) {
  const qty = toNum(item?.qty ?? item?.quantity ?? 0, 0);
  return qty > 0 ? Math.trunc(qty) : 0;
}

function getItemProductRevenueIncl(item) {
  const lineTotals = item?.line_totals || {};
  const total = toNum(
    lineTotals.final_incl ??
      lineTotals.line_total_incl ??
      lineTotals.total_incl ??
      lineTotals.lineTotalIncl ??
      0,
    0,
  );
  return r2(total);
}

function getItemSuccessFeePercent(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const product = item?.product_snapshot || item?.product || {};

  return toNum(
    variant?.fees?.success_fee_percent ??
      product?.product?.fees?.success_fee_percent ??
      product?.fees?.success_fee_percent ??
      0,
    0,
  );
}

function getItemFulfilmentMode(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const product = item?.product_snapshot || item?.product || {};
  const mode = toStr(
    variant?.fees?.fulfilment_mode ||
      variant?.fees?.fulfillment_mode ||
      product?.fulfillment?.mode ||
      product?.fulfilment?.mode ||
      "seller",
  ).toLowerCase();

  return mode === "bevgo" ? "bevgo" : "seller";
}

function getExpectedFulfilmentBy(item, orderCreatedAt) {
  const product = item?.product_snapshot || item?.product || {};
  const fulfilment = product?.fulfillment || product?.fulfilment || {};
  const mode = getItemFulfilmentMode(item);
  if (mode !== "seller") return null;

  const leadTimeDays = Number(fulfilment?.lead_time_days ?? fulfilment?.leadTimeDays ?? 0);
  const createdAt = toStr(orderCreatedAt, "");
  if (!createdAt || !(leadTimeDays > 0)) return null;

  return addDays(createdAt, leadTimeDays);
}

function isPayoutProfileReady(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const payoutMethod = normalizeStoredPayoutMethod(source);
  if (payoutMethod === "other_country_bank") {
    return Boolean(
      toStr(source.accountHolderName) &&
        toStr(source.bankName) &&
        toStr(source.bankCountry || source.country) &&
        toStr(source.currency) &&
        toStr(source.iban) &&
        toStr(source.swiftBic || source.swift_bic),
    );
  }
  return Boolean(
    toStr(source.accountHolderName) &&
      toStr(source.bankName) &&
      toStr(source.bankCountry || source.country) &&
      toStr(source.accountNumber) &&
      toStr(source.branchCode),
  );
}

function getPayoutProfileSummary(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const accountNumber = toStr(source.accountNumber);
  const payoutMethod = normalizeStoredPayoutMethod(source);
  return {
    ready: isPayoutProfileReady(source),
    payoutMethod,
    verificationStatus: toStr(source.verificationStatus || "not_submitted").toLowerCase() || "not_submitted",
    bankName: toStr(source.bankName || null) || null,
    bankCountry: toStr(source.bankCountry || source.country || null) || null,
    accountHolderName: toStr(source.accountHolderName || null) || null,
    accountType: toStr(source.accountType || null) || null,
    currency: toStr(source.currency || "ZAR") || "ZAR",
    accountLast4: accountNumber ? accountNumber.slice(-4) : null,
    ibanLast4: toStr(source.iban) ? toStr(source.iban).slice(-4) : null,
    swiftBic: toStr(source.swiftBic || source.swift_bic || null) || null,
    peachRecipientId: toStr(source.peachRecipientId || null) || null,
    beneficiaryReference: toStr(source.beneficiaryReference || null) || null,
  };
}

function getVariantFeeValue(item, key) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return r2(
    variant?.fees?.[key] ??
      0,
  );
}

function getLineWeightBand(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.fees?.weight_band || null, "") || null;
}

function getLineSizeBand(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.fees?.size_band || null, "") || null;
}

function getLineStorageBand(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.fees?.storage_band || null, "") || null;
}

function buildSettlementLine(item, index, orderCreatedAt) {
  const identity = getItemSellerIdentity(item);
  const qty = getItemQty(item);
  // Settlement success fees must only ever apply to the product line itself.
  // Seller/platform delivery charges live on order/cart totals and are excluded here.
  const lineTotalIncl = getItemProductRevenueIncl(item);
  const successFeePercent = getItemSuccessFeePercent(item);
  const fulfilmentMode = getItemFulfilmentMode(item);
  const perUnitFulfilment = fulfilmentMode === "bevgo" ? getVariantFeeValue(item, "fulfilment_fee_incl") : 0;
  const perUnitStorage = fulfilmentMode === "bevgo" ? getVariantFeeValue(item, "storage_fee_incl") : 0;
  const successFeeIncl = r2(lineTotalIncl * (successFeePercent / 100));
  const fulfilmentFeeIncl = r2(perUnitFulfilment * qty);
  const handlingFeeIncl = 0;
  const storageAccruedIncl = r2(perUnitStorage * qty);
  const payoutDueIncl = r2(Math.max(lineTotalIncl - successFeeIncl - fulfilmentFeeIncl, 0));
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};

  const sellerKey = identity.sellerCode || identity.sellerSlug || normalizeKey(identity.vendorName) || `LINE_${index + 1}`;
  const expectedFulfilmentBy = getExpectedFulfilmentBy(item, orderCreatedAt);

  return {
    sellerKey,
    sellerCode: identity.sellerCode || null,
    sellerSlug: identity.sellerSlug || null,
    vendorName: identity.vendorName || null,
    fulfilmentMode,
    lineId: toStr(
      item?.line_id ||
        item?.lineId ||
        variant?.variant_id ||
        variant?.variantId ||
        product?.product?.unique_id ||
        product?.unique_id ||
        `${index + 1}`,
    ),
    productUniqueId: toStr(
      product?.product?.unique_id ||
        product?.unique_id ||
        item?.product_unique_id ||
        "",
    ) || null,
    variantId: toStr(variant?.variant_id || variant?.variantId || "", "") || null,
    title: toStr(product?.product?.title || product?.title || product?.name || "Item"),
    sku: toStr(variant?.sku || variant?.variant_sku || "", "") || null,
    quantity: qty,
    lineTotalIncl,
    successFeePercent: r2(successFeePercent),
    successFeeIncl,
    fulfilmentFeeIncl,
    handlingFeeIncl,
    storageAccruedIncl,
    payoutDueIncl,
    sizeBand: getLineSizeBand(item),
    weightBand: getLineWeightBand(item),
    storageBand: getLineStorageBand(item),
    expectedFulfilmentBy,
    late: false,
  };
}

export function buildSellerSettlementBuckets(order) {
  const createdAt = toStr(order?.timestamps?.createdAt || now());
  const items = Array.isArray(order?.items) ? order.items : [];
  const buckets = new Map();

  items.forEach((item, index) => {
    const line = buildSettlementLine(item, index, createdAt);
    const bucket = buckets.get(line.sellerKey) || {
      sellerKey: line.sellerKey,
      sellerCode: line.sellerCode,
      sellerSlug: line.sellerSlug,
      vendorName: line.vendorName,
      fulfilmentModes: new Set(),
      lines: [],
      totals: {
        grossIncl: 0,
        successFeeIncl: 0,
        fulfilmentFeeIncl: 0,
        handlingFeeIncl: 0,
        storageAccruedIncl: 0,
        payoutDueIncl: 0,
        quantity: 0,
      },
      expectedFulfilmentBy: null,
    };

    bucket.lines.push(line);
    bucket.fulfilmentModes.add(line.fulfilmentMode);
    bucket.totals.grossIncl = r2(bucket.totals.grossIncl + line.lineTotalIncl);
    bucket.totals.successFeeIncl = r2(bucket.totals.successFeeIncl + line.successFeeIncl);
    bucket.totals.fulfilmentFeeIncl = r2(bucket.totals.fulfilmentFeeIncl + line.fulfilmentFeeIncl);
    bucket.totals.handlingFeeIncl = r2(bucket.totals.handlingFeeIncl + line.handlingFeeIncl);
    bucket.totals.storageAccruedIncl = r2(bucket.totals.storageAccruedIncl + line.storageAccruedIncl);
    bucket.totals.payoutDueIncl = r2(bucket.totals.payoutDueIncl + line.payoutDueIncl);
    bucket.totals.quantity = bucket.totals.quantity + line.quantity;

    if (line.expectedFulfilmentBy) {
      const current = bucket.expectedFulfilmentBy ? new Date(bucket.expectedFulfilmentBy).getTime() : null;
      const next = new Date(line.expectedFulfilmentBy).getTime();
      if (!bucket.expectedFulfilmentBy || (Number.isFinite(next) && (!Number.isFinite(current) || next < current))) {
        bucket.expectedFulfilmentBy = line.expectedFulfilmentBy;
      }
    }

    buckets.set(line.sellerKey, bucket);
  });

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    fulfilmentMode: bucket.fulfilmentModes.size === 1 ? Array.from(bucket.fulfilmentModes)[0] : "mixed",
    fulfilmentModes: Array.from(bucket.fulfilmentModes),
    totals: {
      ...bucket.totals,
      netDueIncl: r2(bucket.totals.payoutDueIncl),
    },
  }));
}

export function summarizeSellerSettlementBucket(bucket) {
  return {
    sellerKey: bucket.sellerKey,
    sellerCode: bucket.sellerCode || null,
    sellerSlug: bucket.sellerSlug || null,
    vendorName: bucket.vendorName || null,
    fulfilmentMode: bucket.fulfilmentMode || "seller",
    grossIncl: r2(bucket.totals?.grossIncl || 0),
    successFeeIncl: r2(bucket.totals?.successFeeIncl || 0),
    fulfilmentFeeIncl: r2(bucket.totals?.fulfilmentFeeIncl || 0),
    handlingFeeIncl: r2(bucket.totals?.handlingFeeIncl || 0),
    storageAccruedIncl: r2(bucket.totals?.storageAccruedIncl || 0),
    payoutDueIncl: r2(bucket.totals?.payoutDueIncl || 0),
    quantity: Math.max(0, Math.trunc(Number(bucket.totals?.quantity || 0))),
    expectedFulfilmentBy: bucket.expectedFulfilmentBy || null,
    lineCount: Array.isArray(bucket.lines) ? bucket.lines.length : 0,
  };
}

function aggregateSettlementStatus(statuses) {
  const order = ["blocked", "cancelled", "pending_review", "held", "ready_for_payout", "processing_payout", "paid"];
  for (const item of order) {
    if (statuses.includes(item)) return item;
  }
  return statuses[0] || "held";
}

function getSettlementStatus({ orderStatus, paymentStatus, claimStatus, reviewStatus, releaseStatus, payoutEligible, payoutProfileReady, batchStatus }) {
  const normalizedOrderStatus = toStr(orderStatus).toLowerCase();
  const normalizedPaymentStatus = toStr(paymentStatus).toLowerCase();
  const normalizedClaimStatus = toStr(claimStatus).toLowerCase();
  const normalizedReviewStatus = toStr(reviewStatus).toLowerCase();
  const normalizedReleaseStatus = toStr(releaseStatus).toLowerCase();

  if (["cancelled"].includes(normalizedOrderStatus) || ["refunded", "partial_refund"].includes(normalizedPaymentStatus)) {
    return "cancelled";
  }
  if (normalizedReleaseStatus === "paid") return "paid";
  if (["pending_submission", "submitted", "in_transit"].includes(toStr(batchStatus).toLowerCase())) return "processing_payout";
  if (normalizedReviewStatus === "rejected") return "blocked";
  if ((normalizedReviewStatus === "approved" || normalizedOrderStatus === "completed") && payoutEligible && payoutProfileReady) {
    return "ready_for_payout";
  }
  if (normalizedClaimStatus === "pending_review") return "pending_review";
  return "held";
}

function getBucketDeliveredAt(order, bucket) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const sellerCode = toStr(bucket?.sellerCode).toLowerCase();
  const sellerSlug = toStr(bucket?.sellerSlug).toLowerCase();
  const deliveredDates = [];

  for (const item of items) {
    const identity = getItemSellerIdentity(item);
    const matchesSeller =
      (sellerCode && toStr(identity.sellerCode).toLowerCase() === sellerCode) ||
      (sellerSlug && toStr(identity.sellerSlug).toLowerCase() === sellerSlug);
    if (!matchesSeller) continue;

    const tracking = item?.fulfillment_tracking || {};
    const deliveredAt =
      parseDate(tracking?.deliveredAt) ||
      parseDate(tracking?.updatedAt && toStr(tracking?.status).toLowerCase() === "delivered" ? tracking.updatedAt : null);
    if (deliveredAt) deliveredDates.push(deliveredAt);
  }

  if (!deliveredDates.length) {
    return parseDate(order?.timestamps?.completedAt || order?.timestamps?.updatedAt || null);
  }

  deliveredDates.sort((left, right) => right.getTime() - left.getTime());
  return deliveredDates[0];
}

async function bumpSellerStrike({ ownerId, reasonCode, reasonMessage, orderId, orderNumber }) {
  if (!ownerId) return;
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection("users").doc(ownerId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const nowIso = now();
  const strikePath = "seller.accountHealth.strikes";
  const updates = {
    [`${strikePath}.total`]: FieldValue.increment(1),
    [`seller.accountHealth.lastStrikeAt`]: nowIso,
    [`seller.accountHealth.lastStrikeReasonCode`]: reasonCode || "other",
    [`seller.accountHealth.lastStrikeReasonMessage`]: reasonMessage || null,
    [`seller.accountHealth.lastOrderId`]: orderId || null,
    [`seller.accountHealth.lastOrderNumber`]: orderNumber || null,
    [`seller.accountHealth.updatedAt`]: nowIso,
  };

  if (reasonCode === "late_fulfilment") {
    updates[`${strikePath}.lateFulfilment`] = FieldValue.increment(1);
  }
  if (reasonCode === "review_rejected") {
    updates[`${strikePath}.reviewRejected`] = FieldValue.increment(1);
  }
  if (reasonCode === "missing_tracking") {
    updates[`${strikePath}.missingTracking`] = FieldValue.increment(1);
  }

  const currentSeller = snap.data()?.seller && typeof snap.data().seller === "object" ? snap.data().seller : {};
  const currentStrikes = Number(currentSeller?.accountHealth?.strikes?.total || 0);
  if (currentStrikes + 1 >= STRIKE_THRESHOLD) {
    updates["seller.accountHealth.flagged"] = true;
    updates["seller.accountHealth.flaggedReason"] = "repeat_fulfilment_offences";
  }

  await ref.update(updates);
}

export async function syncOrderSellerSettlements({
  orderId,
  orderNumber = null,
  orderSnapshot = null,
  eventType = "payment_success",
  claim = null,
  review = null,
  release = null,
}) {
  if (!orderId) {
    throw new Error("orderId is required to sync settlements.");
  }

  const db = getAdminDb();
  if (!db) {
    throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  }

  const orderRef = db.collection("orders_v2").doc(orderId);
  const orderSnap = orderSnapshot
    ? null
    : await orderRef.get();

  const order = orderSnapshot || (orderSnap?.exists ? orderSnap.data() : null);
  if (!order) {
    throw new Error("Order not found.");
  }

  const buckets = buildSellerSettlementBuckets(order);
  const orderStatus = toStr(order?.order?.status?.order || "draft").toLowerCase();
  const paymentStatus = toStr(order?.payment?.status || order?.order?.status?.payment || "unpaid").toLowerCase();
  const createdAt = toStr(order?.timestamps?.createdAt || now());
  const summaries = [];
  const settlementStatuses = [];

  for (const bucket of buckets) {
    const sellerIdentifier = bucket.sellerCode || bucket.sellerSlug || bucket.vendorName || bucket.sellerKey;
    const sellerOwner = await findSellerOwnerByIdentifier(sellerIdentifier);
    const settlementId = `${orderId}__${normalizeKey(sellerIdentifier || bucket.sellerKey || "UNKNOWN")}`;
    const settlementRef = db.collection(SETTLEMENT_COLLECTION).doc(settlementId);
    const existingSnap = await settlementRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};
    const payoutProfileSummary = getPayoutProfileSummary(sellerOwner?.data?.seller?.payoutProfile || existing?.payout?.bank_profile || {});
    const deliveredAt = getBucketDeliveredAt(order, bucket);
    const eligibleAt = deliveredAt ? parseDate(addDays(deliveredAt.toISOString(), PAYOUT_HOLD_DAYS)) : null;
    const payoutEligible = Boolean(eligibleAt && eligibleAt.getTime() <= Date.now());

    const claimStatus = toStr(claim?.status || existing?.fulfilment?.claimStatus || "");
    const reviewStatus = toStr(review?.status || existing?.fulfilment?.reviewStatus || "");
    const releaseStatus = toStr(release?.status || existing?.payout?.status || "");
    const batchStatus = toStr(existing?.payout?.batchStatus || existing?.payout_batch?.status || "");
    const nextStatus = getSettlementStatus({
      orderStatus,
      paymentStatus,
      claimStatus,
      reviewStatus,
      releaseStatus,
      payoutEligible,
      payoutProfileReady: payoutProfileSummary.ready,
      batchStatus,
    });

    const nextFulfilmentStatus =
      nextStatus === "blocked"
        ? "review_rejected"
        : nextStatus === "ready_for_payout" || nextStatus === "paid"
          ? "completed"
          : claim?.status === "pending_review"
            ? "pending_review"
            : bucket.fulfilmentMode === "bevgo"
              ? "awaiting_stock"
              : "awaiting_confirmation";

    const lineLate = Boolean(claim?.late === true);
    const strikeReasonCode =
      review?.status === "rejected"
        ? "review_rejected"
        : lineLate
          ? "late_fulfilment"
          : claim?.missingTracking === true
            ? "missing_tracking"
            : null;
    const strikeReasonMessage =
      review?.status === "rejected"
        ? toStr(review?.feedback || review?.reason || "Fulfilment review was rejected.")
        : lineLate
          ? "The seller missed the expected fulfilment window."
          : claim?.missingTracking === true
            ? "The seller submitted a fulfilment claim without tracking information."
            : null;

    const settlementPayload = {
      settlementId,
      orderId,
      orderNumber: orderNumber || toStr(order?.order?.orderNumber || null),
      merchantTransactionId: toStr(order?.order?.merchantTransactionId || null),
      sellerUid: sellerOwner?.id || existing?.sellerUid || null,
      sellerCode: bucket.sellerCode || existing?.sellerCode || null,
      sellerSlug: bucket.sellerSlug || existing?.sellerSlug || null,
      vendorName: bucket.vendorName || existing?.vendorName || null,
      status: nextStatus,
      orderStatus,
      paymentStatus,
      fulfilment: {
        mode: bucket.fulfilmentMode || existing?.fulfilment?.mode || "seller",
        status: nextFulfilmentStatus,
        claimStatus: claim?.status || existing?.fulfilment?.claimStatus || null,
        reviewStatus: review?.status || existing?.fulfilment?.reviewStatus || null,
        reviewFeedback: review?.feedback || existing?.fulfilment?.reviewFeedback || null,
        claimedAt: claim?.submittedAt || existing?.fulfilment?.claimedAt || null,
        claimedBy: claim?.submittedBy || existing?.fulfilment?.claimedBy || null,
        reviewedAt: review?.reviewedAt || existing?.fulfilment?.reviewedAt || null,
        reviewedBy: review?.reviewedBy || existing?.fulfilment?.reviewedBy || null,
        trackingNumber: claim?.trackingNumber || existing?.fulfilment?.trackingNumber || null,
        courierName: claim?.courierName || existing?.fulfilment?.courierName || null,
        proofUrl: claim?.proofUrl || existing?.fulfilment?.proofUrl || null,
        expectedFulfilmentBy: bucket.expectedFulfilmentBy || existing?.fulfilment?.expectedFulfilmentBy || null,
        late: claim?.late === true || existing?.fulfilment?.late === true,
      },
      payout: {
        currency: "ZAR",
        gross_incl: r2(bucket.totals?.grossIncl || 0),
        success_fee_incl: r2(bucket.totals?.successFeeIncl || 0),
        fulfilment_fee_incl: r2(bucket.totals?.fulfilmentFeeIncl || 0),
        handling_fee_incl: r2(bucket.totals?.handlingFeeIncl || 0),
        storage_accrued_incl: r2(bucket.totals?.storageAccruedIncl || 0),
        net_due_incl: r2(bucket.totals?.payoutDueIncl || 0),
        released_incl: r2(release?.releasedIncl || existing?.payout?.released_incl || 0),
        remaining_due_incl: r2(Math.max((bucket.totals?.payoutDueIncl || 0) - Number(release?.releasedIncl || existing?.payout?.released_incl || 0), 0)),
        status:
          release?.status ||
          existing?.payout?.status ||
          (nextStatus === "paid"
            ? "paid"
            : nextStatus === "processing_payout"
              ? "pending_submission"
              : nextStatus === "ready_for_payout"
                ? "ready_for_payout"
                : "held"),
        releaseReference: release?.reference || existing?.payout?.releaseReference || null,
        releasedAt: release?.releasedAt || existing?.payout?.releasedAt || null,
        releasedBy: release?.releasedBy || existing?.payout?.releasedBy || null,
        delivered_at: isoOrNull(deliveredAt),
        eligible_at: isoOrNull(eligibleAt),
        hold_days: PAYOUT_HOLD_DAYS,
        hold_reason:
          !deliveredAt
            ? "awaiting_delivery"
            : !payoutEligible
              ? "return_window_open"
              : !payoutProfileSummary.ready
                ? "missing_bank_details"
                : null,
        bank_profile: payoutProfileSummary,
        batchId: existing?.payout?.batchId || null,
        batchStatus: batchStatus || null,
      },
      lines: bucket.lines,
      accountability: {
        late: claim?.late === true || existing?.accountability?.late === true,
        strikeReasonCode: strikeReasonCode || existing?.accountability?.strikeReasonCode || null,
        strikeReasonMessage: strikeReasonMessage || existing?.accountability?.strikeReasonMessage || null,
      },
      createdAt: existing?.createdAt || createdAt,
      updatedAt: now(),
      lastSyncedAt: now(),
    };

    await settlementRef.set(settlementPayload, { merge: true });

    if (sellerOwner?.id && strikeReasonCode) {
      await bumpSellerStrike({
        ownerId: sellerOwner.id,
        reasonCode: strikeReasonCode,
        reasonMessage: strikeReasonMessage,
        orderId,
        orderNumber: orderNumber || toStr(order?.order?.orderNumber || null),
      });
    }

    summaries.push({
      settlementId,
      sellerCode: settlementPayload.sellerCode,
      sellerSlug: settlementPayload.sellerSlug,
      vendorName: settlementPayload.vendorName,
      status: settlementPayload.status,
      payoutStatus: settlementPayload.payout.status,
      eligibleAt: settlementPayload.payout.eligible_at,
      holdReason: settlementPayload.payout.hold_reason,
      bankReady: payoutProfileSummary.ready,
      fulfilmentMode: settlementPayload.fulfilment.mode,
      grossIncl: settlementPayload.payout.gross_incl,
      successFeeIncl: settlementPayload.payout.success_fee_incl,
      fulfilmentFeeIncl: settlementPayload.payout.fulfilment_fee_incl,
      handlingFeeIncl: settlementPayload.payout.handling_fee_incl,
      storageAccruedIncl: settlementPayload.payout.storage_accrued_incl,
      netDueIncl: settlementPayload.payout.net_due_incl,
      releasedIncl: settlementPayload.payout.released_incl,
      remainingDueIncl: settlementPayload.payout.remaining_due_incl,
      quantity: bucket.totals?.quantity || 0,
      lineCount: bucket.lines.length,
      expectedFulfilmentBy: bucket.expectedFulfilmentBy || null,
      late: settlementPayload.accountability.late,
    });
    settlementStatuses.push(settlementPayload.status);
  }

  const aggregateStatus = aggregateSettlementStatus(settlementStatuses);
  await orderRef.update({
    "settlements.items": summaries,
    "settlements.status": aggregateStatus,
    "settlements.updatedAt": now(),
    "settlements.orderStatus": orderStatus,
    "settlements.paymentStatus": paymentStatus,
    "timestamps.updatedAt": now(),
  });

  return {
    orderId,
    orderNumber: orderNumber || toStr(order?.order?.orderNumber || null),
    settlementStatus: aggregateStatus,
    settlements: summaries,
  };
}

export async function releaseSellerSettlement({
  orderId,
  settlementId,
  releasedBy = null,
  releaseReference = null,
  amountIncl = null,
}) {
  const db = getAdminDb();
  if (!db) {
    throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  }

  const ref = settlementId
    ? db.collection(SETTLEMENT_COLLECTION).doc(settlementId)
    : null;
  if (!orderId && !ref) {
    throw new Error("orderId or settlementId is required to release a seller settlement.");
  }

  const settlementSnap = ref ? await ref.get() : null;
  const settlement = settlementSnap?.exists ? settlementSnap.data() : null;
  if (!settlement) {
    throw new Error("Seller settlement not found.");
  }
  const settlementStatus = toStr(settlement?.status || "").toLowerCase();
  const payoutStatus = toStr(settlement?.payout?.status || "").toLowerCase();
  const batchStatus = toStr(settlement?.payout?.batchStatus || "").toLowerCase();
  const holdReason = toStr(settlement?.payout?.hold_reason || "");
  const deliveredAt = parseDate(settlement?.payout?.delivered_at);
  const eligibleAt = parseDate(settlement?.payout?.eligible_at);
  const payoutProfileReady = settlement?.payout?.bank_profile?.ready === true;

  if (!["ready_for_payout", "processing_payout", "pending_submission", "submitted"].includes(settlementStatus)) {
    throw new Error("This settlement is not ready to be released.");
  }
  if (!["ready_for_payout", "pending_submission", "submitted", "paid"].includes(payoutStatus) && !["pending_submission", "submitted", "in_transit"].includes(batchStatus)) {
    throw new Error("This settlement has not reached a payable payout state.");
  }
  if (!deliveredAt) {
    throw new Error("This settlement cannot be released before the order is marked delivered.");
  }
  if (!eligibleAt || eligibleAt.getTime() > Date.now()) {
    throw new Error("This settlement cannot be released before the payout hold window closes.");
  }
  if (!payoutProfileReady) {
    throw new Error("This settlement cannot be released until payout details are complete.");
  }
  if (holdReason && holdReason !== "none") {
    throw new Error("This settlement is still on hold and cannot be released.");
  }

  const releasedIncl = r2(amountIncl ?? settlement?.payout?.net_due_incl ?? 0);
  const nowIso = now();
  const next = {
    status: "paid",
    payout: {
      ...(settlement?.payout || {}),
      status: "paid",
      released_incl: releasedIncl,
      remaining_due_incl: 0,
      releasedAt: nowIso,
      releasedBy,
      releaseReference: releaseReference || settlement?.payout?.releaseReference || null,
    },
    updatedAt: nowIso,
    lastSyncedAt: nowIso,
  };

  await ref.set(next, { merge: true });

  if (orderId) {
    const orderRef = db.collection("orders_v2").doc(orderId);
    await orderRef.update({
      "settlements.updatedAt": nowIso,
      "timestamps.updatedAt": nowIso,
    });
  }

  return {
    settlementId: settlement?.settlementId || settlementId,
    orderId: settlement?.orderId || orderId || null,
    releasedIncl,
    status: "paid",
  };
}

export async function getSellerSettlementSnapshot(orderId) {
  if (!orderId) return [];
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.collection("orders_v2").doc(orderId).get();
  if (!snap.exists) return [];
  const order = snap.data();
  return Array.isArray(order?.settlements?.items) ? order.settlements.items : [];
}
