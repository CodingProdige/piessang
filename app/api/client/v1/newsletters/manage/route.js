export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { newslettersCollection, normalizeNewsletterInput, normalizeNewsletterRecord } from "@/lib/newsletters";
import { isSystemAdminUid } from "@/lib/support/tickets";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage newsletters.");

    const isAdmin = await isSystemAdminUid(sessionUser.uid);
    if (!isAdmin) return err(403, "Access Denied", "Only Piessang admins can manage newsletters.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const newsletterId = String(body?.newsletterId || "").trim();
    const input = normalizeNewsletterInput(body?.newsletter || {});
    if (!input.title) return err(400, "Missing Fields", "Newsletter title is required.");

    const now = new Date().toISOString();
    const ref = newsletterId ? newslettersCollection(db).doc(newsletterId) : newslettersCollection(db).doc();
    const currentSnap = await ref.get();
    const current = currentSnap.exists ? normalizeNewsletterRecord(currentSnap.id, currentSnap.data()) : null;

    await ref.set(
      {
        newsletter: {
          title: input.title,
          slug: input.slug || current?.newsletter?.slug || ref.id,
          description: input.description,
          audienceLabel: input.audienceLabel,
          status: input.status,
          createdAt: current?.newsletter?.createdAt || now,
          updatedAt: now,
          createdBy: current?.newsletter?.createdBy || sessionUser.uid,
          updatedBy: sessionUser.uid,
        },
        metrics: {
          subscriberCount: Number(current?.metrics?.subscriberCount || 0),
        },
      },
      { merge: true },
    );

    const saved = await ref.get();
    return ok({ item: normalizeNewsletterRecord(saved.id, saved.data()) });
  } catch (error) {
    return err(500, "Save Failed", error?.message || "Unable to save newsletter.");
  }
}
