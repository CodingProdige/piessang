export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, data: p }, { status: s });
const err = (s, t, m, x = {}) => NextResponse.json({ ok: false, title: t, message: m, ...x }, { status: s });

function toBool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePreferences(raw) {
  const preferences = raw && typeof raw === "object" ? raw : {};
  const topics = preferences.notificationTopics && typeof preferences.notificationTopics === "object"
    ? preferences.notificationTopics
    : {};

  return {
    emailNotifications: toBool(preferences.emailNotifications, true),
    smsNotifications: toBool(preferences.smsNotifications, true),
    pushNotifications: toBool(preferences.pushNotifications, true),
    notificationTopics: {
      orders: toBool(topics.orders, true),
      delivery: toBool(topics.delivery, true),
      returns: toBool(topics.returns, true),
      support: toBool(topics.support, true),
      promotions: toBool(topics.promotions, false),
      account: toBool(topics.account, true),
      following: toBool(topics.following, true),
      favorites: toBool(topics.favorites, true),
    },
  };
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || body?.userId || "").trim();
    if (!uid) return err(400, "Missing Fields", "uid is required.");

    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return err(404, "User Not Found", "Could not find user.");

    return ok({
      preferences: normalizePreferences(snap.data()?.preferences),
    });
  } catch (e) {
    return err(500, "Preferences Fetch Failed", e?.message || "Unexpected error fetching preferences.");
  }
}
