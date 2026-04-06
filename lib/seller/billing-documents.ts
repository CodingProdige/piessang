function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

const PIESSANG_LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/piessang-ada7b.firebasestorage.app/o/Branding%2FPiessang%20Logo%20White%20Background.jpg?alt=media&token=a6422033-dfbf-4837-adf0-436ad4c97fb3";

import { formatMoneyExact, normalizeMoneyAmount } from "@/lib/money";

function toNum(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function formatMoney(value: unknown) {
  return formatMoneyExact(normalizeMoneyAmount(toNum(value, 0)));
}

function esc(value: unknown) {
  return toStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: unknown) {
  const raw = toStr(value);
  if (!raw) return "Not available";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildSellerBillingDocumentPayload(cycle: Record<string, any>, docType: "invoice" | "statement", assetBaseUrl: string) {
  return {
    docType,
    assetBaseUrl,
    seller: {
      vendorName: toStr(cycle?.vendorName || "Seller"),
      sellerSlug: toStr(cycle?.sellerSlug),
      sellerCode: toStr(cycle?.sellerCode),
    },
    cycle: {
      billingId: toStr(cycle?.billingId),
      billingMonthLabel: toStr(cycle?.billingMonthLabel || cycle?.monthKey),
      monthKey: toStr(cycle?.monthKey),
      invoiceNumber: toStr(cycle?.invoice?.invoiceNumber || cycle?.billingId),
      issuedAt: toStr(cycle?.issuedAt),
      dueDate: toStr(cycle?.dueDate),
      status: toStr(cycle?.status || "due"),
      totals: {
        amountDueIncl: toNum(cycle?.totals?.amountDueIncl),
        fulfilmentFeeIncl: toNum(cycle?.totals?.fulfilmentFeeIncl),
        storageFeeIncl: toNum(cycle?.totals?.storageFeeIncl),
        successFeeIncl: toNum(cycle?.totals?.successFeeIncl),
        salesIncl: toNum(cycle?.totals?.salesIncl),
      },
      notes: {
        invoiceRule: toStr(cycle?.notes?.invoiceRule),
      },
      payments: Array.isArray(cycle?.payments) ? cycle.payments : [],
      counts: {
        settlements: toNum(cycle?.counts?.settlements),
        agedLots: toNum(cycle?.counts?.agedLots),
      },
    },
  };
}

export function renderSellerBillingDocumentHtml(docType: "invoice" | "statement", payload: ReturnType<typeof buildSellerBillingDocumentPayload>) {
  const { seller, cycle, assetBaseUrl } = payload;
  const title = docType === "invoice" ? "Seller billing invoice" : "Seller billing statement";
  const watermarkUrl = `${assetBaseUrl}/backgrounds/piessang-repeat-background.png`;

  const paymentRows = cycle.payments.length
    ? cycle.payments
        .map(
          (payment: Record<string, any>) => `
          <tr>
            <td>${esc(formatDate(payment?.requestedAt || payment?.paidAt))}</td>
            <td>${esc(toStr(payment?.method || "request").replace(/_/g, " "))}</td>
            <td>${esc(toStr(payment?.status || "pending_review").replace(/_/g, " "))}</td>
            <td>${esc(toStr(payment?.reference || payment?.id || "—"))}</td>
            <td>${esc(formatMoney(payment?.amountIncl || 0))}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No payment activity recorded yet.</td></tr>`;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${esc(title)}</title>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #202020; }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background-image: url("${esc(watermarkUrl)}");
          background-repeat: repeat;
          background-size: 100% auto;
          opacity: 0.025;
          pointer-events: none;
        }
        body { padding: 28px; font-size: 12px; }
        .page { position: relative; z-index: 1; }
        .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .brand img { width: 180px; height: auto; object-fit: contain; }
        .title { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; }
        .subtle { color: #5f6b76; }
        .card, .table-wrap { border: 1px solid #dfe3e8; border-radius: 14px; background: rgba(255,255,255,0.94); }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
        .card { padding: 14px; }
        .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #8a94a3; font-weight: 700; }
        .value { margin-top: 6px; font-size: 18px; font-weight: 700; }
        .table-wrap { margin-top: 18px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 12px; border-bottom: 1px solid #eceff2; text-align: left; vertical-align: top; }
        th { background: #f7f8fa; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #8a94a3; }
        .totals { margin-top: 18px; width: 340px; margin-left: auto; }
        .totals-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eceff2; }
        .totals-row.total { font-size: 16px; font-weight: 700; }
        .footer { margin-top: 24px; font-size: 11px; color: #5f6b76; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="brand">
            <img src="${esc(PIESSANG_LOGO_URL)}" alt="Piessang" />
          </div>
          <div>
            <div class="title">${esc(title)}</div>
            <p class="subtle">${esc(seller.vendorName)} • ${esc(cycle.billingMonthLabel)}</p>
            <p class="subtle">${esc(cycle.invoiceNumber)}</p>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="eyebrow">Seller</div>
            <div class="value">${esc(seller.vendorName)}</div>
            <p class="subtle">${esc(seller.sellerCode || seller.sellerSlug || "Seller")}</p>
          </div>
          <div class="card">
            <div class="eyebrow">Cycle details</div>
            <div class="value">${esc(cycle.billingMonthLabel)}</div>
            <p class="subtle">Issued ${esc(formatDate(cycle.issuedAt))}</p>
            <p class="subtle">Due ${esc(formatDate(cycle.dueDate))}</p>
            <p class="subtle">Status ${esc(cycle.status.replace(/_/g, " "))}</p>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Charge</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fulfilment fees</td>
                <td>Piessang fulfilment charges for warehouse-handled seller orders in this billing month.</td>
                <td>${esc(formatMoney(cycle.totals.fulfilmentFeeIncl))}</td>
              </tr>
              <tr>
                <td>Storage fees</td>
                <td>Warehouse lot storage charges for aged stock over the configured threshold.</td>
                <td>${esc(formatMoney(cycle.totals.storageFeeIncl))}</td>
              </tr>
              ${
                docType === "statement"
                  ? `<tr>
                      <td>Success fees</td>
                      <td>Marketplace reporting visibility for category-linked success fees.</td>
                      <td>${esc(formatMoney(cycle.totals.successFeeIncl))}</td>
                    </tr>
                    <tr>
                      <td>Sales reference</td>
                      <td>Total sales processed through the seller settlement layer in this cycle.</td>
                      <td>${esc(formatMoney(cycle.totals.salesIncl))}</td>
                    </tr>`
                  : ""
              }
            </tbody>
          </table>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payment activity</th>
                <th>Method</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${paymentRows}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="totals-row"><span>Fulfilment fees</span><strong>${esc(formatMoney(cycle.totals.fulfilmentFeeIncl))}</strong></div>
          <div class="totals-row"><span>Storage fees</span><strong>${esc(formatMoney(cycle.totals.storageFeeIncl))}</strong></div>
          <div class="totals-row total"><span>Amount due</span><strong>${esc(formatMoney(cycle.totals.amountDueIncl))}</strong></div>
        </div>

        <div class="footer">
          <p>${esc(cycle.notes.invoiceRule || "Seller billing is calculated from fulfilment and storage, with marketplace charges shown for reporting transparency.")}</p>
        </div>
      </div>
    </body>
  </html>`;
}
