export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensureOrderInvoice } from "@/lib/orders/invoices";
import {
  CUSTOMER_SELLER_INVOICE_TEMPLATE_VERSION,
  buildCustomerSellerInvoicePayload,
  generateCustomerSellerInvoicePdf,
  renderCustomerSellerInvoiceHtml,
} from "@/lib/orders/customer-seller-invoices";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function buildFingerprint(value) {
  return JSON.stringify(value || {});
}

async function resolveSellerOwner(db, { sellerCode = "", sellerSlug = "" }) {
  if (sellerSlug) {
    const bySlug = await db.collection("users").where("seller.sellerSlug", "==", sellerSlug).limit(1).get();
    if (!bySlug.empty) return bySlug.docs[0];
  }
  if (sellerCode) {
    for (const field of ["seller.sellerCode", "seller.activeSellerCode", "seller.groupSellerCode"]) {
      const snap = await db.collection("users").where(field, "==", sellerCode).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }
  }
  return null;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase admin service account missing.");

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const force = Boolean(body?.force);
    const generatedBy = toStr(body?.generatedBy || "customer_seller_invoice_view");
    const buyerBusiness = body?.buyerBusiness && typeof body.buyerBusiness === "object" ? body.buyerBusiness : {};

    if (!orderId) return err(400, "Missing Order", "orderId is required.");
    if (!sellerCode && !sellerSlug) return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");

    const orderRef = db.collection("orders_v2").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "Could not find that order.");
    const order = orderSnap.data() || {};

    await ensureOrderInvoice({
      db,
      orderId: orderSnap.id,
      generatedBy,
      issuedAt: nowIso(),
    });

    const sellerKey = toStr(sellerCode || sellerSlug);
    const existingDoc =
      order?.delivery_docs?.seller_invoices?.[sellerKey] &&
      typeof order.delivery_docs.seller_invoices[sellerKey] === "object"
        ? order.delivery_docs.seller_invoices[sellerKey]
        : null;
    const buyerFingerprint = buildFingerprint({
      templateVersion: CUSTOMER_SELLER_INVOICE_TEMPLATE_VERSION,
      buyerBusiness,
    });
    const existingUrl = toStr(existingDoc?.url);
    if (existingUrl && !force && toStr(existingDoc?.buyerFingerprint) === buyerFingerprint) {
      return ok({
        orderId: orderSnap.id,
        sellerCode,
        sellerSlug,
        url: existingUrl,
        generatedAt: toStr(existingDoc?.generatedAt),
        status: "already_generated",
      });
    }

    const sellerOwnerSnap = await resolveSellerOwner(db, { sellerCode, sellerSlug });
    const sellerOwner = sellerOwnerSnap?.data() || {};
    const sellerNode = sellerOwner?.seller || {};
    const accountNode = sellerOwner?.account || {};
    const sellerBusiness = {
      companyName: toStr(sellerNode?.businessDetails?.companyName || accountNode?.accountName || sellerNode?.vendorName),
      tradingName: toStr(sellerNode?.vendorName || sellerNode?.groupVendorName),
      registrationNumber: toStr(sellerNode?.businessDetails?.registrationNumber),
      vatNumber: toStr(sellerNode?.businessDetails?.vatNumber || accountNode?.vatNumber),
      phoneNumber: toStr(sellerNode?.businessDetails?.phoneNumber || accountNode?.phoneNumber),
      email: toStr(sellerNode?.businessDetails?.email || sellerOwner?.email),
      addressText: toStr(sellerNode?.businessDetails?.addressText),
      logoUrl: toStr(sellerNode?.branding?.logoImageUrl || sellerNode?.media?.logoImageUrl),
    };

    const siteUrl = new URL(req.url).origin;
    const payload = buildCustomerSellerInvoicePayload({
      order,
      orderId: orderSnap.id,
      siteUrl,
      sellerIdentity: { sellerCode, sellerSlug },
      sellerBusiness,
      buyerBusiness,
    });
    if (!payload) {
      return err(404, "Seller Slice Not Found", "This seller does not have any items on that order.");
    }

    const htmlContent = renderCustomerSellerInvoiceHtml(payload);
    const fileName = `customer-seller-invoice-${payload.order.orderNumber || orderSnap.id}-${sellerKey || "seller"}`;
    const pdfUrl = await generateCustomerSellerInvoicePdf({ htmlContent, fileName });
    if (!pdfUrl) return err(502, "PDF Failed", "Invoice generation did not return a PDF URL.");

    const generatedAt = nowIso();
    await orderRef.set(
      {
        delivery_docs: {
          seller_invoices: {
            [sellerKey]: {
              url: pdfUrl,
              generatedAt,
              generatedBy,
              buyerFingerprint,
              sellerCode: payload?.seller?.sellerCode || sellerCode || null,
              sellerSlug: payload?.seller?.sellerSlug || sellerSlug || null,
            },
          },
        },
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt: generatedAt,
        },
      },
      { merge: true },
    );

    return ok({
      orderId: orderSnap.id,
      sellerCode,
      sellerSlug,
      url: pdfUrl,
      generatedAt,
      status: "generated",
    });
  } catch (error) {
    return err(500, "Invoice Generation Failed", error?.message || "Unexpected error generating seller invoice.");
  }
}
