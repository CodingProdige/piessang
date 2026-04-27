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

function normalizeLegacyShippingEntry(entry = {}) {
  const destination = entry?.destination && typeof entry.destination === "object" ? entry.destination : {};
  const estimatedDeliveryDays =
    entry?.estimated_delivery_days && typeof entry.estimated_delivery_days === "object"
      ? entry.estimated_delivery_days
      : entry?.estimatedDeliveryDays && typeof entry.estimatedDeliveryDays === "object"
        ? entry.estimatedDeliveryDays
        : {};
  const finalShippingFee = toNum(
    entry?.final_shipping_fee ??
      entry?.amount_incl ??
      entry?.amountIncl ??
      entry?.sellerAmountIncl ??
      0,
  );
  return {
    sellerCode: toStr(entry?.sellerCode || entry?.seller_code || entry?.seller_key || ""),
    sellerSlug: toStr(entry?.sellerSlug || entry?.seller_slug || ""),
    sellerId: toStr(entry?.sellerId || ""),
    sellerName: toStr(entry?.seller_name || entry?.vendorName || entry?.label || "Seller shipping"),
    matchedSource: "shipping_zone",
    matchedRuleId: toStr(entry?.zoneId || ""),
    matchedRuleName: toStr(entry?.matched_rule_label || entry?.zoneName || entry?.label || "Shipping"),
    matchType: toStr(entry?.coverageMatchType || entry?.matchType || "country"),
    pricingMode: toStr(entry?.pricingMode || ""),
    batchingMode: toStr(entry?.batchingMode || ""),
    baseShippingFee: toNum(entry?.base_shipping_fee ?? finalShippingFee),
    platformShippingMarkup: toNum(entry?.platform_shipping_markup ?? entry?.platformShippingMarkup ?? entry?.platform_shipping_margin ?? 0),
    finalShippingFee,
    estimatedDeliveryDays: {
      min: toNum(estimatedDeliveryDays?.min),
      max: toNum(estimatedDeliveryDays?.max),
    },
    destination: {
      countryCode: toStr(destination?.countryCode || destination?.country || ""),
      country: toStr(destination?.country || ""),
      province: toStr(destination?.province || destination?.stateProvinceRegion || ""),
      city: toStr(destination?.city || ""),
      postalCode: toStr(destination?.postalCode || ""),
    },
    items: Array.isArray(entry?.items) ? entry.items : [],
    status: toStr(entry?.status || "pending"),
    tracking: entry?.tracking && typeof entry.tracking === "object"
      ? {
          courierName: toStr(entry.tracking?.courierName),
          trackingNumber: toStr(entry.tracking?.trackingNumber),
          trackingUrl: toStr(entry.tracking?.trackingUrl),
          notes: toStr(entry.tracking?.notes),
          updatedAt: toStr(entry.tracking?.updatedAt),
        }
      : null,
    legacy: true,
  };
}

function getLegacySellerBreakdown(order = {}) {
  const snapshot = order?.delivery_snapshot && typeof order.delivery_snapshot === "object" ? order.delivery_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const pricingSnapshot = order?.pricing_snapshot && typeof order.pricing_snapshot === "object" ? order.pricing_snapshot : {};
  if (Array.isArray(order?.shippingBreakdown) && order.shippingBreakdown.length) return [];
  if (Array.isArray(pricingSnapshot?.sellerDeliveryBreakdown)) return pricingSnapshot.sellerDeliveryBreakdown;
  if (Array.isArray(snapshot?.sellerDeliveryBreakdown)) return snapshot.sellerDeliveryBreakdown;
  if (Array.isArray(delivery?.fee?.seller_breakdown)) return delivery.fee.seller_breakdown;
  return [];
}

export function getOrderShippingAddress(order = {}) {
  const shippingEntry = Array.isArray(order?.shippingBreakdown) ? order.shippingBreakdown[0] : null;
  const shippingDestination =
    shippingEntry?.destination && typeof shippingEntry.destination === "object" ? shippingEntry.destination : null;
  const snapshotAddress =
    order?.delivery_snapshot?.address && typeof order.delivery_snapshot.address === "object"
      ? order.delivery_snapshot.address
      : order?.delivery?.address_snapshot && typeof order.delivery.address_snapshot === "object"
        ? order.delivery.address_snapshot
        : order?.delivery_address && typeof order.delivery_address === "object"
          ? order.delivery_address
          : {};
  return {
    recipientName: toStr(snapshotAddress?.recipientName || ""),
    streetAddress: toStr(snapshotAddress?.streetAddress || ""),
    addressLine2: toStr(snapshotAddress?.addressLine2 || ""),
    suburb: toStr(snapshotAddress?.suburb || ""),
    city: toStr(shippingDestination?.city || snapshotAddress?.city || ""),
    province: toStr(
      shippingDestination?.province ||
        snapshotAddress?.province ||
        snapshotAddress?.stateProvinceRegion ||
        "",
    ),
    postalCode: toStr(shippingDestination?.postalCode || snapshotAddress?.postalCode || ""),
    country: toStr(
      shippingDestination?.country ||
        shippingDestination?.countryCode ||
        snapshotAddress?.country ||
        "",
    ),
    phoneNumber: toStr(snapshotAddress?.phoneNumber || ""),
  };
}

