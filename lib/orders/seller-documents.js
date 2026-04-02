function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function r2(value) {
  return Number(toNum(value).toFixed(2));
}

function formatMoney(value) {
  return `R ${r2(value).toFixed(2)}`;
}

function formatDate(value) {
  const input = toStr(value);
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: toStr(product?.product?.sellerCode || product?.seller?.sellerCode || ""),
    sellerSlug: toStr(product?.product?.sellerSlug || product?.seller?.sellerSlug || ""),
    vendorName: toStr(product?.product?.vendorName || product?.seller?.vendorName || ""),
  };
}

function getItemQuantity(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getItemTitle(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(product?.product?.title || product?.title || variant?.label || "Product");
}

function getItemVariant(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.label || variant?.variant_id || "");
}

function getItemSku(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.sku || variant?.variant_sku || variant?.variant_id || "");
}

function getItemLineTotal(item) {
  const lineTotals = item?.line_totals || {};
  return r2(lineTotals?.final_incl ?? lineTotals?.total_incl ?? 0);
}

function collectTrackingDetails(items = []) {
  const trackingRows = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const tracking = item?.fulfillment_tracking || {};
    const status = toStr(tracking?.status || tracking?.label || "");
    const courierName = toStr(tracking?.courierName || tracking?.courier || "");
    const trackingNumber = toStr(tracking?.trackingNumber || tracking?.tracking_number || "");
    const notes = toStr(tracking?.notes || "");
    const key = `${courierName}::${trackingNumber}::${status}::${notes}`;
    if (!courierName && !trackingNumber && !notes && !status) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    trackingRows.push({
      courierName,
      trackingNumber,
      notes,
      status,
    });
  }
  return trackingRows;
}

function humanizeDeliveryType(value) {
  const normalized = toStr(value).toLowerCase();
  if (normalized === "collection") return "Customer collection";
  if (normalized === "direct_delivery") return "Direct delivery";
  if (normalized === "shipping") return "Shipping";
  return normalized ? normalized.replace(/_/g, " ") : "";
}

function getSellerBreakdownEntry(order, sellerCode, sellerSlug) {
  const snapshot = order?.delivery_snapshot && typeof order.delivery_snapshot === "object" ? order.delivery_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const breakdown = Array.isArray(snapshot?.sellerDeliveryBreakdown)
    ? snapshot.sellerDeliveryBreakdown
    : Array.isArray(delivery?.fee?.seller_breakdown)
      ? delivery.fee.seller_breakdown
      : [];
  const normalizedCode = toStr(sellerCode).toLowerCase();
  const normalizedSlug = toStr(sellerSlug).toLowerCase();
  return (
    breakdown.find((entry) => {
      const entryCode = toStr(entry?.sellerCode || entry?.seller_code || entry?.seller_key).toLowerCase();
      const entrySlug = toStr(entry?.sellerSlug || entry?.seller_slug).toLowerCase();
      return Boolean(
        (normalizedCode && entryCode === normalizedCode) ||
        (normalizedSlug && entrySlug === normalizedSlug),
      );
    }) || null
  );
}

