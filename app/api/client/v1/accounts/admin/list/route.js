export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error") =>
  NextResponse.json({ ok: false, title, message }, { status });

async function listAdminUids() {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.collection("users").where("system.accessType", "==", "admin").get();

  const uids = snap.docs
    .map(docSnap => {
      const data = docSnap.data() || {};
      return data?.uid || docSnap.id || null;
    })
    .filter(Boolean);

  return Array.from(new Set(uids));
}

async function handler() {
  try {
    const uids = await listAdminUids();
    return ok({
      uids,
      count: uids.length
    });
  } catch (e) {
    return err(
      500,
      "Fetch Admin List Failed",
      e?.message || "Unexpected error fetching admin UIDs."
    );
  }
}

export async function GET() {
  return handler();
}

export async function POST() {
  return handler();
}
