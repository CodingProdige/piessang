export const runtime = "nodejs";
export const preferredRegion = "fra1";

export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import { stripeRequest } from "@/lib/payments/stripe";

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

    const { userId, cardId } = await req.json();

    if (!userId || !cardId) {
      return err(
        400,
        "Missing Parameters",
        "userId and cardId are required."
      );
    }

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      return err(404, "User Not Found", "Could not find user.");
    }

    const userData = snap.data() || {};
    const stripeCustomerId = String(
      userData?.paymentMethods?.stripeCustomerId ||
        userData?.billing?.stripeCustomerId ||
        userData?.stripeCustomerId ||
        "",
    ).trim();

    if (stripeCustomerId) {
      await stripeRequest(`/v1/payment_methods/${encodeURIComponent(cardId)}/detach`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      });
    } else {
      const cards = userData.paymentMethods?.cards ?? [];
      const filteredCards = cards.filter(c => c.id !== cardId);

      if (filteredCards.length === cards.length) {
        return err(404, "Card Not Found", "No card found with that id.");
      }

      await userRef.update({
        "paymentMethods.cards": filteredCards,
        "paymentMethods.updatedAt": new Date().toISOString()
      });
    }

    return ok({
      message: "Payment method deleted.",
      remainingCards: null
    });

  } catch (error) {
    console.error("PAYMENT_METHOD_DELETE_ERROR:", error);
    return err(
      500,
      "Delete Failed",
      "Unable to delete payment method.",
      { error: error.message }
    );
  }
}
