export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildProductStatus } from "@/lib/catalogue/product-status";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function buildRepairPatch(data) {
  const status = buildProductStatus(data);
  const patch = {};
  let changed = false;

  if (status.current !== status.stored) {
    patch["moderation.status"] = status.current;
    changed = true;
  }

  if (status.isStalePendingState && data?.live_snapshot) {
    patch.live_snapshot = FieldValue.delete();
    changed = true;
  }

  if (changed) {
    patch["timestamps.updatedAt"] = FieldValue.serverTimestamp();
  }

  return { changed, patch, status };
}

export async function POST() {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const snap = await db.collection("products_v2").get();
    const stale = snap.docs
      .map((docSnap) => {
        const data = docSnap.data() || {};
        const repair = buildRepairPatch(data);
        return { docSnap, repair };
      })
      .filter((entry) => entry.repair.changed);

    let updated = 0;
    for (const part of chunk(stale, 450)) {
      const batch = db.batch();
      for (const entry of part) {
        batch.update(entry.docSnap.ref, entry.repair.patch);
        updated += 1;
      }
      await batch.commit();
    }

    return ok({
      message: "Product statuses synchronized.",
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
