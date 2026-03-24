import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { verifyFirebaseIdToken } from "@/lib/auth/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function jsonError(status: number, title: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, title, message, ...extra }, { status });
}

export async function requireSessionUser() {
  const cookieStore = await cookies();
  const idToken = cookieStore.get(SESSION_COOKIE)?.value?.trim() || "";
  if (!idToken) return null;
  return verifyFirebaseIdToken(idToken);
}

export function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}
