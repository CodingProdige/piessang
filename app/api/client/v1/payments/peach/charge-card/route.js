export const runtime = "nodejs";

import { NextResponse } from "next/server";
import https from "https";
import querystring from "querystring";
import { getAdminDb } from "@/lib/firebase/admin";
import crypto from "crypto";

/* ───────── HELPERS ───────── */

const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, ...p }, { status: s });

const err = (s, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status: s });

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

/* ───────── ENV ───────── */

const HOST = "oppwa.com";
const ENTITY_ID = process.env.PEACH_S2S_ENTITY_ID;
const ACCESS_TOKEN = process.env.PEACH_S2S_ACCESS_TOKEN;
const DEFAULT_SHOPPER_RESULT_URL =
  process.env.PEACH_SHOPPER_RESULT_URL || "https://pay.piessang.com/3ds/complete";
const BASE_URL = process.env.BASE_URL;
const LEGACY_PORTAL_HOST = "client-portal.piessang.com";
const CURRENT_PORTAL_HOST = "piessang.com";

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

function getQueryParam(rawUrl, key) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return url.searchParams.get(key);
  } catch {
    return null;
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

/* ───────── VALIDATE CONFIG ───────── */

function ensureConfig() {
  if (!ENTITY_ID || !ACCESS_TOKEN) {
    throw new Error("ENTITY_ID or ACCESS_TOKEN not configured");
  }
}

/* ───────── PEACH REQUEST (ALIGNED) ───────── */

function peachRequest(path, form) {
  const body = querystring.stringify(form);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        port: 443,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${ACCESS_TOKEN}`
        }
      },
      res => {
        const buf = [];
        res.on("data", c => buf.push(c));
        res.on("end", () => {
          const text = Buffer.concat(buf).toString("utf8");

          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(
              new Error(
                `Gateway returned invalid JSON: ${text?.slice(0, 200) || ""}`
              )
            );
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/* ───────── ENDPOINT ───────── */

export async function POST(req) {
  try {
    ensureConfig();
    const db = getAdminDb();
    if (!db) {
      return err(500, "Database Unavailable", "Admin database is not configured.");
    }

    const {
      userId,
      amount,
      currency,
      merchantTransactionId,
      card,
      billing,
      customer,
      shopperResultUrl,
      saveCard = true
    } = await req.json();

    if (!userId || !amount || !currency || !merchantTransactionId || !card) {
      return err(400, "Missing Information", "Please check your payment details.");
    }

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      return err(404, "User Not Found", "User does not exist.");
    }

    const user = snap.data();
    const cards = user.paymentMethods?.cards || [];

    /* ───── BUILD PEACH PAYLOAD ───── */

    const shopperResultUrlBase = normalizePortalHost(
      shopperResultUrl || DEFAULT_SHOPPER_RESULT_URL
    );

    if (!BASE_URL) {
      return err(
        500,
        "Config Error",
        "BASE_URL is required to build shopper redirect URL."
      );
    }

    const formattedAmount = Number(amount).toFixed(2);

    const orderSnap = await db
      .collection("orders_v2")
      .where("order.merchantTransactionId", "==", merchantTransactionId)
      .limit(1)
      .get();

    if (orderSnap.empty) {
      return err(404, "Order Not Found", "No order matches this transaction.");
    }

    const orderDoc = orderSnap.docs[0];
    const orderData = orderDoc.data() || {};
    const orderCustomerId =
      orderData?.meta?.orderedFor ||
      orderData?.order?.customerId ||
      orderData?.customer_snapshot?.customerId ||
      null;
    if (orderCustomerId && String(orderCustomerId) !== String(userId)) {
      return err(403, "Forbidden", "You cannot pay for another customer's order.");
    }
    if (orderData?.order?.status?.payment === "paid" || orderData?.payment?.status === "paid") {
      return err(409, "Already Paid", "This order has already been paid.");
    }
    const expectedAmount = Number(orderData?.payment?.required_amount_incl || 0).toFixed(2);
    const expectedCurrency = String(orderData?.payment?.currency || currency || "").trim();
    if (formattedAmount !== expectedAmount) {
      return err(400, "Amount Mismatch", "The payment amount no longer matches the order total.", {
        expectedAmount,
        providedAmount: formattedAmount,
      });
    }
    if (String(currency || "").trim() !== expectedCurrency) {
      return err(400, "Currency Mismatch", "The payment currency no longer matches the order.", {
        expectedCurrency,
        providedCurrency: currency,
      });
    }

    const redirectUrl = `${BASE_URL}/api/v1/payments/peach/shopper-redirect?merchantTransactionId=${encodeURIComponent(
      merchantTransactionId
    )}`;

    const peachPayload = {
      entityId: ENTITY_ID,
      amount: formattedAmount,
      currency,
      paymentBrand: card.brand || "VISA",
      paymentType: "DB",

      "card.number": card.number,
      "card.holder": card.holder,
      "card.expiryMonth": card.expiryMonth,
      "card.expiryYear": card.expiryYear,
      "card.cvv": card.cvv,

      merchantTransactionId,
      createRegistration: "true",

      "standingInstruction.mode": "INITIAL",
      "standingInstruction.source": "CIT",
      "standingInstruction.type": "UNSCHEDULED",

      "customer.email": customer?.email || "unknown@piessang.com",
      shopperResultUrl: redirectUrl
    };

    const gateway = await peachRequest("/v1/payments", peachPayload);

    if (!gateway?.result?.code?.startsWith("000.")) {
      return err(
        402,
        "Payment Failed",
        gateway?.result?.description || "Your card was declined.",
        { gateway }
      );
    }

    const timestamp = now();

    /* ───── DUPLICATE CARD CHECK ───── */

    let cardId = null;
    const cardsList = cards || [];

    const existingCard =
      cardsList.find(
        c =>
          c.bin === gateway.card?.bin &&
          c.last4 === gateway.card?.last4Digits &&
          c.expiryMonth === gateway.card?.expiryMonth &&
          c.expiryYear === gateway.card?.expiryYear
      ) || null;

    const paymentAttempt = {
      merchantTransactionId,
      paymentId: gateway.id,
      amount: formattedAmount,
      currency,
      status: "success",
      createdAt: timestamp
    };

    let updatedCards;

    if (existingCard) {
      cardId = existingCard.id;

      updatedCards = cardsList.map(c =>
        c.id === existingCard.id
          ? {
              ...c,
              paymentAttempts: [...(c.paymentAttempts || []), paymentAttempt],
              lastCharged: [...(c.lastCharged || []), timestamp],
              updatedAt: timestamp
            }
          : c
      );
    } else if (saveCard) {
      const newCard = {
        id: uid(),
        status: "active",
        type: "card",

        brand: gateway.paymentBrand,
        last4: gateway.card.last4Digits,
        bin: gateway.card.bin,
        expiryMonth: gateway.card.expiryMonth,
        expiryYear: gateway.card.expiryYear,

        token: {
          provider: "peach",
          registrationId: gateway.registrationId,
          entityId: ENTITY_ID,
          merchantTransactionId,
          peachTransactionId: gateway.id,
          raw: null
        },

        billing: billing || null,

        paymentAttempts: [paymentAttempt],
        lastCharged: [timestamp],
        createdAt: timestamp,
        updatedAt: timestamp
      };

      updatedCards = [...cardsList, newCard];
      cardId = newCard.id;
    } else {
      updatedCards = cardsList;
    }

    await userRef.update({
      "paymentMethods.cards": updatedCards
    });

    /* ───── RESOLVE ORDER ───── */

    let orderId = null;
    if (!orderSnap.empty) {
      orderId = orderSnap.docs[0].id;
    }

    if (!orderId) {
      throw new Error(`Order not found in orders_v2: ${merchantTransactionId}`);
    }

    const orderNumberFromUrl = getQueryParam(
      shopperResultUrlBase,
      "orderNumber"
    );

    await db.collection("peach_redirects").doc(merchantTransactionId).set(
      {
        merchantTransactionId,
        orderId,
        paymentId: gateway.id,
        shopperResultUrl: shopperResultUrlBase,
        orderNumber: orderNumberFromUrl,
        payment: {
          provider: "peach",
          method: "card",
          chargeType: "card",
          merchantTransactionId,
          peachTransactionId: gateway.id,
          threeDSecureId: null,
          amount_incl: Number(formattedAmount),
          currency,
        },
        createdAt: now(),
        updatedAt: now()
      },
      { merge: true }
    );

    const shopperResultUrlWithPaymentId = appendQueryParam(
      shopperResultUrlBase,
      "paymentId",
      gateway.id
    );

    return ok({
      paymentId: gateway.id,
      cardId,
      title: "Payment Successful",
      message: "Your payment was completed successfully.",
      shopperResultUrl: shopperResultUrlWithPaymentId,
      gateway
    });
  } catch (e) {
    return err(
      500,
      "Payment Error",
      e?.message || "Something went wrong while processing your payment."
    );
  }
}
