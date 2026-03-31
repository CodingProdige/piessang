"use client";

import { useEffect, useMemo, useState } from "react";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";

type PricingRule = {
  id: string;
  label: string;
  minDistanceKm: string;
  maxDistanceKm: string;
  minOrderValue: string;
  maxOrderValue: string;
  fee: string;
  freeAboveOrderValue: string;
};

type ShippingZone = {
  id: string;
  label: string;
  scopeType: string;
  country: string;
  region: string;
  city: string;
  postalCodes: string;
  leadTimeDays: string;
  cutoffTime: string;
  pricingRules: PricingRule[];
  isFallback: boolean;
};

type DeliveryProfile = {
  origin: {
    country: string;
    region: string;
    city: string;
    suburb: string;
    postalCode: string;
    utcOffsetMinutes: string;
    latitude: string;
    longitude: string;
  };
  directDelivery: {
    enabled: boolean;
    radiusKm: string;
    leadTimeDays: string;
    cutoffTime: string;
    pricingRules: PricingRule[];
  };
  shippingZones: ShippingZone[];
  pickup: {
    enabled: boolean;
    leadTimeDays: string;
  };
  notes: string;
};

const EMPTY_PROFILE: DeliveryProfile = {
  origin: {
    country: "",
    region: "",
    city: "",
    suburb: "",
    postalCode: "",
    utcOffsetMinutes: "",
    latitude: "",
    longitude: "",
  },
  directDelivery: {
    enabled: false,
    radiusKm: "",
    leadTimeDays: "1",
    cutoffTime: "10:00",
    pricingRules: [],
  },
  shippingZones: [],
  pickup: {
    enabled: false,
    leadTimeDays: "0",
  },
  notes: "",
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function makePricingRule(seed = Date.now()): PricingRule {
  return {
    id: `pricing-${seed}`,
    label: "",
    minDistanceKm: "",
    maxDistanceKm: "",
    minOrderValue: "",
    maxOrderValue: "",
    fee: "",
    freeAboveOrderValue: "",
  };
}

function makeShippingZone(seed = Date.now()): ShippingZone {
  return {
    id: `zone-${seed}`,
    label: "",
    scopeType: "country",
    country: "",
    region: "",
    city: "",
    postalCodes: "",
    leadTimeDays: "2",
    cutoffTime: "10:00",
    pricingRules: [makePricingRule(seed + 1)],
    isFallback: false,
  };
}

function mapPricingRules(rules: any[] = []) {
  return Array.isArray(rules)
    ? rules.map((rule) => ({
        id: toStr(rule.id),
        label: toStr(rule.label),
        minDistanceKm: toStr(rule.minDistanceKm),
        maxDistanceKm: toStr(rule.maxDistanceKm),
        minOrderValue: toStr(rule.minOrderValue),
        maxOrderValue: toStr(rule.maxOrderValue),
        fee: toStr(rule.fee),
        freeAboveOrderValue: toStr(rule.freeAboveOrderValue),
      }))
    : [];
}

function mapDeliveryProfile(profile: any): DeliveryProfile {
  const normalized = normalizeSellerDeliveryProfile(profile && typeof profile === "object" ? profile : {});
  return {
    origin: {
      country: toStr(normalized?.origin?.country),
      region: toStr(normalized?.origin?.region),
      city: toStr(normalized?.origin?.city),
      suburb: toStr(normalized?.origin?.suburb),
      postalCode: toStr(normalized?.origin?.postalCode),
      utcOffsetMinutes: toStr(normalized?.origin?.utcOffsetMinutes),
      latitude: toStr(normalized?.origin?.latitude),
      longitude: toStr(normalized?.origin?.longitude),
    },
    directDelivery: {
      enabled: normalized?.directDelivery?.enabled === true,
      radiusKm: toStr(normalized?.directDelivery?.radiusKm),
      leadTimeDays: toStr(normalized?.directDelivery?.leadTimeDays || "1"),
      cutoffTime: toStr(normalized?.directDelivery?.cutoffTime || "10:00"),
      pricingRules: mapPricingRules(normalized?.directDelivery?.pricingRules || []),
    },
    shippingZones: Array.isArray(normalized?.shippingZones)
      ? normalized.shippingZones.map((zone) => ({
          id: toStr(zone.id),
          label: toStr(zone.label),
          scopeType: toStr(zone.scopeType || "country"),
          country: toStr(zone.country),
          region: toStr(zone.region),
          city: toStr(zone.city),
          postalCodes: Array.isArray(zone.postalCodes) ? zone.postalCodes.join(", ") : "",
          leadTimeDays: toStr(zone.leadTimeDays || "2"),
          cutoffTime: toStr(zone.cutoffTime || "10:00"),
          pricingRules: mapPricingRules(zone.pricingRules || []),
          isFallback: zone.isFallback === true,
        }))
      : [],
    pickup: {
      enabled: normalized?.pickup?.enabled === true,
      leadTimeDays: toStr(normalized?.pickup?.leadTimeDays || "0"),
    },
    notes: toStr(normalized?.notes).slice(0, 500),
  };
}

function formatOriginSummary(origin: DeliveryProfile["origin"]) {
  return [origin.suburb, origin.city, origin.region, origin.country].filter(Boolean).join(", ");
}

export function SellerPlatformDeliveryWorkspace() {
  const [deliveryProfile, setDeliveryProfile] = useState<DeliveryProfile>(EMPTY_PROFILE);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(EMPTY_PROFILE));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [originPickerOpen, setOriginPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/admin/platform-delivery", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load Piessang delivery settings.");
        }
        if (cancelled) return;
        const next = mapDeliveryProfile(payload?.deliveryProfile || {});
        setDeliveryProfile(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Piessang delivery settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(deliveryProfile) !== savedSnapshot, [deliveryProfile, savedSnapshot]);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/client/v1/admin/platform-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryProfile }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save Piessang delivery settings.");
      }
      const next = mapDeliveryProfile(payload?.deliveryProfile || deliveryProfile);
      setDeliveryProfile(next);
      setSavedSnapshot(JSON.stringify(next));
      setNotice("Piessang shipping settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Piessang delivery settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Piessang fulfilment shipping rules</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Manage the platform delivery origin, direct delivery rules, shipping zones, and pickup rules used whenever Piessang fulfils an order.
        </p>
      </section>

      {notice ? <div className="rounded-[8px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">{notice}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        {loading ? (
          <div className="text-[13px] text-[#57636c]">Loading Piessang shipping settings...</div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#202020]">Platform shipping origin</p>
                  <p className="mt-1 text-[12px] text-[#57636c]">This is the Piessang dispatch point used to measure direct delivery radius and shipping rules.</p>
                  <p className="mt-3 text-[13px] font-semibold text-[#202020]">{formatOriginSummary(deliveryProfile.origin) || "No origin chosen yet."}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOriginPickerOpen(true)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  {formatOriginSummary(deliveryProfile.origin) ? "Edit origin" : "Choose origin"}
                </button>
              </div>
            </div>

            <div className="rounded-[8px] border border-black/5 bg-white">
              <div className="border-b border-black/5 px-4 py-4">
                <p className="text-[13px] font-semibold text-[#202020]">Piessang direct delivery</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Use this when Piessang delivers orders directly from the platform origin.</p>
              </div>
              <div className="space-y-4 px-4 py-4">
                <label className="flex items-center gap-2 text-[13px] font-medium text-[#202020]">
                  <input
                    type="checkbox"
                    checked={deliveryProfile.directDelivery.enabled}
                    onChange={(event) =>
                      setDeliveryProfile((current) => ({
                        ...current,
                        directDelivery: {
                          ...current.directDelivery,
                          enabled: event.target.checked,
                          pricingRules:
                            event.target.checked && current.directDelivery.pricingRules.length === 0
                              ? [makePricingRule(Date.now())]
                              : current.directDelivery.pricingRules,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-black/20"
                  />
                  Enable Piessang direct delivery
                </label>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Radius (km)</span>
                    <input value={deliveryProfile.directDelivery.radiusKm} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, radiusKm: event.target.value.replace(/[^\d]/g, "").slice(0, 4) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="15" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Lead time (days)</span>
                    <input value={deliveryProfile.directDelivery.leadTimeDays} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, leadTimeDays: event.target.value.replace(/[^\d]/g, "").slice(0, 2) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="1" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Cutoff time</span>
                    <input type="time" value={deliveryProfile.directDelivery.cutoffTime} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, cutoffTime: event.target.value } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-semibold text-[#202020]">Pricing rules</p>
                  <button type="button" onClick={() => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: [...current.directDelivery.pricingRules, makePricingRule(Date.now())] } }))} className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]">
                    Add rule
                  </button>
                </div>

                <div className="space-y-3">
                  {deliveryProfile.directDelivery.pricingRules.length ? deliveryProfile.directDelivery.pricingRules.map((rule, index) => (
                    <div key={rule.id || index} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-3">
                      <div className="grid gap-3 md:grid-cols-4">
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Rule label</span><input value={rule.label} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value.slice(0, 120) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="Nearby orders" /></label>
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Min distance</span><input value={rule.minDistanceKm} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, minDistanceKm: event.target.value.replace(/[^\d]/g, "").slice(0, 4) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="0" /></label>
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Max distance</span><input value={rule.maxDistanceKm} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, maxDistanceKm: event.target.value.replace(/[^\d]/g, "").slice(0, 4) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="5" /></label>
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Fee (R)</span><input value={rule.fee} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, fee: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="60" /></label>
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Min order value</span><input value={rule.minOrderValue} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, minOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="0" /></label>
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Max order value</span><input value={rule.maxOrderValue} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, maxOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="500" /></label>
                        <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Free above value</span><input value={rule.freeAboveOrderValue} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.map((entry, entryIndex) => entryIndex === index ? { ...entry, freeAboveOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="750" /></label>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button type="button" onClick={() => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, pricingRules: current.directDelivery.pricingRules.filter((_, entryIndex) => entryIndex !== index) } }))} className="text-[12px] font-semibold text-[#b91c1c]">Remove rule</button>
                      </div>
                    </div>
                  )) : <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-4 py-5 text-[12px] text-[#57636c]">No direct delivery pricing rules yet.</div>}
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-black/5 bg-white">
              <div className="border-b border-black/5 px-4 py-4">
                <p className="text-[13px] font-semibold text-[#202020]">Piessang shipping zones</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Add country, region, city, or postal-code shipping zones for courier fulfilment.</p>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => setDeliveryProfile((current) => ({ ...current, shippingZones: [...current.shippingZones, makeShippingZone(Date.now())] }))} className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]">
                    Add zone
                  </button>
                </div>
                {deliveryProfile.shippingZones.length ? deliveryProfile.shippingZones.map((zone, index) => (
                  <div key={zone.id || index} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Zone label</span><input value={zone.label} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value.slice(0, 120) } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="South Africa" /></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Scope</span><select value={zone.scopeType} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, scopeType: event.target.value } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"><option value="country">Country</option><option value="region">Region</option><option value="city">City</option><option value="postal">Postal code</option></select></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Country</span><input value={zone.country} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, country: event.target.value.slice(0, 60) } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="South Africa" /></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Region</span><input value={zone.region} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, region: event.target.value.slice(0, 80) } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="Western Cape" /></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">City</span><input value={zone.city} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, city: event.target.value.slice(0, 80) } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="Cape Town" /></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Postal codes</span><input value={zone.postalCodes} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, postalCodes: event.target.value.slice(0, 200) } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="8000, 8001" /></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Lead time</span><input value={zone.leadTimeDays} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, leadTimeDays: event.target.value.replace(/[^\d]/g, "").slice(0, 2) } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="2" /></label>
                      <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Cutoff time</span><input type="time" value={zone.cutoffTime} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, cutoffTime: event.target.value } : entry) }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" /></label>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[12px] text-[#202020]">
                        <input type="checkbox" checked={zone.isFallback} onChange={(event) => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? { ...entry, isFallback: event.target.checked } : entry) }))} className="h-4 w-4 rounded border-black/20" />
                        Fallback zone
                      </label>
                      <button type="button" onClick={() => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.filter((_, entryIndex) => entryIndex !== index) }))} className="text-[12px] font-semibold text-[#b91c1c]">Remove zone</button>
                    </div>
                  </div>
                )) : <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-4 py-5 text-[12px] text-[#57636c]">No shipping zones yet.</div>}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[8px] border border-black/5 bg-white p-4">
                <label className="flex items-center gap-2 text-[13px] font-medium text-[#202020]">
                  <input type="checkbox" checked={deliveryProfile.pickup.enabled} onChange={(event) => setDeliveryProfile((current) => ({ ...current, pickup: { ...current.pickup, enabled: event.target.checked } }))} className="h-4 w-4 rounded border-black/20" />
                  Allow Piessang pickup
                </label>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Pickup lead time (days)</span>
                  <input value={deliveryProfile.pickup.leadTimeDays} onChange={(event) => setDeliveryProfile((current) => ({ ...current, pickup: { ...current.pickup, leadTimeDays: event.target.value.replace(/[^\d]/g, "").slice(0, 2) } }))} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none" placeholder="0" />
                </label>
              </div>

              <div className="rounded-[8px] border border-black/5 bg-white p-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Internal fulfilment notes</span>
                  <textarea value={deliveryProfile.notes} onChange={(event) => setDeliveryProfile((current) => ({ ...current, notes: event.target.value.slice(0, 500) }))} rows={6} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-3 text-[13px] outline-none" placeholder="Optional notes for the operations team." />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
              <button type="button" onClick={() => setDeliveryProfile(JSON.parse(savedSnapshot))} disabled={!dirty || saving} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50">
                Reset
              </button>
              <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save Piessang shipping settings"}
              </button>
            </div>
          </div>
        )}
      </section>

      <GooglePlacePickerModal
        open={originPickerOpen}
        title="Choose Piessang shipping origin"
        initialValue={{
          country: deliveryProfile.origin.country,
          region: deliveryProfile.origin.region,
          city: deliveryProfile.origin.city,
          suburb: deliveryProfile.origin.suburb,
          postalCode: deliveryProfile.origin.postalCode,
          utcOffsetMinutes: Number.isFinite(Number(deliveryProfile.origin.utcOffsetMinutes)) ? Number(deliveryProfile.origin.utcOffsetMinutes) : null,
          latitude: Number.isFinite(Number(deliveryProfile.origin.latitude)) ? Number(deliveryProfile.origin.latitude) : null,
          longitude: Number.isFinite(Number(deliveryProfile.origin.longitude)) ? Number(deliveryProfile.origin.longitude) : null,
        }}
        onClose={() => setOriginPickerOpen(false)}
        onSelect={(selection) => {
          setDeliveryProfile((current) => ({
            ...current,
            origin: {
              ...current.origin,
              country: toStr(selection?.country),
              region: toStr(selection?.region),
              city: toStr(selection?.city),
              suburb: toStr(selection?.suburb),
              postalCode: toStr(selection?.postalCode),
              utcOffsetMinutes: toStr(selection?.utcOffsetMinutes),
              latitude: toStr(selection?.latitude),
              longitude: toStr(selection?.longitude),
            },
          }));
          setOriginPickerOpen(false);
        }}
      />
    </div>
  );
}

export default SellerPlatformDeliveryWorkspace;
