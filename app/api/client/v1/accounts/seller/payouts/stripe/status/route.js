export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getStripeRecipientAccountSummary } from "@/lib/seller/stripe-global-payouts";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function mapVerificationStatus(summary) {
  if (summary?.payoutsEnabled || toStr(summary?.status).toLowerCase() === "ready") return "verified";
  if (toStr(summary?.status).toLowerCase() === "action_required") return "failed";
  if (summary?.detailsSubmitted || toStr(summary?.status).toLowerCase() === "submitted") return "pending";
  if (toStr(summary?.status).toLowerCase() === "pending") return "pending";
  return "not_submitted";
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const { searchParams } = new URL(req.url);
    const uid = toStr(searchParams.get("uid"));
    const sellerSlug = toStr(searchParams.get("sellerSlug"));
    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!canManageSellerTeam(requester, sellerSlug)) {
      const systemAccessType = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase();
      if (systemAccessType !== "admin") {
        return err(403, "Access Denied", "You do not have permission to view this seller payout setup.");
      }
    }

    const sellerOwner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!sellerOwner) return err(404, "Seller Not Found", "Could not find that seller account.");

    const payoutProfile = sellerOwner.data?.seller?.payoutProfile || {};
    const stripeRecipientAccountId = toStr(payoutProfile?.stripeRecipientAccountId);
    if (!stripeRecipientAccountId) {
      return ok({
        connected: false,
        status: "not_started",
      });
    }

    const summary = await getStripeRecipientAccountSummary(stripeRecipientAccountId);
    const now = new Date().toISOString();
    const verificationStatus = mapVerificationStatus(summary);

    await db.collection("users").doc(sellerOwner.id).set(
      {
        seller: {
          payoutProfile: {
            stripeRecipientAccountId,
            stripeRecipientCountry: toStr(summary?.country || payoutProfile?.stripeRecipientCountry),
            stripeRecipientEntityType: toStr(summary?.entityType || payoutProfile?.stripeRecipientEntityType),
            verificationStatus,
            verificationNotes:
              summary?.payoutsEnabled
                ? "Stripe recipient is ready for automated payouts."
                : Array.isArray(summary?.currentlyDue) && summary.currentlyDue.length
                ? `Stripe still needs: ${summary.currentlyDue.join(", ")}`
                : Array.isArray(summary?.pendingVerification) && summary.pendingVerification.length
                  ? `Stripe is verifying: ${summary.pendingVerification.join(", ")}`
                  : "",
            lastVerifiedAt: now,
          },
        },
        timestamps: {
          updatedAt: now,
        },
      },
      { merge: true },
    );

    return ok({
      connected: true,
      ...summary,
    });
  } catch (e) {
    return err(e?.status || 500, "Stripe Status Failed", e?.message || "Unable to load Stripe payout status.", {
      details: String(e?.payload?.error?.message || e?.message || "").slice(0, 500),
    });
  }
}
