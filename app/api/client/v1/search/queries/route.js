export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeQuery(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyQuery(value) {
  return normalizeQuery(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) return ok({ items: [] });

    const snap = await db
      .collection("search_queries_v1")
      .orderBy("count", "desc")
      .limit(6)
      .get()
      .catch(() => null);

    const items = (snap?.docs || [])
      .map((doc) => {
        const data = doc.data() || {};
        const query = toStr(data?.query);
        if (!query) return null;
        return {
          id: doc.id,
          query,
          count: Number(data?.count || 0),
        };
      })
      .filter(Boolean);

    return ok({ items });
  } catch (error) {
    return err(500, "Search Queries Failed", error?.message || "Unable to load search queries.");
  }
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return ok({ tracked: false });

    const body = await req.json().catch(() => ({}));
    const query = normalizeQuery(body?.query);
    if (!query || query.length < 2) return err(400, "Invalid Query", "A longer search query is required.");

    const docId = slugifyQuery(query) || query;
    await db.collection("search_queries_v1").doc(docId).set(
      {
        query,
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return ok({ tracked: true });
  } catch (error) {
    return err(500, "Track Failed", error?.message || "Unable to track search query.");
  }
}
