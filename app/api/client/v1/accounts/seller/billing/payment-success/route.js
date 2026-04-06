export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { SELLER_BILLING_COLLECTION } from "@/lib/seller/billing";
import { clearSellerBillingBlock } from "@/lib/seller/billing-enforcement";
import { createSellerNotification } from "@/lib/notifications/seller-inbox";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to finalize billing payment.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};

    const body = await req.json().catch(() => ({}));
    const billingId = toStr(body?.billingId);
    const sellerSlug = toStr(body?.sellerSlug);
    const sellerCode = toStr(body?.sellerCode);
    const paymentIntentId = toStr(body?.paymentIntentId);
    if (!billingId || !paymentIntentId) return err(400, "Missing Parameters", "billingId and paymentIntentId are required.");

    if (!isSystemAdminUser(requester) && !canAccessSellerSettlement(requester, sellerSlug, sellerCode)) {
      return err(403, "Access Denied", "You do not have access to this seller billing data.");
    }

    const cycleRef = db.collection(SELLER_BILLING_COLLECTION).doc(billingId);
    const cycleSnap = await cycleRef.get();
    if (!cycleSnap.exists) return err(404, "Billing Cycle Not Found", "Could not find that billing cycle.");
    const cycle = cycleSnap.data() || {};

    const amountDueIncl = toNum(cycle?.totals?.amountDueIncl);
    const paymentRecord = {
      id: `pay_${Date.now()}`,
      method: "stripe",
      status: "paid",
      amountIncl: amountDueIncl,
      requestedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      requestedBy: sessionUser.uid,
      reference: paymentIntentId,
      notes: "Seller billing paid immediately by card through Stripe.",
      stripePaymentIntentId: paymentIntentId,
    };

    await cycleRef.set(
      {
        payments: [...(Array.isArray(cycle?.payments) ? cycle.payments : []), paymentRecord],
        status: "settled",
        totals: {
          ...(cycle?.totals || {}),
          amountDueIncl: 0,
        },
        payment: {
          ...(cycle?.payment || {}),
          stripePaymentIntentId: paymentIntentId,
        },
        settledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    await clearSellerBillingBlock({
      sellerSlug: toStr(cycle?.sellerSlug || sellerSlug),
      sellerCode: toStr(cycle?.sellerCode || sellerCode),
      clearedBy: "billing-payment",
    });

    await createSellerNotification({
      sellerCode: toStr(cycle?.sellerCode || sellerCode),
      sellerSlug: toStr(cycle?.sellerSlug || sellerSlug),
      type: "seller-billing-settled",
      title: "Billing settled",
      message: `Your ${toStr(cycle?.billingMonthLabel || "current")} seller bill has been paid and your account access has been restored.`,
      href: toStr(cycle?.sellerSlug || sellerSlug)
        ? `/seller/dashboard?seller=${encodeURIComponent(toStr(cycle?.sellerSlug || sellerSlug))}&section=billing`
        : "/seller/dashboard?section=billing",
      metadata: {
        billingId,
        paymentIntentId,
        amountPaidIncl: amountDueIncl,
      },
    }).catch(() => null);

    return ok({ billingId, payment: paymentRecord, status: "settled" });
  } catch (e) {
    return err(500, "Billing Payment Failed", e?.message || "Unable to finalize billing payment.");
  }
}
