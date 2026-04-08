import { createSign } from "crypto";
import { getAdminDb } from "@/lib/firebase/admin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CONTENT_API_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";
const GOOGLE_MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID || "";
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
const GOOGLE_FEED_TARGET_COUNTRY = (process.env.GOOGLE_FEED_TARGET_COUNTRY || "ZA").toUpperCase();
const GOOGLE_FEED_CONTENT_LANGUAGE = (process.env.GOOGLE_FEED_CONTENT_LANGUAGE || "en").toLowerCase();
const LOG_COLLECTION = "google_merchant_logs";
const QUEUE_COLLECTION = "google_sync_queue";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function escBase64Url(v) {
  return Buffer.from(v)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildJwtAssertion() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/content",
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp,
  };

  const encodedHeader = escBase64Url(JSON.stringify(header));
  const encodedClaim = escBase64Url(JSON.stringify(claim));
  const unsigned = `${encodedHeader}.${encodedClaim}`;
  const privateKey = GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n");
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

async function getGoogleAccessToken() {
  const assertion = buildJwtAssertion();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.access_token) {
    throw new Error(
      `OAuth token request failed: ${res.status} ${json ? JSON.stringify(json) : raw.slice(0, 500)}`
    );
  }
  return json.access_token;
}

async function pushDeleteBatch(accessToken, entries) {
  const res = await fetch(`${GOOGLE_CONTENT_API_BASE}/products/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ entries }),
  });

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(
      `Google delete batch failed: ${res.status} ${json ? JSON.stringify(json) : raw.slice(0, 1200)}`
    );
  }

  const entryErrors = Array.isArray(json?.entries)
    ? json.entries.filter((entry) => entry?.errors && Array.isArray(entry.errors) && entry.errors.length)
    : [];
  if (entryErrors.length) {
    throw new Error(`Google delete batch entry errors: ${JSON.stringify(entryErrors).slice(0, 2000)}`);
  }

  return json;
}

export async function deleteGoogleMerchantOffers(offerIds = []) {
  if (!GOOGLE_MERCHANT_ID) {
    throw new Error("Set GOOGLE_MERCHANT_ID.");
  }

  const normalizedOfferIds = Array.from(
    new Set(
      (Array.isArray(offerIds) ? offerIds : [])
        .map((value) => toStr(value))
        .filter(Boolean),
    ),
  );
  if (!normalizedOfferIds.length) {
    return { merchantId: GOOGLE_MERCHANT_ID, offersDeleted: 0, batches: 0, offerIds: [] };
  }

  const entries = normalizedOfferIds.map((offerId, index) => ({
    batchId: index + 1,
    merchantId: GOOGLE_MERCHANT_ID,
    method: "delete",
    productId: `online:${GOOGLE_FEED_CONTENT_LANGUAGE}:${GOOGLE_FEED_TARGET_COUNTRY}:${offerId}`,
  }));

  const accessToken = await getGoogleAccessToken();
  const parts = chunk(entries, 900);
  const results = [];
  for (const part of parts) {
    results.push(await pushDeleteBatch(accessToken, part));
  }

  return {
    merchantId: GOOGLE_MERCHANT_ID,
    offersDeleted: normalizedOfferIds.length,
    batches: results.length,
    offerIds: normalizedOfferIds,
  };
}

export async function appendGoogleMerchantLog({
  source = "manual",
  action = "sync",
  ok = true,
  summary = {},
  error = "",
  actorUid = "",
} = {}) {
  const db = getAdminDb();
  if (!db) return null;

  const createdAt = new Date().toISOString();
  const ref = db.collection(LOG_COLLECTION).doc();
  await ref.set({
    source: toStr(source) || "manual",
    action: toStr(action) || "sync",
    ok: ok !== false,
    summary: summary && typeof summary === "object" ? summary : {},
    error: toStr(error).slice(0, 2000) || null,
    actorUid: toStr(actorUid) || null,
    createdAt,
  });
  return ref.id;
}

export async function listGoogleMerchantLogs(limit = 25) {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db
    .collection(LOG_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(Number(limit) || 25, 100)))
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

export async function getGoogleMerchantQueueSnapshot(limit = 50) {
  const db = getAdminDb();
  if (!db) return { totals: {}, jobs: [] };

  const [pendingSnap, processingSnap, doneSnap, failedSnap, latestPendingSnap, latestFailedSnap] = await Promise.all([
    db.collection(QUEUE_COLLECTION).where("status", "==", "pending").get(),
    db.collection(QUEUE_COLLECTION).where("status", "==", "processing").get(),
    db.collection(QUEUE_COLLECTION).where("status", "==", "done").get(),
    db.collection(QUEUE_COLLECTION).where("lastError", "!=", null).orderBy("lastError").orderBy("timestamps.failedAt", "desc").limit(Math.max(1, Math.min(Number(limit) || 50, 100))).get(),
    db.collection(QUEUE_COLLECTION).where("status", "==", "pending").orderBy("timestamps.updatedAt", "desc").limit(Math.max(1, Math.min(Number(limit) || 50, 100))).get(),
    db.collection(QUEUE_COLLECTION).where("lastError", "!=", null).orderBy("lastError").orderBy("timestamps.failedAt", "desc").limit(Math.max(1, Math.min(Number(limit) || 50, 100))).get(),
  ]);

  const pendingJobs = latestPendingSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const failedJobs = latestFailedSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

  return {
    totals: {
      pending: pendingSnap.size,
      processing: processingSnap.size,
      done: doneSnap.size,
      failed: failedSnap.size,
    },
    jobs: pendingJobs,
    failedJobs,
  };
}
