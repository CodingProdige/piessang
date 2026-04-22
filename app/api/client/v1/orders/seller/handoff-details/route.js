export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toLower(value) {
  return toStr(value).toLowerCase();
}

function isSystemAdminUser(data) {
  return toLower(data?.system?.accessType || data?.systemAccessType) === "admin";
}

function getRequesterSellerIdentifiers(userData) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return new Set(
    [
      seller?.sellerCode,
      seller?.activeSellerCode,
      seller?.groupSellerCode,
      seller?.sellerSlug,
      seller?.activeSellerSlug,
      seller?.groupSellerSlug,
    ]
      .map((item) => toLower(item))
      .filter(Boolean),
  );
}

function normalizeCountryAlpha2(input) {
  const value = toStr(input).toUpperCase();
  if (value.length === 2) return value;
  if (value === "SOUTH AFRICA") return "ZA";
  if (value === "UNITED STATES" || value === "UNITED STATES OF AMERICA") return "US";
  if (value === "CANADA") return "CA";
  return value.slice(0, 2);
}

function getSellerBreakdownEntry(order, sellerCode, sellerSlug) {
  const snapshot = order?.delivery_snapshot && typeof order.delivery_snapshot === "object" ? order.delivery_snapshot : {};
  const delivery = order?.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const breakdown = Array.isArray(snapshot?.sellerDeliveryBreakdown)
    ? snapshot.sellerDeliveryBreakdown
    : Array.isArray(delivery?.fee?.seller_breakdown)
      ? delivery.fee.seller_breakdown
      : [];

  const normalizedCode = toLower(sellerCode);
  const normalizedSlug = toLower(sellerSlug);
  return breakdown.find((item) => {
    const entryCode = toLower(item?.sellerCode || item?.seller_code || item?.seller_key || "");
    const entrySlug = toLower(item?.sellerSlug || item?.seller_slug || "");
    return Boolean((normalizedCode && entryCode === normalizedCode) || (normalizedSlug && entrySlug === normalizedSlug));
  }) || null;
}

function parseListPayload(payload) {
  return [
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload?.addresses) ? payload.addresses : []),
    ...(Array.isArray(payload?.pickup_slots) ? payload.pickup_slots : []),
    ...(Array.isArray(payload?.locations) ? payload.locations : []),
    ...(Array.isArray(payload) ? payload : []),
  ];
}

