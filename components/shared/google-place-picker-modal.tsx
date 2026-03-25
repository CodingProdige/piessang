"use client";

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
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (window.__piessangGoogleMapsPromise) return window.__piessangGoogleMapsPromise;
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("Google Maps API key is not configured."));

  window.__piessangGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps="true"]');
    if (existing) {
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
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any[] = [], status: string) => {
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

  const servicesRef = useRef<{
    autocomplete?: any;
    places?: any;
    geocoder?: any;
    map?: any;
    marker?: any;
  }>({});

  useEffect(() => {
    if (!open) return;
    setQuery(initialValue?.formattedAddress || "");
    setSelectedLocation(initialValue || null);
    setPredictions([]);
    setError(null);
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
    if (!query.trim() || !servicesRef.current.autocomplete) {
      setPredictions([]);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      servicesRef.current.autocomplete.getPlacePredictions(
        { input: query, types: ["geocode"] },
        (results: any[] = [], status: string) => {
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
  }, [open, query]);

  const canSave = useMemo(
    () => Boolean(selectedLocation?.formattedAddress && typeof selectedLocation?.latitude === "number" && typeof selectedLocation?.longitude === "number"),
    [selectedLocation],
  );

  function selectPrediction(placeId: string) {
    if (!servicesRef.current.places) return;
    servicesRef.current.places.getDetails(
      {
        placeId,
        fields: ["formatted_address", "address_components", "geometry", "name", "utc_offset_minutes"],
      },
      (place: any, status: string) => {
        if (status !== "OK" || !place) return;
        const mapped = mapPlaceResult(place);
        setSelectedLocation(mapped);
        setQuery(mapped.formattedAddress || "");
        setPredictions([]);
        if (servicesRef.current.map && mapped.latitude != null && mapped.longitude != null) {
          servicesRef.current.map.setCenter({ lat: mapped.latitude, lng: mapped.longitude });
          servicesRef.current.map.setZoom(14);
          servicesRef.current.marker?.setPosition({ lat: mapped.latitude, lng: mapped.longitude });
        }
      },
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 px-4 py-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative h-[90svh] w-full max-w-[920px] overflow-hidden rounded-[8px] bg-white shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Location picker</p>
              <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">{title}</h3>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                Search for an address, choose a suggestion, or click on the map to pin the location.
              </p>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]" aria-label="Close location picker">
              ×
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="border-r border-black/5 px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Search location</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  placeholder="Start typing an address or place"
                />
              </label>

              {error ? (
                <div className="mt-3 rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div>
              ) : null}

              {loading ? <div className="mt-3 text-[12px] text-[#57636c]">Loading map…</div> : null}

              <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto">
                {predictions.map((prediction) => (
                  <button
                    key={prediction.placeId}
                    type="button"
                    onClick={() => selectPrediction(prediction.placeId)}
                    className="block w-full rounded-[8px] border border-black/10 bg-white px-3 py-3 text-left text-[12px] text-[#202020] hover:border-[#cbb26b]"
                  >
                    {prediction.description}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[12px] text-[#57636c]">
                <p className="font-semibold text-[#202020]">Selected address</p>
                <p className="mt-1">{selectedLocation?.formattedAddress || "No location selected yet."}</p>
              </div>
            </div>

            <div className="min-h-0 p-4">
              <div ref={mapRef} className="h-full min-h-[320px] w-full rounded-[8px] bg-[#f3f4f6]" />
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
    </div>
  );
}
