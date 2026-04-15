export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getSessionCookieDomains, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });

export async function POST(req) {
  const response = ok({ message: "Session cleared." });
  const clearOptions = {
    ...SESSION_COOKIE_OPTIONS,
    value: "",
    expires: new Date(0),
    maxAge: 0,
  };

  response.cookies.set(SESSION_COOKIE, "", clearOptions);

  for (const domain of getSessionCookieDomains(req.nextUrl.hostname)) {
    response.cookies.set(SESSION_COOKIE, "", {
      ...clearOptions,
      domain,
    });
  }

  return response;
}
