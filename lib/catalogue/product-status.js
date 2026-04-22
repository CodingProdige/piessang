function toStatusText(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeStatusText(value) {
  return toStatusText(value).replace(/\s+/g, " ").trim();
}

function statusValuesDiffer(left, right) {
  return normalizeStatusText(left) !== normalizeStatusText(right);
}

function statusImageCount(data) {
  return Array.isArray(data?.media?.images) ? data.media.images.filter((entry) => Boolean(entry?.imageUrl)).length : 0;
}

function statusVariantCount(data) {
  return Array.isArray(data?.variants) ? data.variants.length : 0;
}

function summarizeStatusVariantLabels(data) {
  if (!Array.isArray(data?.variants)) return "";
  return data.variants
    .map((variant) => toStatusText(variant?.label || variant?.variant_id || ""))
    .filter(Boolean)
    .join(", ");
}

export function hasMeaningfulProductPendingDiff(product) {
  const live = product?.live_snapshot || null;
  if (!live) return false;

  const pending = product || {};
  const rows = [
    [toStatusText(live?.product?.title, "Not set"), toStatusText(pending?.product?.title, "Not set")],
    [toStatusText(live?.product?.brandTitle || "", "Not set"), toStatusText(pending?.product?.brandTitle || "", "Not set")],
    [toStatusText(live?.product?.vendorName || "", "Not set"), toStatusText(pending?.product?.vendorName || "", "Not set")],
    [toStatusText(live?.grouping?.category || "", "Not set"), toStatusText(pending?.grouping?.category || "", "Not set")],
    [toStatusText(live?.grouping?.subCategory || "", "Not set"), toStatusText(pending?.grouping?.subCategory || "", "Not set")],
    [toStatusText(live?.fulfillment?.mode || "", "Not set"), toStatusText(pending?.fulfillment?.mode || "", "Not set")],
    [String(statusImageCount(live)), String(statusImageCount(pending))],
    [
      `${statusVariantCount(live)}${summarizeStatusVariantLabels(live) ? ` • ${summarizeStatusVariantLabels(live)}` : ""}`,
      `${statusVariantCount(pending)}${summarizeStatusVariantLabels(pending) ? ` • ${summarizeStatusVariantLabels(pending)}` : ""}`,
    ],
    [toStatusText(live?.product?.overview || "", "Not set"), toStatusText(pending?.product?.overview || "", "Not set")],
    [toStatusText(live?.product?.description || "", "Not set"), toStatusText(pending?.product?.description || "", "Not set")],
  ];

  return rows.some(([left, right]) => statusValuesDiffer(left, right));
}

export function buildProductStatus(product) {
  const stored = toStatusText(product?.moderation?.status, "draft").toLowerCase() || "draft";
  const hasLiveSnapshot = Boolean(product?.live_snapshot && typeof product.live_snapshot === "object");
  const hasMeaningfulPendingUpdate = hasLiveSnapshot && hasMeaningfulProductPendingDiff(product);
  const isStalePendingState = hasLiveSnapshot && !hasMeaningfulPendingUpdate;
  const isActive = product?.placement?.isActive !== false;
  const isFreshSubmissionInReview = stored === "in_review" && !hasLiveSnapshot;

  let current = stored;
  if ((stored === "in_review" || stored === "pending") && isStalePendingState) {
    current = isActive ? "published" : "draft";
  } else if (stored === "published" && !isActive) {
    current = "draft";
  } else if (!stored) {
    current = isActive ? "published" : "draft";
  }

  const reviewQueueStatus =
    stored === "in_review" && (isFreshSubmissionInReview || hasMeaningfulPendingUpdate)
      ? "in_review"
      : "none";
  const pendingUpdateStatus = hasMeaningfulPendingUpdate
    ? stored === "rejected"
      ? "rejected"
      : stored === "in_review" || stored === "pending"
        ? "in_review"
        : "pending"
    : "none";

  return {
    stored,
    current,
    isActive,
    hasLiveSnapshot,
    hasMeaningfulPendingUpdate,
    hasPendingLiveUpdate: hasLiveSnapshot && hasMeaningfulPendingUpdate,
    isStalePendingState,
    reviewQueueStatus,
    pendingUpdateStatus,
  };
}
