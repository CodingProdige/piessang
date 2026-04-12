export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import {
  createSellerShopifyOauthState,
  getShopifyOauthConfig,
  isShopifyOauthConfigured,
  normalizeShopDomain,
} from "@/lib/integrations/shopify-onboarding";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function requireSellerContext({ sellerSlug = "", sellerCode = "" }) {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) throw new Error("Sign in again to manage Shopify onboarding.");

  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
  if (!requesterSnap.exists) throw new Error("Could not find the requesting account.");

  const requester = requesterSnap.data() || {};
  const sellerIdentifier = toStr(sellerSlug || sellerCode);
  if (!sellerIdentifier) throw new Error("sellerSlug or sellerCode is required.");

  if (!isSystemAdminUser(requester) && !canManageSellerTeam(requester, sellerIdentifier)) {
    throw new Error("You do not have permission to manage this seller's Shopify onboarding.");
  }

  const owner = await findSellerOwnerByIdentifier(sellerIdentifier);
  if (!owner) throw new Error("Could not find a seller account for that identifier.");

  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  return {
    uid: sessionUser.uid,
    sellerSlug: toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug),
    sellerCode: toStr(seller?.sellerCode || seller?.groupSellerCode || sellerCode),
    vendorName: toStr(seller?.vendorName || seller?.groupVendorName || owner.data?.account?.accountName || ""),
  };
}

export async function GET(req) {
  try {
    if (!isShopifyOauthConfigured()) {
      return NextResponse.redirect(new URL("/seller/dashboard?section=integrations&shopifyError=oauth_not_configured", req.url));
    }

    const url = new URL(req.url);
    const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));
    if (!shopDomain) {
      return NextResponse.redirect(new URL("/seller/dashboard?section=integrations&shopifyError=missing_shop", req.url));
    }

    const auth = await requireSellerContext({
      sellerSlug: toStr(url.searchParams.get("sellerSlug")),
      sellerCode: toStr(url.searchParams.get("sellerCode")),
    });

    const callbackUrl = new URL("/api/client/v1/accounts/seller/shopify/callback", req.url);
    const state = await createSellerShopifyOauthState({
      uid: auth.uid,
      sellerSlug: auth.sellerSlug,
      sellerCode: auth.sellerCode,
      vendorName: auth.vendorName,
      shopDomain,
      syncMode: toStr(url.searchParams.get("syncMode") || "import_once"),
      importStatus: toStr(url.searchParams.get("importStatus") || "draft"),
      autoSyncPriceStock: toStr(url.searchParams.get("autoSyncPriceStock") || "true"),
      autoImportNewProducts: toStr(url.searchParams.get("autoImportNewProducts") || "false"),
      redirectTo: `/seller/dashboard?section=integrations&seller=${encodeURIComponent(auth.sellerCode || auth.sellerSlug)}`,
    });

    const config = getShopifyOauthConfig();
    const installUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    installUrl.searchParams.set("client_id", config.clientId);
    installUrl.searchParams.set("scope", config.scopes);
    installUrl.searchParams.set("redirect_uri", callbackUrl.toString());
    installUrl.searchParams.set("state", state);

    return NextResponse.redirect(installUrl);
  } catch (error) {
    console.error("shopify authorize failed:", error);
    const fallback = new URL("/seller/dashboard?section=integrations&shopifyError=authorize_failed", req.url);
    fallback.searchParams.set("shopifyDetails", toStr(error?.message || "").slice(0, 160));
    return NextResponse.redirect(fallback);
  }
}
