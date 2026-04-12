export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import {
  consumeSellerShopifyOauthState,
  exchangeShopifyOauthCode,
  getDefaultShopifyWebhookTopics,
  normalizeShopDomain,
  registerSellerShopifyWebhooks,
  saveSellerShopifyConnection,
  updateSellerShopifyConnectionState,
} from "@/lib/integrations/shopify-onboarding";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  const requestUrl = new URL(req.url);

  try {
    const errorParam = toStr(requestUrl.searchParams.get("error"));
    const errorDescription = toStr(requestUrl.searchParams.get("error_description"));
    if (errorParam) {
      const failed = new URL("/seller/dashboard?section=integrations&shopifyError=oauth_denied", req.url);
      failed.searchParams.set("shopifyDetails", errorDescription || errorParam);
      return NextResponse.redirect(failed);
    }

    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) {
      return NextResponse.redirect(new URL("/seller/dashboard?section=integrations&shopifyError=session_required", req.url));
    }

    const state = toStr(requestUrl.searchParams.get("state"));
    const code = toStr(requestUrl.searchParams.get("code"));
    const shop = normalizeShopDomain(requestUrl.searchParams.get("shop"));
    if (!state || !code || !shop) {
      return NextResponse.redirect(new URL("/seller/dashboard?section=integrations&shopifyError=invalid_callback", req.url));
    }

    const savedState = await consumeSellerShopifyOauthState(state);
    if (!savedState) {
      return NextResponse.redirect(new URL("/seller/dashboard?section=integrations&shopifyError=expired_state", req.url));
    }
    if (toStr(savedState?.uid) !== toStr(sessionUser.uid)) {
      return NextResponse.redirect(new URL("/seller/dashboard?section=integrations&shopifyError=state_mismatch", req.url));
    }

    const callbackUrl = new URL("/api/client/v1/accounts/seller/shopify/callback", req.url).toString();
    const oauth = await exchangeShopifyOauthCode({
      shopDomain: shop,
      code,
      redirectUri: callbackUrl,
    });

    const connection = await saveSellerShopifyConnection({
      sellerSlug: toStr(savedState?.seller?.sellerSlug),
      sellerCode: toStr(savedState?.seller?.sellerCode),
      vendorName: toStr(savedState?.seller?.vendorName),
      shopDomain: shop,
      adminAccessToken: oauth.accessToken,
      syncMode: toStr(savedState?.settings?.syncMode || "import_once"),
      importStatus: toStr(savedState?.settings?.importStatus || "draft"),
      autoSyncPriceStock: savedState?.settings?.autoSyncPriceStock !== false,
      autoImportNewProducts: savedState?.settings?.autoImportNewProducts === true,
    });

    let webhookResults = [];
    try {
      const webhookUrl = new URL("/api/client/v1/accounts/seller/shopify/webhook", req.url).toString();
      webhookResults = await registerSellerShopifyWebhooks({
        shopDomain: shop,
        adminAccessToken: oauth.accessToken,
        deliveryUrl: webhookUrl,
        topics: getDefaultShopifyWebhookTopics(),
      });

      await updateSellerShopifyConnectionState({
        sellerSlug: toStr(savedState?.seller?.sellerSlug),
        sellerCode: toStr(savedState?.seller?.sellerCode),
        patch: {
          webhooks: {
            registeredAt: new Date().toISOString(),
            deliveryUrl: webhookUrl,
            topics: webhookResults,
          },
        },
      });
    } catch (webhookError) {
      console.error("shopify webhook registration failed:", webhookError);
      await updateSellerShopifyConnectionState({
        sellerSlug: toStr(savedState?.seller?.sellerSlug),
        sellerCode: toStr(savedState?.seller?.sellerCode),
        patch: {
          webhooks: {
            lastError: toStr(webhookError?.message || "").slice(0, 240),
            lastAttemptAt: new Date().toISOString(),
          },
        },
      });
    }

    const redirectTo = toStr(savedState?.redirectTo) || "/seller/dashboard?section=integrations";
    const redirectUrl = new URL(redirectTo, req.url);
    redirectUrl.searchParams.set("shopifySuccess", "connected");
    redirectUrl.searchParams.set("shop", shop);
    if (connection?.connected && webhookResults.some((row) => row.ok)) {
      redirectUrl.searchParams.set("shopifyDetails", "Shopify connected and webhooks registered.");
    }
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("shopify callback failed:", error);
    const failed = new URL("/seller/dashboard?section=integrations&shopifyError=callback_failed", req.url);
    failed.searchParams.set("shopifyDetails", toStr(error?.message || "").slice(0, 160));
    return NextResponse.redirect(failed);
  }
}