async function easyshipFetch(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ensureOriginAddressId({ baseUrl, token, origin, companyName }) {
  const countryAlpha2 = normalizeCountryAlpha2(origin?.country);
  const city = toStr(origin?.city || origin?.suburb);
  const postalCode = toStr(origin?.postalCode);
  const state = toStr(origin?.region);
  const line1 = toStr(origin?.suburb || origin?.city || origin?.region || origin?.country);
  if (!countryAlpha2 || !city || !line1) return null;

  const listUrl = new URL(`${baseUrl}/addresses`);
  listUrl.searchParams.set("status", "active");
  listUrl.searchParams.set("per_page", "100");
  const listed = await easyshipFetch(listUrl.toString(), token, { method: "GET" });
  if (listed.response.ok) {
    const match = parseListPayload(listed.payload).find((entry) => {
      const entryCountry = normalizeCountryAlpha2(entry?.country_alpha2 || entry?.country);
      const entryCity = toLower(entry?.city);
      const entryPostal = toLower(entry?.postal_code || entry?.postalCode);
      const entryState = toLower(entry?.state);
      const entryLine1 = toLower(entry?.line_1 || entry?.line1);
      return (
        entryCountry === countryAlpha2 &&
        entryCity === toLower(city) &&
        entryPostal === toLower(postalCode) &&
        entryState === toLower(state) &&
        entryLine1 === toLower(line1)
      );
    });
    if (match?.id) return toStr(match.id);
  }

  const created = await easyshipFetch(`${baseUrl}/addresses`, token, {
    method: "POST",
    body: JSON.stringify({
      company_name: toStr(companyName || "Piessang seller").slice(0, 27),
      line_1: line1.slice(0, 35),
      line_2: "",
      city: city.slice(0, 200),
      state: state.slice(0, 200),
      postal_code: postalCode || undefined,
      country_alpha2: countryAlpha2,
    }),
  });
  const createdSource =
    (created.payload?.address && typeof created.payload.address === "object" ? created.payload.address : null)
    || (created.payload?.data && typeof created.payload.data === "object" ? created.payload.data : null)
    || created.payload;
  return toStr(createdSource?.id || "");
}

function mapPickupSlots(payload) {
  return parseListPayload(payload)
    .map((slot) => {
      const date = toStr(slot?.selected_date || slot?.date);
      const from = toStr(slot?.selected_from_time || slot?.from_time || slot?.from);
      const to = toStr(slot?.selected_to_time || slot?.to_time || slot?.to);
      const id = toStr(slot?.time_slot_id || slot?.id);
      if (!date && !from && !to) return null;
      return { id: id || `${date}-${from}-${to}`, date, from, to };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function mapLocations(payload) {
  return parseListPayload(payload)
    .map((entry) => {
      const name = toStr(entry?.name || entry?.location_name || entry?.description || entry?.company_name);
      const address = [
        toStr(entry?.line_1 || entry?.address1),
        toStr(entry?.line_2 || entry?.address2),
        toStr(entry?.city),
        toStr(entry?.state),
        toStr(entry?.postal_code || entry?.postalCode),
      ].filter(Boolean).join(", ");
      if (!name && !address) return null;
      return {
        id: toStr(entry?.id || entry?.location_id || `${name}-${address}`),
        name: name || "Service point",
        address,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

async function fetchDropoffLocations({ baseUrl, token, carrier, origin }) {
  const normalizedCarrier = toLower(carrier);
  let endpoint = "";
  if (normalizedCarrier.includes("fedex")) endpoint = "fedex";
  else if (normalizedCarrier.includes("ups")) endpoint = "ups";
  else if (normalizedCarrier.includes("usps")) endpoint = "usps";
  else if (normalizedCarrier.includes("canada post")) endpoint = "canada_post";
  if (!endpoint) {
    return { locations: [], note: "Dropoff location lookup is not available for this courier yet." };
  }

  const url = new URL(`${baseUrl}/locations/${endpoint}`);
  url.searchParams.set("country_alpha2", normalizeCountryAlpha2(origin?.country));
  if (toStr(origin?.city)) url.searchParams.set("city", toStr(origin.city));
  if (toStr(origin?.region)) url.searchParams.set("state", toStr(origin.region));
  if (toStr(origin?.postalCode)) url.searchParams.set("postal_code", toStr(origin.postalCode));
  if (toStr(origin?.suburb || origin?.city)) url.searchParams.set("line_1", toStr(origin?.suburb || origin?.city));
  url.searchParams.set("per_page", "5");
  const fetched = await easyshipFetch(url.toString(), token, { method: "GET" });
  if (!fetched.response.ok) {
    return { locations: [], note: toStr(fetched.payload?.message || "Dropoff location lookup is unavailable right now.") };
  }
  return { locations: mapLocations(fetched.payload), note: "" };
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load courier handoff details.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const isSystemAdmin = isSystemAdminUser(requester);
    const requesterIdentifiers = getRequesterSellerIdentifiers(requester);

    const { searchParams } = new URL(req.url);
    const orderId = toStr(searchParams.get("orderId"));
    const sellerCode = toStr(searchParams.get("sellerCode"));
    const sellerSlug = toStr(searchParams.get("sellerSlug"));
    if (!orderId) return err(400, "Missing Order", "An orderId is required.");

    if (!isSystemAdmin && !requesterIdentifiers.has(toLower(sellerCode)) && !requesterIdentifiers.has(toLower(sellerSlug))) {
      return err(403, "Forbidden", "You do not have access to this seller order.");
    }

    const orderSnap = await db.collection("orders_v2").doc(orderId).get();
    if (!orderSnap.exists) return err(404, "Order Not Found", "This order could not be found.");
    const order = orderSnap.data() || {};
    const entry = getSellerBreakdownEntry(order, sellerCode, sellerSlug);
    if (!entry) return err(404, "Delivery Not Found", "No courier delivery details were found for this seller slice.");

    const deliveryType = toLower(entry?.delivery_type || entry?.method || entry?.type || "");
    if (!["courier_live_rate", "platform_courier_live_rate"].includes(deliveryType)) {
      return err(409, "Not Platform Courier", "This order is not using Piessang-managed courier shipping.");
    }

    const ownerDoc =
      (sellerCode ? await findSellerOwnerByCode(sellerCode) : null) ??
      (sellerSlug ? await findSellerOwnerBySlug(sellerSlug) : null);
    const seller = ownerDoc?.data?.seller && typeof ownerDoc.data.seller === "object" ? ownerDoc.data.seller : {};
    const origin = seller?.deliveryProfile?.origin && typeof seller.deliveryProfile.origin === "object" ? seller.deliveryProfile.origin : null;
    const companyName = toStr(seller?.vendorName || seller?.groupVendorName || seller?.companyName || "Piessang seller");

    const selectedQuoteId = toStr(entry?.selected_courier_quote_id || "");
    const carrier = toStr(entry?.courier_carrier || entry?.courierCarrier || "");
    const service = toStr(entry?.courier_service || entry?.courierService || "");
    const handoverMode = toLower(entry?.courier_handover_mode || "") === "dropoff" ? "dropoff" : "pickup";
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");

    const result = {
      handoverMode,
      carrier,
      service,
      pickupSlots: [],
      dropoffLocations: [],
      note: "",
    };

    if (!origin?.country) {
      return ok({
        details: {
          ...result,
          note: "Set the seller shipping origin before Piessang can fetch pickup slots or dropoff points.",
        },
      });
    }

    if (!token || !selectedQuoteId) {
      return ok({
        details: {
          ...result,
          note: "Courier handoff details are not available yet for this order.",
        },
      });
    }

    if (handoverMode === "pickup") {
      const originAddressId = await ensureOriginAddressId({ baseUrl, token, origin, companyName });
      if (!originAddressId) {
        return ok({
          details: {
            ...result,
            note: "Piessang could not prepare the origin address for pickup-slot lookup yet.",
          },
        });
      }
      const slotsUrl = new URL(`${baseUrl}/courier_services/${encodeURIComponent(selectedQuoteId)}/pickup_slots`);
      slotsUrl.searchParams.set("origin_address_id", originAddressId);
      const slots = await easyshipFetch(slotsUrl.toString(), token, { method: "GET" });
      if (!slots.response.ok) {
        return ok({
          details: {
            ...result,
            note: toStr(slots.payload?.message || "Pickup slots are not available for this courier service yet."),
          },
        });
      }
      return ok({
        details: {
          ...result,
          pickupSlots: mapPickupSlots(slots.payload),
          note: "",
        },
      });
    }

    const dropoff = await fetchDropoffLocations({ baseUrl, token, carrier, origin });
    return ok({
      details: {
        ...result,
        dropoffLocations: dropoff.locations,
        note: dropoff.note,
      },
    });
  } catch (error) {
    return err(500, "Courier Handoff Lookup Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
