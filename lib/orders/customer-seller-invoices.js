import axios from "axios";

const CLOUD_FUNCTION_URL = "https://generatepdf-th2kiymgaa-uc.a.run.app";
export const CUSTOMER_SELLER_INVOICE_TEMPLATE_VERSION = "2026-04-01-v2";

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
  }).format(date);
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  const productNode = product?.product || {};
  const sellerNode = product?.seller || productNode?.seller || {};
  return {
    sellerCode: toStr(item?.seller_snapshot?.sellerCode || sellerNode?.sellerCode || productNode?.sellerCode || ""),
    sellerSlug: toStr(item?.seller_snapshot?.sellerSlug || sellerNode?.sellerSlug || productNode?.sellerSlug || ""),
    vendorName: toStr(item?.seller_snapshot?.vendorName || sellerNode?.vendorName || productNode?.vendorName || product?.vendorName || ""),
  };
}

function getLineTitle(item) {
  const product = item?.product_snapshot || item?.product || {};
  const productNode = product?.product || {};
  return toStr(product?.name || productNode?.title || product?.title || "Product");
}

function getLineVariant(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.label || "");
}

function getLineSku(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.sku || variant?.variant_sku || variant?.variant_id || "");
}

function getLineImage(item) {
  return (
    toStr(item?.selected_variant_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(item?.product_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl)
  );
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
      const entryCode = toStr(entry?.sellerCode || entry?.seller_code || "").toLowerCase();
      const entrySlug = toStr(entry?.sellerSlug || entry?.seller_slug || "").toLowerCase();
      return Boolean(
        (normalizedCode && entryCode === normalizedCode) ||
        (normalizedSlug && entrySlug === normalizedSlug),
      );
    }) || null
  );
}

function getSellerSliceEntry(order, sellerCode, sellerSlug, vendorName) {
  const slices = Array.isArray(order?.seller_slices) ? order.seller_slices : [];
  const normalizedCode = toStr(sellerCode).toLowerCase();
  const normalizedSlug = toStr(sellerSlug).toLowerCase();
  const normalizedVendor = toStr(vendorName).toLowerCase();
  return (
    slices.find((entry) => {
      const entryCode = toStr(entry?.sellerCode).toLowerCase();
      const entrySlug = toStr(entry?.sellerSlug).toLowerCase();
      const entryVendor = toStr(entry?.vendorName).toLowerCase();
      return Boolean(
        (normalizedCode && entryCode === normalizedCode) ||
        (normalizedSlug && entrySlug === normalizedSlug) ||
        (normalizedVendor && entryVendor === normalizedVendor),
      );
    }) || null
  );
}

