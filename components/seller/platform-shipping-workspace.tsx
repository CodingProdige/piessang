"use client";

import { useEffect, useMemo, useState } from "react";
import { AppSnackbar } from "@/components/ui/app-snackbar";

type PlatformShippingMarkup = {
  enabled: boolean;
  mode: "percentage" | "fixed";
  value: string;
  appliesTo: "all" | "seller_fulfilled" | "piessang_fulfilled";
  countryCode: string;
  updatedAt?: string;
  updatedBy?: string;
};

const EMPTY_MARKUP: PlatformShippingMarkup = {
  enabled: false,
  mode: "percentage",
  value: "10",
  appliesTo: "seller_fulfilled",
  countryCode: "ZA",
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function mapMarkup(input: any): PlatformShippingMarkup {
  return {
    enabled: input?.enabled === true,
    mode: toStr(input?.mode || "percentage") === "fixed" ? "fixed" : "percentage",
    value: toStr(input?.value ?? "0"),
    appliesTo:
      toStr(input?.appliesTo || "seller_fulfilled") === "all" || toStr(input?.appliesTo || "") === "piessang_fulfilled"
        ? (toStr(input?.appliesTo) as PlatformShippingMarkup["appliesTo"])
        : "seller_fulfilled",
    countryCode: toStr(input?.countryCode || "ZA").toUpperCase() || "ZA",
    updatedAt: toStr(input?.updatedAt || ""),
    updatedBy: toStr(input?.updatedBy || ""),
  };
}

export function SellerPlatformShippingWorkspace() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [markup, setMarkup] = useState<PlatformShippingMarkup>(EMPTY_MARKUP);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(EMPTY_MARKUP));
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/admin/platform-shipping", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load Piessang shipping settings.");
        const nextMarkup = mapMarkup(payload?.platformShippingMarkup || {});
        if (!cancelled) {
          setMarkup(nextMarkup);
          setSavedSnapshot(JSON.stringify(nextMarkup));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Piessang shipping settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(markup) !== savedSnapshot, [markup, savedSnapshot]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/admin/platform-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformShippingMarkup: {
            enabled: markup.enabled,
            mode: markup.mode,
            value: Number(markup.value || 0),
            appliesTo: markup.appliesTo,
            countryCode: markup.countryCode,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save Piessang shipping settings.");
      const nextMarkup = mapMarkup(payload?.platformShippingMarkup || {});
      setMarkup(nextMarkup);
      setSavedSnapshot(JSON.stringify(nextMarkup));
      setSnackbar({ tone: "success", message: "Platform shipping markup saved." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to save Piessang shipping settings.";
      setError(message);
      setSnackbar({ tone: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Piessang shipping markup</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Configure the internal platform shipping markup applied on top of canonical shipping results. Sellers and shoppers only ever see the final customer shipping charge.
        </p>
      </section>

      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        {loading ? (
          <div className="text-[13px] text-[#57636c]">Loading platform shipping settings...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[13px] font-medium text-[#202020]">
              <input
                type="checkbox"
                checked={markup.enabled}
                onChange={(event) => setMarkup((current) => ({ ...current, enabled: event.target.checked }))}
              />
              Enable platform shipping markup
            </label>
            <div className="rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[12px] text-[#57636c]">
              {markup.updatedAt ? `Last updated ${new Date(markup.updatedAt).toLocaleString("en-ZA")}` : "No shipping markup changes saved yet."}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Markup mode</span>
              <select
                value={markup.mode}
                onChange={(event) => setMarkup((current) => ({ ...current, mode: event.target.value as PlatformShippingMarkup["mode"] }))}
                className="h-11 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[14px] outline-none"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Markup value</span>
              <input
                value={markup.value}
                onChange={(event) => setMarkup((current) => ({ ...current, value: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) }))}
                className="h-11 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[14px] outline-none"
                placeholder={markup.mode === "percentage" ? "10" : "20"}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Applies to</span>
              <select
                value={markup.appliesTo}
                onChange={(event) => setMarkup((current) => ({ ...current, appliesTo: event.target.value as PlatformShippingMarkup["appliesTo"] }))}
                className="h-11 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[14px] outline-none"
              >
                <option value="all">All shipping</option>
                <option value="seller_fulfilled">Seller fulfilled</option>
                <option value="piessang_fulfilled">Piessang fulfilled</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Country code</span>
              <input
                value={markup.countryCode}
                onChange={(event) => setMarkup((current) => ({ ...current, countryCode: event.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() }))}
                className="h-11 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[14px] outline-none"
                placeholder="ZA"
              />
            </label>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving || !dirty}
          className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save shipping markup"}
        </button>
      </div>

      <AppSnackbar notice={snackbar ? { tone: snackbar.tone, message: snackbar.message } : null} />
    </section>
  );
}

export default SellerPlatformShippingWorkspace;
