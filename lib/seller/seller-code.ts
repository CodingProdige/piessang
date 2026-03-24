import { createHash } from "crypto";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeCode(value: string) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function sellerCodeFromUid(uid: string) {
  const seed = toStr(uid);
  if (!seed) return "";

  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 10).toUpperCase();
  return `SC-${digest}`;
}

export function normalizeSellerCode(value: unknown) {
  return normalizeCode(toStr(value));
}

export function ensureSellerCode(value: unknown, seed: string) {
  return normalizeSellerCode(value) || sellerCodeFromUid(seed);
}

export function normalizeSellerDescription(value: unknown, maxLength = 500) {
  return toStr(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
