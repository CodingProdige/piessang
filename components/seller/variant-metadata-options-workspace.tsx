// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VARIANT_METADATA_SELECT_OPTIONS,
  VARIANT_METADATA_SELECT_FIELD_DEFS,
} from "@/lib/catalogue/variant-metadata-select-options";
import { VARIANT_METADATA_GROUP_ORDER } from "@/lib/catalogue/variant-context";

function cloneCustomFields(values) {
  return JSON.parse(JSON.stringify(Array.isArray(values) ? values : []));
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_VARIANT_METADATA_SELECT_OPTIONS));
}

function toStr(value) {
  return value == null ? "" : String(value).trim();
}

function formatProductUsage(count) {
  const safeCount = Number(count || 0);
  return `${safeCount} product${safeCount === 1 ? "" : "s"}`;
}

function getUsageCount(usage, fieldKey, optionValue) {
  return Number(usage?.[fieldKey]?.options?.[optionValue]?.productsCount || 0);
}

function getFieldUsageCount(usage, fieldKey) {
  return Number(usage?.[fieldKey]?.productsCount || 0);
}

function normalizeFieldKey(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function UsagePill({ label, tone = "slate" }) {
  const toneClass =
    tone === "green"
      ? "border-[#cdebdc] bg-[#ecfdf5] text-[#166534]"
      : tone === "amber"
        ? "border-[#f2deb4] bg-[#fffbeb] text-[#92400e]"
        : "border-black/10 bg-[#f6f7f8] text-[#57636c]";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {label}
    </span>
  );
}

