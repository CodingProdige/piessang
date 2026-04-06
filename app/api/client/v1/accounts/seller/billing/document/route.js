export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import axios from "axios";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { SELLER_BILLING_COLLECTION, computeSellerBillingCycle, saveSellerBillingCycle } from "@/lib/seller/billing";
import { buildSellerBillingDocumentPayload, renderSellerBillingDocumentHtml } from "@/lib/seller/billing-documents";

const CLOUD_FUNCTION_URL = "https://generatepdf-th2kiymgaa-uc.a.run.app";
const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to create billing documents.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};

    const body = await req.json().catch(() => ({}));
    const billingId = toStr(body?.billingId);
    const sellerSlug = toStr(body?.sellerSlug);
    const sellerCode = toStr(body?.sellerCode);
    const vendorName = toStr(body?.vendorName);
    const monthKey = toStr(body?.monthKey);
    const docType = toStr(body?.docType).toLowerCase();

    if (!["invoice", "statement"].includes(docType)) return err(400, "Invalid Document", "docType must be invoice or statement.");
    if (!isSystemAdminUser(requester) && !canAccessSellerSettlement(requester, sellerSlug, sellerCode)) {
      return err(403, "Access Denied", "You do not have access to this seller billing data.");
    }

    let cycleSnap = billingId ? await db.collection(SELLER_BILLING_COLLECTION).doc(billingId).get() : null;
    let cycle = cycleSnap?.exists ? { billingId: cycleSnap.id, ...(cycleSnap.data() || {}) } : null;
    if (!cycle && monthKey) {
      const computed = await computeSellerBillingCycle({ sellerSlug, sellerCode, vendorName, monthKey });
      cycle = await saveSellerBillingCycle(computed);
    }
    if (!cycle) return err(404, "Billing Cycle Not Found", "Could not find that billing cycle.");

    const payload = buildSellerBillingDocumentPayload(cycle, docType === "invoice" ? "invoice" : "statement", new URL(req.url).origin);
    const htmlContent = renderSellerBillingDocumentHtml(docType === "invoice" ? "invoice" : "statement", payload);
    const fileName = `${docType}-${payload.cycle.invoiceNumber || payload.cycle.monthKey || "billing"}`;
    const pdfResponse = await axios.post(CLOUD_FUNCTION_URL, { htmlContent, fileName });
    const pdfUrl = toStr(pdfResponse?.data?.pdfUrl);
    if (!pdfUrl) return err(502, "PDF Failed", "Document generation did not return a PDF URL.");

    const now = new Date().toISOString();
    const updateKey = docType === "invoice" ? "invoiceUrl" : "statementUrl";
    await db.collection(SELLER_BILLING_COLLECTION).doc(toStr(cycle.billingId || billingId)).set(
      {
        invoice: {
          ...(cycle.invoice || {}),
          [updateKey]: pdfUrl,
          [`${docType}GeneratedAt`]: now,
        },
        updatedAt: now,
      },
      { merge: true },
    );

    return ok({ url: pdfUrl, docType, billingId: toStr(cycle.billingId || billingId), generatedAt: now });
  } catch (e) {
    return err(500, "Document Generation Failed", e?.message || "Unable to create billing document.");
  }
}

