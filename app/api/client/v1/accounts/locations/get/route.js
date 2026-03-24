export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, data: p }, { status: s });

const err = (s, t, m, x = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...x }, { status: s });

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { searchParams } = new URL(req.url);

    const userId = searchParams.get("userId");
    const defaultOnly = searchParams.get("defaultOnly") === "true";

    if (!userId) {
      return err(400, "Missing userId", "userId is required.");
    }

    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) {
      return err(404, "User Not Found", `No user ${userId}`);
    }

    const data = snap.data();
    const locations = Array.isArray(data.deliveryLocations)
      ? data.deliveryLocations
      : [];

    if (defaultOnly) {
      const defaultLocation =
        locations.find(l => l.is_default === true) || null;

      return ok({
        userId,
        deliveryLocation: defaultLocation,
      });
    }

    return ok({
      userId,
      deliveryLocations: locations,
    });
  } catch (e) {
    console.error("GET_LOCATIONS_ERROR:", e);
    return err(
      500,
      "Server Error",
      "Failed to fetch delivery locations.",
      { details: e.message }
    );
  }
}
