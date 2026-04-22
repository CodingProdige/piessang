export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { EASYSHIP_CUSTOMS_CATEGORY_FALLBACK_OPTIONS } from "@/lib/integrations/easyship-taxonomy";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeLabel(value) {
  return toStr(value)
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSorted(values) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeLabel(value))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function extractReferenceItems(payload) {
  return [
    ...(Array.isArray(payload?.categories) ? payload.categories : []),
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload) ? payload : []),
  ];
}

function pickCategoryLabel(entry) {
  if (typeof entry === "string") return normalizeLabel(entry);
  if (!entry || typeof entry !== "object") return "";
  return normalizeLabel(
    entry?.name ||
      entry?.label ||
      entry?.display_name ||
      entry?.description ||
      entry?.title ||
      entry?.category ||
      entry?.value,
  );
}

let cache = {
  expiresAt: 0,
  categories: [],
  source: "fallback",
};

async function fetchEasyshipCategories({ token, baseUrl }) {
  const candidates = [
    "/reference/categories",
    "/reference/item_categories",
    "/categories",
    "/item_categories",
    "/references/categories",
  ];

  for (const path of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const categories = uniqueSorted(extractReferenceItems(payload).map((entry) => pickCategoryLabel(entry)));
      if (categories.length) {
        return { categories, source: `easyship:${path}` };
      }
    } catch {
      continue;
    }
  }

  return {
    categories: [...EASYSHIP_CUSTOMS_CATEGORY_FALLBACK_OPTIONS],
    source: "fallback",
  };
}

export async function GET() {
  try {
    const now = Date.now();
    if (cache.expiresAt > now && Array.isArray(cache.categories) && cache.categories.length) {
      return ok({
        categories: cache.categories,
        source: cache.source,
        cached: true,
      });
    }

    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");

    if (!token) {
      cache = {
        expiresAt: now + 5 * 60 * 1000,
        categories: [...EASYSHIP_CUSTOMS_CATEGORY_FALLBACK_OPTIONS],
        source: "fallback:no-token",
      };
      return ok({
        categories: cache.categories,
        source: cache.source,
        cached: false,
      });
    }

    const result = await fetchEasyshipCategories({ token, baseUrl });
    cache = {
      expiresAt: now + 60 * 60 * 1000,
      categories: result.categories,
      source: result.source,
    };

    return ok({
      categories: result.categories,
      source: result.source,
      cached: false,
    });
  } catch (error) {
    return err(
      500,
      "Easyship Categories Failed",
      error instanceof Error ? error.message : "Unexpected error.",
      {
        categories: [...EASYSHIP_CUSTOMS_CATEGORY_FALLBACK_OPTIONS],
        source: "fallback:error",
      },
    );
  }
}