export function getSellerShippingEntry(order = {}, sellerCode = "", sellerSlug = "") {
  const codeNeedle = toLower(sellerCode);
  const slugNeedle = toLower(sellerSlug);
  const activeBreakdown = Array.isArray(order?.shippingBreakdown) ? order.shippingBreakdown : [];
  const activeMatch = activeBreakdown.find((entry) => {
    const entryCode = toLower(entry?.sellerCode || entry?.seller_code || entry?.seller_key || "");
    const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
    const entryId = toLower(entry?.sellerId || "");
    return Boolean((codeNeedle && (entryCode === codeNeedle || entryId === codeNeedle)) || (slugNeedle && entrySlug === slugNeedle));
  });
  if (activeMatch) {
    const estimated = activeMatch?.estimatedDeliveryDays && typeof activeMatch.estimatedDeliveryDays === "object" ? activeMatch.estimatedDeliveryDays : {};
    const destination = activeMatch?.destination && typeof activeMatch.destination === "object" ? activeMatch.destination : {};
    return {
      sellerCode: toStr(activeMatch?.sellerCode || activeMatch?.seller_key || ""),
      sellerSlug: toStr(activeMatch?.sellerSlug || ""),
      sellerId: toStr(activeMatch?.sellerId || ""),
      sellerName: toStr(activeMatch?.seller_name || "Seller shipping"),
      matchedSource: toStr(activeMatch?.matchedSource || "shipping_zone"),
      matchedRuleId: toStr(activeMatch?.matchedRuleId || ""),
      matchedRuleName: toStr(activeMatch?.matchedRuleName || "Shipping"),
      matchType: toStr(activeMatch?.matchType || "country"),
      pricingMode: toStr(activeMatch?.pricingMode || ""),
      batchingMode: toStr(activeMatch?.batchingMode || ""),
      baseShippingFee: toNum(activeMatch?.baseShippingFee),
      platformShippingMarkup: toNum(activeMatch?.platformShippingMarkup ?? activeMatch?.platformShippingMargin ?? 0),
      finalShippingFee: toNum(activeMatch?.finalShippingFee),
      estimatedDeliveryDays: {
        min: toNum(estimated?.min),
        max: toNum(estimated?.max),
      },
      destination: {
        countryCode: toStr(destination?.countryCode || ""),
        country: toStr(destination?.country || destination?.countryCode || ""),
        province: toStr(destination?.province || ""),
        city: toStr(destination?.city || ""),
        postalCode: toStr(destination?.postalCode || ""),
      },
      items: Array.isArray(activeMatch?.items) ? activeMatch.items : [],
      status: toStr(activeMatch?.status || "pending"),
      tracking:
        activeMatch?.tracking && typeof activeMatch.tracking === "object"
          ? {
              courierName: toStr(activeMatch.tracking?.courierName),
              trackingNumber: toStr(activeMatch.tracking?.trackingNumber),
              trackingUrl: toStr(activeMatch.tracking?.trackingUrl),
              notes: toStr(activeMatch.tracking?.notes),
              updatedAt: toStr(activeMatch.tracking?.updatedAt),
            }
          : null,
      legacy: false,
    };
  }

  const legacyEntry = getLegacySellerBreakdown(order).find((entry) => {
    const entryCode = toLower(entry?.sellerCode || entry?.seller_code || entry?.seller_key || "");
    const entrySlug = toLower(entry?.sellerSlug || entry?.seller_slug || "");
    return Boolean((codeNeedle && entryCode === codeNeedle) || (slugNeedle && entrySlug === slugNeedle));
  });
  return legacyEntry ? normalizeLegacyShippingEntry(legacyEntry) : null;
}

export function formatShippingDestinationLabel(destination = {}) {
  return [
    toStr(destination?.city),
    toStr(destination?.province),
    toStr(destination?.postalCode),
    toStr(destination?.country),
  ]
    .filter(Boolean)
    .join(", ");
}

export function getShippingStatusLabel(value = "") {
  const normalized = toLower(value);
  if (!normalized) return "Pending";
  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
