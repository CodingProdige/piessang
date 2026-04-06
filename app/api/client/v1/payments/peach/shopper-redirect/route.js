export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import https from "https";
const LEGACY_PORTAL_HOST = "client-portal.piessang.com";
const CURRENT_PORTAL_HOST = "piessang.com";
const HOST = "oppwa.com";
const ACCESS_TOKEN = process.env.PEACH_S2S_ACCESS_TOKEN;
const ENTITY_ID = process.env.PEACH_S2S_ENTITY_ID;

const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, ...p }, { status: s });

const err = (s, t, m, x = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...x }, { status: s });

function appendQueryParam(rawUrl, key, value) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const joiner = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(
      value
    )}`;
  }
}

function normalizePortalHost(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (url.hostname === LEGACY_PORTAL_HOST) {
      url.hostname = CURRENT_PORTAL_HOST;
    }
    return url.toString();
  } catch {
    return rawUrl.replace(LEGACY_PORTAL_HOST, CURRENT_PORTAL_HOST);
  }
}

function mapStatus(code = "") {
  if (!code) return "unknown";
  if (code.startsWith("000.000") || code.startsWith("000.100.1")) {
    return "succeeded";
  }
  if (code.startsWith("000.200.000")) {
    return "pending";
  }
  if (!code.startsWith("000.")) {
    return "failed";
  }
  return "pending";
}

function peachGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        port: 443,
        host: HOST,
        path,
        method: "GET",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(raw));
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function handleRedirect(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Database Unavailable", "Admin database is not configured.");
    }
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    let merchantTransactionId = searchParams.get("merchantTransactionId");

    // Peach/browser callbacks may return as POST with form fields.
    if (!merchantTransactionId && req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        merchantTransactionId = body?.merchantTransactionId || null;
      } else if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const form = await req.formData().catch(() => null);
        merchantTransactionId = form?.get("merchantTransactionId") || null;
      }
    }

    if (!merchantTransactionId) {
      return err(
        400,
        "Missing merchantTransactionId",
        "merchantTransactionId is required."
      );
    }

    const snap = await db.collection("peach_redirects").doc(merchantTransactionId).get();

    if (!snap.exists) {
      return err(
        404,
        "Redirect Not Found",
        "No redirect data found for this transaction."
      );
    }

    const data = snap.data() || {};
    const shopperResultUrl = normalizePortalHost(data.shopperResultUrl);
    const paymentId = data.paymentId;
    const orderId = data.orderId || null;
    const orderNumber = data.orderNumber || null;
    const payment = data.payment && typeof data.payment === "object" ? data.payment : null;

    if (!shopperResultUrl || !paymentId) {
      return err(
        409,
        "Redirect Missing Data",
        "shopperResultUrl or paymentId missing."
      );
    }

    const paymentStatusResult = await peachGet(
      `/v1/payments/${encodeURIComponent(paymentId)}?entityId=${encodeURIComponent(ENTITY_ID || "")}`,
    );
    const resultCode = String(paymentStatusResult?.result?.code || "").trim();
    const paymentStatus = mapStatus(resultCode);

    if (paymentStatus === "succeeded" && orderId && payment) {
      const originBase = new URL(req.url).origin;
      const finalizeResponse = await fetch(`${originBase}/api/client/v1/orders/payment-success`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          payment,
        }),
      }).catch(() => null);

      if (!finalizeResponse?.ok) {
        let finalizeMessage = "We couldn't confirm your order payment.";
        try {
          const payload = await finalizeResponse?.json();
          if (payload?.message) {
            finalizeMessage = String(payload.message);
          }
        } catch {
          // Ignore response parsing errors.
        }
        return err(502, "Payment Finalization Failed", finalizeMessage, {
          orderId,
          paymentId,
          merchantTransactionId,
        });
      }
    }

    let redirectUrl = appendQueryParam(shopperResultUrl, "paymentId", paymentId);
    redirectUrl = appendQueryParam(
      redirectUrl,
      "merchantTransactionId",
      merchantTransactionId
    );
    if (orderNumber) {
      redirectUrl = appendQueryParam(redirectUrl, "orderNumber", orderNumber);
    }
    if (orderId) {
      redirectUrl = appendQueryParam(redirectUrl, "orderId", orderId);
    }
    redirectUrl = appendQueryParam(redirectUrl, "paymentStatus", paymentStatus);

    return NextResponse.redirect(redirectUrl, { status: 302 });
  } catch (e) {
    return err(500, "Redirect Error", e?.message || "Server error.");
  }
}

export async function GET(req) {
  return handleRedirect(req);
}

export async function POST(req) {
  return handleRedirect(req);
}
