import { normalizeSellerFulfillmentStatus } from "@/lib/orders/status-lifecycle";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value: unknown, fallback = "") {
  return toStr(value, fallback).toLowerCase();
}

function getOrderStatus(order: any = {}) {
  return toLower(order?.lifecycle?.orderStatus || order?.order?.status?.order, "confirmed");
}

function getPaymentStatus(order: any = {}) {
  return toLower(order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment);
}

function getFulfillmentStatuses(order: any = {}) {
  const items: any[] = Array.isArray(order?.items) ? order.items : [];
  return items
    .map((item: any) => normalizeSellerFulfillmentStatus(item?.fulfillment_tracking?.status))
    .filter(Boolean);
}

function summarizeFulfillment(statuses: string[]) {
  return {
    hasCancelledOnly: Boolean(statuses.length) && statuses.every((status) => status === "cancelled"),
    hasDelivered: statuses.includes("delivered"),
    hasDispatched: statuses.includes("dispatched"),
    hasProcessing: statuses.includes("processing"),
  };
}

export function getOrderCancellationState(order: any = {}) {
  const orderStatus = getOrderStatus(order);
  const paymentStatus = getPaymentStatus(order);
  const requestStatus = toLower(order?.cancellation?.status || order?.lifecycle?.cancellationStatus);
  const statuses = getFulfillmentStatuses(order);
  const summary = summarizeFulfillment(statuses);
  const paymentProvider = toLower(order?.payment?.provider);

  if (requestStatus === "requested") {
    return {
      canSubmit: false,
      mode: null,
      status: "requested",
      title: "Cancellation requested",
      buttonLabel: "",
      message: "We’ve received your cancellation request and are reviewing it before we stop fulfilment.",
      blockingReason: "requested",
    };
  }

  if (requestStatus === "approved") {
    return {
      canSubmit: false,
      mode: null,
      status: "approved",
      title: "Cancellation approved",
      buttonLabel: "",
      message: "Your cancellation request has been approved and the order is being closed out.",
      blockingReason: "approved",
    };
  }

  if (requestStatus === "rejected") {
    return {
      canSubmit: false,
      mode: null,
      status: "rejected",
      title: "Cancellation declined",
      buttonLabel: "",
      message: "This order can no longer be cancelled from your account. Contact support if you still need help.",
      blockingReason: "rejected",
    };
  }

  if (orderStatus === "cancelled") {
    return {
      canSubmit: false,
      mode: null,
      status: "cancelled",
      title: "Order cancelled",
      buttonLabel: "",
      message: "This order has already been cancelled.",
      blockingReason: "cancelled",
    };
  }

  if (orderStatus === "completed" || summary.hasDelivered) {
    return {
      canSubmit: false,
      mode: null,
      status: null,
      title: "Return required",
      buttonLabel: "",
      message: "Delivered orders can no longer be cancelled. Use the returns flow if something went wrong.",
      blockingReason: "delivered",
    };
  }

  if (orderStatus === "dispatched" || summary.hasDispatched) {
    return {
      canSubmit: false,
      mode: null,
      status: null,
      title: "Already dispatched",
      buttonLabel: "",
      message: "This order is already out for delivery, so it can’t be cancelled from your account anymore.",
      blockingReason: "dispatched",
    };
  }

  if (paymentStatus === "refunded" || paymentStatus === "partial_refund") {
    return {
      canSubmit: false,
      mode: null,
      status: paymentStatus,
      title: "Refund already in progress",
      buttonLabel: "",
      message: "A refund has already been processed on this order, so cancellation is no longer available.",
      blockingReason: "refunded",
    };
  }

  const unpaidLike = !paymentStatus || ["pending", "payment_pending", "unpaid", "authorized"].includes(paymentStatus);
  if (
    unpaidLike &&
    !summary.hasProcessing &&
    !summary.hasDispatched &&
    !summary.hasDelivered &&
    ["payment_pending", "confirmed", ""].includes(orderStatus)
  ) {
    return {
      canSubmit: true,
      mode: "cancel",
      status: null,
      title: "Cancel order",
      buttonLabel: "Cancel order",
      message: "This order has not started processing yet, so it can be cancelled instantly.",
      blockingReason: null,
    };
  }

  if (
    paymentStatus === "paid" &&
    paymentProvider === "stripe" &&
    !summary.hasProcessing &&
    !summary.hasDispatched &&
    !summary.hasDelivered &&
    ["payment_pending", "confirmed", ""].includes(orderStatus)
  ) {
    return {
      canSubmit: true,
      mode: "cancel",
      status: null,
      title: "Cancel order",
      buttonLabel: "Cancel order",
      message: "This order has not started processing yet, so it can be cancelled instantly and refunded automatically.",
      blockingReason: null,
    };
  }

  if (!summary.hasDispatched && !summary.hasDelivered && ["confirmed", "processing", "payment_pending"].includes(orderStatus)) {
    return {
      canSubmit: true,
      mode: "request",
      status: null,
      title: "Request cancellation",
      buttonLabel: "Request cancellation",
      message: "We’ll review your request before stopping fulfilment and, where needed, starting the refund process.",
      blockingReason: null,
    };
  }

  return {
    canSubmit: false,
    mode: null,
    status: null,
    title: "Cancellation unavailable",
    buttonLabel: "",
    message: "This order can no longer be cancelled from your account.",
    blockingReason: "unavailable",
  };
}
