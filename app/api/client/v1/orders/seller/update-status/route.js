export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { buildOrderDeliveryProgress, deriveAggregateOrderStatuses, enrichOrderItemFulfillment } from "@/lib/orders/fulfillment-progress";
import { canTransitionSellerFulfillment, getSellerFulfillmentStatusLabel, normalizeSellerFulfillmentStatus, requiresCancellationReason } from "@/lib/orders/status-lifecycle";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";
import { sendTrackingUpdateNotifications } from "@/lib/orders/tracking-notifications";
import { processStripeOrderRefund } from "@/lib/payments/stripe-refunds";
import { buildShipmentParcelFromVariant } from "@/lib/shipping/contracts";
import { easyshipRateAdapter } from "@/lib/shipping/adapters/easyship";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
    sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
    vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || ""),
  };
}

function r2(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function getLineQty(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function computeLineFinalIncl(item) {
  const lineTotal = Number(item?.line_totals?.final_incl);
  if (Number.isFinite(lineTotal) && lineTotal >= 0) return r2(lineTotal);
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const quantity = getLineQty(item);
  const saleIncl = Number(variant?.sale?.sale_price_incl);
  const regularIncl = Number(variant?.pricing?.selling_price_incl);
  const unitIncl = Number.isFinite(saleIncl) && saleIncl > 0 ? saleIncl : Number.isFinite(regularIncl) && regularIncl > 0 ? regularIncl : 0;
  return r2(unitIncl * quantity);
}

function collectLineShipmentParcels(item) {
  const quantity = getLineQty(item);
  const parcel = buildShipmentParcelFromVariant(item?.selected_variant_snapshot || item?.selected_variant || item?.variant || null);
  if (!parcel || quantity <= 0) return [];
  return Array.from({ length: quantity }, () => parcel);
}

function collectLineQuoteItems(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const quantity = getLineQty(item);
  if (quantity <= 0) return [];
  const lineTotal = computeLineFinalIncl(item);
  const unitValue = quantity > 0 ? r2(lineTotal / quantity) : 0;
  return [
    {
      description: toStr(product?.product?.title || variant?.label || "Marketplace item"),
      quantity,
      unitValue,
      customsCategory: product?.product?.shipping?.customsCategory || product?.shipping?.customsCategory || null,
      hsCode: product?.product?.shipping?.hsCode || product?.shipping?.hsCode || null,
      countryOfOrigin: product?.product?.shipping?.countryOfOrigin || product?.shipping?.countryOfOrigin || null,
    },
  ];
}

function getOrderDeliveryAddress(order) {
  const snapshot = order?.delivery_snapshot && typeof order.delivery_snapshot === "object" ? order.delivery_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const address = snapshot?.address && typeof snapshot.address === "object" ? snapshot.address : delivery?.address_snapshot && typeof delivery.address_snapshot === "object" ? delivery.address_snapshot : {};
  return {
    country: toStr(address?.country),
    region: toStr(address?.province || address?.stateProvinceRegion),
    city: toStr(address?.city || address?.suburb),
    suburb: toStr(address?.suburb),
    postalCode: toStr(address?.postalCode),
    recipientName: toStr(address?.recipientName),
  };
}

function updateSellerBreakdownEntries(entries, sellerCode, sellerSlug, patch) {
  const normalizedCode = toLower(sellerCode);
  const normalizedSlug = toLower(sellerSlug);
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const entryCode = toLower(entry?.sellerCode || entry?.seller_code || entry?.seller_key || "");
    const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
    const matches = Boolean((normalizedCode && entryCode === normalizedCode) || (normalizedSlug && entrySlug === normalizedSlug));
    return matches ? { ...entry, ...patch } : entry;
  });
}

