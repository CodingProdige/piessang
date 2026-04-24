"use client";

import { useEffect, useRef, useState } from "react";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import {
  normalizeShopperLocation,
  parseShopperLocation,
  serializeShopperLocation,
  type ShopperLocation,
} from "@/lib/shopper/location";
import { getFlagEmoji } from "@/lib/currency/display-currency";
import { STRIPE_SUPPORTED_SHOPPER_COUNTRIES } from "@/lib/marketplace/country-config";

export type ShopperDeliveryArea = ShopperLocation & {
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const STORAGE_KEY = "piessang-shopper-delivery-area";
const STORAGE_EVENT = "piessang-shopper-delivery-area-change";
const COOKIE_KEY = "piessang_shopper_country";
const AREA_COOKIE_KEY = "piessang_shopper_delivery_area";
export const SHOPPER_COUNTRY_OPTIONS = STRIPE_SUPPORTED_SHOPPER_COUNTRIES.map((entry) => ({
  code: entry.code,
  label: entry.label,
  flag: getFlagEmoji(entry.code),
  displayLabel: `${getFlagEmoji(entry.code)} ${entry.label}`.trim(),
}));

function normalizeText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getCountryLabel(countryCode?: string | null, fallback?: string | null) {
  const normalizedCode = String(countryCode || "").trim().toUpperCase();
  if (normalizedCode) {
    const match = SHOPPER_COUNTRY_OPTIONS.find((entry) => entry.code === normalizedCode);
    if (match?.label) return match.label;
  }
  return normalizeText(String(fallback || ""));
}

function normalizeShopperDeliveryArea(input: unknown): ShopperDeliveryArea | null {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const normalized = normalizeShopperLocation({
    ...source,
    lat: source?.lat ?? source?.latitude,
    lng: source?.lng ?? source?.longitude,
  });
  const country = getCountryLabel(normalized.countryCode, String(source?.country || ""));
  const nextArea: ShopperDeliveryArea = {
    ...normalized,
    country: country || null,
    latitude: normalized.lat,
    longitude: normalized.lng,
  };
  const hasValue = Boolean(
    nextArea.countryCode ||
      nextArea.country ||
      nextArea.province ||
      nextArea.city ||
      nextArea.suburb ||
      nextArea.postalCode ||
      nextArea.addressLine1 ||
      nextArea.latitude != null ||
      nextArea.longitude != null,
  );
  return hasValue ? nextArea : null;
}

export function hasPreciseShopperDeliveryArea(area: ShopperDeliveryArea | null | undefined) {
  if (!area) return false;
  return Boolean(
    normalizeText(area.addressLine1 || "") ||
      normalizeText(area.city || "") ||
      normalizeText(area.province || "") ||
      normalizeText(area.suburb || "") ||
      normalizeText(area.postalCode || "") ||
      typeof area.latitude === "number" ||
      typeof area.longitude === "number",
  );
}

export function formatPreciseShopperDeliveryArea(area: ShopperDeliveryArea | null | undefined) {
  if (!area) return "";
  return [area.addressLine1, area.suburb, area.city, area.province]
    .map((entry) => normalizeText(entry || ""))
    .filter(Boolean)
    .join(", ");
}

export function readShopperDeliveryArea(): ShopperDeliveryArea | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const areaCookie = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${AREA_COOKIE_KEY}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    const cookieCountry = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${COOKIE_KEY}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    if (!raw) {
      if (areaCookie) {
        const parsedCookie = JSON.parse(decodeURIComponent(areaCookie));
        return normalizeShopperDeliveryArea({ ...parsedCookie, country: parsedCookie?.country || cookieCountry || "" });
      }
      const country = normalizeText(cookieCountry || "");
      return country ? normalizeShopperDeliveryArea({ country }) : null;
    }
    const parsed = JSON.parse(raw);
    return normalizeShopperDeliveryArea({ ...parsed, country: parsed?.country || cookieCountry || "" });
  } catch {
    const cookieCountry = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${COOKIE_KEY}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    const country = normalizeText(cookieCountry || "");
    return country ? normalizeShopperDeliveryArea({ country }) : null;
  }
}

