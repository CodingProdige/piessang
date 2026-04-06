export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  CUSTOMER_SELLER_CREDIT_NOTE_TEMPLATE_VERSION,
  buildCustomerSellerCreditNotePayload,
  generateCustomerSellerCreditNotePdf,
  renderCustomerSellerCreditNoteHtml,
} from "@/lib/orders/customer-seller-credit-notes";

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
    const creditNoteId = toStr(body?.creditNoteId);
    const force = Boolean(body?.force);
    const generatedBy = toStr(body?.generatedBy || "customer_seller_credit_note_view");

    if (!orderId) return err(400, "Missing Order", "orderId is required.");
    if (!creditNoteId) return err(400, "Missing Credit Note", "creditNoteId is required.");

    const orderRef = db.collection("orders_v2").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "Could not find that order.");
    const order = orderSnap.data() || {};

    const storedDoc =
      order?.delivery_docs?.seller_credit_notes?.[creditNoteId] &&
      typeof order.delivery_docs.seller_credit_notes[creditNoteId] === "object"
        ? order.delivery_docs.seller_credit_notes[creditNoteId]
        : null;

    const fingerprint = buildFingerprint({
      templateVersion: CUSTOMER_SELLER_CREDIT_NOTE_TEMPLATE_VERSION,
      creditNoteId,
    });
    if (toStr(storedDoc?.url) && !force && toStr(storedDoc?.fingerprint) === fingerprint) {
      return ok({
        orderId: orderSnap.id,
        creditNoteId,
        url: toStr(storedDoc?.url),
        generatedAt: toStr(storedDoc?.generatedAt),
        status: "already_generated",
      });
    }

    const creditNoteRef = db.collection("credit_notes_v2").doc(creditNoteId);
    const creditNoteSnap = await creditNoteRef.get();
    if (!creditNoteSnap.exists) return err(404, "Credit Note Not Found", "Could not find that credit note.");
    const creditNote = creditNoteSnap.data() || {};

    const sellerOwnerSnap = await resolveSellerOwner(db, {
      sellerCode: toStr(creditNote?.sellerCode),
      sellerSlug: toStr(creditNote?.sellerSlug),
    });
    const sellerOwner = sellerOwnerSnap?.data() || {};
    const sellerNode = sellerOwner?.seller || {};
    const accountNode = sellerOwner?.account || {};
    const sellerBusiness = {
      companyName: toStr(sellerNode?.businessDetails?.companyName || accountNode?.accountName || creditNote?.vendorName),
      tradingName: toStr(creditNote?.vendorName || sellerNode?.vendorName || sellerNode?.groupVendorName),
      registrationNumber: toStr(sellerNode?.businessDetails?.registrationNumber),
      vatNumber: toStr(sellerNode?.businessDetails?.vatNumber || accountNode?.vatNumber),
      phoneNumber: toStr(sellerNode?.businessDetails?.phoneNumber || accountNode?.phoneNumber),
      email: toStr(sellerNode?.businessDetails?.email || sellerOwner?.email),
      addressText: toStr(sellerNode?.businessDetails?.addressText),
      logoUrl: toStr(sellerNode?.branding?.logoImageUrl || sellerNode?.media?.logoImageUrl),
    };

    const payload = buildCustomerSellerCreditNotePayload({
      order,
      orderId: orderSnap.id,
      siteUrl: new URL(req.url).origin,
      creditNote,
      sellerBusiness,
    });

    const htmlContent = renderCustomerSellerCreditNoteHtml(payload);
    const fileName = `seller-credit-note-${payload.order.orderNumber || orderSnap.id}-${creditNoteId}`;
    const pdfUrl = await generateCustomerSellerCreditNotePdf({ htmlContent, fileName });
    if (!pdfUrl) return err(502, "PDF Failed", "Credit note generation did not return a PDF URL.");

    const generatedAt = nowIso();
    await Promise.all([
      creditNoteRef.set(
        {
          pdfUrl,
          generatedAt,
          templateVersion: CUSTOMER_SELLER_CREDIT_NOTE_TEMPLATE_VERSION,
          updatedAt: generatedAt,
        },
        { merge: true },
      ),
      orderRef.set(
        {
          delivery_docs: {
            seller_credit_notes: {
              [creditNoteId]: {
                url: pdfUrl,
                generatedAt,
                generatedBy,
                fingerprint,
              },
            },
          },
          timestamps: {
            ...(order?.timestamps || {}),
            updatedAt: generatedAt,
          },
        },
        { merge: true },
      ),
    ]);

    return ok({
      orderId: orderSnap.id,
      creditNoteId,
      url: pdfUrl,
      generatedAt,
      status: "generated",
    });
  } catch (error) {
    return err(500, "Credit Note Generation Failed", error?.message || "Unexpected error generating seller credit note.");
  }
}
