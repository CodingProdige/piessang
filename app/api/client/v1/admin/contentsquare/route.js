export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import {
  createContentsquareReplay,
  deleteContentsquareReplay,
  listContentsquareReplays,
} from "@/lib/integrations/contentsquare-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage Contentsquare tools.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage Contentsquare tools.") };
  }

  return { sessionUser };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const replays = await listContentsquareReplays(100);
    return ok({ items: replays });
  } catch (error) {
    console.error("admin/contentsquare get failed:", error);
    return err(500, "Unexpected Error", "Unable to load Contentsquare replay entries.", {
      details: String(error?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const action = toStr(body?.action || "create").toLowerCase();

    if (action === "create") {
      const item = await createContentsquareReplay(body?.data || body, auth.sessionUser.uid);
      return ok({ item }, 201);
    }

    if (action === "delete") {
      const result = await deleteContentsquareReplay(body?.id);
      return ok(result);
    }

    return err(400, "Invalid Action", "Supported actions are create and delete.");
  } catch (error) {
    console.error("admin/contentsquare post failed:", error);
    return err(500, "Unexpected Error", toStr(error?.message, "Unable to update Contentsquare replay entries."));
  }
}
