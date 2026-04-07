"use client";

import { useEffect, useMemo, useState } from "react";
import { SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES } from "@/lib/marketplace/country-config";

type SettingsPayload = {
  countryCodes: string[];
  countries: Array<{ code: string; label: string }>;
  updatedAt?: string;
  updatedBy?: string;
};

function formatTimestamp(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function SellerGoogleMerchantCountriesWorkspace() {
  const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>([]);
  const [savedCountryCodes, setSavedCountryCodes] = useState<string[]>([]);
  const [meta, setMeta] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/admin/google-merchant-countries", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load Google Merchant rollout countries.");
        }
        if (cancelled) return;
        const nextCodes = Array.isArray(payload?.settings?.countryCodes) ? payload.settings.countryCodes : [];
        setSelectedCountryCodes(nextCodes);
        setSavedCountryCodes(nextCodes);
        setMeta(payload?.settings || null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Google Merchant rollout countries.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(
    () => JSON.stringify([...selectedCountryCodes].sort()) !== JSON.stringify([...savedCountryCodes].sort()),
    [selectedCountryCodes, savedCountryCodes],
  );

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/admin/google-merchant-countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCodes: selectedCountryCodes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save Google Merchant rollout countries.");
      }
      const nextCodes = Array.isArray(payload?.settings?.countryCodes) ? payload.settings.countryCodes : [];
      setSelectedCountryCodes(nextCodes);
      setSavedCountryCodes(nextCodes);
      setMeta(payload?.settings || null);
      setMessage("Google Merchant rollout countries saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Google Merchant rollout countries.");
    } finally {
      setSaving(false);
    }
  }

  function toggleCountry(code: string) {
    setSelectedCountryCodes((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code],
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Google Merchant rollout countries</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Control which checkout-supported countries Piessang is allowed to target through Google Merchant Center. The Google sync only emits offers for countries enabled here and supported by the seller’s delivery profile.
        </p>
      </section>

      {message ? <div className="rounded-[8px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        {loading ? (
          <div className="text-[13px] text-[#57636c]">Loading Google Merchant rollout countries...</div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
              <p className="text-[13px] font-semibold text-[#202020]">Current rollout</p>
              <p className="mt-1 text-[12px] text-[#57636c]">
                {selectedCountryCodes.length
                  ? `${selectedCountryCodes.length} countries enabled for Google product sync.`
                  : "No countries enabled yet."}
              </p>
              {meta?.updatedAt ? (
                <p className="mt-2 text-[11px] text-[#7d7d7d]">Last updated: {formatTimestamp(meta.updatedAt)}</p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES.map((country) => {
                const checked = selectedCountryCodes.includes(country.code);
                return (
                  <label
                    key={country.code}
                    className={`flex items-start gap-3 rounded-[8px] border px-4 py-3 transition-colors ${checked ? "border-[#cbb26b] bg-[#fff9ea]" : "border-black/10 bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCountry(country.code)}
                      className="mt-0.5 h-4 w-4 rounded border-black/20"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[#202020]">{country.label}</span>
                      <span className="mt-0.5 block text-[11px] text-[#7d7d7d]">{country.code}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty || selectedCountryCodes.length === 0}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save rollout countries"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCountryCodes(savedCountryCodes)}
                disabled={saving || !dirty}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset changes
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
