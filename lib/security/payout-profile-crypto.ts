import crypto from "node:crypto";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getEncryptionKey() {
  const raw = toStr(process.env.PAYOUT_PROFILE_ENCRYPTION_KEY || process.env.WISE_PAYOUT_ENCRYPTION_KEY);
  if (!raw) return null;

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {}

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) return utf8;
  return null;
}

export function payoutProfileEncryptionEnabled() {
  return Boolean(getEncryptionKey());
}

export function encryptPayoutField(value: unknown) {
  const plain = toStr(value);
  if (!plain) return "";
  const key = getEncryptionKey();
  if (!key) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:gcm:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptPayoutField(value: unknown) {
  const input = toStr(value);
  if (!input) return "";
  if (!input.startsWith("enc:gcm:")) return input;
  const key = getEncryptionKey();
  if (!key) return "";

  const parts = input.split(":");
  if (parts.length !== 5) return "";
  const [, , ivB64, tagB64, dataB64] = parts;

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return "";
  }
}

export function encryptPayoutProfile(profile: Record<string, unknown>) {
  const next = { ...(profile || {}) };
  for (const key of ["accountNumber", "iban", "swiftBic", "routingNumber", "branchCode", "bankAddress"]) {
    next[key] = encryptPayoutField(next[key]);
  }
  return next;
}

export function decryptPayoutProfile(profile: Record<string, unknown>) {
  const next = { ...(profile || {}) };
  for (const key of ["accountNumber", "iban", "swiftBic", "routingNumber", "branchCode", "bankAddress"]) {
    next[key] = decryptPayoutField(next[key]);
  }
  return next;
}