function buildPlatformShipmentBreakdownPatch({ sellerDeliveryEntry = null, platformShipment = null, failure = null, now = "" } = {}) {
  const currentEntry = sellerDeliveryEntry && typeof sellerDeliveryEntry === "object" ? sellerDeliveryEntry : {};
  if (failure) {
    return {
      shipment_creation_state: "failed",
      shipment_error_message: toStr(failure?.message || "Piessang could not create the courier shipment yet."),
      shipment_last_attempt_at: now || new Date().toISOString(),
      shipment_retryable: true,
      shipment_status: toStr(currentEntry?.shipment_status || ""),
    };
  }
  if (platformShipment) {
    return {
      easyship_shipment_id: platformShipment.shipmentId,
      shipment_id: platformShipment.shipmentId,
      tracking_number: platformShipment.trackingNumber,
      tracking_url: platformShipment.trackingUrl,
      label_url: platformShipment.labelUrl,
      shipment_status: platformShipment.status,
      shipment_metadata: platformShipment.metadata || {},
      courier_carrier: toStr(platformShipment?.metadata?.courierName || currentEntry?.courier_carrier || ""),
      courier_service: toStr(platformShipment?.metadata?.serviceName || currentEntry?.courier_service || ""),
      shipment_creation_state: "created",
      shipment_error_message: "",
      shipment_last_attempt_at: now || new Date().toISOString(),
      shipment_retryable: false,
    };
  }
  return {};
}

async function createPlatformCourierShipment({ order, sellerCode, sellerSlug, sellerDeliveryEntry, sellerItems }) {
  const existingShipmentId = toStr(
    sellerDeliveryEntry?.easyship_shipment_id ||
    sellerDeliveryEntry?.shipment_id ||
    sellerDeliveryEntry?.shipmentId,
  );
  if (existingShipmentId) {
    return {
      skipped: true,
      shipmentId: existingShipmentId,
      trackingNumber: toStr(sellerDeliveryEntry?.tracking_number || sellerDeliveryEntry?.courier_tracking_number || "") || null,
      trackingUrl: toStr(sellerDeliveryEntry?.tracking_url || sellerDeliveryEntry?.courier_tracking_url || "") || null,
      labelUrl: toStr(sellerDeliveryEntry?.label_url || "") || null,
      status: toStr(sellerDeliveryEntry?.shipment_status || "created"),
      metadata: sellerDeliveryEntry?.shipment_metadata && typeof sellerDeliveryEntry.shipment_metadata === "object" ? sellerDeliveryEntry.shipment_metadata : {},
    };
  }

  const ownerDoc =
    (sellerCode ? await findSellerOwnerByCode(sellerCode) : null) ??
    (sellerSlug ? await findSellerOwnerBySlug(sellerSlug) : null);
  const seller = ownerDoc?.data?.seller && typeof ownerDoc.data.seller === "object" ? ownerDoc.data.seller : {};
  const origin = seller?.deliveryProfile?.origin && typeof seller.deliveryProfile.origin === "object" ? seller.deliveryProfile.origin : null;
  if (!origin?.country) {
    throw new Error("Seller shipping origin is missing, so Piessang cannot create the courier shipment yet.");
  }

  const destination = getOrderDeliveryAddress(order);
  if (!destination.country) {
    throw new Error("Customer delivery address is incomplete, so Piessang cannot create the courier shipment yet.");
  }

  const parcels = sellerItems.flatMap((item) => collectLineShipmentParcels(item));
  const items = sellerItems.flatMap((item) => collectLineQuoteItems(item));
  const availableQuotes = Array.isArray(sellerDeliveryEntry?.available_courier_quotes) ? sellerDeliveryEntry.available_courier_quotes : [];
  const selectedQuoteId = toStr(sellerDeliveryEntry?.selected_courier_quote_id || "");
  const selectedQuote = availableQuotes.find((quote) => toStr(quote?.id) === selectedQuoteId) || null;

  return easyshipRateAdapter.createShipment({
    sellerId: sellerCode || sellerSlug,
    orderId: toStr(order?.order?.orderNumber || order?.order?.id || ""),
    origin,
    destination,
    parcels,
    serviceCode: selectedQuoteId || null,
    metadata: {
      items,
      sellerCode,
      sellerSlug,
      orderNumber: toStr(order?.order?.orderNumber || ""),
      companyName: toStr(seller?.vendorName || seller?.groupVendorName || seller?.companyName || "Piessang seller"),
      recipientName: toStr(destination.recipientName || ""),
      handoverMode: toStr(sellerDeliveryEntry?.courier_handover_mode || "pickup"),
      courierName: toStr(selectedQuote?.carrier || sellerDeliveryEntry?.courier_carrier || ""),
      serviceName: toStr(selectedQuote?.service || sellerDeliveryEntry?.courier_service || ""),
    },
  });
}

