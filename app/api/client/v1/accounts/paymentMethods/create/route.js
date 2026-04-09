export const runtime = "nodejs";
export const preferredRegion = "fra1";

export const dynamic = "force-dynamic";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import { buildCardPresentationMetadata } from "@/lib/payments/card-presentation";

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, message: "Server Firestore access is not configured." },
        { status: 500 }
      );
    }

    const {
      userId,
      token,
      brand,
      last4,
      expiryMonth,
      expiryYear,
      peachTransactionId,
      merchantTransactionId
    } = await req.json();

    const cardId = `card_${Date.now()}`;
    const card = {
      card_id: cardId,
      token,
      brand,
      last4,
      expiryMonth,
      expiryYear,
      peachTransactionId,
      merchantTransactionId,
      isActive: true,
      themeKey: buildCardPresentationMetadata({ cardId, brand, last4 }).themeKey,
      lastCharged: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(userId).update({
      "paymentMethods.cards": FieldValue.arrayUnion(card),
      "paymentMethods.updatedAt": new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, data: card });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: "Failed to save card", error: err },
      { status: 500 }
    );
  }
}
