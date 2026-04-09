export const runtime = "nodejs";
export const preferredRegion = "fra1";

export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import { stripeRequest } from "@/lib/payments/stripe";
import { buildCardPresentationMetadata } from "@/lib/payments/card-presentation";

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

    const userData = snap.data() || {};
    const cardPresentation =
      userData?.paymentMethods?.cardPresentation && typeof userData.paymentMethods.cardPresentation === "object"
        ? userData.paymentMethods.cardPresentation
        : {};
    const stripeCustomerId = String(
      userData?.paymentMethods?.stripeCustomerId ||
        userData?.billing?.stripeCustomerId ||
        userData?.stripeCustomerId ||
        "",
    ).trim();

    let activeCards = [];
    if (stripeCustomerId) {
      const payload = await stripeRequest(
        `/v1/payment_methods?customer=${encodeURIComponent(stripeCustomerId)}&type=card`,
      ).catch(() => ({ data: [] }));
      activeCards = (Array.isArray(payload?.data) ? payload.data : []).map((paymentMethod) => ({
        id: String(paymentMethod?.id || ""),
        brand: String(paymentMethod?.card?.brand || "").toUpperCase(),
        last4: String(paymentMethod?.card?.last4 || ""),
        expiryMonth: String(paymentMethod?.card?.exp_month || "").padStart(2, "0"),
        expiryYear: String(paymentMethod?.card?.exp_year || ""),
        status: "active",
        ...(cardPresentation[String(paymentMethod?.id || "")] || buildCardPresentationMetadata({
          cardId: String(paymentMethod?.id || ""),
          brand: String(paymentMethod?.card?.brand || "").toUpperCase(),
          last4: String(paymentMethod?.card?.last4 || ""),
        })),
      }));
    } else {
      const cards = userData.paymentMethods?.cards ?? [];
      activeCards = cards
        .filter((c) => c.status === "active")
        .map((card) => ({
          ...card,
          ...(cardPresentation[String(card?.id || card?.card_id || "")] || buildCardPresentationMetadata({
            cardId: String(card?.id || card?.card_id || ""),
            brand: String(card?.brand || "").toUpperCase(),
            last4: String(card?.last4 || ""),
            themeKey: card?.themeKey,
          })),
        }));
    }

    return ok({
      paymentMethods: {
        cards: activeCards,
        count: activeCards.length,
        stripeCustomerId: stripeCustomerId || null,
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
