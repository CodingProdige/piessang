export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSearchText(value) {
  return toStr(value)
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCandidateMeta(item) {
  const data = item?.data || {};
  return {
    id: toStr(item?.id || data?.docId || data?.product?.unique_id || data?.product?.slug),
    title: toStr(data?.product?.title),
    brand: toStr(data?.brand?.title || data?.grouping?.brand),
    category: toStr(data?.grouping?.category),
    subCategory: toStr(data?.grouping?.subCategory),
    imageUrl: toStr(data?.media?.images?.[0]?.imageUrl),
  };
}

async function rerankCandidatesWithVision(client, sourceImageUrl, candidates) {
  const usable = candidates.filter((candidate) => candidate?.imageUrl).slice(0, 8);
  if (usable.length < 2) return { rankedIds: usable.map((candidate) => candidate.id), notes: "" };

  const content = [
    {
      type: "text",
      text:
        "Compare the reference image with each candidate product image. Return JSON only with keys rankedIds and notes. " +
        "rankedIds must list the candidate ids from most visually similar to least visually similar. " +
        "Prefer exact product type, pack format, brand marks, colorway, container shape, and retail presentation.",
    },
    { type: "text", text: "Reference image:" },
    { type: "image_url", image_url: { url: sourceImageUrl } },
  ];

  for (const candidate of usable) {
    content.push({
      type: "text",
      text: `Candidate ${candidate.id}: ${[candidate.title, candidate.brand, candidate.category, candidate.subCategory].filter(Boolean).join(" | ")}`,
    });
    content.push({
      type: "image_url",
      image_url: { url: candidate.imageUrl },
    });
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are Piessang's visual product ranking assistant. Compare a source image with candidate catalogue product images and rank them by visual similarity. Output JSON only.",
      },
      {
        role: "user",
        content,
      },
    ],
  });

  const parsed = safeJsonParse(toStr(completion?.choices?.[0]?.message?.content), {});
  const rankedIds = Array.isArray(parsed?.rankedIds)
    ? parsed.rankedIds.map((value) => toStr(value)).filter(Boolean)
    : [];
  const notes = normalizeSearchText(parsed?.notes || "");
  return { rankedIds, notes };
}

export async function POST(req) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return err(500, "Missing API Key", "OPENAI_API_KEY is not set.");

    const body = await req.json().catch(() => ({}));
    const imageDataUrl = toStr(body?.imageDataUrl);
    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return err(400, "Missing Image", "Provide an imageDataUrl to search with.");
    }

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Piessang's visual product search assistant. Look at the image and return JSON only with keys: label, searchQuery, alternateQueries, notes. " +
            "searchQuery must be a concise ecommerce search phrase that would help find the same or very similar retail products in a marketplace catalogue. " +
            "alternateQueries must be an array of up to 3 short search phrases. " +
            "Do not mention products not visible in the image. Favor product type, brand if visible, pack/count, size/volume, color/material, and common retail naming.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Generate the best catalogue search terms for this image." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const rawText = toStr(completion?.choices?.[0]?.message?.content);
    const parsed = safeJsonParse(rawText, {});
    const label = normalizeSearchText(parsed?.label || "");
    const searchQuery = normalizeSearchText(parsed?.searchQuery || label);
    const alternateQueries = Array.isArray(parsed?.alternateQueries)
      ? parsed.alternateQueries.map((entry) => normalizeSearchText(entry)).filter(Boolean).slice(0, 3)
      : [];
    const notes = normalizeSearchText(parsed?.notes || "");

    if (!searchQuery) {
      return err(502, "Image Search Failed", "The image could not be turned into a useful product search query.");
    }

    const origin = new URL(req.url).origin;
    const attemptedQueries = Array.from(new Set([searchQuery, ...alternateQueries])).slice(0, 4);
    let matchedItems = [];
    let appliedQuery = searchQuery;

    const candidateMap = new Map();
    for (const query of attemptedQueries) {
      const params = new URLSearchParams({
        search: query,
        limit: "24",
        isActive: "true",
      });
      const response = await fetch(`${origin}/api/catalogue/v1/products/product/get?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (response.ok && payload?.ok !== false && items.length) {
        for (const item of items) {
          const meta = getCandidateMeta(item);
          if (!meta.id) continue;
          if (!candidateMap.has(meta.id)) candidateMap.set(meta.id, item);
        }
      }
      if (!matchedItems.length && response.ok && payload?.ok !== false && items.length) {
        matchedItems = items;
        appliedQuery = query;
      }
    }

    const candidateItems = Array.from(candidateMap.values()).slice(0, 24);
    let rerankNotes = "";
    if (candidateItems.length) {
      const candidateMeta = candidateItems.map(getCandidateMeta);
      const rerank = await rerankCandidatesWithVision(client, imageDataUrl, candidateMeta).catch(() => ({ rankedIds: [], notes: "" }));
      rerankNotes = rerank?.notes || "";
      if (Array.isArray(rerank?.rankedIds) && rerank.rankedIds.length) {
        const byId = new Map(candidateItems.map((item) => [getCandidateMeta(item).id, item]));
        const ranked = rerank.rankedIds.map((id) => byId.get(id)).filter(Boolean);
        const leftovers = candidateItems.filter((item) => !rerank.rankedIds.includes(getCandidateMeta(item).id));
        matchedItems = [...ranked, ...leftovers].slice(0, 18);
      } else {
        matchedItems = candidateItems.slice(0, 18);
      }
    }

    return ok({
      label: label || searchQuery,
      searchQuery: appliedQuery,
      alternateQueries,
      notes: rerankNotes || notes,
      items: matchedItems,
      resultCount: matchedItems.length,
    });
  } catch (error) {
    return err(500, "Image Search Failed", error?.message || "Unexpected error while searching by image.");
  }
}
