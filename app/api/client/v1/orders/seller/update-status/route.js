export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { buildOrderDeliveryProgress, deriveAggregateOrderStatuses, enrichOrderItemFulfillment } from "@/lib/orders/fulfillment-progress";

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

function statusLabel(status) {
  if (status === "delivered") return "Delivered";
  if (status === "dispatched") return "Dispatched";
  if (status === "processing") return "Processing";
  if (status === "confirmed") return "Confirmed";
  return "Updated";
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

function buildCustomerUpdateCopy({ deliveryType, status, courierName, trackingNumber, sellerVendorName }) {
  const normalizedDeliveryType = toLower(deliveryType);
  const normalizedStatus = toLower(status);
  const vendorLabel = toStr(sellerVendorName || "your seller");

  if (normalizedDeliveryType === "collection") {
    if (normalizedStatus === "processing") {
      return {
        statusLabel: "Preparing for collection",
        statusHeadline: "Your order is being prepared for collection",
        statusMessage: `${vendorLabel} is preparing your items for pickup.`,
      };
    }
    if (normalizedStatus === "delivered") {
      return {
        statusLabel: "Collected",
        statusHeadline: "Your collection is complete",
        statusMessage: `Your items from ${vendorLabel} have been handed over to you.`,
      };
    }
    return {
      statusLabel: "Ready for collection",
      statusHeadline: "Your order is ready for collection",
      statusMessage: `${vendorLabel} has marked your items as ready for pickup.`,
    };
  }

  if (normalizedDeliveryType === "direct_delivery") {
    if (normalizedStatus === "processing") {
      return {
        statusLabel: "Preparing for delivery",
        statusHeadline: "Your order is being prepared for delivery",
        statusMessage: `${vendorLabel} is preparing your items for direct delivery.`,
      };
    }
    if (normalizedStatus === "dispatched") {
      return {
        statusLabel: "Out for direct delivery",
        statusHeadline: "Your order is out for delivery",
        statusMessage: `${vendorLabel} is on the way with your order.`,
      };
    }
    return {
      statusLabel: statusLabel(status),
      statusHeadline: "Your order has a delivery update",
      statusMessage: `${vendorLabel} updated the delivery status for your order.`,
    };
  }

  if (normalizedDeliveryType === "shipping") {
    if (normalizedStatus === "processing") {
      return {
        statusLabel: "Preparing for shipment",
        statusHeadline: "Your order is being prepared for shipment",
        statusMessage: `${vendorLabel} is preparing your items for courier dispatch.`,
      };
    }
    if (normalizedStatus === "dispatched") {
      const courierSummary = [courierName ? `Courier: ${courierName}.` : "", trackingNumber ? `Tracking number: ${trackingNumber}.` : ""]
        .filter(Boolean)
        .join(" ");
      return {
        statusLabel: "Shipped with courier",
        statusHeadline: "Your order has been shipped",
        statusMessage: `${vendorLabel} handed your order to the courier.${courierSummary ? ` ${courierSummary}` : ""}`.trim(),
      };
    }
  }

  return {
    statusLabel: statusLabel(status),
    statusHeadline: "Your order has a new update",
    statusMessage: `${vendorLabel} updated the status of your order.`,
  };
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
    const status = toLower(body?.status);
    const trackingNumber = toStr(body?.trackingNumber);
    const courierName = toStr(body?.courierName);
    const notes = toStr(body?.notes);

    if (!orderIdInput && !orderNumberInput) {
      return err(400, "Missing Order", "orderId or orderNumber is required.");
    }
    if (!sellerCode && !sellerSlug) {
      return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");
    }
    if (!["confirmed", "processing", "dispatched", "delivered"].includes(status)) {
      return err(400, "Invalid Status", "status must be confirmed, processing, dispatched, or delivered.");
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
            status,
            updatedAt: now,
            updatedBy: sessionUser.uid,
            trackingNumber: trackingNumber || item?.fulfillment_tracking?.trackingNumber || null,
            courierName: courierName || item?.fulfillment_tracking?.courierName || null,
            notes: notes || item?.fulfillment_tracking?.notes || null,
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

    await orderRef.set(
      {
        items: enrichedItems,
        order: {
          ...(order?.order || {}),
          status: {
            ...(order?.order?.status || {}),
            order: aggregate.orderStatus,
            fulfillment: aggregate.fulfillmentStatus,
          },
        },
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt: now,
        },
      },
      { merge: true },
    );

    const customerEmail = getCustomerEmail(order);
    const customerPhone = getCustomerPhone(order);
    const customerName = getCustomerName(order);
    const origin = new URL(req.url).origin;
    const sellerVendorName = touchedItems[0]?.product_snapshot?.product?.vendorName || touchedItems[0]?.product_snapshot?.seller?.vendorName || "";
    const copy = buildCustomerUpdateCopy({
      deliveryType: sellerDeliveryEntry?.delivery_type || sellerDeliveryEntry?.method || "",
      status,
      courierName: courierName || touchedItems[0]?.fulfillment_tracking?.courierName || "",
      trackingNumber: trackingNumber || touchedItems[0]?.fulfillment_tracking?.trackingNumber || "",
      sellerVendorName,
    });
    if (customerEmail) {
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-seller-fulfillment-update",
          to: customerEmail,
          data: {
            customerName,
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
            statusLabel: copy.statusLabel,
            statusHeadline: copy.statusHeadline,
            statusMessage: copy.statusMessage,
            sellerVendorName,
            itemCount: touchedItems.length,
            items: touchedItems.map((item) => ({
              title: toStr(item?.product_snapshot?.product?.title || item?.product_snapshot?.title || "Product"),
              variant: toStr(item?.selected_variant_snapshot?.label || item?.selected_variant_snapshot?.variant_id || ""),
              quantity: Number(item?.quantity || 0),
              statusLabel: copy.statusLabel,
            })),
          },
        }),
      }).catch(() => null);
    }
    if (customerPhone) {
      await fetch(`${origin}/api/client/v1/notifications/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-seller-fulfillment-update",
          to: customerPhone,
          data: {
            customerName,
            orderNumber: toStr(order?.order?.orderNumber || orderNumberInput || resolvedOrderId),
            vendorName: sellerVendorName || "your seller",
            statusLabel: copy.statusLabel,
            statusMessage: copy.statusMessage,
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
    });
  } catch (e) {
    return err(500, "Update Failed", e?.message || "Unexpected error updating seller order items.");
  }
}