function getCustomerEmail(order) {
  const snapshot = order?.customer_snapshot || {};
  const account = snapshot?.account || {};
  const personal = snapshot?.personal || {};
  return (
    toStr(snapshot?.email) ||
    toStr(account?.email) ||
    toStr(personal?.email) ||
    ""
  );
}

function getCustomerPhone(order) {
  const snapshot = order?.customer_snapshot || {};
  const account = snapshot?.account || {};
  const personal = snapshot?.personal || {};
  return (
    toStr(snapshot?.phoneNumber) ||
    toStr(account?.phoneNumber) ||
    toStr(account?.mobileNumber) ||
    toStr(personal?.phoneNumber) ||
    toStr(personal?.mobileNumber) ||
    ""
  );
}

function getCustomerName(order) {
  const snapshot = order?.customer_snapshot || {};
  const account = snapshot?.account || {};
  const business = snapshot?.business || {};
  const personal = snapshot?.personal || {};
  return (
    toStr(account?.accountName) ||
    toStr(business?.companyName) ||
    toStr(personal?.fullName) ||
    "Customer"
  );
}

function getSellerDeliveryBreakdownEntry(order, sellerCode, sellerSlug) {
  const pricingSnapshot = order?.pricing_snapshot && typeof order.pricing_snapshot === "object" ? order.pricing_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const breakdown = Array.isArray(pricingSnapshot?.sellerDeliveryBreakdown)
    ? pricingSnapshot.sellerDeliveryBreakdown
    : Array.isArray(delivery?.fee?.seller_breakdown)
      ? delivery.fee.seller_breakdown
      : [];
  const normalizedCode = toLower(sellerCode);
  const normalizedSlug = toLower(sellerSlug);
  return (
    breakdown.find((entry) => {
      const entryCode = toLower(entry?.sellerCode || entry?.seller_code || entry?.seller_key || "");
      const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
      return Boolean((normalizedCode && entryCode === normalizedCode) || (normalizedSlug && entrySlug === normalizedSlug));
    }) || null
  );
}

function getPrimaryPeachPaymentId(order) {
  const attempts = Array.isArray(order?.payment?.attempts) ? order.payment.attempts : [];
  const chargedAttempt = attempts.find(
    (attempt) =>
      toLower(attempt?.provider) === "peach" &&
      toLower(attempt?.status) === "charged" &&
      toLower(attempt?.type) !== "refund" &&
      toStr(attempt?.peachTransactionId),
  );
  return toStr(chargedAttempt?.peachTransactionId || "");
}

