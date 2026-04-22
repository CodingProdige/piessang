export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { resolveEasyshipCategoryMapping, resolveReviewedHsFallback } from "@/lib/integrations/easyship-taxonomy";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function pickFirstHsCode(payload) {
  const candidates = [
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload?.hs_codes) ? payload.hs_codes : []),
    ...(Array.isArray(payload) ? payload : []),
  ];
  const first = candidates[0] || null;
  if (!first || typeof first !== "object") return null;
  const code = toStr(first?.code || first?.hs_code || first?.id);
  const description = toStr(first?.description || first?.name);
  if (!code) return null;
  return { code, description: description || null };
}

function buildHsLookupDescription(body, mapping) {
  const customsCategory = toStr(body?.customsCategory);
  const title = toStr(body?.title);
  const brand = toStr(body?.brandTitle || body?.brand);
  const category = toStr(body?.categorySlug).replace(/[-_]+/g, " ");
  const subCategory = toStr(body?.subCategorySlug).replace(/[-_]+/g, " ");
  const overview = toStr(body?.overview);
  const description = toStr(body?.description);
  const mappedTerm = toStr(mapping?.hsSearchTerm);

  const parts = [
    customsCategory ? `Customs category: ${customsCategory}.` : "",
    title ? `Product title: ${title}.` : "",
    brand ? `Brand: ${brand}.` : "",
    category ? `Marketplace category: ${category}.` : "",
    subCategory ? `Marketplace subcategory: ${subCategory}.` : "",
    overview ? `Overview: ${overview}.` : "",
    description ? `Description: ${description}.` : "",
    mappedTerm ? `Search hint: ${mappedTerm}.` : "",
  ].filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 700);
}

async function fetchOpenAiHsSuggestion({ customsCategory, title, mapping, apiKey }) {
  const input = {
    customsCategory: toStr(customsCategory),
    productTitle: toStr(title),
    mappedSearchTerm: toStr(mapping?.hsSearchTerm),
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      text: {
        format: {
          type: "json_schema",
          name: "hs_code_suggestion",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              code: { type: "string" },
              description: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["code", "description", "confidence"],
          },
        },
      },
      instructions: [
        "You are helping classify a product for customs.",
        "Suggest only a likely universal HS code classification at the 6-digit level when possible.",
        "Be conservative. If the item is ambiguous, still return the most likely general 6-digit customs code.",
        "Return concise factual output only.",
      ].join(" "),
      input: JSON.stringify(input),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(toStr(payload?.error?.message || payload?.message || `OpenAI request failed (${response.status}).`));
  }

  const text =
    toStr(payload?.output_text) ||
    (Array.isArray(payload?.output)
      ? payload.output
          .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
          .map((item) => toStr(item?.text))
          .join("")
          .trim()
      : "");
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const code = toStr(parsed?.code).replace(/[^\d.]/g, "");
    const description = toStr(parsed?.description);
    const confidence = toStr(parsed?.confidence).toLowerCase();
    if (!code) return null;
    return {
      code,
      description: description || null,
      confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "low",
    };
  } catch {
    return null;
  }
}

export async function POST(req) {
  try {
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const openAiKey = toStr(process.env.OPENAI_API_KEY);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
    const body = await req.json().catch(() => ({}));
    const categorySlug = toStr(body?.categorySlug);
    const subCategorySlug = toStr(body?.subCategorySlug);
    const title = toStr(body?.title);
    const customsCategory = toStr(body?.customsCategory);
    const mapping = resolveEasyshipCategoryMapping({ categorySlug, subCategorySlug });
    const reviewedFallback = resolveReviewedHsFallback({ categorySlug, subCategorySlug });
    const queryDescription = buildHsLookupDescription(body, mapping);

    if (!queryDescription) {
      return err(400, "Missing Description", "A category or description is required to suggest an HS code.");
    }

    if (!token) {
      return ok({
        suggestion: null,
        mapping,
        source: "none",
        note: "Easyship API token is not configured for live HS code suggestions.",
      });
    }

    const url = new URL(`${baseUrl}/hs_codes`);
    url.searchParams.set("description", queryDescription);
    url.searchParams.set("per_page", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return err(
        response.status || 500,
        "Easyship Suggestion Failed",
        toStr(payload?.message || payload?.error || "Easyship could not suggest an HS code right now."),
        { mapping },
      );
    }

    const easyshipSuggestion = pickFirstHsCode(payload);
    if (easyshipSuggestion) {
      return ok({
        suggestion: easyshipSuggestion,
        mapping,
        source: "easyship",
        confidence: "high",
      });
    }

    if (reviewedFallback) {
      return ok({
        suggestion: {
          code: reviewedFallback.code,
          description: reviewedFallback.description,
        },
        mapping,
        source: "reviewed_fallback",
        confidence: reviewedFallback.confidence,
        note: "Piessang used a reviewed customs fallback for this product family because Easyship could not confidently suggest an HS code.",
      });
    }

    if (openAiKey) {
      const aiSuggestion = await fetchOpenAiHsSuggestion({
        customsCategory,
        title,
        mapping,
        apiKey: openAiKey,
      }).catch(() => null);
      if (aiSuggestion) {
        return ok({
          suggestion: {
            code: aiSuggestion.code,
            description: aiSuggestion.description,
          },
          mapping,
          source: "ai_fallback",
          confidence: aiSuggestion.confidence,
          note: "Piessang used an AI fallback because Easyship could not confidently suggest an HS code for this category.",
        });
      }
    }

    return ok({
      suggestion: null,
      mapping,
      source: "none",
      note: "Easyship could not confidently suggest an HS code for this product.",
    });
  } catch (error) {
    return err(500, "Easyship Suggestion Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
