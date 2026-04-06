export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && Object.keys(value).length === 0) return true;
  return false;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json().catch(() => ({}));
    const {
      uid,
      targetAccountType,
      data = {}
    } = body || {};

    if (isEmpty(uid)) {
      return err(400, "Missing Fields", "uid is required.");
    }

    if (isEmpty(targetAccountType)) {
      return err(400, "Missing Account Type", "targetAccountType is required.");
    }

    const ref = db.collection("users").doc(String(uid).trim());
    const snap = await ref.get();
    if (!snap.exists) {
      return err(404, "User Not Found", "Cannot convert a non-existing user.");
    }

    const existing = snap.data() || {};
    const previousAccountType = existing?.account?.accountType || null;
    const nextAccountType = String(targetAccountType).trim();
    const now = new Date().toISOString();

    const payload = {
      account: {
        ...(existing?.account || {}),
        ...(isEmpty(data?.account) ? {} : data.account),
        accountType: nextAccountType,
        accountActive: true,
        onboardingComplete: true
      },
      system: {
        ...(existing?.system || {}),
        updatedAt: now
      }
    };

    await ref.update(payload);

    return ok({
      data: {
        uid: String(uid).trim(),
        previousAccountType,
        accountType: nextAccountType,
        accountActive: true,
        convertedAt: now
      }
    });
  } catch (e) {
    return err(500, "Conversion Failed", e?.message || "Unexpected error.");
  }
}