export function buildSellerDocumentPayload(order, { sellerCode = "", sellerSlug = "", assetBaseUrl = "" } = {}) {
  const sourceItems = Array.isArray(order?.items) ? order.items : [];
  const items = sourceItems.filter((item) => {
    const identity = getLineSellerIdentity(item);
    return Boolean(
      (sellerCode && toStr(identity.sellerCode).toLowerCase() === toStr(sellerCode).toLowerCase()) ||
      (sellerSlug && toStr(identity.sellerSlug).toLowerCase() === toStr(sellerSlug).toLowerCase()),
    );
  });
  if (!items.length) return null;

  const sellerIdentity = getLineSellerIdentity(items[0]);
  const customerSnapshot = order?.customer_snapshot || {};
  const deliveryAddress = order?.delivery_snapshot?.address || order?.delivery?.address_snapshot || {};
  const breakdownEntry = getSellerBreakdownEntry(order, sellerIdentity.sellerCode, sellerIdentity.sellerSlug);
  const tracking = collectTrackingDetails(items);
  const subtotalIncl = r2(items.reduce((sum, item) => sum + getItemLineTotal(item), 0));
  const deliveryFeeIncl = r2(breakdownEntry?.amount_incl ?? breakdownEntry?.amountIncl ?? 0);
  const totalIncl = r2(subtotalIncl + deliveryFeeIncl);
  const customerName =
    toStr(deliveryAddress?.recipientName) ||
    toStr(customerSnapshot?.account?.accountName) ||
    toStr(customerSnapshot?.business?.companyName) ||
    toStr(customerSnapshot?.personal?.fullName) ||
    "Customer";
  const customerPhone =
    toStr(deliveryAddress?.phoneNumber) ||
    toStr(customerSnapshot?.phoneNumber) ||
    toStr(customerSnapshot?.account?.phoneNumber) ||
    toStr(customerSnapshot?.personal?.phoneNumber) ||
    "";

  return {
    seller: {
      sellerCode: sellerIdentity.sellerCode,
      sellerSlug: sellerIdentity.sellerSlug,
      vendorName: sellerIdentity.vendorName || "Seller",
    },
    branding: {
      assetBaseUrl,
      logoUrl: assetBaseUrl ? `${assetBaseUrl}/logo/Piessang%20Logo.png` : "",
      stripeBadgeUrl: assetBaseUrl ? `${assetBaseUrl}/badges/Stripe%20Secure%20Checkout%20Badge.png` : "",
    },
    order: {
      orderId: toStr(order?.docId || order?.order?.orderId || ""),
      orderNumber: toStr(order?.order?.orderNumber || ""),
      createdAt: toStr(order?.timestamps?.createdAt || ""),
      paymentStatus: toStr(order?.lifecycle?.paymentStatus || order?.payment_summary?.status || order?.payment?.status || ""),
      deliveryType: toStr(breakdownEntry?.delivery_type || breakdownEntry?.method || ""),
      deliveryLabel: toStr(breakdownEntry?.label || humanizeDeliveryType(breakdownEntry?.delivery_type || breakdownEntry?.method || "")),
      deliveryRuleLabel: toStr(breakdownEntry?.matched_rule_label || ""),
    },
    customer: {
      name: customerName,
      phone: customerPhone,
      address: [
        toStr(deliveryAddress?.streetAddress),
        toStr(deliveryAddress?.addressLine2),
        toStr(deliveryAddress?.suburb),
        toStr(deliveryAddress?.city),
        toStr(deliveryAddress?.stateProvinceRegion || deliveryAddress?.province),
        toStr(deliveryAddress?.postalCode),
        toStr(deliveryAddress?.country),
      ]
        .filter(Boolean)
        .join(", "),
      notes: toStr(deliveryAddress?.instructions || deliveryAddress?.deliveryInstructions || order?.delivery_snapshot?.notes || order?.delivery?.notes || ""),
    },
    fulfillment: {
      type: toStr(breakdownEntry?.delivery_type || breakdownEntry?.method || ""),
      label: toStr(breakdownEntry?.label || humanizeDeliveryType(breakdownEntry?.delivery_type || breakdownEntry?.method || "")),
      ruleLabel: toStr(breakdownEntry?.matched_rule_label || ""),
      tracking,
    },
    totals: {
      subtotalIncl,
      deliveryFeeIncl,
      totalIncl,
    },
    items: items.map((item, index) => ({
      index: index + 1,
      title: getItemTitle(item),
      variant: getItemVariant(item),
      sku: getItemSku(item),
      quantity: getItemQuantity(item),
      lineTotalIncl: getItemLineTotal(item),
    })),
  };
}

function renderDocumentHeader(title, payload) {
  return `
    <div class="header">
      <div>
        <div class="brand-row">
          ${payload.branding?.logoUrl ? `<img src="${payload.branding.logoUrl}" alt="Piessang" class="brand-logo" />` : ""}
          <div class="eyebrow">Piessang seller document</div>
        </div>
        <h1>${title}</h1>
        <p class="muted">${payload.seller.vendorName}</p>
      </div>
      <div class="meta">
        <p><strong>Order:</strong> ${payload.order.orderNumber || payload.order.orderId}</p>
        <p><strong>Created:</strong> ${formatDate(payload.order.createdAt)}</p>
        <p><strong>Payment:</strong> ${payload.order.paymentStatus || "pending"}</p>
      </div>
    </div>
  `;
}

