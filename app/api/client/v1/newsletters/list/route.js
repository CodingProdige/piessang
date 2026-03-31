export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  newslettersCollection,
  normalizeNewsletterRecord,
  normalizeNewsletterSubscriptions,
} from "@/lib/newsletters";
import { isSystemAdminUid } from "@/lib/support/tickets";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to view newsletters.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const { searchParams } = new URL(req.url);
    const adminMode = searchParams.get("adminMode") === "true";

    if (adminMode) {
      const isAdmin = await isSystemAdminUid(sessionUser.uid);
      if (!isAdmin) return err(403, "Access Denied", "Only Piessang admins can manage newsletters.");
    }

    const [catalogSnap, userSnap] = await Promise.all([
      newslettersCollection(db).orderBy("newsletter.createdAt", "desc").get(),
      db.collection("users").doc(sessionUser.uid).get(),
    ]);

    const subscriptions = normalizeNewsletterSubscriptions(userSnap.data()?.preferences?.newsletterSubscriptions);
    let items = catalogSnap.docs.map((docSnap) => normalizeNewsletterRecord(docSnap.id, docSnap.data()));

    if (!adminMode) {
      items = items.filter((item) => item.newsletter.status === "active");
    }

    const counts = items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.newsletter.status === "active") acc.active += 1;
        if (item.newsletter.status === "draft") acc.draft += 1;
        if (item.newsletter.status === "archived") acc.archived += 1;
        return acc;
      },
      { total: 0, active: 0, draft: 0, archived: 0 },
    );

    return ok({
      items: items.map((item) => ({
        ...item,
        subscribed: Boolean(subscriptions[item.docId]),
      })),
      counts,
    });
  } catch (error) {
    return err(500, "Load Failed", error?.message || "Unable to load newsletters.");
  }
}
