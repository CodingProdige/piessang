import { getAdminDb } from "@/lib/firebase/admin";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";
import { buildOrderDeliveryProgress, deriveAggregateOrderStatuses, enrichOrderItemFulfillment } from "@/lib/orders/fulfillment-progress";
import { sendTrackingUpdateNotifications } from "@/lib/orders/tracking-notifications";

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
  return (
    toStr(snapshot?.email) ||
    toStr(snapshot?.account?.email) ||
    toStr(snapshot?.personal?.email) ||
    ""
  );
}

function getCustomerPhone(order) {
  const snapshot = order?.customer_snapshot || {};
  return (
    toStr(snapshot?.phoneNumber) ||
    toStr(snapshot?.account?.phoneNumber) ||
    toStr(snapshot?.account?.mobileNumber) ||
    toStr(snapshot?.personal?.phoneNumber) ||
    toStr(snapshot?.personal?.mobileNumber) ||
    ""
  );
}

function getCustomerName(order) {
  const snapshot = order?.customer_snapshot || {};
  return (
    toStr(snapshot?.account?.accountName) ||
    toStr(snapshot?.business?.companyName) ||
    toStr(snapshot?.personal?.fullName) ||
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

function mapShipmentStatus(shipment = {}, tracking = {}) {
  const deliveryState = toLower(shipment?.delivery_state || tracking?.tracking_status || tracking?.status);
  const pickupState = toLower(shipment?.pickup_state);
  const labelState = toLower(shipment?.label_state);

  if (deliveryState === "delivered") {
    return { status: "delivered", label: "Delivered", progressPercent: 100, notificationStatus: "delivered", active: false };
  }
  if (deliveryState === "out_for_delivery") {
    return { status: "dispatched", label: "Out for delivery", progressPercent: 90, notificationStatus: "out_for_delivery", active: true };
  }
  if (deliveryState === "in_transit" || deliveryState === "tracking_info_received" || deliveryState === "pending_tracking_event") {
    return { status: "dispatched", label: "In transit", progressPercent: 72, notificationStatus: "in_transit", active: true };
  }
  if (pickupState && pickupState !== "none" && pickupState !== "pending") {
    return { status: "dispatched", label: "Pickup scheduled", progressPercent: 50, notificationStatus: "dispatched", active: true };
  }
  if (labelState === "generated" || labelState === "ready") {
    return { status: "processing", label: "Label generated", progressPercent: 35, notificationStatus: "processing", active: true };
  }
  if (labelState === "pending") {
    return { status: "processing", label: "Label pending", progressPercent: 25, notificationStatus: "processing", active: true };
  }
  if (deliveryState === "failed_delivery_attempts" || deliveryState === "attempt_fail") {
    return { status: "dispatched", label: "Delivery attempt failed", progressPercent: 80, notificationStatus: "dispatched", active: true };
  }
  if (deliveryState === "exception") {
    return { status: "dispatched", label: "Delivery exception", progressPercent: 75, notificationStatus: "dispatched", active: true };
  }
  return { status: "processing", label: "Shipment created", progressPercent: 20, notificationStatus: "processing", active: true };
}

async function easyshipFetch(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function firstArray(payload, keys = []) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return Array.isArray(payload) ? payload : [];
}

function firstObject(payload, keys = []) {
  for (const key of keys) {
    if (payload?.[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])) return payload[key];
  }
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

export async function fetchEasyshipShipmentSnapshot(shipmentId) {
  const token = toStr(process.env.EASYSHIP_API_TOKEN);
  const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
  if (!token || !shipmentId) {
    throw new Error("Easyship shipment sync is not configured.");
  }

  const shipmentResponse = await easyshipFetch(
    `${baseUrl}/shipments/${encodeURIComponent(shipmentId)}?format=URL&label=4x6&packing_slip=none`,
    token,
    { method: "GET" },
  );
  if (!shipmentResponse.response.ok) {
    throw new Error(toStr(shipmentResponse.payload?.message || `Could not fetch Easyship shipment ${shipmentId}.`));
  }

  const shipment = firstObject(shipmentResponse.payload, ["shipment", "data"]);
  const trackingUrl = new URL(`${baseUrl}/shipments/trackings`);
  trackingUrl.searchParams.append("easyship_shipment_id", shipmentId);
  trackingUrl.searchParams.set("include_checkpoints", "true");
  const trackingResponse = await easyshipFetch(trackingUrl.toString(), token, { method: "GET" });
  const trackingItems = trackingResponse.response.ok ? firstArray(trackingResponse.payload, ["trackings", "data"]) : [];
  const tracking = trackingItems[0] || {};
  return { shipment, tracking };
}

export async function syncEasyshipShipmentById({ shipmentId, originBase = "", eventName = "" }) {
  const db = getAdminDb();
  if (!db) throw new Error("Firestore admin is not configured.");
  if (!shipmentId) throw new Error("shipmentId is required.");

  const indexRef = db.collection("order_courier_shipments").doc(String(shipmentId));
  const indexSnap = await indexRef.get();
  if (!indexSnap.exists) {
    return { ok: false, skipped: true, reason: "shipment_not_indexed" };
  }

  const index = indexSnap.data() || {};
  const orderId = toStr(index?.orderId);
  const sellerCode = toStr(index?.sellerCode);
  const sellerSlug = toStr(index?.sellerSlug);
  if (!orderId) return { ok: false, skipped: true, reason: "order_missing" };

  const orderRef = db.collection("orders_v2").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return { ok: false, skipped: true, reason: "order_not_found" };
  const order = orderSnap.data() || {};
  const sellerDeliveryEntry = getSellerDeliveryBreakdownEntry(order, sellerCode, sellerSlug);
  if (!sellerDeliveryEntry) return { ok: false, skipped: true, reason: "seller_delivery_not_found" };

  const snapshot = await fetchEasyshipShipmentSnapshot(shipmentId);
  const shipment = snapshot.shipment || {};
  const tracking = snapshot.tracking || {};
  const mapped = mapShipmentStatus(shipment, tracking);

  const trackingNumber = toStr(
    shipment?.tracking_number ||
    tracking?.tracking_number ||
    shipment?.tracking?.tracking_number ||
    "",
  ) || null;
  const trackingUrl = toStr(
    shipment?.tracking_page_url ||
    shipment?.tracking_url ||
    tracking?.tracking_page_url ||
    tracking?.tracking_url ||
    shipment?.tracking?.tracking_page_url ||
    "",
  ) || null;
  const courierName = toStr(
    shipment?.courier_name ||
    shipment?.selected_courier?.name ||
    sellerDeliveryEntry?.courier_carrier ||
    "",
  ) || null;
  const serviceName = toStr(
    shipment?.courier_service_name ||
    shipment?.selected_courier_service?.name ||
    sellerDeliveryEntry?.courier_service ||
    "",
  ) || null;
  const labelUrl = toStr(
    shipment?.label_url ||
    shipment?.label?.url ||
    shipment?.shipping_label?.url ||
    "",
  ) || null;

  const sourceItems = Array.isArray(order?.items) ? order.items : [];
  const touchedItems = [];
  const nextItems = sourceItems.map((item) => {
    const sellerIdentity = getLineSellerIdentity(item);
    const matchesSeller =
      (sellerCode && toLower(sellerIdentity.sellerCode) === toLower(sellerCode)) ||
      (sellerSlug && toLower(sellerIdentity.sellerSlug) === toLower(sellerSlug));
    if (!matchesSeller) return enrichOrderItemFulfillment(item, order);

    const previousStatus = toLower(item?.fulfillment_tracking?.status || "");
    const nextItem = enrichOrderItemFulfillment(
      {
        ...item,
        fulfillment_tracking: {
          ...(item?.fulfillment_tracking || {}),
          status: mapped.status,
          label: mapped.label,
          progressPercent: mapped.progressPercent,
          updatedAt: new Date().toISOString(),
          actionOwner: "platform",
          trackingNumber,
          courierName,
          trackingUrl,
          labelUrl,
          shipmentId,
          shipmentStatus: toStr(shipment?.delivery_state || shipment?.label_state || shipment?.pickup_state || ""),
          checkpoints: Array.isArray(tracking?.checkpoints) ? tracking.checkpoints : [],
        },
      },
      order,
    );
    touchedItems.push({ previousStatus, nextItem });
    return nextItem;
  });

  const aggregate = deriveAggregateOrderStatuses(nextItems, order);
  const { items: enrichedItems } = buildOrderDeliveryProgress({ ...order, items: nextItems });

  const breakdownPatch = {
    easyship_shipment_id: shipmentId,
    shipment_id: shipmentId,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    label_url: labelUrl,
    shipment_status: toStr(shipment?.delivery_state || shipment?.label_state || shipment?.pickup_state || ""),
    shipment_metadata: {
      courierName,
      serviceName,
      tracking,
      shipment,
    },
    courier_carrier: courierName || sellerDeliveryEntry?.courier_carrier || "",
    courier_service: serviceName || sellerDeliveryEntry?.courier_service || "",
  };

  const nextPricingBreakdown = updateSellerBreakdownEntries(order?.pricing_snapshot?.sellerDeliveryBreakdown || [], sellerCode, sellerSlug, breakdownPatch);
  const nextDeliveryBreakdown = updateSellerBreakdownEntries(order?.delivery?.fee?.seller_breakdown || [], sellerCode, sellerSlug, breakdownPatch);
  const nextDeliverySnapshotBreakdown = updateSellerBreakdownEntries(order?.delivery_snapshot?.sellerDeliveryBreakdown || [], sellerCode, sellerSlug, breakdownPatch);

  const previousAggregateStatus = toLower(touchedItems[0]?.previousStatus || "");
  const meaningfulStatusChanged = previousAggregateStatus !== toLower(mapped.status);
  let nextTimelineEvents = order?.timeline?.events || [];
  if (meaningfulStatusChanged) {
    nextTimelineEvents = appendOrderTimelineEvent(
      { timeline: { events: nextTimelineEvents } },
      createOrderTimelineEvent({
        type: "platform_courier_tracking_update",
        title: mapped.label || "Courier tracking updated",
        message: [courierName ? `Courier: ${courierName}.` : "", trackingNumber ? `Tracking number: ${trackingNumber}.` : ""].filter(Boolean).join(" "),
        actorType: "system",
        actorId: "piessang",
        actorLabel: "Piessang",
        createdAt: new Date().toISOString(),
        status: mapped.status,
        sellerCode: sellerCode || null,
        sellerSlug: sellerSlug || null,
        metadata: {
          shipmentId,
          eventName: eventName || null,
        },
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
      },
      lifecycle: {
        ...(order?.lifecycle || {}),
        orderStatus: aggregate.orderStatus,
        fulfillmentStatus: aggregate.fulfillmentStatus,
        updatedAt: new Date().toISOString(),
      },
      timeline: {
        ...(order?.timeline || {}),
        events: nextTimelineEvents,
        updatedAt: new Date().toISOString(),
      },
      timestamps: {
        ...(order?.timestamps || {}),
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true },
  );

  await indexRef.set(
    {
      shipmentId,
      orderId,
      sellerCode: sellerCode || null,
      sellerSlug: sellerSlug || null,
      trackingNumber: trackingNumber || null,
      trackingUrl: trackingUrl || null,
      shipmentStatus: toStr(shipment?.delivery_state || shipment?.label_state || shipment?.pickup_state || ""),
      active: mapped.active !== false,
      lastSyncedAt: new Date().toISOString(),
      lastEventName: eventName || null,
    },
    { merge: true },
  );

  if (meaningfulStatusChanged && originBase) {
    const sellerVendorName =
      touchedItems[0]?.nextItem?.product_snapshot?.product?.vendorName ||
      touchedItems[0]?.nextItem?.product_snapshot?.seller?.vendorName ||
      "";
    await sendTrackingUpdateNotifications({
      origin: originBase,
      customerEmail: getCustomerEmail(order),
      customerPhone: getCustomerPhone(order),
      customerName: getCustomerName(order),
      orderNumber: toStr(order?.order?.orderNumber || orderId),
      deliveryType: sellerDeliveryEntry?.delivery_type || sellerDeliveryEntry?.method || "",
      status: mapped.notificationStatus || mapped.status,
      courierName: courierName || "",
      trackingNumber: trackingNumber || "",
      sellerVendorName,
      itemCount: touchedItems.length,
      items: touchedItems.map(({ nextItem }) => ({
        title: toStr(nextItem?.product_snapshot?.product?.title || nextItem?.product_snapshot?.title || "Product"),
        variant: toStr(nextItem?.selected_variant_snapshot?.label || nextItem?.selected_variant_snapshot?.variant_id || ""),
        quantity: Number(nextItem?.quantity || 0),
        statusLabel: mapped.label || mapped.status,
      })),
    }).catch(() => null);
  }

  return {
    ok: true,
    shipmentId,
    orderId,
    sellerCode,
    sellerSlug,
    status: mapped.status,
    label: mapped.label,
    trackingNumber,
  };
}
