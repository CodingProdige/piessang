import type { CourierAdapter, ShippingRateQuote, ShipmentAddress, ShipmentParcel } from "@/lib/shipping/contracts";
import { COUNTRY_CATALOG } from "@/lib/marketplace/country-config";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

class EasyshipRatesError extends Error {
  debug?: Record<string, unknown>;

  constructor(message: string, debug?: Record<string, unknown>) {
    super(message);
    this.name = "EasyshipRatesError";
    this.debug = debug;
  }
}

function findCountryAlpha2(input: unknown) {
  const value = toStr(input).toUpperCase();
  if (!value) return "";
  if (value.length === 2) return value;
  const match = COUNTRY_CATALOG.find((entry) => entry.label.trim().toLowerCase() === value.trim().toLowerCase());
  return match?.code || "";
}

function aggregateParcels(parcels: ShipmentParcel[] = []) {
  const safe = Array.isArray(parcels) ? parcels : [];
  return safe.reduce(
    (summary, parcel) => {
      summary.totalActualWeight += Math.max(0, toNum(parcel?.actualWeightKg, 0));
      summary.lengthCm = Math.max(summary.lengthCm, Math.max(0, toNum(parcel?.lengthCm, 0)));
      summary.widthCm = Math.max(summary.widthCm, Math.max(0, toNum(parcel?.widthCm, 0)));
      summary.heightCm += Math.max(0, toNum(parcel?.heightCm, 0));
      return summary;
    },
    { totalActualWeight: 0, lengthCm: 0, widthCm: 0, heightCm: 0 },
  );
}

function getMarkupConfig() {
  const percent = Number(process.env.EASYSHIP_MARKUP_PERCENT ?? process.env.PIESSANG_EASYSHIP_MARKUP_PERCENT ?? 0);
  const fixedAmount = Number(process.env.EASYSHIP_MARKUP_FIXED ?? process.env.PIESSANG_EASYSHIP_MARKUP_FIXED ?? 0);
  const minimumAmount = Number(process.env.EASYSHIP_MARKUP_MIN ?? process.env.PIESSANG_EASYSHIP_MARKUP_MIN ?? 0);
  const maximumAmount = Number(process.env.EASYSHIP_MARKUP_MAX ?? process.env.PIESSANG_EASYSHIP_MARKUP_MAX ?? 0);
  return {
    percent: Number.isFinite(percent) ? percent : 0,
    fixedAmount: Number.isFinite(fixedAmount) ? fixedAmount : 0,
    minimumAmount: Number.isFinite(minimumAmount) ? minimumAmount : 0,
    maximumAmount: Number.isFinite(maximumAmount) ? maximumAmount : 0,
  };
}

function applyMarkup(amount: number) {
  const baseAmount = Math.max(0, roundMoney(amount));
  const { percent, fixedAmount, minimumAmount, maximumAmount } = getMarkupConfig();
  let markup = baseAmount * Math.max(0, percent);
  markup += Math.max(0, fixedAmount);
  if (minimumAmount > 0) markup = Math.max(markup, minimumAmount);
  if (maximumAmount > 0) markup = Math.min(markup, maximumAmount);
  return {
    finalAmount: roundMoney(baseAmount + markup),
    markupAmount: roundMoney(markup),
  };
}

function buildAddress(address: ShipmentAddress | null | undefined) {
  const countryCode = findCountryAlpha2(address?.country);
  if (!countryCode) return null;
  return {
    country_alpha2: countryCode,
    state: toStr(address?.region),
    city: toStr(address?.city || address?.suburb),
    postal_code: toStr(address?.postalCode),
  };
}

function buildFullAddress(address: ShipmentAddress | null | undefined, companyName = "") {
  const countryCode = findCountryAlpha2(address?.country);
  if (!countryCode) return null;
  const line1 = toStr(address?.suburb || address?.city || address?.region || address?.country).slice(0, 35);
  return {
    company_name: toStr(companyName || "Piessang seller").slice(0, 27),
    line_1: line1 || toStr(address?.city || address?.region || address?.country).slice(0, 35),
    line_2: "",
    state: toStr(address?.region),
    city: toStr(address?.city || address?.suburb),
    postal_code: toStr(address?.postalCode),
    country_alpha2: countryCode,
  };
}

