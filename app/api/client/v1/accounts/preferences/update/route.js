export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, data: p }, { status: s });
const err = (s, t, m, x = {}) => NextResponse.json({ ok: false, title: t, message: m, ...x }, { status: s });

function toBool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePreferences(raw, existing = {}) {
  const preferences = raw && typeof raw === "object" ? raw : {};
  const current = existing && typeof existing === "object" ? existing : {};
  const incomingTopics = preferences.notificationTopics && typeof preferences.notificationTopics === "object"
    ? preferences.notificationTopics
    : {};
  const currentTopics = current.notificationTopics && typeof current.notificationTopics === "object"
    ? current.notificationTopics
    : {};

  return {
    ...current,
    emailNotifications: toBool(preferences.emailNotifications, toBool(current.emailNotifications, true)),
    smsNotifications: toBool(preferences.smsNotifications, toBool(current.smsNotifications, true)),
    pushNotifications: toBool(preferences.pushNotifications, toBool(current.pushNotifications, true)),
    notificationTopics: {
      orders: toBool(incomingTopics.orders, toBool(currentTopics.orders, true)),
      delivery: toBool(incomingTopics.delivery, toBool(currentTopics.delivery, true)),
      returns: toBool(incomingTopics.returns, toBool(currentTopics.returns, true)),
      support: toBool(incomingTopics.support, toBool(currentTopics.support, true)),
      promotions: toBool(incomingTopics.promotions, toBool(currentTopics.promotions, false)),
      account: toBool(incomingTopics.account, toBool(currentTopics.account, true)),
    },
  };
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || body?.userId || "").trim();
    const preferences = body?.preferences;
    if (!uid || !preferences || typeof preferences !== "object") {
      return err(400, "Missing Fields", "uid and preferences are required.");
    }

    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "User Not Found", "Could not find user.");

    const nextPreferences = normalizePreferences(preferences, snap.data()?.preferences);

    await ref.update({
      preferences: nextPreferences,
      "system.updatedAt": new Date().toISOString(),
    });

    return ok({ preferences: nextPreferences });
  } catch (e) {
    return err(500, "Preferences Update Failed", e?.message || "Unexpected error updating preferences.");
  }
}
