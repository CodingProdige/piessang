import axios from "axios";

const CLOUD_FUNCTION_URL = "https://generatepdf-th2kiymgaa-uc.a.run.app";
export const CUSTOMER_SELLER_CREDIT_NOTE_TEMPLATE_VERSION = "2026-04-01-v1";
const PIESSANG_LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/piessang-ada7b.firebasestorage.app/o/Branding%2FPiessang%20Logo%20White%20Background.jpg?alt=media&token=a6422033-dfbf-4837-adf0-436ad4c97fb3";

import { formatMoneyExact, normalizeMoneyAmount } from "@/lib/money";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function r2(value) {
  return normalizeMoneyAmount(toNum(value));
}

function formatMoney(value) {
  return formatMoneyExact(r2(value), { space: true });
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

function esc(value) {
  return toStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function getLineTitle(item) {
  const product = item?.product_snapshot || item?.product || {};
  const productNode = product?.product || {};
  return toStr(product?.name || productNode?.title || product?.title || item?.title || "Product");
}

function getLineVariant(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.label || item?.variant || "");
}

function getLineSku(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return toStr(variant?.sku || variant?.variant_sku || variant?.variant_id || item?.sku || "");
}

function getLineImage(item) {
  return (
    toStr(item?.selected_variant_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(item?.product_snapshot?.media?.images?.find?.((entry) => Boolean(entry?.imageUrl))?.imageUrl) ||
    toStr(item?.imageUrl)
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

export function buildCustomerSellerCreditNotePayload({
  order = {},
  orderId = "",
  siteUrl = "https://piessang.co.za",
  creditNote = {},
  sellerBusiness = {},
} = {}) {
  const lines = Array.isArray(creditNote?.lines) ? creditNote.lines : [];
  const creditedLines = lines.map((line, index) => {
    const lineTotalIncl = r2(line?.amountIncl ?? line?.lineTotalIncl ?? line?.line_totals?.final_incl ?? 0);
    return {
      index: index + 1,
      title: getLineTitle(line),
      variant: getLineVariant(line),
      sku: getLineSku(line),
      quantity: Math.max(1, Number(line?.quantity || 0)),
      lineTotalIncl,
      imageUrl: getLineImage(line),
    };
  });

  const linesTotalIncl = r2(creditedLines.reduce((sum, line) => sum + line.lineTotalIncl, 0));
  const creditAmountIncl = r2(creditNote?.amountIncl ?? creditNote?.amount_incl ?? linesTotalIncl);

  return {
    seller: {
      vendorName: toStr(sellerBusiness?.companyName || sellerBusiness?.tradingName || creditNote?.vendorName || "Seller"),
      tradingName: toStr(creditNote?.vendorName || sellerBusiness?.tradingName || sellerBusiness?.companyName || "Seller"),
      registrationNumber: toStr(sellerBusiness?.registrationNumber),
      vatNumber: toStr(sellerBusiness?.vatNumber),
      phoneNumber: toStr(sellerBusiness?.phoneNumber),
      email: toStr(sellerBusiness?.email),
      address: formatAddress(sellerBusiness?.address) || toStr(sellerBusiness?.addressText),
      logoUrl: toStr(sellerBusiness?.logoUrl || PIESSANG_LOGO_URL),
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
      address:
        formatAddress(order?.delivery_snapshot?.address) ||
        formatAddress(order?.delivery?.address_snapshot) ||
        formatAddress(order?.delivery_address) ||
        "",
    },
    order: {
      orderId,
      orderNumber: toStr(order?.order?.orderNumber || orderId),
      originalInvoiceNumber: toStr(creditNote?.originalSellerInvoiceNumber || creditNote?.originalInvoiceNumber),
      createdAt: toStr(order?.timestamps?.createdAt),
      paymentMethod: toStr(order?.payment?.method || order?.payment?.provider),
    },
    creditNote: {
      creditNoteId: toStr(creditNote?.creditNoteId || creditNote?.docId),
      creditNoteNumber: toStr(creditNote?.creditNoteNumber),
      issuedAt: formatDate(creditNote?.issuedAt || creditNote?.createdAt),
      generatedAt: new Date().toISOString(),
      reason: toStr(creditNote?.reasonLabel || creditNote?.reason || "Refund adjustment"),
    },
    totals: {
      linesTotalIncl,
      creditAmountIncl,
    },
    items: creditedLines,
  };
}

export function renderCustomerSellerCreditNoteHtml(payload) {
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
        <title>Seller Credit Note</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #111; font-size: 12px; position: relative; }
          .watermark { position: fixed; inset: 0; background-image: url('${esc(payload?.platform?.watermarkUrl)}'); background-repeat: repeat; background-position: center; background-size: 520px auto; opacity: 0.025; pointer-events: none; z-index: 0; }
          .page { position: relative; z-index: 1; }
          .header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:14px; margin-bottom:16px; }
          .brand { display:flex; gap:12px; align-items:flex-start; }
          .logo { max-width:64px; max-height:64px; object-fit:contain; }
          .company p, .card p { margin: 4px 0; }
          .doc-title { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
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
            <div class="doc-title">Credit Note</div>
          </div>

          <div class="meta-grid">
            <div class="card">
              <h3>Credit note</h3>
              <p>Credit Note Number: <strong>${esc(payload?.creditNote?.creditNoteNumber)}</strong></p>
              <p>Original Invoice: ${esc(payload?.order?.originalInvoiceNumber || "-")}</p>
              <p>Order Number: ${esc(payload?.order?.orderNumber)}</p>
              <p>Issued Date: ${esc(payload?.creditNote?.issuedAt)}</p>
              <p>Reason: ${esc(payload?.creditNote?.reason || "-")}</p>
            </div>
            <div class="card">
              <h3>Customer</h3>
              <p>${esc(payload?.customer?.name || "Customer")}</p>
              ${payload?.customer?.address ? `<p>${esc(payload.customer.address)}</p>` : ""}
              ${payload?.customer?.phone ? `<p>Phone: ${esc(payload.customer.phone)}</p>` : ""}
              ${payload?.customer?.email ? `<p>Email: ${esc(payload.customer.email)}</p>` : ""}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th style="width:60px;">Image</th>
                <th>Credited item</th>
                <th class="right" style="width:70px;">Qty</th>
                <th class="right" style="width:120px;">Credited total</th>
              </tr>
            </thead>
            <tbody>${itemRows || `<tr><td colspan="5">No credited items recorded.</td></tr>`}</tbody>
          </table>

          <div class="totals">
            <table>
              <tbody>
                <tr>
                  <td>Credited items total (Incl.)</td>
                  <td class="right">${formatMoney(payload?.totals?.linesTotalIncl)}</td>
                </tr>
                <tr>
                  <td><strong>Credit amount (Incl.)</strong></td>
                  <td class="right"><strong>${formatMoney(payload?.totals?.creditAmountIncl)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <div>Generated: ${esc(formatDate(payload?.creditNote?.generatedAt))}</div>
            <div>Issued for refund / return adjustment</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function generateCustomerSellerCreditNotePdf({ htmlContent, fileName }) {
  const response = await axios.post(CLOUD_FUNCTION_URL, { htmlContent, fileName });
  return toStr(response?.data?.pdfUrl);
}
