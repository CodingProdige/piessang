"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

export type LocationValue = {
  formattedAddress?: string;
  streetAddress?: string;
  addressLine2?: string;
  country?: string;
  region?: string;
  city?: string;
  suburb?: string;
  postalCode?: string;
  utcOffsetMinutes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Prediction = {
  description: string;
  placeId: string;
};

function splitPredictionDescription(description: string) {
  const [primary, ...rest] = String(description || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    primary: primary || description,
    secondary: rest.join(", "),
  };
}

type GooglePlacePickerModalProps = {
  open: boolean;
  title: string;
  initialValue?: LocationValue | null;
  onClose: () => void;
  onSelect: (value: LocationValue) => void;
};

declare global {
  interface Window {
    google?: any;
    __piessangGoogleMapsPromise?: Promise<any>;
  }
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("Window unavailable."));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__piessangGoogleMapsPromise) return window.__piessangGoogleMapsPromise;
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("Google Maps API key is not configured."));

  window.__piessangGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps="true"]');
    if (existing) {
      if (window.google?.maps) {
        resolve(window.google);
        return;
      }
      existing.addEventListener("load", () => resolve(window.google));
      existing.addEventListener("error", () => reject(new Error("Unable to load Google Maps.")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Unable to load Google Maps."));
    document.head.appendChild(script);
  });

  return window.__piessangGoogleMapsPromise;
}

function getAddressComponent(components: any[] = [], type: string, fallbackType?: string) {
  const match = components.find((component) => Array.isArray(component.types) && component.types.includes(type));
  if (match) return match.long_name || "";
  if (fallbackType) {
    const fallback = components.find((component) => Array.isArray(component.types) && component.types.includes(fallbackType));
    if (fallback) return fallback.long_name || "";
  }
  return "";
}

function mapPlaceResult(place: any): LocationValue {
  const geometry = place?.geometry?.location;
  const components = Array.isArray(place?.address_components) ? place.address_components : [];
  const streetNumber = getAddressComponent(components, "street_number");
  const route = getAddressComponent(components, "route");
  const premise = getAddressComponent(components, "premise");
  const subpremise = getAddressComponent(components, "subpremise");
  return {
    formattedAddress: place?.formatted_address || place?.name || "",
    streetAddress: [streetNumber, route].filter(Boolean).join(" ").trim() || place?.name || "",
    addressLine2: [subpremise, premise].filter(Boolean).join(", "),
    country: getAddressComponent(components, "country"),
    region: getAddressComponent(components, "administrative_area_level_1"),
    city: getAddressComponent(components, "locality", "administrative_area_level_2"),
    suburb: getAddressComponent(components, "sublocality", "neighborhood"),
    postalCode: getAddressComponent(components, "postal_code"),
    utcOffsetMinutes:
      Number.isFinite(Number(place?.utc_offset_minutes)) ? Number(place.utc_offset_minutes) : null,
    latitude: geometry?.lat ? Number(geometry.lat().toFixed(6)) : null,
    longitude: geometry?.lng ? Number(geometry.lng().toFixed(6)) : null,
  };
}

export async function reverseGeocodeCoordinates(latitude: number, longitude: number) {
  const google = await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  return new Promise<LocationValue>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Location lookup took too long."));
    }, 8000);
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any[] = [], status: string) => {
      window.clearTimeout(timeoutId);
      if (status !== "OK" || !results?.[0]) {
        reject(new Error("Unable to resolve your current location."));
        return;
      }
      resolve(mapPlaceResult(results[0]));
    });
  });
}

