export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import axios from "axios";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { buildSellerDocumentPayload, renderSellerDocumentHtml } from "@/lib/orders/seller-documents";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, data: payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

const CLOUD_FUNCTION_URL = "https://generatepdf-th2kiymgaa-uc.a.run.app";

async function resolveOrderRef(db, { orderId = "", orderNumber = "" }) {
  if (orderId) return db.collection("orders_v2").doc(orderId);
  if (!orderNumber) return null;
  const snap = await db.collection("orders_v2").where("order.orderNumber", "==", orderNumber).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].ref;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to create seller documents.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const orderNumber = toStr(body?.orderNumber);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const docType = toStr(body?.docType).toLowerCase();

    if (!orderId && !orderNumber) return err(400, "Missing Order", "orderId or orderNumber is required.");
    if (!sellerCode && !sellerSlug) return err(400, "Missing Seller", "sellerCode or sellerSlug is required.");
    if (!["packing_slip", "delivery_note", "invoice"].includes(docType)) {
      return err(400, "Invalid Document", "docType must be packing_slip, delivery_note, or invoice.");
    }

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canAccessSellerSettlement(requester, sellerSlug, sellerCode) && !isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "You do not have permission to create documents for this seller.");
    }

    const orderRef = await resolveOrderRef(db, { orderId, orderNumber });
    if (!orderRef) return err(404, "Order Not Found", "Could not find that order.");

    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "Could not find that order.");
    const order = orderSnap.data() || {};

    const payload = buildSellerDocumentPayload(order, {
      sellerCode,
      sellerSlug,
      assetBaseUrl: new URL(req.url).origin,
    });
    if (!payload) {
      return err(404, "Seller Slice Not Found", "This seller does not have any items on that order.");
    }

    const htmlContent = renderSellerDocumentHtml(docType, payload);
    const fileName = `${docType}-${payload.order.orderNumber || payload.order.orderId}-${payload.seller.sellerCode || payload.seller.sellerSlug || "seller"}`;
    const pdfResponse = await axios.post(CLOUD_FUNCTION_URL, { htmlContent, fileName });
    const pdfUrl = toStr(pdfResponse?.data?.pdfUrl);
    if (!pdfUrl) return err(502, "PDF Failed", "Document generation did not return a PDF URL.");

    const sellerKey = payload.seller.sellerCode || payload.seller.sellerSlug;
    const now = new Date().toISOString();
    await orderRef.set(
      {
        seller_documents: {
          [sellerKey]: {
            [docType]: {
              url: pdfUrl,
              generatedAt: now,
              generatedBy: sessionUser.uid,
            },
          },
        },
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt: now,
        },
      },
      { merge: true },
    );

    return ok({
      orderId: orderSnap.id,
      orderNumber: payload.order.orderNumber || null,
      sellerCode: payload.seller.sellerCode || null,
      sellerSlug: payload.seller.sellerSlug || null,
      docType,
      url: pdfUrl,
      generatedAt: now,
    });
  } catch (error) {
    return err(500, "Document Generation Failed", error?.message || "Unexpected error generating seller document.");
  }
}
