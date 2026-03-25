"use client";

import { useEffect, useState } from "react";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";

export type ShopperDeliveryArea = {
  city: string;
  province: string;
  suburb?: string;
  postalCode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
};

const STORAGE_KEY = "piessang-shopper-delivery-area";
const STORAGE_EVENT = "piessang-shopper-delivery-area-change";

function normalizeText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function readShopperDeliveryArea(): ShopperDeliveryArea | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const city = normalizeText(parsed?.city || "");
    const province = normalizeText(parsed?.province || "");
    const suburb = normalizeText(parsed?.suburb || "");
    const postalCode = normalizeText(parsed?.postalCode || "");
    const country = normalizeText(parsed?.country || "");
    const latitude = typeof parsed?.latitude === "number" ? parsed.latitude : null;
    const longitude = typeof parsed?.longitude === "number" ? parsed.longitude : null;
    if (!city && !province) return null;
    return { city, province, suburb, postalCode, country, latitude, longitude };
  } catch {
    return null;
  }
}

export function saveShopperDeliveryArea(area: ShopperDeliveryArea | null) {
  if (typeof window === "undefined") return;
  if (!area) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: null }));
    return;
  }
  const nextArea = {
    city: normalizeText(area.city),
    province: normalizeText(area.province),
    suburb: normalizeText(area.suburb || ""),
    postalCode: normalizeText(area.postalCode || ""),
    country: normalizeText(area.country || ""),
    latitude: typeof area.latitude === "number" ? area.latitude : null,
    longitude: typeof area.longitude === "number" ? area.longitude : null,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextArea));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: nextArea }));
}

export function subscribeToShopperDeliveryArea(listener: (area: ShopperDeliveryArea | null) => void) {
  if (typeof window === "undefined") return () => {};
  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<ShopperDeliveryArea | null>).detail;
    listener(detail ?? readShopperDeliveryArea());
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    listener(readShopperDeliveryArea());
  };
  window.addEventListener(STORAGE_EVENT, handleChange as EventListener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(STORAGE_EVENT, handleChange as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function DeliveryAreaGate({
  onChange,
  compact = false,
}: {
  onChange?: (area: ShopperDeliveryArea | null) => void;
  compact?: boolean;
}) {
  const [area, setArea] = useState<ShopperDeliveryArea | null>(null);
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const stored = readShopperDeliveryArea();
    setArea(stored);
    setCity(stored?.city || "");
    setProvince(stored?.province || "");
    setSuburb(stored?.suburb || "");
    setPostalCode(stored?.postalCode || "");
    setCountry(stored?.country || "South Africa");
    onChange?.(stored);
  }, [onChange]);

  function applyArea() {
    const next = {
      city: normalizeText(city),
      province: normalizeText(province),
      suburb: normalizeText(suburb),
      postalCode: normalizeText(postalCode),
      country: normalizeText(country),
      latitude: area?.latitude ?? null,
      longitude: area?.longitude ?? null,
    };
    const hasValue = Boolean(next.city || next.province);
    const finalValue = hasValue ? next : null;
    setArea(finalValue);
    saveShopperDeliveryArea(finalValue);
    onChange?.(finalValue);
    setEditing(false);
  }

  return (
    <>
    <div className={`rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Delivery area</p>
          <p className="mt-1 text-[13px] text-[#57636c]">
            {area
              ? `Showing delivery guidance for ${[area.city, area.province].filter(Boolean).join(", ")}.`
              : "Add your suburb or city so we can show seller delivery availability more clearly."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          className="text-[12px] font-semibold text-[#907d4c]"
        >
          {editing ? "Close" : area ? "Change" : "Set area"}
        </button>
      </div>
      {editing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">City or suburb</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
              placeholder="Cape Town"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Province</span>
            <input
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
              placeholder="Western Cape"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Postal code</span>
            <input
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
              placeholder="7646"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Country</span>
            <input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
              placeholder="South Africa"
            />
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={applyArea}
              className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white"
            >
              Save delivery area
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
            >
              Search on map
            </button>
            {area ? (
              <button
                type="button"
                onClick={() => {
                  setArea(null);
                  setCity("");
                  setProvince("");
                  setSuburb("");
                  setPostalCode("");
                  setCountry("South Africa");
                  saveShopperDeliveryArea(null);
                  onChange?.(null);
                  setEditing(false);
                }}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
    <GooglePlacePickerModal
      open={pickerOpen}
      title="Choose your delivery area"
      initialValue={area}
      onClose={() => setPickerOpen(false)}
      onSelect={(value) => {
        const nextArea = {
          city: normalizeText(value.city || ""),
          province: normalizeText(value.region || ""),
          suburb: normalizeText(value.suburb || ""),
          postalCode: normalizeText(value.postalCode || ""),
          country: normalizeText(value.country || ""),
          latitude: typeof value.latitude === "number" ? value.latitude : null,
          longitude: typeof value.longitude === "number" ? value.longitude : null,
        };
        setArea(nextArea);
        setCity(nextArea.city);
        setProvince(nextArea.province);
        setSuburb(nextArea.suburb);
        setPostalCode(nextArea.postalCode);
        setCountry(nextArea.country || "South Africa");
        saveShopperDeliveryArea(nextArea);
        onChange?.(nextArea);
        setPickerOpen(false);
        setEditing(false);
      }}
    />
    </>
  );
}
