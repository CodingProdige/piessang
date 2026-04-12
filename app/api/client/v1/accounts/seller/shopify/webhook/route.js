export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  findSellerShopifyConnectionByShopDomain,
  processSellerShopifyWebhookEvent,
  recordSellerShopifyWebhookEvent,
  verifyShopifyWebhookSignature,
} from "@/lib/integrations/shopify-onboarding";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function POST(req) {
  try {
    const rawBody = await req.text();
    await verifyShopifyWebhookSignature(rawBody, req.headers.get("x-shopify-hmac-sha256"));

    const topic = toStr(req.headers.get("x-shopify-topic")).toLowerCase();
    const shopDomain = toStr(req.headers.get("x-shopify-shop-domain")).toLowerCase();
    const webhookId = toStr(req.headers.get("x-shopify-webhook-id"));

    if (!topic || !shopDomain) {
      return err(400, "Invalid Webhook", "Shopify webhook is missing topic or shop domain headers.");
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const connection = await findSellerShopifyConnectionByShopDomain(shopDomain);
    const event = await recordSellerShopifyWebhookEvent({
      topic,
      shopDomain,
      webhookId,
      payload,
      connection,
    });
    const processing = await processSellerShopifyWebhookEvent({
      eventId: event.id,
      topic,
      shopDomain,
      payload,
      connection,
    });

    return ok({
      received: true,
      eventId: event.id,
      connectionFound: event.connected,
      allowedActions: event.allowedActions,
      categoriesManagedInPiessang: true,
      processing,
    });
  } catch (error) {
    console.error("seller shopify webhook failed:", error);
    return err(error?.status || 500, "Shopify Webhook Failed", error?.message || "Unable to process Shopify webhook.", {
      details: toStr(error?.message || "").slice(0, 300),
    });
  }
}
