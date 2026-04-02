function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

export function createOrderTimelineEvent({
  type = "",
  title = "",
  message = "",
  actorType = "system",
  actorId = "",
  actorLabel = "",
  createdAt = "",
  status = "",
  sellerCode = "",
  sellerSlug = "",
  metadata = {},
} = {}) {
  const timestamp = toStr(createdAt) || new Date().toISOString();
  return {
    id: `${toLower(type) || "event"}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    type: toLower(type) || "event",
    title: toStr(title) || "Order updated",
    message: toStr(message),
    actorType: toLower(actorType) || "system",
    actorId: toStr(actorId) || null,
    actorLabel: toStr(actorLabel) || null,
    createdAt: timestamp,
    status: toLower(status) || null,
    sellerCode: toStr(sellerCode) || null,
    sellerSlug: toStr(sellerSlug) || null,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
}

export function appendOrderTimelineEvent(order, event) {
  const existing = Array.isArray(order?.timeline?.events) ? order.timeline.events : [];
  return [...existing, event].sort((left, right) => toStr(right?.createdAt).localeCompare(toStr(left?.createdAt)));
}

export function getOrderTimelineEvents(order) {
  const stored = Array.isArray(order?.timeline?.events) ? order.timeline.events : [];
  return stored
    .filter((entry) => entry && typeof entry === "object")
    .sort((left, right) => toStr(right?.createdAt).localeCompare(toStr(left?.createdAt)));
}

