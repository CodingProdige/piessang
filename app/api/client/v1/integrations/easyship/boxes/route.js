export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeBoxList(payload) {
  const buckets = [
    ...(Array.isArray(payload?.boxes) ? payload.boxes : []),
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload) ? payload : []),
  ];

  const seen = new Set();
  return buckets
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const id = toStr(entry?.id || entry?.slug);
      const slug = toStr(entry?.slug);
      const name = toStr(entry?.name || entry?.label || entry?.slug);
      const umbrella = toStr(entry?.courier_umbrella_name || entry?.courierUmbrellaName || "");
      const key = `${id}::${slug}::${name}`.toLowerCase();
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return {
        id: id || slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        slug: slug || null,
        name: name || slug || "Box",
        type: toStr(entry?.type || entry?.category || ""),
        courierUmbrellaName: umbrella || null,
        lengthCm: Number(entry?.length ?? entry?.dimensions?.length ?? 0) || null,
        widthCm: Number(entry?.width ?? entry?.dimensions?.width ?? 0) || null,
        heightCm: Number(entry?.height ?? entry?.dimensions?.height ?? 0) || null,
        emptyWeightKg: Number(entry?.empty_weight ?? entry?.weight ?? 0) || null,
      };
    })
    .filter(Boolean);
}

export async function GET(req) {
  try {
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
    if (!token) {
      return ok({ boxes: [], note: "Easyship API token is not configured." });
    }

    const { searchParams } = new URL(req.url);
    const originCountry = toStr(searchParams.get("origin_country_alpha2") || searchParams.get("originCountry"));
    const umbrella = toStr(searchParams.get("courier_umbrella_name") || searchParams.get("courierUmbrellaName"));

    const url = new URL(`${baseUrl}/boxes`);
    url.searchParams.set("per_page", "100");
    if (originCountry) url.searchParams.set("courier_country_alpha2", originCountry);
    if (umbrella) url.searchParams.set("courier_umbrella_name", umbrella);

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
        response.status,
        "Easyship Boxes Error",
        toStr(payload?.message || payload?.error || "Unable to load Easyship boxes."),
        { debug: { requestUrl: url.toString(), response: payload } },
      );
    }

    return ok({
      boxes: normalizeBoxList(payload),
      debug: { requestUrl: url.toString() },
    });
  } catch (error) {
    return err(500, "Easyship Boxes Error", error instanceof Error ? error.message : "Unexpected error.");
  }
}
