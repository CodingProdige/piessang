"use client";

import { useEffect, useRef, useState } from "react";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import { getFlagEmoji } from "@/lib/currency/display-currency";
import { STRIPE_SUPPORTED_SHOPPER_COUNTRIES } from "@/lib/marketplace/country-config";

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
const COOKIE_KEY = "piessang_shopper_country";
export const SHOPPER_COUNTRY_OPTIONS = STRIPE_SUPPORTED_SHOPPER_COUNTRIES.map((entry) => ({
  code: entry.code,
  label: entry.label,
  flag: getFlagEmoji(entry.code),
  displayLabel: `${getFlagEmoji(entry.code)} ${entry.label}`.trim(),
}));

function normalizeText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function hasPreciseShopperDeliveryArea(area: ShopperDeliveryArea | null | undefined) {
  if (!area) return false;
  return Boolean(
    normalizeText(area.city) ||
      normalizeText(area.province) ||
      normalizeText(area.suburb || "") ||
      normalizeText(area.postalCode || "") ||
      typeof area.latitude === "number" ||
      typeof area.longitude === "number",
  );
}

export function formatPreciseShopperDeliveryArea(area: ShopperDeliveryArea | null | undefined) {
  if (!area) return "";
  return [area.suburb, area.city, area.province].map((entry) => normalizeText(entry || "")).filter(Boolean).join(", ");
}

export function readShopperDeliveryArea(): ShopperDeliveryArea | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const cookieCountry = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${COOKIE_KEY}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    if (!raw) {
      const country = normalizeText(cookieCountry || "");
      return country ? { city: "", province: "", suburb: "", postalCode: "", country, latitude: null, longitude: null } : null;
    }
    const parsed = JSON.parse(raw);
    const city = normalizeText(parsed?.city || "");
    const province = normalizeText(parsed?.province || "");
    const suburb = normalizeText(parsed?.suburb || "");
    const postalCode = normalizeText(parsed?.postalCode || "");
    const country = normalizeText(parsed?.country || cookieCountry || "");
    const latitude = typeof parsed?.latitude === "number" ? parsed.latitude : null;
    const longitude = typeof parsed?.longitude === "number" ? parsed.longitude : null;
    if (!city && !province && !country) return null;
    return { city, province, suburb, postalCode, country, latitude, longitude };
  } catch {
    const cookieCountry = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${COOKIE_KEY}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    const country = normalizeText(cookieCountry || "");
    return country ? { city: "", province: "", suburb: "", postalCode: "", country, latitude: null, longitude: null } : null;
  }
}

export function saveShopperDeliveryArea(area: ShopperDeliveryArea | null) {
  if (typeof window === "undefined") return;
  if (!area) {
    window.localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
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
  if (nextArea.country) {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(nextArea.country)}; path=/; max-age=31536000; SameSite=Lax`;
  }
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: nextArea }));
}

export function detectShopperCountryFromBrowser() {
  if (typeof window === "undefined") return "";
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const entry of languages) {
    const locale = String(entry || "").trim();
    if (!locale) continue;
    const parts = locale.replace("_", "-").split("-");
    const region = String(parts[1] || "").trim().toUpperCase();
    if (!region) continue;
    const match = SHOPPER_COUNTRY_OPTIONS.find((country) => country.code === region);
    if (match?.label) return match.label;
  }
  return "";
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
  const onChangeRef = useRef(onChange);
  const [area, setArea] = useState<ShopperDeliveryArea | null>(null);
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const stored = readShopperDeliveryArea();
    setArea(stored);
    setCity(stored?.city || "");
    setProvince(stored?.province || "");
    setSuburb(stored?.suburb || "");
    setPostalCode(stored?.postalCode || "");
    setCountry(stored?.country || "South Africa");
    onChangeRef.current?.(stored);
  }, []);

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
    const hasValue = Boolean(next.city || next.province || next.suburb || next.postalCode || next.country);
    const finalValue = hasValue ? next : null;
    setArea(finalValue);
    saveShopperDeliveryArea(finalValue);
    onChangeRef.current?.(finalValue);
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
                  onChangeRef.current?.(null);
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
        onChangeRef.current?.(nextArea);
        setPickerOpen(false);
        setEditing(false);
      }}
    />
    </>
  );
}