export function GooglePlacePickerModal({
  open,
  title,
  initialValue,
  onClose,
  onSelect,
}: GooglePlacePickerModalProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationValue | null>(initialValue || null);
  const [showMapPreview, setShowMapPreview] = useState(true);
  const [isStreetAddressFocused, setIsStreetAddressFocused] = useState(false);
  const [allowStreetEditing, setAllowStreetEditing] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const isMountedRef = useRef(false);
  const suppressPredictionLookupRef = useRef(false);

  const servicesRef = useRef<{
    autocomplete?: any;
    places?: any;
    geocoder?: any;
    map?: any;
    marker?: any;
  }>({});

  useEffect(() => {
    isMountedRef.current = true;
    setPortalReady(true);
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(initialValue?.streetAddress || initialValue?.formattedAddress || "");
    setSelectedLocation(initialValue || null);
    setPredictions([]);
    setError(null);
    setShowMapPreview(true);
    setIsStreetAddressFocused(false);
    setAllowStreetEditing(false);
    suppressPredictionLookupRef.current = false;
  }, [initialValue, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadGoogleMaps()
      .then((google) => {
        if (cancelled) return;
        servicesRef.current.autocomplete = new google.maps.places.AutocompleteService();
        servicesRef.current.places = new google.maps.places.PlacesService(document.createElement("div"));
        servicesRef.current.geocoder = new google.maps.Geocoder();

        if (mapRef.current) {
          const map = new google.maps.Map(mapRef.current, {
            center: {
              lat: typeof initialValue?.latitude === "number" ? initialValue.latitude : -33.9249,
              lng: typeof initialValue?.longitude === "number" ? initialValue.longitude : 18.4241,
            },
            zoom: typeof initialValue?.latitude === "number" && typeof initialValue?.longitude === "number" ? 13 : 5,
            disableDefaultUI: false,
            streetViewControl: false,
            mapTypeControl: false,
          });
          const marker = new google.maps.Marker({
            map,
            draggable: false,
            position:
              typeof initialValue?.latitude === "number" && typeof initialValue?.longitude === "number"
                ? { lat: initialValue.latitude, lng: initialValue.longitude }
                : undefined,
          });
          map.addListener("click", (event: any) => {
            const lat = event?.latLng?.lat?.();
            const lng = event?.latLng?.lng?.();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            marker.setPosition({ lat, lng });
            servicesRef.current.geocoder.geocode({ location: { lat, lng } }, (results: any[] = [], status: string) => {
              if (!isMountedRef.current) return;
              if (status !== "OK" || !results?.[0]) return;
              const mapped = mapPlaceResult(results[0]);
              setSelectedLocation(mapped);
              setQuery(mapped.formattedAddress || "");
            });
          });
          servicesRef.current.map = map;
          servicesRef.current.marker = marker;
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load the location picker.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialValue, open]);

  useEffect(() => {
    if (!open) return;
    const normalizedQuery = query.trim();
    if (
      !normalizedQuery ||
      normalizedQuery.length < 3 ||
      !servicesRef.current.autocomplete ||
      !isStreetAddressFocused ||
      suppressPredictionLookupRef.current
    ) {
      setPredictions([]);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      servicesRef.current.autocomplete.getPlacePredictions(
        { input: normalizedQuery, types: ["geocode"] },
        (results: any[] = [], status: string) => {
          if (!isMountedRef.current) return;
          if (status !== "OK" && status !== "ZERO_RESULTS") {
            setPredictions([]);
            return;
          }
          setPredictions(
            (results || []).slice(0, 6).map((result) => ({
              description: result.description,
              placeId: result.place_id,
            })),
          );
        },
      );
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [isStreetAddressFocused, open, query]);

  const canSave = useMemo(
    () => Boolean(selectedLocation?.formattedAddress && typeof selectedLocation?.latitude === "number" && typeof selectedLocation?.longitude === "number"),
    [selectedLocation],
  );

  function updateSelectedLocationField<K extends keyof LocationValue>(field: K, value: LocationValue[K]) {
    setSelectedLocation((current) => {
      const next = {
        ...(current || {}),
        [field]: value,
      } as LocationValue;

      if (field !== "formattedAddress") {
        const rebuiltAddress = [
          next.streetAddress,
          next.suburb,
          next.city,
          next.region,
          next.country,
        ]
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
          .join(", ");

        next.formattedAddress = rebuiltAddress || next.formattedAddress || "";
      }

      return next;
    });
  }

  function selectPrediction(placeId: string) {
    if (!servicesRef.current.places) return;
    suppressPredictionLookupRef.current = true;
    setPredictions([]);
    setIsStreetAddressFocused(false);
    servicesRef.current.places.getDetails(
      {
        placeId,
        fields: ["formatted_address", "address_components", "geometry", "name", "utc_offset_minutes"],
      },
      (place: any, status: string) => {
        if (!isMountedRef.current) return;
        if (status !== "OK" || !place) return;
        const mapped = mapPlaceResult(place);
        setSelectedLocation(mapped);
        setQuery(mapped.streetAddress || mapped.formattedAddress || "");
        if (servicesRef.current.map && mapped.latitude != null && mapped.longitude != null) {
          servicesRef.current.map.setCenter({ lat: mapped.latitude, lng: mapped.longitude });
          servicesRef.current.map.setZoom(14);
          servicesRef.current.marker?.setPosition({ lat: mapped.latitude, lng: mapped.longitude });
        }
      },
    );
  }

  if (!open || !portalReady || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 px-4 py-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative h-[88svh] w-full max-w-[1040px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)] md:max-h-[920px]" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Location picker</p>
              <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{title}</h3>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                Fill in your delivery address below. Google suggestions will appear as you type your street address.
              </p>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]" aria-label="Close location picker">
              ×
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                {error ? (
                  <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div>
                ) : null}

                {loading ? <div className="text-[12px] text-[#57636c]">Loading location services…</div> : null}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <input
                  tabIndex={-1}
                  aria-hidden="true"
                  autoComplete="username"
                  name="fake-address-username"
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                />
                <input
                  tabIndex={-1}
                  aria-hidden="true"
                  autoComplete="new-password"
                  name="fake-address-password"
                  type="password"
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                />
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Street address</span>
                  <input
                    value={selectedLocation?.streetAddress || ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      suppressPredictionLookupRef.current = false;
                      updateSelectedLocationField("streetAddress", value);
                      setQuery(value);
                    }}
                    onFocus={() => {
                      setAllowStreetEditing(true);
                      suppressPredictionLookupRef.current = false;
                      setIsStreetAddressFocused(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => {
                        if (!isMountedRef.current) return;
                        setIsStreetAddressFocused(false);
                        setAllowStreetEditing(false);
                      }, 120);
                    }}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Street number and road"
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-protonpass-ignore="true"
                    name="street-search-google-only"
                    readOnly={!allowStreetEditing}
                  />
                </label>

                {predictions.length ? (
                  <div className="md:col-span-2 max-h-[240px] space-y-2 overflow-y-auto rounded-[8px] border border-black/6 bg-[#fcfcfb] p-2">
                    {predictions.map((prediction) => {
                      const parts = splitPredictionDescription(prediction.description);
                      return (
                        <button
                          key={prediction.placeId}
                          type="button"
                          onClick={() => selectPrediction(prediction.placeId)}
                          className="block w-full rounded-[8px] border border-black/8 bg-white px-3 py-3 text-left transition-colors hover:border-[#cbb26b] hover:bg-[#fffdfa]"
                        >
                          <span className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f6f1e3] text-[#907d4c]">
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                                <path d="M10 1.5a5.5 5.5 0 0 0-5.5 5.5c0 4.5 5.5 11.5 5.5 11.5S15.5 11.5 15.5 7A5.5 5.5 0 0 0 10 1.5Zm0 7.75A2.25 2.25 0 1 1 10 4.75a2.25 2.25 0 0 1 0 4.5Z" />
                              </svg>
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[12px] font-semibold leading-[1.45] text-[#202020]">
                                {parts.primary}
                              </span>
                              {parts.secondary ? (
                                <span className="mt-0.5 block text-[11px] leading-[1.45] text-[#6b7280]">
                                  {parts.secondary}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Address line 2</span>
                  <input
                    value={selectedLocation?.addressLine2 || ""}
                    onChange={(event) => updateSelectedLocationField("addressLine2", event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Apartment, estate, complex, or unit"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Suburb</span>
                  <input
                    value={selectedLocation?.suburb || ""}
                    onChange={(event) => updateSelectedLocationField("suburb", event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Suburb"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">City / town</span>
                  <input
                    value={selectedLocation?.city || ""}
                    onChange={(event) => updateSelectedLocationField("city", event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="City or town"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Province / region</span>
                  <input
                    value={selectedLocation?.region || ""}
                    onChange={(event) => updateSelectedLocationField("region", event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Province or region"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Postal code</span>
                  <input
                    value={selectedLocation?.postalCode || ""}
                    onChange={(event) => updateSelectedLocationField("postalCode", event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Postal code"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Country</span>
                  <input
                    value={selectedLocation?.country || ""}
                    onChange={(event) => updateSelectedLocationField("country", event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Country"
                  />
                </label>
              </div>
            </div>

            <div className="border-l border-black/5 bg-[#fcfcfb] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Map preview</p>
                  <p className="mt-1 text-[12px] text-[#57636c]">Optional fine-tuning if the suggested address needs adjustment.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMapPreview((current) => !current)}
                  className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                >
                  {showMapPreview ? "Hide map" : "Show map"}
                </button>
              </div>

              {showMapPreview ? (
                <div ref={mapRef} className="h-[420px] w-full rounded-[8px] bg-[#f3f4f6]" />
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded-[8px] border border-dashed border-black/10 bg-white px-6 text-center text-[13px] leading-[1.6] text-[#57636c]">
                  Use the address form for the normal flow. Open the map only if you need to fine-tune the pin.
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => selectedLocation && onSelect(selectedLocation)}
              disabled={!canSave}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use this location
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