async function resolveOrderId(db, orderId, orderNumber) {
  if (orderId) return orderId;
  if (!orderNumber) return null;
  const snap = await db.collection("orders_v2").where("order.orderNumber", "==", orderNumber).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to update seller order status.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const orderIdInput = toStr(body?.orderId);
    const orderNumberInput = toStr(body?.orderNumber);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const status = normalizeSellerFulfillmentStatus(body?.status);
    const trackingNumber = toStr(body?.trackingNumber);
    const courierName = toStr(body?.courierName);
    const notes = toStr(body?.notes);
    const cancellationReason = toStr(body?.cancellationReason || body?.reason);

    if (!orderIdInput && !orderNumberInput) {
      return err(400, "Missing Order", "orderId or orderNumber is required.");
    }
    if (!sellerCode && !sellerSlug) {
      return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");
    }
    if (!["processing", "dispatched", "delivered", "cancelled"].includes(status)) {
      return err(400, "Invalid Status", "status must be processing, dispatched, delivered, or cancelled.");
    }
    if (requiresCancellationReason(status) && !cancellationReason) {
      return err(400, "Missing Cancellation Reason", "A cancellation reason is required before cancelling an order.");
    }

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canAccessSellerSettlement(requester, sellerSlug, sellerCode) && !isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "You do not have permission to update this seller order.");
    }

    const resolvedOrderId = await resolveOrderId(db, orderIdInput, orderNumberInput);
    if (!resolvedOrderId) return err(404, "Order Not Found", "Could not find that order.");

    const orderRef = db.collection("orders_v2").doc(resolvedOrderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "Could not find that order.");

    const order = orderSnap.data() || {};
    const now = new Date().toISOString();
    const sourceItems = Array.isArray(order?.items) ? order.items : [];
    const touchedItems = [];
    const sellerDeliveryEntry = getSellerDeliveryBreakdownEntry(order, sellerCode, sellerSlug);
    const trackingOwner = toLower(sellerDeliveryEntry?.tracking_owner || sellerDeliveryEntry?.trackingOwner || "");
    const previousOrderStatus = toLower(order?.lifecycle?.orderStatus || order?.order?.status?.order || "");
    const cancellationStatus = toLower(order?.cancellation?.status || order?.lifecycle?.cancellationStatus || "");
    const paymentStatus = toLower(order?.payment?.status || order?.lifecycle?.paymentStatus || order?.order?.status?.payment || "");

    if (["requested", "approved", "cancelled"].includes(cancellationStatus)) {
      return err(
        409,
        "Cancellation In Progress",
        cancellationStatus === "cancelled"
          ? "This order has already been cancelled. Seller fulfilment updates are locked."
          : "This order has a customer cancellation request in progress. Seller fulfilment updates are locked until the cancellation is resolved.",
        { cancellationStatus },
      );
    }

    if (["refunded", "partial_refund"].includes(paymentStatus) || previousOrderStatus === "cancelled") {
      return err(409, "Order Locked", "This order can no longer be fulfilled because it has been cancelled or refunded.", {
        cancellationStatus,
        paymentStatus,
      });
    }

    if ((trackingOwner === "platform" || trackingOwner === "piessang") && !isSystemAdminUser(requester)) {
      return err(
        409,
        "Courier Status Managed By Piessang",
        "This courier shipment is now managed by Piessang and the courier integration, so sellers cannot update its fulfilment status manually.",
      );
    }

    const sellerSourceItems = sourceItems
      .filter((item) => {
        const lineSeller = getLineSellerIdentity(item);
        return (
          (sellerCode && toLower(lineSeller.sellerCode) === toLower(sellerCode)) ||
          (sellerSlug && toLower(lineSeller.sellerSlug) === toLower(sellerSlug))
        );
      })
      .map((item) => enrichOrderItemFulfillment(item, order));
    const currentSellerStatus = deriveAggregateOrderStatuses(sellerSourceItems, order)?.fulfillmentStatus || "confirmed";

    if (
      !canTransitionSellerFulfillment({
        currentStatus: currentSellerStatus,
        nextStatus: status,
        deliveryType: sellerDeliveryEntry?.delivery_type || sellerDeliveryEntry?.method || "",
        isComplete: sellerSourceItems.every((item) => toLower(item?.fulfillment_tracking?.status) === "delivered"),
      })
    ) {
      return err(409, "Invalid Status Change", `You cannot move this order from ${getSellerFulfillmentStatusLabel(currentSellerStatus)} to ${getSellerFulfillmentStatusLabel(status)}.`);
    }
    if ((trackingOwner === "piessang" || trackingOwner === "platform") && (trackingNumber || courierName)) {
      return err(409, "Tracking Managed By Piessang", "This shipping method is tracked by Piessang, so sellers cannot add courier details manually.");
    }

    let platformShipment = null;
    let platformShipmentFailure = null;
    if (status === "dispatched" && (trackingOwner === "platform" || trackingOwner === "piessang")) {
      try {
        platformShipment = await createPlatformCourierShipment({
          order,
          sellerCode,
          sellerSlug,
          sellerDeliveryEntry,
          sellerItems: sellerSourceItems,
        });
      } catch (shipmentError) {
        platformShipmentFailure = shipmentError instanceof Error ? shipmentError : new Error("Piessang could not create the courier shipment yet.");
      }
    }

    const effectiveStatus = platformShipmentFailure ? currentSellerStatus : status;
    const nextItems = sourceItems.map((item) => {
      const lineSeller = getLineSellerIdentity(item);
      const matchesSeller =
        (sellerCode && toLower(lineSeller.sellerCode) === toLower(sellerCode)) ||
        (sellerSlug && toLower(lineSeller.sellerSlug) === toLower(sellerSlug));
      if (!matchesSeller) return enrichOrderItemFulfillment(item, order);

      const nextItem = enrichOrderItemFulfillment(
        {
          ...item,
          fulfillment_tracking: {
            ...(item?.fulfillment_tracking || {}),
            status: effectiveStatus,
            updatedAt: now,
            updatedBy: sessionUser.uid,
            trackingNumber:
              (trackingOwner === "platform" || trackingOwner === "piessang")
                ? platformShipment?.trackingNumber || item?.fulfillment_tracking?.trackingNumber || null
                : trackingNumber || item?.fulfillment_tracking?.trackingNumber || null,
            courierName:
              (trackingOwner === "platform" || trackingOwner === "piessang")
                ? toStr(platformShipment?.metadata?.courierName || "") || item?.fulfillment_tracking?.courierName || null
                : courierName || item?.fulfillment_tracking?.courierName || null,
            trackingUrl:
              (trackingOwner === "platform" || trackingOwner === "piessang")
                ? platformShipment?.trackingUrl || item?.fulfillment_tracking?.trackingUrl || null
                : item?.fulfillment_tracking?.trackingUrl || null,
            labelUrl:
              (trackingOwner === "platform" || trackingOwner === "piessang")
                ? platformShipment?.labelUrl || item?.fulfillment_tracking?.labelUrl || null
                : item?.fulfillment_tracking?.labelUrl || null,
            shipmentId:
              (trackingOwner === "platform" || trackingOwner === "piessang")
                ? platformShipment?.shipmentId || item?.fulfillment_tracking?.shipmentId || null
                : item?.fulfillment_tracking?.shipmentId || null,
            shipmentStatus:
              (trackingOwner === "platform" || trackingOwner === "piessang")
                ? toStr(platformShipment?.status || item?.fulfillment_tracking?.shipmentStatus || "")
                : toStr(item?.fulfillment_tracking?.shipmentStatus || ""),
            notes: notes || item?.fulfillment_tracking?.notes || null,
            cancellationReason: cancellationReason || item?.fulfillment_tracking?.cancellationReason || null,
            cancelledAt: effectiveStatus === "cancelled" ? now : item?.fulfillment_tracking?.cancelledAt || null,
          },
        },
        order,
      );
      touchedItems.push(nextItem);
      return nextItem;
    });

    if (!touchedItems.length) {
      return err(404, "Seller Items Not Found", "This seller does not have any items on that order.");
    }

    const aggregate = deriveAggregateOrderStatuses(nextItems, order);
    const { items: enrichedItems, progress } = buildOrderDeliveryProgress({ ...order, items: nextItems });

    const platformShipmentBreakdownPatch = buildPlatformShipmentBreakdownPatch({
      sellerDeliveryEntry,
      platformShipment,
      failure: platformShipmentFailure,
      now,
    });
    const nextPricingBreakdown = updateSellerBreakdownEntries(
      order?.pricing_snapshot?.sellerDeliveryBreakdown || [],
      sellerCode,
      sellerSlug,
      platformShipmentBreakdownPatch,
    );
    const nextDeliveryBreakdown = updateSellerBreakdownEntries(
      order?.delivery?.fee?.seller_breakdown || [],
      sellerCode,
      sellerSlug,
      platformShipmentBreakdownPatch,
    );
    const nextDeliverySnapshotBreakdown = updateSellerBreakdownEntries(
      order?.delivery_snapshot?.sellerDeliveryBreakdown || [],
      sellerCode,
      sellerSlug,
      platformShipmentBreakdownPatch,
    );

    const wholeOrderCancelled = aggregate.orderStatus === "cancelled";
    const paymentProvider = toLower(order?.payment?.provider || "");
    const shouldAutoRefund =
      wholeOrderCancelled &&
      status === "cancelled" &&
      paymentStatus === "paid" &&
      ["stripe", "peach"].includes(paymentProvider);
    const origin = new URL(req.url).origin;
    let refundResult = null;

    if (shouldAutoRefund) {
      if (paymentProvider === "stripe") {
        refundResult = await processStripeOrderRefund({
          orderRef,
          orderId: resolvedOrderId,
          order,
          refundRequestId: `seller-cancel:${resolvedOrderId}:${sellerCode || sellerSlug || "seller"}`,
          message: cancellationReason || "Seller cancelled this order.",
          adminUid: sessionUser.uid,
          markOrderCancelled: true,
          cancelReason: cancellationReason || "Seller cancelled this order.",
        });
      } else if (paymentProvider === "peach") {
        const paymentId = getPrimaryPeachPaymentId(order);
        if (!paymentId) {
          return err(409, "Refund Unavailable", "We could not find the Peach payment reference needed to refund this cancelled order.");
        }
        const refundResponse = await fetch(`${origin}/api/client/v1/payments/peach/charge-refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: resolvedOrderId,
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || ""),
            paymentId,
            refundRequestId: `seller-cancel:${resolvedOrderId}:${sellerCode || sellerSlug || "seller"}`,
            message: cancellationReason || "Seller cancelled this order.",
          }),
        });
        const refundPayload = await refundResponse.json().catch(() => ({}));
        if (!refundResponse.ok || refundPayload?.ok === false) {
          return err(
            refundResponse.status || 500,
            refundPayload?.title || "Refund Failed",
            refundPayload?.message || "Unable to refund the cancelled order payment.",
          );
        }
        const remainingPaid = Number(refundPayload?.remainingPaid ?? order?.payment?.paid_amount_incl ?? 0);
        const refundedAmountIncl = Math.max(
          Number(order?.payment?.refunded_amount_incl || 0),
          Number(order?.payment?.paid_amount_incl || 0) - remainingPaid,
        );
        refundResult = {
          status: toLower(refundPayload?.status || "refunded") === "partial_refund" ? "partial_refund" : "refunded",
          refundId: toStr(refundPayload?.refundId || ""),
          remainingPaid,
          refundedAmountIncl,
          refundedAt: now,
        };
      }
    }
    const refundStarted = ["refunded", "partial_refund", "already_refunded", "already_processed"].includes(
      toLower(refundResult?.status || ""),
    );
    const effectiveCourierName =
      (trackingOwner === "platform" || trackingOwner === "piessang")
        ? toStr(platformShipment?.metadata?.courierName || platformShipment?.metadata?.serviceName || "")
        : courierName;
    const effectiveTrackingNumber =
      (trackingOwner === "platform" || trackingOwner === "piessang")
        ? toStr(platformShipment?.trackingNumber || "")
        : trackingNumber;
    const sellerVendorName = touchedItems[0]?.product_snapshot?.product?.vendorName || touchedItems[0]?.product_snapshot?.seller?.vendorName || "";
    const timelineEvent = createOrderTimelineEvent({
      type: platformShipmentFailure ? "seller_dispatch_attempt_failed" : `seller_${effectiveStatus}`,
      title:
        platformShipmentFailure
          ? "Courier shipment creation failed"
          : effectiveStatus === "cancelled"
          ? "Seller cancelled this order"
          : effectiveStatus === "dispatched"
            ? (trackingNumber || courierName ? "Order handed to courier" : "Order out for delivery")
            : effectiveStatus === "delivered"
              ? "Seller marked this order delivered"
              : "Seller started processing this order",
      message:
        platformShipmentFailure
          ? `Piessang could not create the courier shipment yet.${platformShipmentFailure?.message ? ` ${platformShipmentFailure.message}` : ""}`
          : effectiveStatus === "cancelled"
          ? `The seller cancelled this order.${cancellationReason ? ` Reason: ${cancellationReason}` : ""}`
          : effectiveStatus === "dispatched"
            ? [
                "The seller marked this order as on the way.",
                effectiveCourierName ? `Courier: ${effectiveCourierName}.` : "",
                effectiveTrackingNumber ? `Tracking number: ${effectiveTrackingNumber}.` : "",
                notes ? `Note: ${notes}` : "",
              ].filter(Boolean).join(" ")
            : effectiveStatus === "delivered"
              ? "The seller confirmed that this order has been delivered."
              : "The seller started preparing this order.",
      actorType: isSystemAdminUser(requester) ? "admin" : "seller",
      actorId: sessionUser.uid,
      actorLabel: toStr(
        requester?.seller?.vendorName ||
          requester?.account?.accountName ||
          requester?.personal?.fullName ||
          requester?.email ||
          sellerVendorName ||
          "Seller",
      ),
      createdAt: now,
      status: platformShipmentFailure ? "failed" : effectiveStatus,
      sellerCode: sellerCode || touchedItems[0]?.product_snapshot?.product?.sellerCode || "",
      sellerSlug: sellerSlug || touchedItems[0]?.product_snapshot?.product?.sellerSlug || "",
      metadata: {
        courierName: effectiveCourierName || null,
        trackingNumber: effectiveTrackingNumber || null,
        note: notes || null,
        itemCount: touchedItems.length,
        cancellationReason: cancellationReason || null,
      },
    });
    let nextTimelineEvents = appendOrderTimelineEvent(order, timelineEvent);
    const orderJustCompleted = aggregate.orderStatus === "completed" && previousOrderStatus !== "completed";
    if (orderJustCompleted) {
      nextTimelineEvents = appendOrderTimelineEvent(
        { timeline: { events: nextTimelineEvents } },
        createOrderTimelineEvent({
          type: "order_completed",
          title: "Order completed",
          message: "All sellers on this order have completed fulfilment. You can now leave a seller or product review.",
          actorType: "system",
          actorId: "piessang",
          actorLabel: "Piessang",
          createdAt: now,
          status: "completed",
        }),
      );
    }

    await orderRef.set(
      {
        items: enrichedItems,
        pricing_snapshot: {
          ...(order?.pricing_snapshot || {}),
          sellerDeliveryBreakdown: nextPricingBreakdown,
        },
        delivery: {
          ...(order?.delivery || {}),
          fee: {
            ...(order?.delivery?.fee || {}),
            seller_breakdown: nextDeliveryBreakdown,
          },
        },
        delivery_snapshot: {
          ...(order?.delivery_snapshot || {}),
          sellerDeliveryBreakdown: nextDeliverySnapshotBreakdown,
        },
        order: {
          ...(order?.order || {}),
          status: {
            ...(order?.order?.status || {}),
            order: aggregate.orderStatus,
            fulfillment: aggregate.fulfillmentStatus,
          },
          ...(wholeOrderCancelled
            ? {
                editable: false,
                editable_reason: cancellationReason,
                cancel_message: cancellationReason,
                cancel_message_at: now,
                status: {
                  ...(order?.order?.status || {}),
                  order: aggregate.orderStatus,
                  fulfillment: aggregate.fulfillmentStatus,
                  payment: refundStarted
                    ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
                    : order?.order?.status?.payment,
                },
              }
            : {}),
        },
        lifecycle: {
          ...(order?.lifecycle || {}),
          orderStatus: aggregate.orderStatus,
          fulfillmentStatus: aggregate.fulfillmentStatus,
          updatedAt: now,
          ...(wholeOrderCancelled
            ? {
                cancelledAt: now,
                editable: false,
                editableReason: cancellationReason,
                cancellationStatus: "cancelled",
                paymentStatus: refundStarted
                  ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
                  : order?.lifecycle?.paymentStatus,
              }
            : {}),
        },
        payment: {
          ...(order?.payment || {}),
          status: refundStarted
            ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
            : order?.payment?.status,
          refunded_at: refundStarted ? (refundResult?.refundedAt || now) : order?.payment?.refunded_at,
          refunded_amount_incl:
            refundStarted
              ? (refundResult?.refundedAmountIncl ?? order?.payment?.refunded_amount_incl ?? 0)
              : order?.payment?.refunded_amount_incl,
          paid_amount_incl:
            refundStarted
              ? (refundResult?.remainingPaid ?? 0)
              : order?.payment?.paid_amount_incl,
        },
        cancellation: wholeOrderCancelled
          ? {
              ...(order?.cancellation || {}),
              status: "cancelled",
              mode: "cancel",
              reason: cancellationReason || order?.cancellation?.reason || null,
              requestedAt: order?.cancellation?.requestedAt || now,
              requestedByUid: order?.cancellation?.requestedByUid || sessionUser.uid,
              approvedAt: order?.cancellation?.approvedAt || now,
              approvedByUid: order?.cancellation?.approvedByUid || sessionUser.uid,
            }
          : order?.cancellation,
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt: now,
          ...(wholeOrderCancelled ? { lockedAt: order?.timestamps?.lockedAt || now } : {}),
        },
        timeline: {
          ...(order?.timeline || {}),
          events: nextTimelineEvents,
          updatedAt: now,
        },
      },
      { merge: true },
    );

    if (platformShipmentFailure) {
      return err(
        409,
        "Courier Shipment Pending",
        platformShipmentFailure.message || "Piessang could not create the courier shipment yet.",
        {
          orderId: resolvedOrderId,
          orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || ""),
          status: effectiveStatus,
          retryable: true,
          deliveryUpdate: {
            shipmentCreationState: "failed",
            shipmentErrorMessage: toStr(platformShipmentFailure.message || ""),
            shipmentLastAttemptAt: now,
            shipmentRetryable: true,
            shipmentStatus: toStr(sellerDeliveryEntry?.shipment_status || ""),
            trackingUrl: toStr(sellerDeliveryEntry?.tracking_url || ""),
            labelUrl: toStr(sellerDeliveryEntry?.label_url || ""),
          },
        },
      );
    }

    if (platformShipment?.shipmentId) {
      await db.collection("order_courier_shipments").doc(String(platformShipment.shipmentId)).set(
        {
          shipmentId: String(platformShipment.shipmentId),
          orderId: resolvedOrderId,
          sellerCode: sellerCode || null,
          sellerSlug: sellerSlug || null,
          trackingNumber: platformShipment.trackingNumber || null,
          trackingUrl: platformShipment.trackingUrl || null,
          shipmentStatus: toStr(platformShipment.status || ""),
          active: toLower(platformShipment.status) !== "delivered" && toLower(platformShipment.status) !== "cancelled",
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    const customerEmail = getCustomerEmail(order);
    const customerPhone = getCustomerPhone(order);
    const customerName = getCustomerName(order);
    await sendTrackingUpdateNotifications({
      origin,
      customerEmail,
      customerPhone,
      customerName,
      orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
      deliveryType: sellerDeliveryEntry?.delivery_type || sellerDeliveryEntry?.method || "",
      status,
      courierName: effectiveCourierName || touchedItems[0]?.fulfillment_tracking?.courierName || "",
      trackingNumber: effectiveTrackingNumber || touchedItems[0]?.fulfillment_tracking?.trackingNumber || "",
      sellerVendorName,
      cancellationReason,
      itemCount: touchedItems.length,
      items: touchedItems.map((item) => ({
        title: toStr(item?.product_snapshot?.product?.title || item?.product_snapshot?.title || "Product"),
        variant: toStr(item?.selected_variant_snapshot?.label || item?.selected_variant_snapshot?.variant_id || ""),
        quantity: Number(item?.quantity || 0),
        statusLabel: getSellerFulfillmentStatusLabel(status),
      })),
    });

    if (status === "delivered" && currentSellerStatus !== "delivered" && customerEmail) {
      const reviewSellerSlug =
        sellerSlug ||
        toStr(touchedItems[0]?.product_snapshot?.product?.sellerSlug || touchedItems[0]?.product_snapshot?.seller?.sellerSlug || "");
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "seller-rating-request",
          to: customerEmail,
          data: {
            customerName,
            vendorName: sellerVendorName || "your seller",
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
            reviewUrl: `${origin}/account/orders/${encodeURIComponent(resolvedOrderId)}${reviewSellerSlug ? `?rateSeller=${encodeURIComponent(reviewSellerSlug)}` : ""}`,
          },
        }),
      }).catch(() => null);
    }

    if (orderJustCompleted && customerEmail) {
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-review-request",
          to: customerEmail,
          data: {
            customerName,
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
            orderUrl: `${origin}/account/orders/${encodeURIComponent(resolvedOrderId)}`,
            reviewsUrl: `${origin}/account/reviews`,
          },
        }),
      }).catch(() => null);
    }

    return ok({
      message: "Seller order items updated.",
      orderId: resolvedOrderId,
      orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || ""),
      updatedCount: touchedItems.length,
      status,
      deliveryProgress: progress,
      deliveryUpdate: {
        shipmentCreationState: platformShipment ? "created" : toStr(sellerDeliveryEntry?.shipment_creation_state || ""),
        shipmentErrorMessage: platformShipment ? "" : toStr(sellerDeliveryEntry?.shipment_error_message || ""),
        shipmentLastAttemptAt: platformShipment ? now : toStr(sellerDeliveryEntry?.shipment_last_attempt_at || ""),
        shipmentRetryable: platformShipment ? false : Boolean(sellerDeliveryEntry?.shipment_retryable),
        shipmentStatus: toStr(platformShipment?.status || sellerDeliveryEntry?.shipment_status || ""),
        trackingUrl: toStr(platformShipment?.trackingUrl || sellerDeliveryEntry?.tracking_url || ""),
        labelUrl: toStr(platformShipment?.labelUrl || sellerDeliveryEntry?.label_url || ""),
      },
      paymentStatus: refundStarted
        ? (refundResult?.status === "partial_refund" ? "partial_refund" : "refunded")
        : paymentStatus,
      refundStarted,
    });
  } catch (e) {
    return err(500, "Update Failed", e?.message || "Unexpected error updating seller order items.");
  }
}
