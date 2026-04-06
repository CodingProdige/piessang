export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { newslettersCollection, normalizeNewsletterSubscriptions } from "@/lib/newsletters";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toBool(value) {
  return value === true;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to update newsletter preferences.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const incoming = normalizeNewsletterSubscriptions(body?.subscriptions);

    await db.runTransaction(async (tx) => {
      const userRef = db.collection("users").doc(sessionUser.uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error("Could not find your account.");

      const current = normalizeNewsletterSubscriptions(userSnap.data()?.preferences?.newsletterSubscriptions);
      const ids = Array.from(new Set([...Object.keys(current), ...Object.keys(incoming)]));

      for (const newsletterId of ids) {
        const nextValue = toBool(incoming[newsletterId]);
        const currentValue = toBool(current[newsletterId]);
        if (nextValue === currentValue) continue;
        const newsletterRef = newslettersCollection(db).doc(newsletterId);
        const newsletterSnap = await tx.get(newsletterRef);
        if (!newsletterSnap.exists) continue;
        const count = Number(newsletterSnap.data()?.metrics?.subscriberCount || 0) || 0;
        tx.set(
          newsletterRef,
          {
            metrics: {
              subscriberCount: Math.max(0, count + (nextValue ? 1 : -1)),
            },
          },
          { merge: true },
        );
      }

      tx.set(
        userRef,
        {
          preferences: {
            newsletterSubscriptions: incoming,
          },
          system: {
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
    });

    return ok({ subscriptions: incoming });
  } catch (error) {
    return err(500, "Update Failed", error?.message || "Unable to update newsletter preferences.");
  }
}