function parseAllowedCouriers(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => toStr(entry).toLowerCase()).filter(Boolean)
    : [];
}

function matchesPreferredCourier(quote: any, preferredCouriers: string[]) {
  if (!preferredCouriers.length) return true;
  const courierName = toStr(quote?.courier_name).toLowerCase();
  return preferredCouriers.some((entry) => courierName.includes(entry));
}

function matchesHandover(quote: any, handoverMode: string) {
  const availableOptions = Array.isArray(quote?.available_handover_options)
    ? quote.available_handover_options.map((entry: unknown) => toStr(entry).toLowerCase())
    : [];
  if (!availableOptions.length) return true;
  if (handoverMode === "dropoff") return availableOptions.includes("dropoff");
  return availableOptions.includes("free_pickup") || availableOptions.includes("paid_pickup");
}

function defaultQuoteItems(request: any) {
  const items = Array.isArray(request?.metadata?.items) ? request.metadata.items : [];
  const defaultCategory = toStr(process.env.EASYSHIP_DEFAULT_ITEM_CATEGORY);
  return items
    .map((item: any) => {
      const quantity = Math.max(1, Math.trunc(toNum(item?.quantity, 1)));
      const unitValue = Math.max(0.01, roundMoney(toNum(item?.unitValue, 0)));
      const category = toStr(item?.customsCategory || item?.category || defaultCategory);
      const hsCode = toStr(item?.hsCode || item?.hs_code || "");
      const originCountry = findCountryAlpha2(item?.countryOfOrigin || item?.country_of_origin);
      return {
        description: toStr(item?.description || "Marketplace item").slice(0, 200),
        category,
        quantity,
        declared_currency: toStr(request.currency || "ZAR").toUpperCase() || "ZAR",
        declared_customs_value: unitValue,
        hs_code: hsCode || undefined,
        origin_country_alpha2: originCountry || undefined,
      };
    })
    .filter((entry: any) => entry.description && entry.category && entry.declared_customs_value > 0);
}

async function easyshipFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function getPayloadObject(payload: any) {
  if (payload?.shipment && typeof payload.shipment === "object") return payload.shipment;
  if (payload?.data && typeof payload.data === "object") return payload.data;
  if (payload && typeof payload === "object") return payload;
  return {};
}

function mapShipmentStatus(source: any) {
  const deliveryState = toStr(source?.delivery_state || source?.delivery?.state).toLowerCase();
  const shipmentState = toStr(source?.shipment_state || source?.state).toLowerCase();
  const labelState = toStr(source?.label_state || source?.label?.state).toLowerCase();
  const pickupState = toStr(source?.pickup_state || source?.pickup?.state).toLowerCase();

  if (deliveryState === "delivered") return "delivered";
  if (deliveryState === "out_for_delivery") return "out_for_delivery";
  if (deliveryState === "failed_attempt") return "exception";
  if (deliveryState === "exception") return "exception";
  if (deliveryState === "in_transit") return "in_transit";
  if (pickupState && pickupState !== "none" && pickupState !== "pending") return "pickup_scheduled";
  if (labelState === "generated") return "label_generated";
  if (labelState === "pending") return "label_pending";
  if (shipmentState === "created") return "created";
  return shipmentState || labelState || deliveryState || "created";
}

function extractDocumentUrl(source: any) {
  const direct =
    toStr(source?.label_url) ||
    toStr(source?.shipping_label?.url) ||
    toStr(source?.label?.url) ||
    "";
  if (direct) return direct;
  const docs = Array.isArray(source?.documents) ? source.documents : [];
  const labelDoc = docs.find((entry: any) => toStr(entry?.document_type || entry?.type).toLowerCase().includes("label"));
  return toStr(labelDoc?.url || "");
}

