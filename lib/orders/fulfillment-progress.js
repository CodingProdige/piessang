function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOrderStatus(order) {
  return toLower(order?.lifecycle?.orderStatus || order?.order?.status?.order || "");
}

function getOrderFulfillmentStatus(order) {
  return toLower(order?.lifecycle?.fulfillmentStatus || order?.order?.status?.fulfillment || "");
}

export function getItemQuantity(item) {
  return Math.max(0, toNum(item?.quantity || 0));
}

export function getItemFulfillmentMode(item) {
  const product = item?.product_snapshot || item?.product || {};
  return toLower(product?.fulfillment?.mode) === "bevgo" ? "bevgo" : "seller";
}

function getExplicitItemStatus(item) {
  const candidates = [
    item?.fulfillment_tracking?.status,
    item?.fulfillment?.status,
    item?.status?.fulfillment,
    item?.status,
    item?.selected_variant_snapshot?.fulfillment_tracking?.status,
  ];
  for (const candidate of candidates) {
    const normalized = toLower(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeStatus(rawStatus, order) {
  const status = toLower(rawStatus);
  const orderStatus = getOrderStatus(order);
  const orderFulfillmentStatus = getOrderFulfillmentStatus(order);

  if (status === "cancelled" || orderStatus === "cancelled") return "cancelled";
  if (["delivered", "completed"].includes(status)) return "delivered";
  if (["dispatched", "shipped", "out_for_delivery", "in_transit"].includes(status)) return "dispatched";
  if (["processing", "packed", "picked", "pending_review", "ready_for_dispatch"].includes(status)) return "processing";
  if (["confirmed", "paid", "reserved"].includes(status)) return "confirmed";
  if (["not_started", "payment_pending"].includes(status)) return "not_started";

  if (["delivered", "completed"].includes(orderFulfillmentStatus) || orderStatus === "completed") {
    return "delivered";
  }
  if (["dispatched", "shipped", "out_for_delivery", "in_transit"].includes(orderFulfillmentStatus) || orderStatus === "dispatched") {
    return "dispatched";
  }
  if (["processing", "pending_review", "review_rejected"].includes(orderFulfillmentStatus) || orderStatus === "processing") {
    return "processing";
  }
  if (["confirmed", "paid"].includes(orderStatus)) return "confirmed";
  return "not_started";
}

export function describeFulfillmentStatus(status) {
  switch (toLower(status)) {
    case "delivered":
      return "Delivered";
    case "dispatched":
      return "Dispatched";
    case "processing":
      return "Processing";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Not started";
  }
}

export function getFulfillmentProgressPercent(status) {
  switch (toLower(status)) {
    case "delivered":
      return 100;
    case "dispatched":
      return 75;
    case "processing":
      return 50;
    case "confirmed":
      return 25;
    case "cancelled":
      return 0;
    default:
      return 0;
  }
}

export function enrichOrderItemFulfillment(item, order = null) {
  const mode = getItemFulfillmentMode(item);
  const status = normalizeStatus(getExplicitItemStatus(item), order);
  const quantity = getItemQuantity(item);

  return {
    ...item,
    fulfillment_tracking: {
      ...(item?.fulfillment_tracking || {}),
      mode,
      status,
      label: describeFulfillmentStatus(status),
      quantity,
      delivered: status === "delivered",
      progressPercent: getFulfillmentProgressPercent(status),
      actionOwner: mode === "seller" ? "seller" : "piessang",
    },
  };
}

export function buildOrderDeliveryProgress(order) {
  const items = Array.isArray(order?.items) ? order.items.map((item) => enrichOrderItemFulfillment(item, order)) : [];
  const totals = items.reduce(
    (acc, item) => {
      const quantity = getItemQuantity(item);
      const delivered = item?.fulfillment_tracking?.delivered === true;
      const progressPercent = Math.max(0, Math.min(100, toNum(item?.fulfillment_tracking?.progressPercent)));
      acc.totalLines += 1;
      acc.totalUnits += quantity;
      acc.progressUnits += quantity * progressPercent;
      if (delivered) {
        acc.deliveredLines += 1;
        acc.deliveredUnits += quantity;
      } else {
        acc.pendingLines += 1;
        acc.pendingUnits += quantity;
      }
      return acc;
    },
    {
      totalLines: 0,
      deliveredLines: 0,
      pendingLines: 0,
      totalUnits: 0,
      deliveredUnits: 0,
      pendingUnits: 0,
      progressUnits: 0,
    },
  );

  const percentByUnits = totals.totalUnits > 0 ? Math.round((totals.deliveredUnits / totals.totalUnits) * 100) : 0;
  const percentByLines = totals.totalLines > 0 ? Math.round((totals.deliveredLines / totals.totalLines) * 100) : 0;
  const percentByProgress = totals.totalUnits > 0 ? Math.round(totals.progressUnits / totals.totalUnits) : 0;

  return {
    items,
    progress: {
      ...totals,
      percentageDelivered: percentByUnits,
      linePercentageDelivered: percentByLines,
      percentageProgress: percentByProgress,
      isComplete: totals.totalLines > 0 && totals.pendingLines === 0,
    },
  };
}

export function deriveAggregateOrderStatuses(items, order = null) {
  const enrichedItems = Array.isArray(items) ? items.map((item) => enrichOrderItemFulfillment(item, order)) : [];
  const activeItems = enrichedItems.filter((item) => item?.fulfillment_tracking?.status !== "cancelled");
  const statuses = activeItems.map((item) => toLower(item?.fulfillment_tracking?.status));

  if (!activeItems.length) {
    return {
      orderStatus: enrichedItems.length ? "cancelled" : getOrderStatus(order) || "payment_pending",
      fulfillmentStatus: enrichedItems.length ? "cancelled" : getOrderFulfillmentStatus(order) || "not_started",
    };
  }

  const allDelivered = statuses.every((status) => status === "delivered");
  const anyDispatched = statuses.some((status) => status === "dispatched");
  const anyProcessing = statuses.some((status) => status === "processing");
  const anyConfirmed = statuses.some((status) => status === "confirmed");

  if (allDelivered) {
    return {
      orderStatus: "completed",
      fulfillmentStatus: "delivered",
    };
  }

  if (anyDispatched) {
    return {
      orderStatus: "dispatched",
      fulfillmentStatus: "dispatched",
    };
  }

  if (anyProcessing) {
    return {
      orderStatus: "processing",
      fulfillmentStatus: "processing",
    };
  }

  if (anyConfirmed) {
    return {
      orderStatus: "confirmed",
      fulfillmentStatus: "confirmed",
    };
  }

  return {
    orderStatus: getOrderStatus(order) || "payment_pending",
    fulfillmentStatus: getOrderFulfillmentStatus(order) || "not_started",
  };
}
