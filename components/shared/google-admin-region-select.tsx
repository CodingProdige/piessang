"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/components/shared/google-place-picker-modal";

type GoogleAdminRegionSelectProps = {
  countryCode: string;
  value: string;
  placeId?: string;
  onSelect: (value: { label: string; placeId: string }) => void;
  disabled?: boolean;
  placeholder?: string;
};

type RegionPrediction = {
  description: string;
  placeId: string;
};

function getAddressComponent(components: any[] = [], type: string) {
  const match = components.find((component) => Array.isArray(component.types) && component.types.includes(type));
  return match?.long_name || "";
}

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

function extractAdminRegion(place: any, expectedCountryCode: string) {
  const components = Array.isArray(place?.address_components) ? place.address_components : [];
  const region = getAddressComponent(components, "administrative_area_level_1");
  const countryComponent = components.find((component: any) => Array.isArray(component.types) && component.types.includes("country"));
  const countryCode = getAddressComponent(components, "country")
    ? String(
        countryComponent?.short_name || "",
      )
        .trim()
        .toUpperCase()
    : "";

  if (!region) return null;
  if (expectedCountryCode && countryCode && countryCode !== expectedCountryCode.trim().toUpperCase()) return null;

  return {
    label: region,
    placeId: String(place?.place_id || "").trim(),
  };
}

export function GoogleAdminRegionSelect({
  countryCode,
  value,
  placeId,
  onSelect,
  disabled = false,
  placeholder = "Search province / state",
}: GoogleAdminRegionSelectProps) {
  const [query, setQuery] = useState(value || "");
  const [predictions, setPredictions] = useState<RegionPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(false);
  const servicesRef = useRef<{
    autocomplete?: any;
    places?: any;
  }>({});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setQuery(value || "");
  }, [value, placeId]);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled) return;
        servicesRef.current.autocomplete = new google.maps.places.AutocompleteService();
        servicesRef.current.places = new google.maps.places.PlacesService(document.createElement("div"));
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Google region search.");
      });

    return () => {
      cancelled = true;
    };
  }, [disabled]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const normalizedCountry = String(countryCode || "").trim().toLowerCase();
    if (
      disabled ||
      !open ||
      !normalizedCountry ||
      normalizedQuery.length < 2 ||
      !servicesRef.current.autocomplete
    ) {
      setPredictions([]);
      return;
    }

    setLoading(true);
    const timeoutId = window.setTimeout(() => {
      servicesRef.current.autocomplete.getPlacePredictions(
        {
          input: normalizedQuery,
          types: ["(regions)"],
          componentRestrictions: { country: normalizedCountry },
        },
        (results: any[] = [], status: string) => {
          if (!isMountedRef.current) return;
          setLoading(false);
          if (status !== "OK" && status !== "ZERO_RESULTS") {
            setPredictions([]);
            return;
          }

          setPredictions(
            (results || [])
              .filter((result) => Array.isArray(result.types) && result.types.includes("administrative_area_level_1"))
              .slice(0, 8)
              .map((result) => ({
                description: result.description,
                placeId: result.place_id,
              })),
          );
        },
      );
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      setLoading(false);
    };
  }, [countryCode, disabled, open, query]);

  const helperText = useMemo(() => {
    if (!countryCode) return "Choose a ship-from country first.";
    if (error) return error;
    if (loading) return "Searching Google regions…";
    if (open && query.trim().length >= 2 && !predictions.length) return "No Google province/state matches found yet.";
    return "Search Google provinces / states for this country.";
  }, [countryCode, error, loading, open, predictions.length, query]);

  function handleSelect(selectedPlaceId: string) {
    if (!servicesRef.current.places) return;
    servicesRef.current.places.getDetails(
      {
        placeId: selectedPlaceId,
        fields: ["address_components", "formatted_address", "place_id"],
      },
      (place: any, status: string) => {
        if (!isMountedRef.current) return;
        if (status !== "OK" || !place) {
          setError("Unable to verify that region with Google.");
          return;
        }
        const region = extractAdminRegion(place, countryCode);
        if (!region?.label || !region.placeId) {
          setError("Google did not return a valid province/state for that selection.");
          return;
        }
        setError(null);
        setQuery(region.label);
        setPredictions([]);
        setOpen(false);
        onSelect(region);
      },
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!isMountedRef.current) return;
            setOpen(false);
            setQuery(value || "");
          }, 140);
        }}
        disabled={disabled || !countryCode}
        className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none"
        placeholder={placeholder}
      />
      {open && predictions.length ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[8px] border border-black/10 bg-white p-1 shadow-[0_14px_30px_rgba(20,24,27,0.12)]">
          {predictions.map((prediction) => {
            const parts = splitPredictionDescription(prediction.description);
            return (
              <button
                key={prediction.placeId}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(prediction.placeId)}
                className="block w-full rounded-[8px] px-3 py-2 text-left hover:bg-[#faf6eb]"
              >
                <span className="block text-[12px] font-semibold text-[#202020]">{parts.primary}</span>
                {parts.secondary ? <span className="block text-[11px] text-[#57636c]">{parts.secondary}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-[#57636c]">{helperText}</p>
    </div>
  );
}