async function ensureOriginAddressId(baseUrl: string, token: string, originAddress: any) {
  const listed = await easyshipFetch(`${baseUrl}/addresses?status=active&per_page=100`, token, { method: "GET" });
  if (listed.response.ok) {
    const addresses = [
      ...(Array.isArray(listed.payload?.addresses) ? listed.payload.addresses : []),
      ...(Array.isArray(listed.payload?.data) ? listed.payload.data : []),
      ...(Array.isArray(listed.payload) ? listed.payload : []),
    ];
    const found = addresses.find((entry: any) => {
      return (
        toStr(entry?.country_alpha2 || entry?.country) === toStr(originAddress?.country_alpha2) &&
        toStr(entry?.city).toLowerCase() === toStr(originAddress?.city).toLowerCase() &&
        toStr(entry?.postal_code).toLowerCase() === toStr(originAddress?.postal_code).toLowerCase() &&
        toStr(entry?.line_1).toLowerCase() === toStr(originAddress?.line_1).toLowerCase()
      );
    });
    if (toStr(found?.id)) return toStr(found.id);
  }
  const created = await easyshipFetch(`${baseUrl}/addresses`, token, {
    method: "POST",
    body: JSON.stringify(originAddress),
  });
  const createdSource = getPayloadObject(created.payload);
  return toStr(createdSource?.id || "");
}

function mapPickupSlots(payload: any) {
  const items = [
    ...(Array.isArray(payload?.pickup_slots) ? payload.pickup_slots : []),
    ...(Array.isArray(payload?.data) ? payload.data : []),
    ...(Array.isArray(payload) ? payload : []),
  ];
  return items
    .map((slot: any) => ({
      id: toStr(slot?.time_slot_id || slot?.id),
      date: toStr(slot?.selected_date || slot?.date),
      from: toStr(slot?.selected_from_time || slot?.from_time || slot?.from),
      to: toStr(slot?.selected_to_time || slot?.to_time || slot?.to),
    }))
    .filter((slot) => slot.date || slot.from || slot.to);
}

