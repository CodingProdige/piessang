export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

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
    const { uid: rawUid, userId: rawUserId } = body || {};
    const uid = isEmpty(rawUid) ? rawUserId : rawUid;

    if (!uid) {
      return err(400, "Missing Fields", "uid is required.");
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return err(404, "User Not Found", `No user found with uid: ${uid}`);
    }

    await userRef.update({
      "preferences.favoriteProducts": [],
    });

    return ok({ favorites: [] });
  } catch (e) {
    return err(500, "Favorites Clear Failed", e?.message || "Unexpected error.");
  }
}
