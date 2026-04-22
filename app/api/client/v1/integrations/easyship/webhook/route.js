export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { syncEasyshipShipmentById } from "@/lib/orders/easyship-sync";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message) => NextResponse.json({ ok: false, title, message }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function collectShipmentIds(payload) {
  const ids = new Set();
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      const shipmentId =
        toStr(value?.easyship_shipment_id) ||
        toStr(value?.shipment_id) ||
        toStr(value?.easyshipShipmentId) ||
        toStr(value?.shipmentId);
      if (shipmentId) ids.add(shipmentId);
      Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return Array.from(ids);
}

function verifyWebhookSignature(rawBody, req) {
  const secret = toStr(process.env.EASYSHIP_WEBHOOK_SECRET);
  if (!secret) return true;

  const directToken =
    toStr(req.headers.get("x-easyship-secret")) ||
    toStr(req.headers.get("x-webhook-secret")) ||
    toStr(req.headers.get("authorization")).replace(/^Bearer\s+/i, "") ||
    toStr(new URL(req.url).searchParams.get("secret"));
  if (directToken && directToken === secret) return true;

  const provided =
    toStr(req.headers.get("x-easyship-signature")) ||
    toStr(req.headers.get("x-easyship-hmac-sha256")) ||
    toStr(req.headers.get("x-hmac-signature"));
  if (!provided) return false;

  const hexDigest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const base64Digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return provided === hexDigest || provided === base64Digest;
}

export async function POST(req) {
  try {
    const rawBody = await req.text();
    if (!verifyWebhookSignature(rawBody, req)) {
      return err(401, "Unauthorized", "Webhook signature validation failed.");
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const eventName =
      toStr(payload?.event) ||
      toStr(payload?.type) ||
      toStr(payload?.topic) ||
      toStr(payload?.name);

    const shipmentIds = collectShipmentIds(payload);
    if (!shipmentIds.length) {
      return ok({ received: true, synced: 0, skipped: "no_shipment_ids" });
    }

    const results = [];
    for (const shipmentId of shipmentIds) {
      results.push(await syncEasyshipShipmentById({
        shipmentId,
        originBase: new URL(req.url).origin,
        eventName,
      }));
    }

    return ok({
      received: true,
      event: eventName || null,
      synced: results.filter((entry) => entry?.ok).length,
      results,
    });
  } catch (error) {
    return err(500, "Webhook Failed", error instanceof Error ? error.message : "Unknown webhook error.");
  }
}