export const easyshipRateAdapter: CourierAdapter = {
  key: "easyship",
  label: "Easyship",
  async getRates(request: any) {
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
    if (!token) return [];

    const originAddress = buildAddress(request.origin);
    const destinationAddress = buildAddress(request.destination);
    if (!originAddress || !destinationAddress) return [];

    const aggregated = aggregateParcels(request.parcels || []);
    if (!(aggregated.totalActualWeight > 0)) return [];

    const items = defaultQuoteItems(request);
    if (!items.length) return [];

    const easyshipPayload = {
      origin_address: originAddress,
      destination_address: destinationAddress,
      incoterms: "DDU",
      calculate_tax_and_duties: true,
      parcels: [
        {
          total_actual_weight: roundMoney(aggregated.totalActualWeight),
          box: {
            slug: "custom",
            length: Math.max(1, Math.round(aggregated.lengthCm || 1)),
            width: Math.max(1, Math.round(aggregated.widthCm || 1)),
            height: Math.max(1, Math.round(aggregated.heightCm || 1)),
          },
          items,
        },
      ],
    };

    const response = await fetch(`${baseUrl}/rates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(easyshipPayload),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = toStr(payload?.message || payload?.error || `Easyship rates request failed (${response.status}).`);
      throw new EasyshipRatesError(message, {
        status: response.status,
        request: easyshipPayload,
        response: payload,
      });
    }

    const preferredCouriers = parseAllowedCouriers(request?.metadata?.courierProfile?.allowedCouriers);
    const handoverMode = toStr(request?.metadata?.courierProfile?.handoverMode || "pickup").toLowerCase();
    const rates = Array.isArray(payload?.rates) ? payload.rates : [];

    return rates
      .filter((quote: any) => matchesPreferredCourier(quote, preferredCouriers))
      .filter((quote: any) => matchesHandover(quote, handoverMode))
      .map((quote: any): ShippingRateQuote => {
        const baseAmount = roundMoney(toNum(quote?.total_charge, quote?.shipment_charge_total || quote?.shipment_charge || 0));
        const markup = applyMarkup(baseAmount);
        return {
          method: "courier_live_rate",
          carrier: toStr(quote?.courier_name || "Easyship courier"),
          service: toStr(quote?.description || quote?.full_description || "Courier service"),
          amountIncl: markup.finalAmount,
          currency: toStr(quote?.currency || request.currency || "ZAR").toUpperCase() || "ZAR",
          leadTimeDays: Number.isFinite(Number(quote?.min_delivery_time)) ? Number(quote.min_delivery_time) : null,
          cutoffTime: null,
          available: true,
          reasonCode: null,
          reasons: [],
          metadata: {
            adapterKey: "easyship",
            courierId: toStr(quote?.courier_id),
            baseAmount,
            markupAmount: markup.markupAmount,
            handoverOptions: Array.isArray(quote?.available_handover_options) ? quote.available_handover_options : [],
            incoterms: toStr(quote?.incoterms),
            easyshipRating: quote?.easyship_rating ?? null,
            totalChargeRaw: quote?.total_charge ?? null,
            debugRequest: easyshipPayload,
          },
        };
      });
  },
  async createShipment(request: any) {
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
    if (!token) throw new Error("Easyship token is not configured.");

    const originAddress = buildFullAddress(request.origin, toStr(request?.metadata?.companyName || "Piessang seller"));
    const destinationAddress = buildFullAddress(request.destination, toStr(request?.metadata?.recipientName || "Customer"));
    if (!originAddress || !destinationAddress) {
      throw new Error("Origin and destination addresses are required before creating a courier shipment.");
    }

    const aggregated = aggregateParcels(request.parcels || []);
    if (!(aggregated.totalActualWeight > 0)) {
      throw new Error("Shipment weight is missing for this courier order.");
    }

    const items = defaultQuoteItems(request);
    if (!items.length) {
      throw new Error("Shipment item customs data is missing for this courier order.");
    }

    const originAddressId = await ensureOriginAddressId(baseUrl, token, originAddress);
    const shipmentCreate = await easyshipFetch(`${baseUrl}/shipments`, token, {
      method: "POST",
      body: JSON.stringify({
        origin_address_id: originAddressId || undefined,
        origin_address: originAddressId ? undefined : originAddress,
        sender_address_id: originAddressId || undefined,
        return_address_id: originAddressId || undefined,
        destination_address: destinationAddress,
        incoterms: "DDU",
        courier_service_id: toStr(request?.serviceCode || "") || undefined,
        metadata: {
          order_id: toStr(request?.orderId),
          seller_id: toStr(request?.sellerId),
          seller_code: toStr(request?.metadata?.sellerCode),
          seller_slug: toStr(request?.metadata?.sellerSlug),
        },
        order_data: {
          platform_order_number: toStr(request?.metadata?.orderNumber || request?.orderId),
        },
        parcels: [
          {
            total_actual_weight: roundMoney(aggregated.totalActualWeight),
            box: {
              slug: "custom",
              length: Math.max(1, Math.round(aggregated.lengthCm || 1)),
              width: Math.max(1, Math.round(aggregated.widthCm || 1)),
              height: Math.max(1, Math.round(aggregated.heightCm || 1)),
            },
            items,
          },
        ],
      }),
    });

    if (!shipmentCreate.response.ok && shipmentCreate.response.status !== 202) {
      throw new Error(toStr(shipmentCreate.payload?.message || shipmentCreate.payload?.error || `Easyship shipment creation failed (${shipmentCreate.response.status}).`));
    }

    const shipmentSource = getPayloadObject(shipmentCreate.payload);
    const easyshipShipmentId = toStr(
      shipmentSource?.easyship_shipment_id ||
      shipmentSource?.id ||
      shipmentCreate.payload?.easyship_shipment_id ||
      shipmentCreate.payload?.id,
    );
    if (!easyshipShipmentId) {
      throw new Error("Easyship did not return a shipment id.");
    }

    let pickupMetadata: Record<string, unknown> | null = null;
    let labelBatchPayload: any = null;

    if (toStr(request?.serviceCode)) {
      const labels = await easyshipFetch(`${baseUrl}/batches/labels`, token, {
        method: "POST",
        body: JSON.stringify({
          shipments: [
            {
              easyship_shipment_id: easyshipShipmentId,
              courier_service_id: toStr(request.serviceCode),
            },
          ],
        }),
      });
      if (labels.response.ok || labels.response.status === 202) {
        labelBatchPayload = labels.payload;
      }
    }

    if (toStr(request?.metadata?.handoverMode).toLowerCase() !== "dropoff" && toStr(request?.serviceCode)) {
      const pickupSlots = await easyshipFetch(
        `${baseUrl}/courier_services/${encodeURIComponent(toStr(request.serviceCode))}/pickup_slots?origin_address_id=${encodeURIComponent(originAddressId)}`,
        token,
        { method: "GET" },
      );
      if (pickupSlots.response.ok) {
        const availableSlots = mapPickupSlots(pickupSlots.payload);
        const firstSlot = availableSlots[0] || null;
        if (firstSlot?.id && firstSlot?.date) {
          const pickup = await easyshipFetch(`${baseUrl}/pickups`, token, {
            method: "POST",
            body: JSON.stringify({
              courier_service_id: toStr(request.serviceCode),
              time_slot_id: firstSlot.id,
              selected_date: firstSlot.date,
              easyship_shipment_ids: [easyshipShipmentId],
            }),
          });
          if (pickup.response.ok) {
            pickupMetadata = {
              slot: firstSlot,
              response: pickup.payload,
            };
          }
        }
      }
    }

    const shipmentDetails = await easyshipFetch(
      `${baseUrl}/shipments/${encodeURIComponent(easyshipShipmentId)}?format=URL&label=4x6&packing_slip=none`,
      token,
      { method: "GET" },
    );
    const detailedSource = shipmentDetails.response.ok ? getPayloadObject(shipmentDetails.payload) : shipmentSource;
    const trackingNumber = toStr(
      detailedSource?.tracking_number ||
      detailedSource?.tracking?.tracking_number ||
      shipmentSource?.tracking_number,
    ) || null;
    const trackingUrl = toStr(
      detailedSource?.tracking_page_url ||
      detailedSource?.tracking_url ||
      detailedSource?.tracking?.tracking_page_url ||
      detailedSource?.tracking?.tracking_url,
    ) || null;
    const labelUrl = extractDocumentUrl(detailedSource) || null;

    return {
      shipmentId: easyshipShipmentId,
      trackingNumber,
      trackingUrl,
      labelUrl,
      status: mapShipmentStatus(detailedSource),
      metadata: {
        courierServiceId: toStr(request?.serviceCode || ""),
        courierName: toStr(
          detailedSource?.courier_name ||
          detailedSource?.selected_courier?.name ||
          request?.metadata?.courierName,
        ),
        serviceName: toStr(
          detailedSource?.courier_service_name ||
          detailedSource?.selected_courier_service?.name ||
          request?.metadata?.serviceName,
        ),
        labelState: toStr(detailedSource?.label_state || ""),
        pickupState: toStr(detailedSource?.pickup_state || ""),
        deliveryState: toStr(detailedSource?.delivery_state || ""),
        pickup: pickupMetadata,
        labelBatch: labelBatchPayload,
        raw: detailedSource,
      },
    };
  },
  async trackShipment(input: { shipmentId?: string | null; trackingNumber?: string | null }) {
    const token = toStr(process.env.EASYSHIP_API_TOKEN);
    const baseUrl = toStr(process.env.EASYSHIP_API_BASE || "https://public-api.easyship.com/2024-09");
    if (!token || !toStr(input?.shipmentId)) return [];

    const url = new URL(`${baseUrl}/shipments/trackings`);
    url.searchParams.append("easyship_shipment_id", toStr(input?.shipmentId));
    url.searchParams.set("include_checkpoints", "true");
    const tracking = await easyshipFetch(url.toString(), token, { method: "GET" });
    if (!tracking.response.ok) return [];
    const items = [
      ...(Array.isArray(tracking.payload?.trackings) ? tracking.payload.trackings : []),
      ...(Array.isArray(tracking.payload?.data) ? tracking.payload.data : []),
      ...(Array.isArray(tracking.payload) ? tracking.payload : []),
    ];
    const first = items[0] || {};
    const checkpoints = Array.isArray(first?.checkpoints) ? first.checkpoints : [];
    return checkpoints.map((checkpoint: any) => ({
      code: toStr(checkpoint?.event_code || checkpoint?.tag || checkpoint?.status || "update"),
      label: toStr(checkpoint?.message || checkpoint?.status || checkpoint?.subtag_message || "Shipment update"),
      occurredAt: toStr(checkpoint?.occurred_at || checkpoint?.created_at || "") || null,
      location: toStr(checkpoint?.location || checkpoint?.city || "") || null,
      detail: toStr(checkpoint?.subtag_message || checkpoint?.details || "") || null,
    }));
  },
  async cancelShipment() {
    return { ok: false, message: "Easyship shipment cancellation is not implemented yet." };
  },
};