function formatAddress(address) {
  if (!address) return "";
  if (typeof address === "string") return address.trim();
  return [
    address.recipientName,
    address.streetAddress,
    address.addressLine2,
    address.suburb,
    address.city,
    address.stateProvinceRegion || address.province,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function getCustomerBusinessDetails(user = {}, order = {}) {
  const account = user?.account || {};
  const business = user?.business || {};
  const snapshotAccount = order?.customer_snapshot?.account || {};
  const snapshotBusiness = order?.customer_snapshot?.business || {};
  return {
    companyName: toStr(business?.companyName || snapshotBusiness?.companyName || account?.accountName || snapshotAccount?.accountName),
    vatNumber: toStr(account?.vatNumber || business?.vatNumber || snapshotAccount?.vatNumber || snapshotBusiness?.vatNumber),
    registrationNumber: toStr(account?.registrationNumber || business?.registrationNumber || snapshotAccount?.registrationNumber || snapshotBusiness?.registrationNumber),
    businessType: toStr(account?.businessType || business?.businessType || snapshotAccount?.businessType || snapshotBusiness?.businessType),
    phoneNumber: toStr(account?.phoneNumber || business?.phoneNumber || snapshotAccount?.phoneNumber || snapshotBusiness?.phoneNumber),
  };
}

export function collectCustomerSellerInvoiceGroups(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const groups = new Map();

  for (const item of items) {
    const identity = getLineSellerIdentity(item);
    const key = toStr(identity.sellerCode || identity.sellerSlug || identity.vendorName);
    if (!key) continue;
    if (!groups.has(key)) {
      const breakdown = getSellerBreakdownEntry(order, identity.sellerCode, identity.sellerSlug);
      const slice = getSellerSliceEntry(order, identity.sellerCode, identity.sellerSlug, identity.vendorName);
      groups.set(key, {
        key,
        sellerCode: identity.sellerCode,
        sellerSlug: identity.sellerSlug,
        vendorName: identity.vendorName || "Seller",
        deliveryFeeIncl: r2(
          slice?.deliveryFeeIncl ??
            slice?.delivery_fee_incl ??
            breakdown?.amount_incl ??
            breakdown?.amountIncl ??
            0,
        ),
        lines: [],
      });
    }
    const group = groups.get(key);
    const quantity = Math.max(1, Number(item?.quantity || 0));
    const lineTotalIncl = r2(item?.line_totals?.final_incl ?? item?.line_totals?.total_incl ?? 0);
    group.lines.push({
      title: getLineTitle(item),
      variant: getLineVariant(item),
      sku: getLineSku(item),
      quantity,
      lineTotalIncl,
      imageUrl: getLineImage(item),
    });
  }

  return Array.from(groups.values()).map((group) => {
    const itemsTotalIncl = r2(group.lines.reduce((sum, line) => sum + line.lineTotalIncl, 0));
    return {
      ...group,
      itemsTotalIncl,
      totalIncl: r2(itemsTotalIncl + group.deliveryFeeIncl),
    };
  });
}

export function buildCustomerSellerInvoicePayload({
  order = {},
  orderId = "",
  siteUrl = "https://piessang.co.za",
  sellerIdentity = {},
  sellerBusiness = {},
  buyerBusiness = {},
} = {}) {
  const sellerCode = toStr(sellerIdentity?.sellerCode);
  const sellerSlug = toStr(sellerIdentity?.sellerSlug);
  const groups = collectCustomerSellerInvoiceGroups(order);
  const group = groups.find((entry) =>
    (sellerCode && entry.sellerCode === sellerCode) ||
    (sellerSlug && entry.sellerSlug === sellerSlug),
  );
  if (!group) return null;

  const deliveryAddress =
    formatAddress(order?.delivery_snapshot?.address) ||
    formatAddress(order?.delivery?.address_snapshot) ||
    formatAddress(order?.delivery_address) ||
    "";
  const invoiceBase = toStr(order?.invoice?.invoiceNumber || order?.order?.orderNumber || orderId);
  const invoiceSuffix = toStr(group.sellerCode || group.sellerSlug || group.vendorName).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toUpperCase();

  return {
    seller: {
      vendorName: toStr(sellerBusiness?.companyName || sellerBusiness?.tradingName || group.vendorName || "Seller"),
      tradingName: toStr(group.vendorName || sellerBusiness?.tradingName || sellerBusiness?.companyName || "Seller"),
      registrationNumber: toStr(sellerBusiness?.registrationNumber),
      vatNumber: toStr(sellerBusiness?.vatNumber),
      phoneNumber: toStr(sellerBusiness?.phoneNumber),
      email: toStr(sellerBusiness?.email),
      address: formatAddress(sellerBusiness?.address) || toStr(sellerBusiness?.addressText),
      logoUrl: toStr(sellerBusiness?.logoUrl || `${siteUrl.replace(/\/+$/, "")}/logo/Piessang%20Logo.png`),
    },
    platform: {
      watermarkUrl: `${siteUrl.replace(/\/+$/, "")}/backgrounds/piessang-repeat-background.png`,
    },
    customer: {
      name: toStr(
        order?.customer_snapshot?.account?.accountName ||
          order?.customer_snapshot?.business?.companyName ||
          order?.customer_snapshot?.personal?.fullName ||
          "Customer",
      ),
      email: toStr(order?.customer_snapshot?.email),
      phone: toStr(order?.customer_snapshot?.account?.phoneNumber || order?.customer_snapshot?.personal?.phoneNumber),
      business: {
        companyName: toStr(buyerBusiness?.companyName),
        vatNumber: toStr(buyerBusiness?.vatNumber),
        registrationNumber: toStr(buyerBusiness?.registrationNumber),
        businessType: toStr(buyerBusiness?.businessType),
        phoneNumber: toStr(buyerBusiness?.phoneNumber),
      },
      address: deliveryAddress,
    },
    order: {
      orderId,
      orderNumber: toStr(order?.order?.orderNumber || orderId),
      createdAt: toStr(order?.timestamps?.createdAt),
      paymentMethod: toStr(order?.payment?.method || order?.payment?.provider),
      paymentStatus: toStr(order?.payment?.status || order?.lifecycle?.paymentStatus),
    },
    invoice: {
      invoiceNumber: invoiceSuffix ? `${invoiceBase}-${invoiceSuffix}` : invoiceBase,
      invoiceDate: formatDate(order?.invoice?.generatedAt || order?.timestamps?.updatedAt || order?.timestamps?.createdAt),
      generatedAt: new Date().toISOString(),
    },
    totals: {
      itemsTotalIncl: group.itemsTotalIncl,
      deliveryFeeIncl: group.deliveryFeeIncl,
      totalIncl: group.totalIncl,
    },
    items: group.lines.map((line, index) => ({
      ...line,
      index: index + 1,
    })),
  };
}

function esc(value) {
  return toStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

export function renderCustomerSellerInvoiceHtml(payload) {
  const business = payload?.customer?.business || {};
  const hasBusiness = Boolean(
    business.companyName || business.vatNumber || business.registrationNumber || business.businessType || business.phoneNumber,
  );
  const itemRows = (payload?.items || [])
    .map(
      (item) => `
        <tr>
          <td>${item.index}</td>
          <td>${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" class="thumb" />` : "-"}</td>
          <td>
            <div class="title">${esc(item.title)}</div>
            ${item.variant ? `<div class="muted">${esc(item.variant)}</div>` : ""}
            ${item.sku ? `<div class="muted">SKU: ${esc(item.sku)}</div>` : ""}
          </td>
          <td class="right">${item.quantity}</td>
          <td class="right">${formatMoney(item.lineTotalIncl)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Seller Invoice</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111; font-size: 12px; position: relative; }
          .watermark {
            position: fixed;
            inset: 0;
            background-image: url('${esc(payload?.platform?.watermarkUrl)}');
            background-repeat: repeat;
            background-position: center;
            background-size: 520px auto;
            opacity: 0.025;
            pointer-events: none;
            z-index: 0;
          }
          .page {
            position: relative;
            z-index: 1;
          }
          .header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:14px; margin-bottom:16px; }
          .brand { display:flex; gap:12px; align-items:flex-start; }
          .logo { max-width:64px; max-height:64px; object-fit:contain; }
          .company p, .meta p, .card p { margin: 4px 0; }
          .title { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
          .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
          .card { border:1px solid #111; padding:12px; min-height:92px; }
          .card h3 { margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
          table { width:100%; border-collapse:collapse; }
          th, td { border:1px solid #111; padding:8px; text-align:left; vertical-align:top; }
          th { background:#f3f3f3; text-transform:uppercase; font-size:10px; letter-spacing:0.4px; }
          .thumb { width:44px; height:44px; object-fit:contain; display:block; }
          .right { text-align:right; }
          .muted { color:#555; font-size:11px; margin-top:4px; }
          .totals { margin-top:16px; display:flex; justify-content:flex-end; }
          .totals table { width:320px; }
          .footer { margin-top:16px; display:flex; justify-content:space-between; font-size:10px; color:#444; }
        </style>
      </head>
      <body>
        <div class="watermark"></div>
        <div class="page">
        <div class="header">
          <div class="brand">
            ${payload?.seller?.logoUrl ? `<img src="${esc(payload.seller.logoUrl)}" alt="${esc(payload.seller.vendorName)}" class="logo" />` : ""}
            <div class="company">
              <p><strong>Seller details</strong></p>
              <p><strong>${esc(payload?.seller?.vendorName || "Seller")}</strong></p>
              ${payload?.seller?.address ? `<p>${esc(payload.seller.address)}</p>` : ""}
              ${payload?.seller?.phoneNumber || payload?.seller?.email ? `<p>${esc([payload.seller.phoneNumber, payload.seller.email].filter(Boolean).join(" | "))}</p>` : ""}
              ${payload?.seller?.registrationNumber ? `<p>Registration No: ${esc(payload.seller.registrationNumber)}</p>` : ""}
              ${payload?.seller?.vatNumber ? `<p>VAT No: ${esc(payload.seller.vatNumber)}</p>` : ""}
            </div>
          </div>
          <div>
            <div class="title">Tax Invoice</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="card">
            <h3>Invoice</h3>
            <p>Invoice Number: <strong>${esc(payload?.invoice?.invoiceNumber)}</strong></p>
            <p>Order Number: ${esc(payload?.order?.orderNumber)}</p>
            <p>Invoice Date: ${esc(payload?.invoice?.invoiceDate)}</p>
            <p>Payment Method: ${esc(payload?.order?.paymentMethod || "-")}</p>
            <p>Payment Status: ${esc(payload?.order?.paymentStatus || "-")}</p>
          </div>
          <div class="card">
            <h3>Customer</h3>
            <p>${esc(payload?.customer?.name || "Customer")}</p>
            ${payload?.customer?.address ? `<p>${esc(payload.customer.address)}</p>` : ""}
            ${hasBusiness && business.companyName ? `<p>Business: ${esc(business.companyName)}</p>` : ""}
            ${hasBusiness && business.registrationNumber ? `<p>Registration No: ${esc(business.registrationNumber)}</p>` : ""}
            ${hasBusiness && business.vatNumber ? `<p>VAT No: ${esc(business.vatNumber)}</p>` : ""}
            ${hasBusiness && business.businessType ? `<p>Business Type: ${esc(business.businessType)}</p>` : ""}
            ${hasBusiness && business.phoneNumber ? `<p>Phone: ${esc(business.phoneNumber)}</p>` : payload?.customer?.phone ? `<p>Phone: ${esc(payload.customer.phone)}</p>` : ""}
            ${payload?.customer?.email ? `<p>Email: ${esc(payload.customer.email)}</p>` : ""}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th style="width:60px;">Image</th>
              <th>Product</th>
              <th class="right" style="width:70px;">Qty</th>
              <th class="right" style="width:120px;">Line Total</th>
            </tr>
          </thead>
          <tbody>${itemRows || `<tr><td colspan="5">No items found for this seller.</td></tr>`}</tbody>
        </table>

        <div class="totals">
          <table>
            <tbody>
              <tr>
                <td>Items total (Incl.)</td>
                <td class="right">${formatMoney(payload?.totals?.itemsTotalIncl)}</td>
              </tr>
              <tr>
                <td>Delivery fee (Incl.)</td>
                <td class="right">${formatMoney(payload?.totals?.deliveryFeeIncl)}</td>
              </tr>
              <tr>
                <td><strong>Total (Incl.)</strong></td>
                <td class="right"><strong>${formatMoney(payload?.totals?.totalIncl)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div>Generated: ${esc(formatDate(payload?.invoice?.generatedAt))}</div>
          <div>Paid order invoice</div>
        </div>
        </div>
      </body>
    </html>
  `;
}

export async function generateCustomerSellerInvoicePdf({ htmlContent, fileName }) {
  const response = await axios.post(CLOUD_FUNCTION_URL, { htmlContent, fileName });
  return toStr(response?.data?.pdfUrl);
}
