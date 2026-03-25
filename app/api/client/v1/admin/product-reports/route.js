export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { collectSellerNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

const PRODUCT_REPORTS_COLLECTION = "product_reports_v1";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isSystemAdminUser(data) {
  return toStr(data?.system?.accessType || data?.systemAccessType).toLowerCase() === "admin";
}

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage product reports.") };
  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };
  const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) return { error: err(403, "Access Denied", "Only system admins can manage product reports.") };
  return { db, requester, sessionUser };
}

function normalizeTimestamp(value) {
  return value && typeof value?.toDate === "function" ? value.toDate().toISOString() : toStr(value);
}

function normalizeReport(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    status: toStr(data?.status || "pending").toLowerCase(),
    reasonCode: toStr(data?.reasonCode || ""),
    reasonLabel: toStr(data?.reasonLabel || ""),
    reportMessage: toStr(data?.reportMessage || ""),
    product: {
      id: toStr(data?.product?.id || ""),
      title: toStr(data?.product?.title || ""),
      sellerSlug: toStr(data?.product?.sellerSlug || ""),
      sellerCode: toStr(data?.product?.sellerCode || ""),
      vendorName: toStr(data?.product?.vendorName || ""),
      uniqueId: toStr(data?.product?.uniqueId || ""),
    },
    reporter: {
      uid: toStr(data?.reporter?.uid || ""),
      name: toStr(data?.reporter?.name || ""),
      email: toStr(data?.reporter?.email || ""),
    },
    dispute: {
      status: toStr(data?.dispute?.status || ""),
      message: toStr(data?.dispute?.message || ""),
      createdAt: normalizeTimestamp(data?.dispute?.createdAt),
      createdBy: toStr(data?.dispute?.createdBy || ""),
    },
    resolution: {
      action: toStr(data?.resolution?.action || ""),
      note: toStr(data?.resolution?.note || ""),
      blockedAt: normalizeTimestamp(data?.resolution?.blockedAt),
      blockedBy: toStr(data?.resolution?.blockedBy || ""),
      resolvedAt: normalizeTimestamp(data?.resolution?.resolvedAt),
      resolvedBy: toStr(data?.resolution?.resolvedBy || ""),
    },
    createdAt: normalizeTimestamp(data?.timestamps?.createdAt || data?.createdAtIso),
    updatedAt: normalizeTimestamp(data?.timestamps?.updatedAt || ""),
  };
}

export async function GET(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = toStr(searchParams.get("status"), "pending").toLowerCase();
    const snap = status === "all"
      ? await auth.db.collection(PRODUCT_REPORTS_COLLECTION).get()
      : await auth.db.collection(PRODUCT_REPORTS_COLLECTION).where("status", "==", status).get();
    const items = snap.docs.map(normalizeReport).sort((left, right) => {
      return (right.updatedAt || right.createdAt || "").localeCompare(left.updatedAt || left.createdAt || "");
    });
    return ok({ count: items.length, items });
  } catch (e) {
    console.error("admin/product-reports get failed:", e);
    return err(500, "Unexpected Error", "Unable to load product reports.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const reportId = toStr(body?.reportId || body?.id);
    const action = toStr(body?.action).toLowerCase();
    const note = toStr(body?.note || body?.message);
    if (!reportId) return err(400, "Missing Report", "Choose a product report first.");
    if (!["dismiss", "block", "restore"].includes(action)) return err(400, "Invalid Action", "Action must be dismiss, block, or restore.");

    const reportRef = auth.db.collection(PRODUCT_REPORTS_COLLECTION).doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) return err(404, "Not Found", "Unable to find that product report.");
    const report = reportSnap.data() || {};
    const productId = toStr(report?.product?.id || "");
    if (!productId) return err(400, "Missing Product", "This report is missing product data.");

    const productRef = auth.db.collection("products_v2").doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return err(404, "Product Not Found", "Unable to find the reported product.");
    const product = productSnap.data() || {};
    const vendorName = toStr(report?.product?.vendorName || product?.product?.vendorName || "Bevgo seller");
    const sellerSlug = toStr(report?.product?.sellerSlug || product?.seller?.sellerSlug || product?.product?.sellerSlug);
    const fulfillmentMode = toStr(product?.fulfillment?.mode || "seller").toLowerCase();
    const statusLabel = action === "block" ? "Blocked" : action === "restore" ? "Restored" : "Report resolved";

    if (action === "block" || action === "restore") {
      const nextPlacement = {
        ...(product?.placement && typeof product.placement === "object" ? product.placement : {}),
        isActive: action === "restore"
          ? toStr(product?.moderation?.status).toLowerCase() !== "awaiting_stock"
          : false,
      };
      const nextModerationStatus =
        action === "block"
          ? "blocked"
          : fulfillmentMode === "bevgo"
            ? "awaiting_stock"
            : "published";
      await productRef.update({
        placement: nextPlacement,
        moderation: {
          ...(product?.moderation && typeof product.moderation === "object" ? product.moderation : {}),
          status: nextModerationStatus,
          reason: action === "block" ? note || "Blocked after a customer product report review." : null,
          notes: action === "block" ? note || "Blocked after a customer product report review." : "Product restored after product report review.",
          reviewedAt: new Date().toISOString(),
          reviewedBy: auth.sessionUser.uid,
        },
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });

      if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
        const recipients = await collectSellerNotificationEmails({
          sellerSlug,
          fallbackEmails: [product?.seller?.contactEmail, product?.email].filter(Boolean),
        });
        if (recipients.length) {
          await sendSellerNotificationEmails({
            origin: new URL(req.url).origin,
            type: "seller-product-status",
            to: recipients,
            data: {
              vendorName,
              productTitle: toStr(report?.product?.title || product?.product?.title || "Product"),
              statusLabel,
              fulfillmentLabel: fulfillmentMode === "bevgo" ? "Piessang fulfils" : "Seller fulfils",
              reason: action === "block" ? note || "A product report was upheld during review." : "The product has been restored after review.",
              nextStep:
                action === "block"
                  ? "The product has been hidden from the marketplace. Review the issue and submit a dispute from the product editor if you want Piessang to reassess the listing."
                  : "The product has been restored on the marketplace.",
            },
          });
        }
      }
    }

    await reportRef.set({
      status: action === "dismiss" ? "resolved" : action === "block" ? "blocked" : "resolved",
      resolution: {
        action,
        note,
        blockedAt: action === "block" ? new Date().toISOString() : null,
        blockedBy: action === "block" ? auth.sessionUser.uid : null,
        resolvedAt: new Date().toISOString(),
        resolvedBy: auth.sessionUser.uid,
      },
      timestamps: {
        ...(report?.timestamps && typeof report.timestamps === "object" ? report.timestamps : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });

    return ok({ message: action === "block" ? "Product blocked." : action === "restore" ? "Product restored." : "Product report dismissed." });
  } catch (e) {
    console.error("admin/product-reports update failed:", e);
    return err(500, "Unexpected Error", "Unable to update the product report.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
