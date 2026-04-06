import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import {
  SEO_PAGE_DEFINITIONS,
  getSeoPageDefinition,
  type SeoPageKey,
} from "@/lib/seo/page-overrides";

export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

const ok = (data: any = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status: number, title: string, message: string) =>
  NextResponse.json({ ok: false, title, message }, { status });

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function requireAdmin() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) throw new Error("UNAUTHORIZED");
  const db = getAdminDb();
  if (!db) throw new Error("NO_DB");
  const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) throw new Error("FORBIDDEN");
  return db;
}

export async function GET() {
  try {
    const db = await requireAdmin();
    const snapshot = await db.collection("seo_pages_v1").get();
    const overrides = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        key: docSnap.id,
        path: toStr(data.path),
        title: toStr(data.title),
        description: toStr(data.description),
        updatedAt: typeof data?.updatedAt?.toDate === "function" ? data.updatedAt.toDate().toISOString() : null,
      };
    });
    return ok({ pages: SEO_PAGE_DEFINITIONS, overrides });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return err(401, "Unauthorized", "Sign in again to manage SEO.");
    if (error instanceof Error && error.message === "FORBIDDEN") return err(403, "Access Denied", "System admin access required.");
    return err(500, "SEO Load Failed", error instanceof Error ? error.message : "Unable to load SEO pages.");
  }
}

export async function POST(request: Request) {
  try {
    const db = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const action = toStr(body?.action);
    const pageKey = toStr(body?.pageKey) as SeoPageKey;
    const definition = getSeoPageDefinition(pageKey);

    if (action === "save") {
      if (!definition) return err(400, "Invalid Page", "Choose a public page to update.");
      const title = toStr(body?.title, definition.defaultTitle).slice(0, 120);
      const description = toStr(body?.description, definition.defaultDescription).slice(0, 320);
      await db.collection("seo_pages_v1").doc(pageKey).set(
        {
          pageKey,
          path: definition.path,
          title,
          description,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      return ok({ saved: true });
    }

    if (action === "suggest") {
      if (!definition) return err(400, "Invalid Page", "Choose a public page to generate suggestions for.");
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return err(500, "AI Not Configured", "OPENAI_API_KEY is not configured.");
      const client = new OpenAI({ apiKey });
      const currentTitle = toStr(body?.title, definition.defaultTitle);
      const currentDescription = toStr(body?.description, definition.defaultDescription);
      const completion = await client.responses.create({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "You generate concise ecommerce SEO metadata. Return strict JSON with keys title and description only. Keep titles under 60 characters when possible and descriptions under 160 characters when possible.",
          },
          {
            role: "user",
            content: `Page: ${definition.label}\nPath: ${definition.path}\nCurrent title: ${currentTitle}\nCurrent description: ${currentDescription}\nGenerate a stronger SEO title and meta description for Piessang.`,
          },
        ],
      });
      const outputText = toStr(completion.output_text);
      const parsed = JSON.parse(outputText || "{}");
      return ok({
        suggestion: {
          title: toStr(parsed?.title, currentTitle),
          description: toStr(parsed?.description, currentDescription),
        },
      });
    }

    return err(400, "Invalid Action", "Use save or suggest.");
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return err(401, "Unauthorized", "Sign in again to manage SEO.");
    if (error instanceof Error && error.message === "FORBIDDEN") return err(403, "Access Denied", "System admin access required.");
    if (error instanceof SyntaxError) return err(500, "AI Response Failed", "The AI response could not be parsed.");
    return err(500, "SEO Update Failed", error instanceof Error ? error.message : "Unable to update SEO.");
  }
}

