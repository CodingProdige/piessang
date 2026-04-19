import crypto from "crypto";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function requireGuestOrderAccessSecret() {
  const secret = toStr(
    process.env.GUEST_ORDER_ACCESS_SECRET ||
      process.env.CRON_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      process.env.STRIPE_SECRET_KEY,
  );
  if (!secret) {
    const error = new Error("Guest order access secret is not configured.");
    error.status = 500;
    throw error;
  }
  return secret;
}

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function signPayload(payload) {
  return crypto.createHmac("sha256", requireGuestOrderAccessSecret()).update(payload).digest("hex");
}

export function createGuestOrderAccessToken({ orderId = "", email = "" } = {}) {
  const normalizedOrderId = toStr(orderId);
  const normalizedEmail = toStr(email).toLowerCase();
  if (!normalizedOrderId || !normalizedEmail) return "";
  const payload = JSON.stringify({
    v: 1,
    orderId: normalizedOrderId,
    emailHash: sha256Hex(normalizedEmail),
    issuedAt: new Date().toISOString(),
  });
  const encoded = base64UrlEncode(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function verifyGuestOrderAccessToken(token = "") {
  const normalized = toStr(token);
  if (!normalized || !normalized.includes(".")) return null;
  const [encoded, signature] = normalized.split(".");
  if (!encoded || !signature) return null;
  const expectedSignature = signPayload(encoded);
  const provided = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded));
    const orderId = toStr(parsed?.orderId);
    const emailHash = toStr(parsed?.emailHash).toLowerCase();
    if (!orderId || !emailHash) return null;
    return {
      version: Number(parsed?.v || 1),
      orderId,
      emailHash,
      issuedAt: toStr(parsed?.issuedAt) || null,
    };
  } catch {
    return null;
  }
}

export function resolveGuestOrderAccessEmail(order = {}) {
  return toStr(
    order?.customer?.email ||
      order?.customer_snapshot?.email ||
      order?.customer_snapshot?.account?.email ||
      order?.customer_snapshot?.personal?.email,
  ).toLowerCase();
}

export function isGuestOrderAccessAllowed({ order = {}, token = "" } = {}) {
  const parsed = verifyGuestOrderAccessToken(token);
  if (!parsed) return false;
  const orderId = toStr(order?.docId || order?.order?.orderId);
  const email = resolveGuestOrderAccessEmail(order);
  if (!orderId || !email) return false;
  return parsed.orderId === orderId && parsed.emailHash === sha256Hex(email);
}

