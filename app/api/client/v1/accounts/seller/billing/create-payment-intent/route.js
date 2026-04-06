export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { SELLER_BILLING_COLLECTION } from "@/lib/seller/billing";
import { ensureStripeCustomer, getStripePublishableKey, stripeRequest } from "@/lib/payments/stripe";

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
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to prepare billing payment.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};

    const body = await req.json().catch(() => ({}));
    const billingId = toStr(body?.billingId);
    const sellerSlug = toStr(body?.sellerSlug);
    const sellerCode = toStr(body?.sellerCode);
    if (!billingId) return err(400, "Missing Billing Cycle", "billingId is required.");

    if (!isSystemAdminUser(requester) && !canAccessSellerSettlement(requester, sellerSlug, sellerCode)) {
      return err(403, "Access Denied", "You do not have access to this seller billing data.");
    }

    const publishableKey = getStripePublishableKey();
    if (!publishableKey) return err(500, "Stripe Not Configured", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required.");

    const cycleRef = db.collection(SELLER_BILLING_COLLECTION).doc(billingId);
    const cycleSnap = await cycleRef.get();
    if (!cycleSnap.exists) return err(404, "Billing Cycle Not Found", "Could not find that billing cycle.");
    const cycle = cycleSnap.data() || {};

    const amountDueIncl = toNum(cycle?.totals?.amountDueIncl);
    if (amountDueIncl <= 0) return err(409, "Nothing Due", "This billing cycle does not have an outstanding amount.");
    if (["settled", "paid"].includes(toStr(cycle?.status).toLowerCase())) {
      return err(409, "Already Settled", "This billing cycle is already settled.");
    }

    const customerId = await ensureStripeCustomer({
      db,
      userId: sessionUser.uid,
      email: toStr(requester?.email || requester?.account?.email || ""),
      name: toStr(requester?.accountName || requester?.sellerVendorName || requester?.personal?.fullName || ""),
      phone: toStr(requester?.phoneNumber || requester?.personal?.phoneNumber || ""),
    });

    const form = new URLSearchParams();
    form.set("amount", String(Math.round(amountDueIncl * 100)));
    form.set("currency", "zar");
    form.set("customer", customerId);
    form.set("confirmation_method", "automatic");
    form.set("capture_method", "automatic");
    form.set("metadata[billingId]", billingId);
    form.set("metadata[sellerCode]", toStr(cycle?.sellerCode || sellerCode));
    form.set("metadata[sellerSlug]", toStr(cycle?.sellerSlug || sellerSlug));
    form.set("metadata[vendorName]", toStr(cycle?.vendorName || ""));
    form.set("metadata[paymentType]", "seller_billing");

    const intent = await stripeRequest("/v1/payment_intents", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    await cycleRef.set(
      {
        payment: {
          stripeCustomerId: customerId,
          stripePaymentIntentId: toStr(intent?.id || "") || null,
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return ok({
      billingId,
      publishableKey,
      customerId,
      paymentIntentId: toStr(intent?.id || ""),
      clientSecret: toStr(intent?.client_secret || ""),
      amountDueIncl,
    });
  } catch (error) {
    return err(error?.status || 500, "Stripe Intent Failed", error?.message || "Unable to prepare billing payment.", {
      error: error?.payload || null,
    });
  }
}
