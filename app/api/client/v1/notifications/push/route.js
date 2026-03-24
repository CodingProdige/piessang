import { NextResponse } from "next/server";
import crypto from "crypto";
import { collection, collectionGroup, doc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { pushTemplates } from "./messages";

const FCM_BATCH_LIMIT = 500;
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
let cachedPushConfig = null;

function getPushConfig() {
  if (cachedPushConfig) return cachedPushConfig;

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
      throw new Error("Missing client_email/private_key");
    }

    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      serviceAccount?.project_id ||
      "";

    if (!projectId) {
      throw new Error("Missing Firebase project id for push notifications.");
    }

    cachedPushConfig = { serviceAccount, projectId };
    return cachedPushConfig;
  } catch (e) {
    console.error("❌ SERVICE ACCOUNT JSON ERROR:", e);
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
  }
}

/* ---------------------------------------------
   FETCH USER TOKENS
--------------------------------------------- */
async function getUserTokens(uid) {
  try {
    const snap = await getDocs(collection(doc(db, "users", uid), "fcm_tokens"));
    const tokens = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const token = data.fcm_token || data.token || null;
      if (token) tokens.push(token);
    });
    return tokens;
  } catch (e) {
    console.error("❌ TOKEN FETCH ERROR:", e);
    return [];
  }
}

async function getAllTokens() {
  try {
    const snap = await getDocs(collectionGroup(db, "fcm_tokens"));
    const tokens = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const token = data.fcm_token || data.token || null;
      if (token) tokens.push(token);
    });
    return Array.from(new Set(tokens));
  } catch (e) {
    console.error("❌ GLOBAL TOKEN FETCH ERROR:", e);
    return [];
  }
}

async function getManyUserTokens(uids = []) {
  const results = await Promise.all(uids.map(uid => getUserTokens(uid)));
  return Array.from(new Set(results.flat()));
}

/* ---------------------------------------------
   TEMPLATE HELPERS
--------------------------------------------- */
function interpolate(template = "", vars = {}) {
  return String(template).replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
    const value = vars?.[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function resolveNotificationName(input = {}) {
  const snapshot = input?.customer_snapshot || {};
  const account = input?.account || snapshot?.account || {};
  const business = input?.business || snapshot?.business || {};
  const personal = input?.personal || snapshot?.personal || {};

  return firstNonEmptyString(
    account?.accountName,
    business?.companyName,
    personal?.fullName,
    input?.customerName,
    input?.companyName,
    input?.name
  );
}

function buildMessage(type, vars = {}) {
  const tpl = pushTemplates?.[type];
  if (tpl) {
    return {
      title: interpolate(tpl.title, vars),
      body: interpolate(tpl.body, vars),
      link: interpolate(tpl.link || "", vars)
    };
  }

  return {
    title: "Bevgo Notification",
    body: "You have a new message."
  };
}

function normalizeOrderNumber(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function deriveMerchantTransactionId(orderNumber) {
  const normalized = normalizeOrderNumber(orderNumber);
  if (!normalized) return "";
  return normalized.replace(/-/g, "");
}

function normalizeDataPayload(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    else out[k] = JSON.stringify(v);
  }
  return out;
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(typeof input === "string" ? input : JSON.stringify(input));
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createServiceAccountJwt() {
  const { serviceAccount } = getPushConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_AUDIENCE,
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const encodedSignature = base64UrlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

async function getAccessToken() {
  const assertion = createServiceAccountJwt();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  }).toString();

  const res = await fetch(TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new Error(
      `OAuth token request failed (${res.status}): ${
        json?.error_description || json?.error || "unknown"
      }`
    );
  }

  return json.access_token;
}

async function sendToToken(accessToken, token, payload) {
  const { projectId } = getPushConfig();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          notification: payload.notification,
          data: payload.data
        }
      })
    }
  );

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: json?.error || json || null
    };
  }

  return {
    ok: true,
    status: response.status,
    name: json?.name || null
  };
}

/* ---------------------------------------------
   SEND PUSH
--------------------------------------------- */
async function sendPush(tokens, payload) {
  const accessToken = await getAccessToken();
  let successCount = 0;
  let failureCount = 0;
  const responses = [];

  for (let i = 0; i < tokens.length; i += FCM_BATCH_LIMIT) {
    const batch = tokens.slice(i, i + FCM_BATCH_LIMIT);
    const batchResults = await Promise.all(
      batch.map(token => sendToToken(accessToken, token, payload))
    );

    const batchSuccess = batchResults.filter(r => r.ok).length;
    const batchFailure = batchResults.length - batchSuccess;
    successCount += batchSuccess;
    failureCount += batchFailure;

    responses.push({
      batchIndex: Math.floor(i / FCM_BATCH_LIMIT) + 1,
      tokenCount: batch.length,
      successCount: batchSuccess,
      failureCount: batchFailure
    });
  }

  return {
    successCount,
    failureCount,
    responses
  };
}

