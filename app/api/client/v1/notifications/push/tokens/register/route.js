export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function tokenId(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 40);
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to enable notifications.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const token = toStr(body?.token);
    if (!token) return err(400, "Missing Fields", "Push token is required.");

    const now = new Date().toISOString();
    const ref = db.collection("users").doc(sessionUser.uid).collection("fcm_tokens").doc(tokenId(token));
    await ref.set(
      {
        token,
        fcm_token: token,
        platform: toStr(body?.platform || body?.deviceType || "web"),
        permission: toStr(body?.permission || ""),
        userAgent: toStr(body?.userAgent || ""),
        scope: toStr(body?.scope || ""),
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    );

    return ok({ tokenId: ref.id });
  } catch (error) {
    return err(500, "Registration Failed", error?.message || "Unable to register push token.");
  }
}
