export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/auth/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";
import { upsertAuthUserDocument } from "@/lib/firebase/admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = String(body?.idToken ?? "").trim();

    if (!idToken) {
      return err(400, "Missing Token", "Provide an idToken in the request body.");
    }

    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified?.uid) {
      return err(401, "Invalid Session", "The supplied ID token could not be verified.");
    }

    try {
      await upsertAuthUserDocument(verified);
    } catch (error) {
      console.error("session/login user sync failed:", error);
    }

    const response = ok({ uid: verified.uid });
    response.cookies.set(SESSION_COOKIE, idToken, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    return err(500, "Unexpected Error", "Unable to create the session.", {
      details: String(error?.message ?? error ?? "").slice(0, 300),
    });
  }
}