/* ---------------------------------------------
   MAIN HANDLER
--------------------------------------------- */
export async function POST(req) {
  try {
    getPushConfig();
    const body = await req.json().catch(() => ({}));
    const {
      uid,
      uids,
      global = false,
      type,
      orderNumber,
      variables,
      notification,
      data,
      deeplink,
      link,
      android,
      includeTokens = false
    } = body || {};

    const resolvedOrderNumber = normalizeOrderNumber(
      orderNumber || variables?.orderNumber || data?.orderNumber || ""
    );
    const derivedMerchantTransactionId =
      deriveMerchantTransactionId(resolvedOrderNumber);
    const resolvedName = resolveNotificationName(variables || {});
    const safeVariables = {
      ...(variables || {}),
      ...(resolvedOrderNumber ? { orderNumber: resolvedOrderNumber } : {}),
      ...(derivedMerchantTransactionId
        ? { merchantTransactionId: derivedMerchantTransactionId }
        : {}),
      ...(resolvedName
        ? {
            name: resolvedName,
            customerName: resolvedName,
            companyName: resolvedName
          }
        : {})
    };

    if (!global && !uid && !(Array.isArray(uids) && uids.length > 0)) {
      return NextResponse.json(
        {
          ok: false,
          title: "Missing Target",
          message: "Provide one of: uid, uids[], or global=true.",
          devicesReceived: 0,
          devicesFailed: 0
        },
        { status: 400 }
      );
    }

    let tokens = [];
    if (global) tokens = await getAllTokens();
    else if (uid) tokens = await getUserTokens(uid);
    else tokens = await getManyUserTokens(uids);

    if (!tokens.length) {
      return NextResponse.json({
        ok: false,
        title: "No Device Tokens",
        message: "No registered device tokens found for the requested target.",
        devicesReceived: 0,
        devicesFailed: 0
      });
    }

    const templateMsg = buildMessage(type, safeVariables);
    const derivedOrderDeeplink = resolvedOrderNumber
      ? `bevgoclientportal://bevgoclientportal.com/order?orderNumber=${encodeURIComponent(
          resolvedOrderNumber
        )}`
      : "";
    const deepLink =
      deeplink ||
      link ||
      notification?.link ||
      templateMsg?.link ||
      derivedOrderDeeplink ||
      "";
    const payloadData = normalizeDataPayload({
      ...(data || {}),
      ...(type ? { template: type } : {}),
      ...(resolvedOrderNumber ? { orderNumber: resolvedOrderNumber } : {}),
      ...(derivedMerchantTransactionId
        ? { merchantTransactionId: derivedMerchantTransactionId }
        : {}),
      ...(resolvedName
        ? { name: resolvedName, customerName: resolvedName, companyName: resolvedName }
        : {}),
      ...(deepLink ? { link: deepLink, deeplink: deepLink } : {})
    });

    const payloadNotification = {
      title: notification?.title || templateMsg.title,
      body: notification?.body || templateMsg.body
    };
    if (notification?.imageUrl) payloadNotification.image = notification.imageUrl;

    const payload = {
      notification: payloadNotification,
      data: payloadData
    };

    const androidNotification = {
      ...(android?.notification?.icon
        ? { icon: android.notification.icon }
        : {}),
      ...(android?.notification?.channelId
        ? { channel_id: android.notification.channelId }
        : {}),
      ...(android?.notification?.sound
        ? { sound: android.notification.sound }
        : {})
    };

    if (Object.keys(androidNotification).length > 0) {
      payload.android = { notification: androidNotification };
    }

    const providerResp = await sendPush(tokens, payload);

    return NextResponse.json({
      ok: true,
      uid,
      uids: Array.isArray(uids) ? uids : undefined,
      global,
      tokensSent: tokens.length,
      devicesReceived: providerResp?.successCount ?? 0,
      devicesFailed: providerResp?.failureCount ?? 0,
      ...(includeTokens ? { tokens } : {}),
      message: payloadNotification,
      deeplink: deepLink || null,
      data: payloadData,
      providerResp,
      sentAt: new Date().toISOString()
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        title: "Push Sending Failed",
        message: e?.message || "Unexpected push error."
      },
      { status: 500 }
    );
  }
}
