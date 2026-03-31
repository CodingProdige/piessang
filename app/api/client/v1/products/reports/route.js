export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { collectSystemAdminNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

const PRODUCT_REPORTS_COLLECTION = "product_reports_v1";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeReasonLabel(code) {
  const normalized = toStr(code).toLowerCase();
  switch (normalized) {
    case "counterfeit":
      return "Counterfeit or fake item";
    case "wrong_listing":
      return "Wrong or misleading listing";
    case "restricted":
      return "Restricted or unsafe product";
    case "pricing":
      return "Suspicious pricing";
    case "content":
      return "Offensive or poor content";
    default:
      return "Other issue";
  }
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const sessionUser = await requireSessionUser().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === "object" ? body.data : body;
    const productId = toStr(payload?.productId || payload?.unique_id || payload?.id);
    const reasonCode = toStr(payload?.reasonCode || "other").toLowerCase();
    const message = toStr(payload?.message || payload?.details);
    const reporterName = toStr(payload?.reporterName || payload?.name || sessionUser?.displayName);
    const reporterEmail = toStr(payload?.reporterEmail || payload?.email || sessionUser?.email);

    if (!productId) return err(400, "Missing Product", "Choose a product to report.");
    if (!message && !reasonCode) return err(400, "Missing Reason", "Tell us what is wrong with the product.");
    if (!sessionUser?.uid && !reporterEmail) {
      return err(400, "Missing Email", "Add your email address so we can follow up if needed.");
    }

    const productSnap = await db.collection("products_v2").doc(productId).get();
    if (!productSnap.exists) return err(404, "Not Found", "We could not find that product.");
    const product = productSnap.data() || {};
    const vendorName = toStr(product?.product?.vendorName || product?.seller?.vendorName || product?.vendor?.title || "Piessang seller");
    const sellerSlug = toStr(product?.seller?.sellerSlug || product?.seller?.activeSellerSlug || product?.seller?.groupSellerSlug || product?.product?.sellerSlug);
    const productTitle = toStr(product?.product?.title || "Untitled product");

    const docRef = db.collection(PRODUCT_REPORTS_COLLECTION).doc();
    const nowIso = new Date().toISOString();
    await docRef.set({
      id: docRef.id,
      status: "pending",
      reasonCode,
      reasonLabel: normalizeReasonLabel(reasonCode),
      reportMessage: message,
      product: {
        id: productId,
        title: productTitle,
        uniqueId: toStr(product?.product?.unique_id || productId),
        sellerSlug,
        sellerCode: toStr(product?.seller?.sellerCode || product?.product?.sellerCode),
        vendorName,
      },
      reporter: {
        uid: toStr(sessionUser?.uid),
        name: reporterName,
        email: reporterEmail,
      },
      dispute: null,
      resolution: null,
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      createdAtIso: nowIso,
    });

    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const recipients = await collectSystemAdminNotificationEmails({ fallbackEmails: ["support@piessang.com"] });
      if (recipients.length) {
        await sendSellerNotificationEmails({
          origin: new URL(req.url).origin,
          type: "product-report-internal",
          to: recipients,
          data: {
            productId,
            productTitle,
            vendorName,
            reasonLabel: normalizeReasonLabel(reasonCode),
            reporterUid: toStr(sessionUser?.uid),
            reporterName,
            reporterEmail,
            reportMessage: message,
          },
        });
      }
    }

    return ok({ message: "Thanks. Your report has been sent to Piessang for review.", reportId: docRef.id });
  } catch (e) {
    console.error("product report submit failed:", e);
    return err(500, "Unexpected Error", "Unable to submit the product report.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
