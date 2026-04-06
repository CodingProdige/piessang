export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { createOrRefreshStripeRecipientOnboardingLink } from "@/lib/seller/stripe-global-payouts";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function resolveAppOrigin(req) {
  const configured =
    toStr(process.env.BASE_URL) ||
    toStr(process.env.NEXT_PUBLIC_BASE_URL) ||
    "";
  const requestOrigin = new URL(req.url).origin;
  return configured || requestOrigin;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    const sellerSlug = toStr(body?.sellerSlug);
    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canManageSellerTeam(requester, sellerSlug)) {
      const systemAccessType = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase();
      if (systemAccessType !== "admin") {
        return err(403, "Access Denied", "You do not have permission to manage this seller payout setup.");
      }
    }

    const sellerOwner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!sellerOwner) {
      return err(404, "Seller Not Found", "Could not find that seller account.");
    }
    const origin = resolveAppOrigin(req);
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    const isLiveStripe = /^sk_live_/i.test(toStr(process.env.STRIPE_SECRET_KEY));
    if (isLocalhost && isLiveStripe) {
      return err(
        400,
        "Stripe Onboarding Failed",
        "Stripe live payout onboarding cannot use localhost return URLs. Set BASE_URL or NEXT_PUBLIC_BASE_URL to your live Piessang domain and try again.",
      );
    }
    const result = await createOrRefreshStripeRecipientOnboardingLink({
      sellerUid: sellerOwner.id,
      sellerSlug,
      returnUrl: `${origin}/seller/dashboard?seller=${encodeURIComponent(sellerSlug)}&section=settings&stripe=return`,
      refreshUrl: `${origin}/seller/dashboard?seller=${encodeURIComponent(sellerSlug)}&section=settings&stripe=refresh`,
    });

    return ok(result);
  } catch (e) {
    return err(e?.status || 500, "Stripe Onboarding Failed", e?.message || "Unable to create a Stripe onboarding link.", {
      details: String(e?.payload?.error?.message || e?.message || "").slice(0, 500),
    });
  }
}
