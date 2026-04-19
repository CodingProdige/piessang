const STRIPE_API_BASE = "https://api.stripe.com";
const GUEST_CART_TOKEN_PREFIX = "cart_guest_";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function getStripePublishableKey() {
  return toStr(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
}

export function requireStripeSecretKey() {
  const secret = toStr(process.env.STRIPE_SECRET_KEY || "");
  if (!secret) {
    const error = new Error("STRIPE_SECRET_KEY is required.");
    error.status = 500;
    throw error;
  }
  return secret;
}

export function requireStripeWebhookSecret() {
  const secret = toStr(process.env.STRIPE_WEBHOOK_SECRET || "");
  if (!secret) {
    const error = new Error("STRIPE_WEBHOOK_SECRET is required.");
    error.status = 500;
    throw error;
  }
  return secret;
}

async function digestHex(algorithm, value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest(algorithm, data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function computeStripeSignature(secret, payload, timestamp) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyStripeWebhookSignature(payload, headerValue) {
  const secret = requireStripeWebhookSecret();
  const header = toStr(headerValue);
  if (!payload || !header) {
    const error = new Error("Missing Stripe signature header.");
    error.status = 400;
    throw error;
  }

  const parts = header.split(",").map((part) => part.trim());
  const timestamp = toStr(parts.find((part) => part.startsWith("t="))?.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => toStr(part.slice(3)))
    .filter(Boolean);

  if (!timestamp || !signatures.length) {
    const error = new Error("Invalid Stripe signature header.");
    error.status = 400;
    throw error;
  }

  const expected = await computeStripeSignature(secret, payload, timestamp);
  if (!signatures.includes(expected)) {
    const error = new Error("Stripe webhook signature verification failed.");
    error.status = 400;
    throw error;
  }

  return true;
}

export async function stripeRequest(path, { method = "GET", body, headers = {} } = {}) {
  const secret = requireStripeSecretKey();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...headers,
    },
    body,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(toStr(payload?.error?.message || payload?.message || "Stripe request failed."));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function ensureStripeCustomer({
  db,
  userId,
  email = "",
  name = "",
  phone = "",
}) {
  if (!db || !userId) {
    const error = new Error("db and userId are required.");
    error.status = 400;
    throw error;
  }

  const userRef = db.collection("users").doc(userId);
  const userSnap = await userRef.get();
  const isGuestUser = toStr(userId).toLowerCase().startsWith(GUEST_CART_TOKEN_PREFIX);
  if (!userSnap.exists && !isGuestUser) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const userData = userSnap.data() || {};
  const existingId = toStr(
    userData?.paymentMethods?.stripeCustomerId ||
      userData?.billing?.stripeCustomerId ||
      userData?.stripeCustomerId ||
      "",
  );
  if (existingId) return existingId;

  const form = new URLSearchParams();
  if (email) form.set("email", email);
  if (name) form.set("name", name);
  if (phone) form.set("phone", phone);
  form.set("metadata[userId]", userId);

  const customer = await stripeRequest("/v1/customers", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const customerId = toStr(customer?.id || "");
  if (!customerId) {
    const error = new Error("Stripe customer was not created.");
    error.status = 500;
    throw error;
  }

  if (userSnap.exists) {
    await userRef.set(
      {
        paymentMethods: {
          ...(userData?.paymentMethods && typeof userData.paymentMethods === "object" ? userData.paymentMethods : {}),
          stripeCustomerId: customerId,
          updatedAt: new Date().toISOString(),
        },
        billing: {
          ...(userData?.billing && typeof userData.billing === "object" ? userData.billing : {}),
          stripeCustomerId: customerId,
        },
        stripeCustomerId: customerId,
      },
      { merge: true },
    );
  }

  return customerId;
}

export default {
  getStripePublishableKey,
  requireStripeSecretKey,
  requireStripeWebhookSecret,
  verifyStripeWebhookSignature,
  ensureStripeCustomer,
  stripeRequest,
};
