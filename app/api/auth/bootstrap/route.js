import { NextResponse } from "next/server";
import { getServerAuthBootstrap } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bootstrap = await getServerAuthBootstrap();
    return NextResponse.json({ ok: true, ...bootstrap });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        title: "Unexpected Error",
        message: "Unable to load authentication bootstrap.",
        details: String(error?.message ?? error ?? "").slice(0, 300),
      },
      { status: 500 },
    );
  }
}
