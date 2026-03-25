export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getServerAuthBootstrap } from "@/lib/auth/server";
import { collectSystemAdminNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

const PRODUCT_REPORTS_COLLECTION = "product_reports_v1";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeKey(value) {
  return toStr(value).toLowerCase();
}

function buildAllowedSellerKeys(profile) {
  const keys = new Set();
  const add = (value) => {
    const normalized = normalizeKey(value);
    if (normalized) keys.add(normalized);
  };
  add(profile?.sellerSlug);
  add(profile?.sellerCode);
  add(profile?.sellerActiveSellerSlug);
  const managedAccounts = Array.isArray(profile?.sellerManagedAccounts) ? profile.sellerManagedAccounts : [];
  for (const item of managedAccounts) {
    add(item?.sellerSlug);
    add(item?.sellerCode);
  }
  return keys;
}

function canManageProduct(profile, { sellerSlug, sellerCode }) {
  if (normalizeKey(profile?.systemAccessType) === "admin") return true;
  if (!profile?.uid || profile?.isSeller !== true) return false;
  const allowedKeys = buildAllowedSellerKeys(profile);
  return allowedKeys.has(normalizeKey(sellerSlug)) || allowedKeys.has(normalizeKey(sellerCode));
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const auth = await getServerAuthBootstrap();
    const profile = auth?.profile || null;
    if (!profile?.uid) return err(401, "Unauthorized", "Sign in again to dispute this block.");

    const body = await req.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === "object" ? body.data : body;
    let reportId = toStr(payload?.reportId || payload?.id);
    const productId = toStr(payload?.productId || payload?.unique_id);
    const message = toStr(payload?.message || payload?.notes);
    if (!reportId && !productId) return err(400, "Missing Report", "Choose the blocked report you want to dispute.");
    if (!message) return err(400, "Missing Message", "Tell Piessang why this product should be restored.");

    let reportRef = db.collection(PRODUCT_REPORTS_COLLECTION).doc(reportId || "__missing__");
    let reportSnap = reportId ? await reportRef.get() : null;
    if ((!reportSnap || !reportSnap.exists) && productId) {
      const reportQuery = await db
        .collection(PRODUCT_REPORTS_COLLECTION)
        .where("product.id", "==", productId)
        .get();
      reportSnap = reportQuery.docs.find((docSnap) => {
        const data = docSnap.data() || {};
        const status = toStr(data?.status).toLowerCase();
        return status === "blocked" || status === "disputed";
      }) || null;
      reportRef = reportSnap?.ref || reportRef;
      reportId = reportSnap?.id || "";
    }
    if (!reportSnap || !reportSnap.exists) return err(404, "Not Found", "Unable to find that product report.");
    const report = reportSnap.data() || {};
    const sellerSlug = toStr(report?.product?.sellerSlug || "");
    const sellerCode = toStr(report?.product?.sellerCode || "");
    if (!canManageProduct(profile, { sellerSlug, sellerCode })) {
      return err(403, "Access Denied", "You can only dispute reports for products you manage.");
    }

    await reportRef.set({
      status: "disputed",
      dispute: {
        status: "pending",
        message,
        createdAt: new Date().toISOString(),
        createdBy: profile.uid,
      },
      timestamps: {
        ...(report?.timestamps && typeof report.timestamps === "object" ? report.timestamps : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });

    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const recipients = await collectSystemAdminNotificationEmails({ fallbackEmails: ["info@bevgo.co.za"] });
      if (recipients.length) {
        await sendSellerNotificationEmails({
          origin: new URL(req.url).origin,
          type: "product-report-dispute-internal",
          to: recipients,
          data: {
            reportId,
            productId: toStr(report?.product?.id || ""),
            productTitle: toStr(report?.product?.title || "Product"),
            vendorName: toStr(report?.product?.vendorName || profile?.sellerVendorName || "Bevgo seller"),
            sellerSlug,
            disputeMessage: message,
          },
        });
      }
    }

    return ok({ message: "Your dispute has been sent to Piessang for review." });
  } catch (e) {
    console.error("product report dispute failed:", e);
    return err(500, "Unexpected Error", "Unable to submit the dispute.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