export function SellerVariantMetadataOptionsWorkspace() {
  const [config, setConfig] = useState(cloneDefaults());
  const [savedConfig, setSavedConfig] = useState(cloneDefaults());
  const [usage, setUsage] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [savedCustomFields, setSavedCustomFields] = useState([]);
  const [customFieldUsage, setCustomFieldUsage] = useState({});
  const [draftValues, setDraftValues] = useState({});
  const [newCustomField, setNewCustomField] = useState({ label: "", group: VARIANT_METADATA_GROUP_ORDER[0] || "Core options" });
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
          const nextConfig = payload.config || cloneDefaults();
          setConfig(nextConfig);
          setSavedConfig(nextConfig);
          setUsage(payload.usage || {});
          setCustomFields(cloneCustomFields(payload.customFields || []));
          setSavedCustomFields(cloneCustomFields(payload.customFields || []));
          setCustomFieldUsage(payload.customFieldUsage || {});
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

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig) || JSON.stringify(customFields) !== JSON.stringify(savedCustomFields);

  function updateFieldOptions(fieldKey, nextValues) {
    setConfig((current) => ({
      ...current,
      [fieldKey]: nextValues,
    }));
  }

  function renameOptionValue(fieldKey, fieldLabel, optionValue, nextRawValue) {
    const nextValue = toStr(nextRawValue);
    if (!nextValue || nextValue === optionValue) return;
    const currentValues = Array.isArray(config[fieldKey]) ? config[fieldKey] : [];
    if (currentValues.some((value) => value !== optionValue && value.toLowerCase() === nextValue.toLowerCase())) {
      setError(`"${nextValue}" already exists for ${fieldLabel.toLowerCase()}.`);
      return;
    }
    updateFieldOptions(
      fieldKey,
      currentValues.map((value) => (value === optionValue ? nextValue : value)),
    );
    setMessage(`Renamed "${optionValue}" to "${nextValue}". Save to publish the change.`);
    setError(null);
  }

  function addOptionValue(fieldKey) {
    const rawValue = toStr(draftValues[fieldKey]);
    if (!rawValue) return;
    const currentValues = Array.isArray(config[fieldKey]) ? config[fieldKey] : [];
    if (currentValues.some((value) => value.toLowerCase() === rawValue.toLowerCase())) {
      setError(`"${rawValue}" already exists for this metadata field.`);
      return;
    }
    updateFieldOptions(fieldKey, [...currentValues, rawValue]);
    setDraftValues((current) => ({ ...current, [fieldKey]: "" }));
    setMessage(`Added "${rawValue}". Save to publish the change.`);
    setError(null);
  }

  function removeOptionValue(fieldKey, fieldLabel, optionValue) {
    const productsCount = getUsageCount(usage, fieldKey, optionValue);
    if (productsCount > 0) {
      setError(
        `You cannot remove "${optionValue}" from ${fieldLabel.toLowerCase()} yet because ${formatProductUsage(productsCount)} still use ${productsCount === 1 ? "it" : "it"}. Update those products first.`,
      );
      return;
    }
    updateFieldOptions(
      fieldKey,
      (Array.isArray(config[fieldKey]) ? config[fieldKey] : []).filter((value) => value !== optionValue),
    );
    setMessage(`Removed "${optionValue}". Save to publish the change.`);
    setError(null);
  }

  function updateCustomField(fieldKey, patch) {
    setCustomFields((current) => current.map((field) => (field.key === fieldKey ? { ...field, ...patch } : field)));
  }

  function renameCustomField(field, nextLabelRaw) {
    const nextLabel = toStr(nextLabelRaw);
    if (!nextLabel || nextLabel === field.label) return;
    setCustomFields((current) =>
      current.map((entry) => (entry.key === field.key ? { ...entry, label: nextLabel } : entry)),
    );
    setMessage(`Renamed "${field.label}" to "${nextLabel}". Save to publish the change.`);
    setError(null);
  }

  function changeCustomFieldGroup(field, nextGroup) {
    const normalizedGroup = toStr(nextGroup) || "Core options";
    if (normalizedGroup === field.group) return;
    updateCustomField(field.key, { group: normalizedGroup });
    setMessage(`Moved "${field.label}" to ${normalizedGroup}. Save to publish the change.`);
    setError(null);
  }

  function renameCustomFieldOption(field, optionValue, nextRawValue) {
    const nextValue = toStr(nextRawValue);
    if (!nextValue || nextValue === optionValue) return;
    const currentOptions = Array.isArray(field.options) ? field.options : [];
    if (currentOptions.some((value) => value !== optionValue && value.toLowerCase() === nextValue.toLowerCase())) {
      setError(`"${nextValue}" already exists for ${field.label.toLowerCase()}.`);
      return;
    }
    updateCustomField(field.key, {
      options: currentOptions.map((value) => (value === optionValue ? nextValue : value)),
    });
    setMessage(`Renamed "${optionValue}" to "${nextValue}". Save to publish the change.`);
    setError(null);
  }

  function addCustomField() {
    const label = toStr(newCustomField.label);
    if (!label) {
      setError("Add a label before creating a custom metadata field.");
      return;
    }
    const key = normalizeFieldKey(label);
    if (!key) {
      setError("That custom metadata field label could not be converted into a safe key.");
      return;
    }
    if (customFields.some((field) => field.key === key)) {
      setError("A custom metadata field with that label already exists.");
      return;
    }
    setCustomFields((current) => [...current, { key, label, group: newCustomField.group || "Core options", options: ["Custom"] }]);
    setNewCustomField({ label: "", group: newCustomField.group || "Core options" });
    setMessage(`Added "${label}". Save to publish the new metadata field.`);
    setError(null);
  }

  function removeCustomField(field) {
    const productsCount = Number(customFieldUsage?.fields?.[field.key]?.productsCount || 0);
    if (productsCount > 0) {
      setError(`You cannot remove "${field.label}" yet because ${formatProductUsage(productsCount)} still use it. Update those products first.`);
      return;
    }
    setCustomFields((current) => current.filter((entry) => entry.key !== field.key));
    setMessage(`Removed "${field.label}". Save to publish the change.`);
    setError(null);
  }

  function addCustomFieldOption(fieldKey) {
    const rawValue = toStr(draftValues[`custom:${fieldKey}`]);
    if (!rawValue) return;
    const field = customFields.find((entry) => entry.key === fieldKey);
    const currentOptions = Array.isArray(field?.options) ? field.options : [];
    if (currentOptions.some((value) => value.toLowerCase() === rawValue.toLowerCase())) {
      setError(`"${rawValue}" already exists for this metadata field.`);
      return;
    }
    updateCustomField(fieldKey, { options: [...currentOptions, rawValue] });
    setDraftValues((current) => ({ ...current, [`custom:${fieldKey}`]: "" }));
    setMessage(`Added "${rawValue}". Save to publish the change.`);
    setError(null);
  }

  function removeCustomFieldOption(field, optionValue) {
    const productsCount = Number(customFieldUsage?.options?.[field.key]?.[optionValue]?.productsCount || 0);
    if (productsCount > 0) {
      setError(`You cannot remove "${optionValue}" from ${field.label.toLowerCase()} yet because ${formatProductUsage(productsCount)} still use it. Update those products first.`);
      return;
    }
    updateCustomField(field.key, { options: (Array.isArray(field.options) ? field.options : []).filter((value) => value !== optionValue) });
    setMessage(`Removed "${optionValue}". Save to publish the change.`);
    setError(null);
  }

  async function save() {
    try {
      setSaving(true);
      setMessage(null);
      setError(null);
      const response = await fetch("/api/client/v1/admin/variant-metadata-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, customFields }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save variant metadata options.");
      const nextConfig = payload.config || cloneDefaults();
      setConfig(nextConfig);
      setSavedConfig(nextConfig);
      setUsage(payload.usage || {});
      setCustomFields(cloneCustomFields(payload.customFields || []));
      setSavedCustomFields(cloneCustomFields(payload.customFields || []));
      setCustomFieldUsage(payload.customFieldUsage || {});
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
          Manage the dropdown-backed variant metadata options used by sellers when they create products. Each selectable value is
          managed as a list item so you can add and remove values cleanly, see how many products use them, and avoid deleting
          values that are already live on products.
        </p>
        {message ? <p className="mt-3 text-[12px] font-medium text-[#166534]">{message}</p> : null}
        {error ? <p className="mt-3 text-[12px] font-medium text-[#b91c1c]">{error}</p> : null}
      </section>

      <section className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Custom metadata fields</h3>
            <p className="mt-2 max-w-[860px] text-[13px] leading-[1.7] text-[#57636c]">
              Add extra selectable metadata fields beyond the built-in catalogue set. These fields use the same dropdown-plus-custom pattern in the seller product editor.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_220px_auto]">
          <input
            type="text"
            value={newCustomField.label}
            onChange={(event) => setNewCustomField((current) => ({ ...current, label: event.target.value }))}
            placeholder="Field label, for example Processor family"
            className="min-w-0 rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
          />
          <select
            value={newCustomField.group}
            onChange={(event) => setNewCustomField((current) => ({ ...current, group: event.target.value }))}
            className="rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
          >
            {VARIANT_METADATA_GROUP_ORDER.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addCustomField}
            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
          >
            Add field
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {customFields.length ? (
            customFields.map((field) => {
              const fieldUsageCount = Number(customFieldUsage?.fields?.[field.key]?.productsCount || 0);
              return (
                <div key={field.key} className="rounded-[10px] border border-black/8 bg-[#fafafa] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(event) => renameCustomField(field, event.target.value)}
                        className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[13px] font-semibold text-[#202020] outline-none focus:border-[#cbb26b]"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select
                          value={field.group}
                          onChange={(event) => changeCustomFieldGroup(field, event.target.value)}
                          className="rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[11px] text-[#57636c] outline-none focus:border-[#cbb26b]"
                        >
                          {VARIANT_METADATA_GROUP_ORDER.map((group) => (
                            <option key={group} value={group}>
                              {group}
                            </option>
                          ))}
                        </select>
                        <UsagePill label={`key ${field.key}`} tone="slate" />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <UsagePill label={`${formatProductUsage(fieldUsageCount)} use this field`} tone={fieldUsageCount > 0 ? "green" : "slate"} />
                      <button
                        type="button"
                        onClick={() => removeCustomField(field)}
                        disabled={fieldUsageCount > 0}
                        className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#57636c] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove field
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(Array.isArray(field.options) ? field.options : []).map((optionValue) => {
                      const optionUsageCount = Number(customFieldUsage?.options?.[field.key]?.[optionValue]?.productsCount || 0);
                      return (
                        <div key={`${field.key}:${optionValue}`} className="rounded-[8px] border border-black/8 bg-white px-3 py-2">
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_122px] sm:items-start">
                            <div className="min-w-0">
                              <input
                                type="text"
                                value={optionValue}
                                onChange={(event) => renameCustomFieldOption(field, optionValue, event.target.value)}
                                className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-[#202020] outline-none focus:border-[#cbb26b]"
                              />
                              <div className="mt-1 flex flex-wrap gap-2">
                                <UsagePill label={`${formatProductUsage(optionUsageCount)} use this value`} tone={optionUsageCount > 0 ? "amber" : "slate"} />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCustomFieldOption(field, optionValue)}
                              disabled={optionUsageCount > 0}
                              className="inline-flex h-8 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#57636c] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={draftValues[`custom:${field.key}`] || ""}
                      onChange={(event) => setDraftValues((current) => ({ ...current, [`custom:${field.key}`]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomFieldOption(field.key);
                        }
                      }}
                      placeholder={`Add a selectable value for ${field.label.toLowerCase()}`}
                      className="min-w-0 flex-1 rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                    />
                    <button
                      type="button"
                      onClick={() => addCustomFieldOption(field.key)}
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                    >
                      Add value
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-3 py-3 text-[12px] text-[#57636c]">
              No custom metadata fields yet.
            </div>
          )}
        </div>
      </section>

      {groupedFields.map((entry) => (
        <section key={entry.group} className="rounded-[12px] border border-black/10 bg-white p-4 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{entry.group}</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {entry.fields.map((field) => {
              const options = Array.isArray(config[field.key]) ? config[field.key] : [];
              const fieldUsageCount = getFieldUsageCount(usage, field.key);
              return (
                <div key={field.key} className="rounded-[10px] border border-black/5 bg-[#fafafa] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-semibold text-[#202020]">{field.label}</p>
                      <p className="mt-1 text-[11px] text-[#57636c]">
                        Values appear in seller dropdowns and can still include `Custom` when you want sellers to break out of the list.
                      </p>
                    </div>
                    <UsagePill
                      label={`${formatProductUsage(fieldUsageCount)} use this field`}
                      tone={fieldUsageCount > 0 ? "green" : "slate"}
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    {options.length ? (
                      options.map((optionValue) => {
                        const optionUsageCount = getUsageCount(usage, field.key, optionValue);
                        const blocked = optionUsageCount > 0;
                        return (
                        <div key={optionValue} className="rounded-[8px] border border-black/8 bg-white px-3 py-2">
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_122px] sm:items-start">
                              <div className="min-w-0">
                              <input
                                type="text"
                                value={optionValue}
                                onChange={(event) => renameOptionValue(field.key, field.label, optionValue, event.target.value)}
                                className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-[#202020] outline-none focus:border-[#cbb26b]"
                              />
                              <div className="mt-1 flex flex-wrap gap-2">
                                <UsagePill
                                  label={`${formatProductUsage(optionUsageCount)} use this value`}
                                  tone={blocked ? "amber" : "slate"}
                                />
                              </div>
                              </div>
                              <button
                                type="button"
                                disabled={blocked}
                                onClick={() => removeOptionValue(field.key, field.label, optionValue)}
                                className="inline-flex h-8 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#57636c] disabled:cursor-not-allowed disabled:opacity-40"
                                title={blocked ? "This value is still used by live products and cannot be removed yet." : "Remove this selectable value"}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c]">
                        No selectable values configured yet for this field.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={draftValues[field.key] || ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setDraftValues((current) => ({ ...current, [field.key]: nextValue }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addOptionValue(field.key);
                        }
                      }}
                      placeholder={`Add a ${field.label.toLowerCase()} option`}
                      className="min-w-0 flex-1 rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                    />
                    <button
                      type="button"
                      onClick={() => addOptionValue(field.key)}
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                    >
                      Add value
                    </button>
                  </div>
                </div>
              );
            })}
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