export function saveShopperDeliveryArea(area: ShopperDeliveryArea | null) {
  if (typeof window === "undefined") return;
  if (!area) {
    window.localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${AREA_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: null }));
    return;
  }
  const normalized = normalizeShopperLocation({
    ...area,
    lat: area.lat ?? area.latitude,
    lng: area.lng ?? area.longitude,
  });
  const nextArea = normalizeShopperDeliveryArea({
    ...normalized,
    country: area.country || getCountryLabel(normalized.countryCode),
  });
  if (!nextArea) return;
  const serialized = {
    ...JSON.parse(serializeShopperLocation(nextArea)),
    country: nextArea.country,
    latitude: nextArea.latitude,
    longitude: nextArea.longitude,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  if (nextArea.country) {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(nextArea.country)}; path=/; max-age=31536000; SameSite=Lax`;
  }
  document.cookie = `${AREA_COOKIE_KEY}=${encodeURIComponent(JSON.stringify(serialized))}; path=/; max-age=31536000; SameSite=Lax`;
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
  const [manualOpen, setManualOpen] = useState(false);
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
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
    setCountry(stored?.country || "");
    onChangeRef.current?.(stored);
  }, []);

  function applyArea() {
    const next = normalizeShopperDeliveryArea({
      city: normalizeText(city),
      province: normalizeText(province),
      suburb: normalizeText(suburb),
      postalCode: normalizeText(postalCode),
      country: normalizeText(country),
      addressLine1: area?.addressLine1 || "",
      source: "manual",
      precision: "locality",
      latitude: area?.latitude ?? null,
      longitude: area?.longitude ?? null,
    });
    const finalValue = next;
    setArea(finalValue);
    saveShopperDeliveryArea(finalValue);
    onChangeRef.current?.(finalValue);
    setEditing(false);
    setManualOpen(false);
  }

  return (
    <>
    <div className={`rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Delivery area</p>
          <p className="mt-1 text-[13px] text-[#57636c]">
            {area
              ? `Showing delivery guidance for ${formatPreciseShopperDeliveryArea(area) || area.country || "your selected area"}.`
              : "Choose your exact address or map location so we can match seller shipping settings for your area."}
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
        <div className="mt-4 space-y-3">
          <div className="rounded-[10px] border border-[rgba(203,178,107,0.34)] bg-[rgba(203,178,107,0.12)] p-3">
            <p className="text-[12px] font-semibold text-[#202020]">Best accuracy</p>
            <p className="mt-1 text-[12px] leading-[1.55] text-[#57636c]">
              Search your exact address or tap the map so Piessang can validate shipping eligibility for your area.
            </p>
            {area?.addressLine1 || area?.latitude != null ? (
              <div className="mt-2 rounded-[8px] bg-white px-3 py-2 text-[12px] text-[#202020] shadow-[0_4px_14px_rgba(20,24,27,0.05)]">
                <p className="font-semibold">{area.addressLine1 || formatPreciseShopperDeliveryArea(area) || area.country}</p>
                <p className="mt-0.5 text-[#57636c]">
                  {[area.suburb, area.city, area.province, area.country].filter(Boolean).join(", ")}
                </p>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white"
              >
                Search exact address
              </button>
              <button
                type="button"
                onClick={() => setManualOpen((current) => !current)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
              >
                {manualOpen ? "Hide manual entry" : "Enter manually"}
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
                    setCountry("");
                    saveShopperDeliveryArea(null);
                    onChangeRef.current?.(null);
                    setEditing(false);
                    setManualOpen(false);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          {manualOpen ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Street or landmark</span>
                <input
                  value={area?.addressLine1 || ""}
                  onChange={(event) =>
                    setArea((current) => ({
                      ...(current || { source: "manual", precision: "address" }),
                      addressLine1: event.target.value,
                    }))
                  }
                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                  placeholder="12 Main Road"
                />
              </label>
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
                  Save manual area
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
    <GooglePlacePickerModal
      open={pickerOpen}
      title="Choose your delivery area"
      initialValue={
        area
          ? {
              formattedAddress: formatPreciseShopperDeliveryArea(area) || undefined,
              streetAddress: area.addressLine1 || undefined,
              country: area.country || undefined,
              region: area.province || undefined,
              city: area.city || undefined,
              suburb: area.suburb || undefined,
              postalCode: area.postalCode || undefined,
              latitude: area.latitude ?? undefined,
              longitude: area.longitude ?? undefined,
            }
          : null
      }
      onClose={() => setPickerOpen(false)}
      onSelect={(value) => {
        const nextArea = normalizeShopperDeliveryArea({
          city: normalizeText(value.city || ""),
          province: normalizeText(value.region || ""),
          suburb: normalizeText(value.suburb || ""),
          postalCode: normalizeText(value.postalCode || ""),
          country: normalizeText(value.country || ""),
          addressLine1: normalizeText(value.streetAddress || value.formattedAddress || ""),
          lat: typeof value.latitude === "number" ? value.latitude : null,
          lng: typeof value.longitude === "number" ? value.longitude : null,
          source: "google_places",
          precision:
            typeof value.latitude === "number" && typeof value.longitude === "number"
              ? "coordinates"
              : "address",
        });
        if (!nextArea) return;
        setArea(nextArea);
        setCity(nextArea.city || "");
        setProvince(nextArea.province || "");
        setSuburb(nextArea.suburb || "");
        setPostalCode(nextArea.postalCode || "");
        setCountry(nextArea.country || "");
        saveShopperDeliveryArea(nextArea);
        onChangeRef.current?.(nextArea);
        setPickerOpen(false);
        setEditing(false);
        setManualOpen(false);
      }}
    />
    </>
  );
}
