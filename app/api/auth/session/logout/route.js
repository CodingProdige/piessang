import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });

export async function POST() {
  const response = ok({ message: "Session cleared." });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
