import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export async function POST() {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const snap = await db.collection("products_v2").get();
    const stale = snap.docs.filter((docSnap) => {
      const data = docSnap.data() || {};
      const moderationStatus = String(data?.moderation?.status || "").trim().toLowerCase();
      const reviewedAt = data?.moderation?.reviewedAt ?? null;
      const reviewedBy = data?.moderation?.reviewedBy ?? null;
      return moderationStatus === "published" && !reviewedAt && !reviewedBy;
    });

    let updated = 0;
    for (const part of chunk(stale, 450)) {
      const batch = db.batch();
      for (const docSnap of part) {
        batch.update(docSnap.ref, {
          "moderation.status": "in_review",
          "moderation.reason": null,
          "moderation.notes": "Moved back to in review after workflow correction. Awaiting admin decision.",
          "moderation.reviewedAt": null,
          "moderation.reviewedBy": null,
          "placement.isActive": false,
          "timestamps.updatedAt": FieldValue.serverTimestamp(),
        });
        updated += 1;
      }
      await batch.commit();
    }

    return ok({
      message: "Product review statuses synchronized.",
      scanned: snap.size,
      updated,
    });
  } catch (e) {
    console.error("admin/products/review-sync failed:", e);
    return err(500, "Unexpected Error", "Failed to synchronize product review statuses.", {
      details: String(e?.message ?? "").slice(0, 300),
    });
  }
}