function renderLineTable(payload) {
  const rows = payload.items
    .map(
      (item) => `
        <tr>
          <td>${item.index}</td>
          <td>${item.title}${item.variant ? `<div class="subtle">${item.variant}</div>` : ""}</td>
          <td>${item.sku || "-"}</td>
          <td>${item.quantity}</td>
          <td>${formatMoney(item.lineTotalIncl)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th>SKU</th>
          <th>Qty</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderSharedStyles() {
  return `
    <style>
      body { font-family: Arial, sans-serif; color: #202020; margin: 32px; }
      .eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #907d4c; font-weight: 700; }
      h1 { margin: 8px 0 4px; font-size: 28px; }
      .muted, .subtle { color: #57636c; }
      .brand-row { display: flex; align-items: center; gap: 12px; }
      .brand-logo { height: 30px; width: auto; object-fit: contain; }
      .header, .grid { display: flex; gap: 24px; justify-content: space-between; }
      .grid > div { flex: 1; }
      .meta p, .card p { margin: 0 0 8px; }
      .card { border: 1px solid #ece8df; border-radius: 10px; padding: 16px; margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border-bottom: 1px solid #ece8df; text-align: left; padding: 12px 10px; vertical-align: top; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #7d7d7d; }
      .totals { margin-top: 20px; width: 320px; margin-left: auto; }
      .totals p { display: flex; justify-content: space-between; margin: 0 0 8px; }
      .totals p strong:last-child { font-size: 18px; }
      .note { margin-top: 18px; padding: 12px 14px; border-radius: 8px; background: #fafafa; border: 1px solid #ece8df; }
      .detail-list { margin-top: 10px; }
      .detail-list p { margin: 0 0 6px; }
      .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #ece8df; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
      .footer-note { font-size: 12px; color: #57636c; }
      .trust-badge { height: 28px; width: auto; object-fit: contain; }
    </style>
  `;
}

export function renderSellerDocumentHtml(docType, payload) {
  const isPackingSlip = docType === "packing_slip";
  const isDeliveryNote = docType === "delivery_note";
  const isInvoice = docType === "invoice";
  const title = isPackingSlip ? "Packing slip" : isDeliveryNote ? "Delivery note" : "Seller invoice";
  const accent = isPackingSlip ? "#3b4a66" : isDeliveryNote ? "#156f52" : "#8a5a16";
  const panelTint = isPackingSlip ? "#f5f7fb" : isDeliveryNote ? "#f2fbf7" : "#fff8ee";
  const documentSummary = isPackingSlip
    ? "Pick and prepare the items in this seller order."
    : isDeliveryNote
      ? payload.fulfillment.type === "collection"
        ? "Use this note when the customer collects the order."
        : payload.fulfillment.type === "shipping"
          ? "Use this note when dispatching the order with your courier."
          : "Use this note while you complete your delivery for this order."
      : "This invoice reflects only your portion of the order, including your delivery charges.";

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        ${renderSharedStyles()}
      </head>
      <body>
        <div style="border:1px solid #ece8df;border-radius:16px;padding:18px 18px 14px;background:${panelTint};margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;">
            <div>
              <div class="eyebrow" style="color:${accent};">${isPackingSlip ? "Warehouse prep" : isDeliveryNote ? "Hand-off document" : "Billing record"}</div>
              <h1 style="margin:8px 0 6px;">${title}</h1>
              <p class="muted" style="margin:0;">${documentSummary}</p>
            </div>
            <div style="text-align:right;">
              <div style="display:inline-flex;border:1px solid ${accent};color:${accent};border-radius:999px;padding:6px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">
                ${isPackingSlip ? "Pack" : isDeliveryNote ? "Deliver" : "Invoice"}
              </div>
            </div>
          </div>
        </div>
        ${renderDocumentHeader(title, payload)}
        <div class="grid">
          <div class="card">
            <div class="eyebrow">Customer</div>
            <p><strong>${payload.customer.name}</strong></p>
            <p>${payload.customer.phone || "No phone saved"}</p>
            <p>${payload.customer.address || "No address saved"}</p>
          </div>
          <div class="card">
            <div class="eyebrow">Fulfilment</div>
            <p><strong>${payload.fulfillment.label || payload.order.deliveryLabel || "Delivery method pending"}</strong></p>
            <div class="detail-list">
              <p>${payload.fulfillment.ruleLabel || payload.order.deliveryRuleLabel || "No delivery rule label saved"}</p>
              ${payload.fulfillment.type === "shipping" && payload.fulfillment.tracking.length
                ? payload.fulfillment.tracking
                    .map(
                      (entry) => `
                        <p><strong>Courier:</strong> ${entry.courierName || "Pending courier"}</p>
                        <p><strong>Tracking:</strong> ${entry.trackingNumber || "Pending tracking number"}</p>
                        ${entry.status ? `<p><strong>Status:</strong> ${entry.status}</p>` : ""}
                        ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ""}
                      `,
                    )
                    .join("")
                : payload.fulfillment.type === "collection"
                  ? `<p>The customer chose collection. Prepare these items for pickup and use this note when handing them over.</p>`
                  : payload.fulfillment.type === "direct_delivery"
                    ? `<p>This order falls within your direct delivery coverage, so you should deliver it yourself without courier tracking.</p>`
                    : ""}
              <p>${payload.customer.notes || "No delivery notes supplied"}</p>
            </div>
          </div>
        </div>
        ${renderLineTable(payload)}
        <div class="totals">
          <p><span>Subtotal</span><span>${formatMoney(payload.totals.subtotalIncl)}</span></p>
          <p><span>Delivery fee</span><span>${formatMoney(payload.totals.deliveryFeeIncl)}</span></p>
          <p><strong>Total</strong><strong>${formatMoney(payload.totals.totalIncl)}</strong></p>
        </div>
        <div class="note">
          ${docType === "packing_slip"
            ? "Use this document to pick and prepare the seller items on this order."
            : docType === "delivery_note"
              ? payload.fulfillment.type === "collection"
                ? "Use this document when handing the order over to the customer at collection."
                : payload.fulfillment.type === "shipping"
                  ? "Use this document when packing and dispatching the order through your chosen courier."
                  : payload.fulfillment.type === "direct_delivery"
                    ? "Use this document while completing your direct delivery for this order."
                    : "Use this document when handing over or delivering the seller items on this order."
              : "This seller invoice reflects only the items and delivery charges assigned to this seller slice."}
        </div>
        <div class="footer">
          <p class="footer-note">Generated for ${payload.seller.vendorName} on Piessang.</p>
          ${payload.branding?.stripeBadgeUrl ? `<img src="${payload.branding.stripeBadgeUrl}" alt="Stripe Secure Checkout" class="trust-badge" />` : ""}
        </div>
      </body>
    </html>
  `;
}
