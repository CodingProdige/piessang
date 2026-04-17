// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VARIANT_METADATA_SELECT_OPTIONS,
  VARIANT_METADATA_SELECT_FIELD_DEFS,
} from "@/lib/catalogue/variant-metadata-select-options";
import { VARIANT_METADATA_GROUP_ORDER } from "@/lib/catalogue/variant-context";

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_VARIANT_METADATA_SELECT_OPTIONS));
}

function toLines(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function fromLines(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function SellerVariantMetadataOptionsWorkspace() {
  const [config, setConfig] = useState(cloneDefaults());
  const [savedConfig, setSavedConfig] = useState(cloneDefaults());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/api/client/v1/admin/variant-metadata-options", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load variant metadata options.");
        if (!cancelled) {
          setConfig(payload.config || cloneDefaults());
          setSavedConfig(payload.config || cloneDefaults());
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load variant metadata options.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedFields = useMemo(
    () =>
      VARIANT_METADATA_GROUP_ORDER.map((group) => ({
        group,
        fields: VARIANT_METADATA_SELECT_FIELD_DEFS.filter((field) => field.group === group),
      })).filter((entry) => entry.fields.length > 0),
    [],
  );

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  async function save() {
    try {
      setSaving(true);
      setMessage(null);
      setError(null);
      const response = await fetch("/api/client/v1/admin/variant-metadata-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save variant metadata options.");
      setConfig(payload.config || cloneDefaults());
      setSavedConfig(payload.config || cloneDefaults());
      setMessage("Variant metadata options saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save variant metadata options.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Variant metadata</p>
        <h2 className="mt-2 text-[22px] font-semibold text-[#202020]">Selectable metadata values</h2>
        <p className="mt-2 max-w-[860px] text-[13px] leading-[1.7] text-[#57636c]">
          Manage the dropdown-backed variant metadata options used by sellers when they create products. One value per line.
          Keep canonical values clean here because these values also feed storefront selectors and filters.
        </p>
        {message ? <p className="mt-3 text-[12px] font-medium text-[#166534]">{message}</p> : null}
        {error ? <p className="mt-3 text-[12px] font-medium text-[#b91c1c]">{error}</p> : null}
      </section>

      {groupedFields.map((entry) => (
        <section key={entry.group} className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{entry.group}</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {entry.fields.map((field) => (
              <label key={field.key} className="block rounded-[10px] border border-black/5 bg-[#fafafa] p-3">
                <span className="block text-[12px] font-semibold text-[#202020]">{field.label}</span>
                <span className="mt-1 block text-[11px] text-[#57636c]">
                  One option per line. Include `Custom` if sellers should still be able to break out of the preset list.
                </span>
                <textarea
                  value={toLines(config[field.key] || [])}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      [field.key]: fromLines(event.target.value),
                    }))
                  }
                  rows={8}
                  className="mt-3 w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                />
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          disabled={loading || saving || !dirty}
          onClick={() => void save()}
          className="inline-flex h-11 items-center rounded-[10px] bg-[#202020] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : loading ? "Loading..." : dirty ? "Save variant metadata options" : "No changes"}
        </button>
      </div>
    </div>
  );
}
