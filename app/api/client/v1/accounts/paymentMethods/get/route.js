export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

/* ---------- helpers ---------- */
const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, data: p }, { status: s });

const err = (s, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status: s });

/* ---------- endpoint ---------- */
export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { userId } = await req.json();

    if (!userId) {
      return err(
        400,
        "Missing Parameters",
        "userId is required."
      );
    }

    const snap = await db.collection("users").doc(userId).get();

    if (!snap.exists) {
      return err(
        404,
        "User Not Found",
        "Could not find user."
      );
    }

    const userData = snap.data();

    const cards =
      userData.paymentMethods?.cards ?? [];

    // only expose active cards by default
    const activeCards = cards.filter(
      c => c.status === "active"
    );

    return ok({
      paymentMethods: {
        cards: activeCards,
        count: activeCards.length
      }
    });

  } catch (error) {
    console.error("PAYMENT_METHOD_GET_ERROR:", error);
    return err(
      500,
      "Get Failed",
      "Unable to fetch payment methods.",
      { error: error.message }
    );
  }
}
