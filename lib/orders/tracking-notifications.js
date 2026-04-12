function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function buildTrackingUpdateCopy({
  deliveryType = "",
  status = "",
  courierName = "",
  trackingNumber = "",
  sellerVendorName = "",
  cancellationReason = "",
} = {}) {
  const normalizedDeliveryType = toStr(deliveryType).toLowerCase();
  const normalizedStatus = toStr(status).toLowerCase();
  const vendorLabel = toStr(sellerVendorName || "your seller");

  if (normalizedStatus === "cancelled") {
    const reasonText = toStr(cancellationReason);
    return {
      statusLabel: "Cancelled",
      statusHeadline: "Your order has been cancelled",
      statusMessage: `${vendorLabel} cancelled this order${reasonText ? ` for the following reason: ${reasonText}` : "."}`,
    };
  }

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
      statusLabel: normalizedStatus || "Updated",
      statusHeadline: "Your order has a delivery update",
      statusMessage: `${vendorLabel} updated the delivery status for your order.`,
    };
  }

  if (normalizedDeliveryType === "shipping" || normalizedDeliveryType === "courier_live_rate" || normalizedDeliveryType === "platform_courier_live_rate") {
    if (normalizedStatus === "processing") {
      return {
        statusLabel: "Preparing for shipment",
        statusHeadline: "Your order is being prepared for shipment",
        statusMessage: `${vendorLabel} is preparing your items for courier dispatch.`,
      };
    }
    if (normalizedStatus === "dispatched" || normalizedStatus === "in_transit") {
      const courierSummary = [courierName ? `Courier: ${courierName}.` : "", trackingNumber ? `Tracking number: ${trackingNumber}.` : ""]
        .filter(Boolean)
        .join(" ");
      return {
        statusLabel: normalizedStatus === "in_transit" ? "In transit" : "Shipped with courier",
        statusHeadline: normalizedStatus === "in_transit" ? "Your order is in transit" : "Your order has been shipped",
        statusMessage: `${vendorLabel} handed your order to the courier.${courierSummary ? ` ${courierSummary}` : ""}`.trim(),
      };
    }
    if (normalizedStatus === "out_for_delivery") {
      return {
        statusLabel: "Out for delivery",
        statusHeadline: "Your order is out for delivery",
        statusMessage: `${vendorLabel} and the courier marked your order as out for delivery.`,
      };
    }
    if (normalizedStatus === "delivered") {
      return {
        statusLabel: "Delivered",
        statusHeadline: "Your order has been delivered",
        statusMessage: `${vendorLabel} confirmed that your order was delivered.`,
      };
    }
  }

  return {
    statusLabel: normalizedStatus || "Updated",
    statusHeadline: "Your order has a new update",
    statusMessage: `${vendorLabel} updated the status of your order.`,
  };
}

export async function sendTrackingUpdateNotifications({
  origin,
  customerEmail = "",
  customerPhone = "",
  customerName = "",
  orderNumber = "",
  sellerVendorName = "",
  deliveryType = "",
  status = "",
  courierName = "",
  trackingNumber = "",
  cancellationReason = "",
  itemCount = 0,
  items = [],
} = {}) {
  const copy = buildTrackingUpdateCopy({
    deliveryType,
    status,
    courierName,
    trackingNumber,
    sellerVendorName,
    cancellationReason,
  });

  const jobs = [];
  if (customerEmail) {
    jobs.push(
      fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-seller-fulfillment-update",
          to: customerEmail,
          data: {
            customerName,
            orderNumber,
            statusLabel: copy.statusLabel,
            statusHeadline: copy.statusHeadline,
            statusMessage: copy.statusMessage,
            cancellationReason,
            sellerVendorName,
            itemCount,
            items,
          },
        }),
      }).catch(() => null),
    );
  }
  if (customerPhone) {
    jobs.push(
      fetch(`${origin}/api/client/v1/notifications/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-seller-fulfillment-update",
          to: customerPhone,
          data: {
            customerName,
            orderNumber,
            vendorName: sellerVendorName || "your seller",
            statusLabel: copy.statusLabel,
            statusMessage: copy.statusMessage,
            cancellationReason,
          },
        }),
      }).catch(() => null),
    );
  }

  await Promise.all(jobs);
  return copy;
}
