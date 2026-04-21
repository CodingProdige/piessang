export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import {
  getSellerShopifyConnection,
  getDefaultShopifyWebhookTopics,
  getValidSellerShopifyAccessToken,
  registerSellerShopifyWebhooks,
  importSelectedSellerShopifyProducts,
  prepareSellerShopifyImport,
  saveSellerShopifyConnection,
  updateSellerShopifyConnectionState,
  verifyShopifyConnection,
  listShopifyPreviewProducts,
  normalizeShopDomain,
} from "@/lib/integrations/shopify-onboarding";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function requireSellerContext({ sellerSlug = "", sellerCode = "" }) {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) {
    return { error: err(401, "Unauthorized", "Sign in again to manage Shopify onboarding.") };
  }

  const db = getAdminDb();
  if (!db) {
    return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };
  }

  const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
  if (!requesterSnap.exists) {
    return { error: err(404, "User Not Found", "Could not find the requesting account.") };
  }

  const requester = requesterSnap.data() || {};
  const sellerIdentifier = toStr(sellerSlug || sellerCode);
  if (!sellerIdentifier) {
    return { error: err(400, "Missing Seller", "sellerSlug or sellerCode is required.") };
  }

  if (!isSystemAdminUser(requester) && !canManageSellerTeam(requester, sellerIdentifier)) {
    return { error: err(403, "Access Denied", "You do not have permission to manage this seller's Shopify onboarding.") };
  }

  const owner = await findSellerOwnerByIdentifier(sellerIdentifier);
  if (!owner) {
    return { error: err(404, "Seller Not Found", "Could not find a seller account for that identifier.") };
  }

  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  const resolvedSellerSlug = toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug);
  const resolvedSellerCode = toStr(seller?.sellerCode || seller?.groupSellerCode || sellerCode);
  const vendorName = toStr(seller?.vendorName || seller?.groupVendorName || owner.data?.account?.accountName || "");

  return {
    sessionUser,
    requester,
    owner,
    seller: {
      sellerSlug: resolvedSellerSlug,
      sellerCode: resolvedSellerCode,
      vendorName,
    },
  };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const sellerSlug = toStr(url.searchParams.get("sellerSlug"));
    const sellerCode = toStr(url.searchParams.get("sellerCode"));
    const auth = await requireSellerContext({ sellerSlug, sellerCode });
    if (auth.error) return auth.error;

    const connection = await getSellerShopifyConnection({
      sellerSlug: auth.seller.sellerSlug,
      sellerCode: auth.seller.sellerCode,
    });

    return ok({
      seller: auth.seller,
      connection,
    });
  } catch (e) {
    console.error("seller/shopify get failed:", e);
    return err(500, "Unexpected Error", "Unable to load the Shopify onboarding workspace.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = toStr(body?.action).toLowerCase();
    const auth = await requireSellerContext({
      sellerSlug: toStr(body?.sellerSlug),
      sellerCode: toStr(body?.sellerCode),
    });
    if (auth.error) return auth.error;

    if (action === "verify_connection") {
      const shopDomain = normalizeShopDomain(body?.shopDomain);
      const adminAccessToken = toStr(body?.adminAccessToken);
      if (!shopDomain || !adminAccessToken) {
        return err(400, "Missing Shopify Credentials", "Enter the Shopify shop domain and admin access token first.");
      }

      const verification = await verifyShopifyConnection({ shopDomain, adminAccessToken });
      const previewProducts = await listShopifyPreviewProducts({ shopDomain, adminAccessToken, limit: 12 });
      return ok({
        verification,
        preview: {
          totals: {
            products: previewProducts.length,
            variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
          },
          products: previewProducts,
        },
      });
    }

    if (action === "save_setup") {
      const shopDomain = normalizeShopDomain(body?.shopDomain);
      const adminAccessToken = toStr(body?.adminAccessToken);
      if (!shopDomain || !adminAccessToken) {
        return err(400, "Missing Shopify Credentials", "Enter the Shopify shop domain and admin access token before saving.");
      }

      const connection = await saveSellerShopifyConnection({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
        vendorName: auth.seller.vendorName,
        shopDomain,
        adminAccessToken,
        syncMode: toStr(body?.syncMode || "import_once"),
        importStatus: toStr(body?.importStatus || "draft"),
        autoSyncPriceStock: body?.autoSyncPriceStock === true,
        autoImportNewProducts: body?.autoImportNewProducts === true,
      });
      return ok({
        message: "Shopify store connected and preview refreshed.",
        connection,
      });
    }

    if (action === "prepare_import") {
      const job = await prepareSellerShopifyImport({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
      });
      const connection = await getSellerShopifyConnection({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
      });
      return ok({
        message: "Draft import prepared from the latest Shopify preview.",
        job,
        connection,
      });
    }

    if (action === "import_selected_products") {
      const result = await importSelectedSellerShopifyProducts({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
        vendorName: auth.seller.vendorName,
        jobId: toStr(body?.jobId),
        productIds: Array.isArray(body?.productIds) ? body.productIds : [],
      });
      const connection = await getSellerShopifyConnection({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
      });
      return ok({
        message: result.createdProducts.length
          ? `Imported ${result.createdProducts.length} Shopify product${result.createdProducts.length === 1 ? "" : "s"} into Piessang.`
          : "No new Shopify products were imported because the selected items already exist in Piessang.",
        ...result,
        connection,
      });
    }

    if (action === "disconnect") {
      const existing = await getSellerShopifyConnection({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
      });
      if (!existing) {
        return ok({
          message: "Shopify integration already disconnected.",
          connection: null,
        });
      }

      const connection = await updateSellerShopifyConnectionState({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
        patch: {
          connected: false,
          tokenMasked: "",
          lastError: "",
          verifiedAt: "",
          accessTokenExpiresAt: "",
          refreshTokenExpiresAt: "",
          lastWebhookAt: "",
          lastWebhookTopic: "",
          lastSyncSummary: null,
          webhooks: null,
          lastPreview: {
            fetchedAt: "",
            totals: {},
            products: [],
          },
          secret: {
            adminAccessToken: "",
            refreshToken: "",
          },
        },
      });

      return ok({
        message: "Shopify integration disconnected. Piessang sync is now stopped until you reconnect.",
        connection,
      });
    }

    if (action === "retry_webhooks") {
      const existing = await getSellerShopifyConnection({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
      });
      if (!existing?.connected || !existing?.shopDomain) {
        return err(400, "Not Connected", "Connect Shopify first before retrying webhook registration.");
      }

      const token = await getValidSellerShopifyAccessToken({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
      });
      const webhookUrl = new URL("/api/client/v1/accounts/seller/shopify/webhook", req.url).toString();
      const webhookResults = await registerSellerShopifyWebhooks({
        shopDomain: existing.shopDomain,
        adminAccessToken: token,
        deliveryUrl: webhookUrl,
        topics: getDefaultShopifyWebhookTopics(),
      });

      const connection = await updateSellerShopifyConnectionState({
        sellerSlug: auth.seller.sellerSlug,
        sellerCode: auth.seller.sellerCode,
        patch: {
          webhooks: {
            registeredAt: new Date().toISOString(),
            deliveryUrl: webhookUrl,
            topics: webhookResults,
            lastError: webhookResults.some((row) => !row.ok)
              ? webhookResults.flatMap((row) => row.errors || []).map((item) => toStr(item?.message)).filter(Boolean).join(" | ").slice(0, 240)
              : "",
            lastAttemptAt: new Date().toISOString(),
          },
        },
      });

      return ok({
        message: webhookResults.some((row) => row.ok)
          ? "Shopify webhooks registered successfully."
          : "Shopify webhook registration still needs attention.",
        connection,
      });
    }

    return err(400, "Invalid Action", "Supported actions are verify_connection, save_setup, prepare_import, disconnect, and retry_webhooks.");
  } catch (e) {
    console.error("seller/shopify update failed:", e);
    return err(500, "Unexpected Error", "Unable to update Shopify onboarding.", {
      details: String(e?.message || "").slice(0, 600),
    });
  }
}
