export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${toStr(item?.id)}::${toStr(item?.label)}`.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeOpaqueId(value) {
  const input = toStr(value);
  return /^[a-f0-9-]{24,}$/i.test(input);
}

function normalizeLabelKey(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickCourierLabel(entry) {
  if (!entry || typeof entry !== "object") return "";
  return toStr(
    entry?.umbrella_name
    || entry?.name
    || entry?.courier_name
    || entry?.label
    || entry?.display_name
    || entry?.full_name
    || entry?.provider_name
    || entry?.company_name
    || entry?.description
    || entry?.slug,
  );
}

function extractHandoverSupport(entry) {
  if (!entry || typeof entry !== "object") {
    return { pickup: null, dropoff: null };
  }

  const options = [
    ...(Array.isArray(entry?.available_handover_options) ? entry.available_handover_options : []),
    ...(Array.isArray(entry?.handover_options) ? entry.handover_options : []),
    ...(Array.isArray(entry?.supported_handover_options) ? entry.supported_handover_options : []),
  ]
    .map((item) => normalizeLabelKey(item))
    .filter(Boolean);

  const pickup =
    typeof entry?.supports_pickup === "boolean"
      ? entry.supports_pickup
      : options.length
        ? options.some((item) => item.includes("pickup"))
        : null;
  const dropoff =
    typeof entry?.supports_dropoff === "boolean"
      ? entry.supports_dropoff
      : options.length
        ? options.some((item) => item.includes("dropoff"))
        : null;

  return { pickup, dropoff };
}

function normalizeCourierList(payload) {
  const buckets = [
    ...(Array.isArray(payload?.couriers) ? payload.couriers : []),
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload) ? payload : []),
  ];

  return uniqueById(
    buckets
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const id = toStr(entry?.id || entry?.courier_id || entry?.slug || entry?.key);
        const label = pickCourierLabel(entry);
        const handover = extractHandoverSupport(entry);
        if (!id && !label) return null;
        return {
          id: id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          label: label || id,
          pickupSupported: handover.pickup,
          dropoffSupported: handover.dropoff,
        };
      })
      .filter(Boolean),
  );
}

function dedupeCourierBrands(couriers) {
  const map = new Map();
  for (const courier of couriers) {
    const label = toStr(courier?.label);
    if (!label) continue;
    const key = normalizeLabelKey(label);
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        id: toStr(courier?.id || key),
        label,
        pickupSupported: typeof courier?.pickupSupported === "boolean" ? courier.pickupSupported : null,
        dropoffSupported: typeof courier?.dropoffSupported === "boolean" ? courier.dropoffSupported : null,
        variants: 1,
      });
      continue;
    }
    current.variants += 1;
    if (typeof courier?.pickupSupported === "boolean") {
      current.pickupSupported = current.pickupSupported === true || courier.pickupSupported === true;
    }
    if (typeof courier?.dropoffSupported === "boolean") {
      current.dropoffSupported = current.dropoffSupported === true || courier.dropoffSupported === true;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function filterByHandover(couriers, handoverMode) {
  const mode = toStr(handoverMode).toLowerCase() === "dropoff" ? "dropoff" : "pickup";
  const key = mode === "dropoff" ? "dropoffSupported" : "pickupSupported";
  const withSignal = couriers.filter((item) => typeof item?.[key] === "boolean");
  if (!withSignal.length) return couriers;
  return couriers.filter((item) => item?.[key] !== false);
}

async function hydrateCourierNames({ baseUrl, token, couriers }) {
  const hydrated = await Promise.all(
    couriers.map(async (courier) => {
      const currentLabel = toStr(courier?.label);
      const courierId = toStr(courier?.id);
      if (!courierId || (currentLabel && !looksLikeOpaqueId(currentLabel))) return courier;
      try {
        const response = await fetch(`${baseUrl}/couriers/${encodeURIComponent(courierId)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return courier;
        const source =
          (payload?.courier && typeof payload.courier === "object" ? payload.courier : null)
          || (payload?.data && typeof payload.data === "object" ? payload.data : null)
          || (payload && typeof payload === "object" ? payload : null);
        const nextLabel = pickCourierLabel(source);
        if (!nextLabel || looksLikeOpaqueId(nextLabel)) return courier;
        return {
          ...courier,
          label: nextLabel,
          pickupSupported:
            typeof source?.supports_pickup === "boolean" ? source.supports_pickup : courier.pickupSupported,
          dropoffSupported:
            typeof source?.supports_dropoff === "boolean" ? source.supports_dropoff : courier.dropoffSupported,
        };
      } catch {
        return courier;
      }
    }),
  );

  return uniqueById(hydrated);
}

async function tryFetchCouriers({ baseUrl, token, originCountry, handoverMode }) {
  const candidates = [
    { path: "/couriers", method: "GET", params: { origin_country_alpha2: originCountry } },
    { path: "/reference/couriers", method: "GET", params: { origin_country_alpha2: originCountry } },
    { path: "/couriers", method: "GET", params: { origin_country: originCountry } },
  ];

  for (const candidate of candidates) {
    const url = new URL(`${baseUrl}${candidate.path}`);
    Object.entries(candidate.params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    const response = await fetch(url.toString(), {
      method: candidate.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) continue;
    const couriers = normalizeCourierList(payload);
    if (couriers.length) {
      const hydrated = await hydrateCourierNames({ baseUrl, token, couriers });
      const deduped = dedupeCourierBrands(hydrated);
      return filterByHandover(deduped, handoverMode);
    }
  }

  return [];
}

export async function GET(req) {
  try {
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
    const originCountry = toStr(req.nextUrl.searchParams.get("originCountry")).toUpperCase();
    const handoverMode = toStr(req.nextUrl.searchParams.get("handoverMode")).toLowerCase() === "dropoff" ? "dropoff" : "pickup";

    if (!originCountry) {
      return err(400, "Missing Origin Country", "An origin country is required to load courier options.");
    }

    if (!token) {
      return ok({ couriers: [], note: "Courier API token is not configured." });
    }

    const couriers = await tryFetchCouriers({ baseUrl, token, originCountry, handoverMode });
    return ok({ couriers });
  } catch (error) {
    return err(500, "Courier Lookup Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
