import { NextResponse } from "next/server";
import { getPublishedLandingPage } from "@/lib/cms/landing-page";

export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

const ok = (data: any = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status: number, title: string, message: string) =>
  NextResponse.json({ ok: false, title, message }, { status });

export async function GET() {
  try {
    const page = await getPublishedLandingPage();
    return ok({
      page: {
        fixedHero: page?.fixedHero || null,
      },
    });
  } catch (error) {
    return err(500, "Landing Page Failed", error instanceof Error ? error.message : "Unable to load landing page data.");
  }
}
