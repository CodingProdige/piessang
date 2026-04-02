function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

export const SELLER_FULFILLMENT_STATUS_SEQUENCE = ["processing", "dispatched", "delivered"];

export function normalizeSellerFulfillmentStatus(value) {
  const normalized = toLower(value);
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (["delivered", "completed"].includes(normalized)) return "delivered";
  if (["dispatched", "shipped", "out_for_delivery", "in_transit"].includes(normalized)) return "dispatched";
  if (["processing", "packed", "picked", "ready_for_dispatch", "pending_review"].includes(normalized)) return "processing";
  if (["confirmed", "payment_pending", "not_started", "paid", "reserved"].includes(normalized)) return "confirmed";
  return normalized || "confirmed";
}

export function getSellerFulfillmentStatusLabel(status) {
  const normalized = normalizeSellerFulfillmentStatus(status);
  if (normalized === "delivered") return "Delivered";
  if (normalized === "dispatched") return "Dispatched";
  if (normalized === "processing") return "Processing";
  if (normalized === "cancelled") return "Cancelled";
  return "Confirmed";
}

export function getSellerFulfillmentActions({ currentStatus, deliveryType, isComplete } = {}) {
  const current = normalizeSellerFulfillmentStatus(currentStatus);
  const method = toLower(deliveryType);

  if (isComplete || current === "delivered" || current === "cancelled") return [];
  if (current === "dispatched") return ["delivered"];
  if (current === "processing") {
    return method === "shipping" ? ["dispatched", "cancelled"] : ["delivered", "cancelled"];
  }
  return ["processing", "cancelled"];
}

export function canTransitionSellerFulfillment({ currentStatus, nextStatus, deliveryType, isComplete } = {}) {
  const next = normalizeSellerFulfillmentStatus(nextStatus);
  return getSellerFulfillmentActions({ currentStatus, deliveryType, isComplete }).includes(next);
}

export function requiresCancellationReason(status) {
  return normalizeSellerFulfillmentStatus(status) === "cancelled";
}

export function mapSellerFulfillmentToAggregate(nextStatus) {
  const normalized = normalizeSellerFulfillmentStatus(nextStatus);
  if (normalized === "cancelled") {
    return {
      orderStatus: "cancelled",
      fulfillmentStatus: "cancelled",
    };
  }
  if (normalized === "delivered") {
    return {
      orderStatus: "completed",
      fulfillmentStatus: "delivered",
    };
  }
  if (normalized === "dispatched") {
    return {
      orderStatus: "dispatched",
      fulfillmentStatus: "dispatched",
    };
  }
  if (normalized === "processing") {
    return {
      orderStatus: "processing",
      fulfillmentStatus: "processing",
    };
  }
  return {
    orderStatus: "confirmed",
    fulfillmentStatus: "confirmed",
  };
}

export function canTransitionOrderLifecycle({ currentStatus, nextStatus } = {}) {
  const current = toLower(currentStatus);
  const next = toLower(nextStatus);
  const ranks = {
    payment_pending: 0,
    confirmed: 1,
    processing: 2,
    dispatched: 3,
    completed: 4,
  };

  if (!next) return false;
  if (current === next) return true;
  if (current === "cancelled" || current === "completed") return false;
  if (next === "cancelled") return current !== "completed";
  if (!(next in ranks)) return false;
  if (!(current in ranks)) return true;
  return ranks[next] >= ranks[current];
}
