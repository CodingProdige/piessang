"use client";

import { useEffect, useState } from "react";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

type Props = {
  open: boolean;
  title: string;
  defaults?: {
    title?: string;
    productSlug?: string;
    sellerSlug?: string;
    pagePath?: string;
    issueType?: string;
    notes?: string;
  };
  onClose: () => void;
  onSaved?: () => void;
};

export function ContentsquareReplayCaptureModal({ open, title, defaults, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    replayUrl: "",
    productSlug: "",
    sellerSlug: "",
    pagePath: "",
    issueType: "product page",
    tags: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: toStr(defaults?.title),
      replayUrl: "",
      productSlug: toStr(defaults?.productSlug),
      sellerSlug: toStr(defaults?.sellerSlug),
      pagePath: toStr(defaults?.pagePath),
      issueType: toStr(defaults?.issueType, "product page"),
      tags: "",
      notes: toStr(defaults?.notes),
    });
    setError(null);
  }, [defaults, open]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/admin/contentsquare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          data: form,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save replay entry.");
      }
      onSaved?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save replay entry.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4">
      <div className="w-full max-w-[620px] rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Save replay</p>
            <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]">
            Close
          </button>
        </div>

        {error ? <div className="mt-4 rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

        <div className="mt-5 grid gap-3">
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Short title"
            className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
          />
          <input
            value={form.replayUrl}
            onChange={(event) => setForm((current) => ({ ...current, replayUrl: event.target.value }))}
            placeholder="Replay URL"
            className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={form.productSlug}
              onChange={(event) => setForm((current) => ({ ...current, productSlug: event.target.value }))}
              placeholder="Product slug"
              className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            />
            <input
              value={form.sellerSlug}
              onChange={(event) => setForm((current) => ({ ...current, sellerSlug: event.target.value }))}
              placeholder="Seller slug"
              className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            />
          </div>
          <input
            value={form.pagePath}
            onChange={(event) => setForm((current) => ({ ...current, pagePath: event.target.value }))}
            placeholder="/products/example"
            className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
          />
          <input
            value={form.issueType}
            onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value }))}
            placeholder="Issue type"
            className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
          />
          <input
            value={form.tags}
            onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
            placeholder="Tags"
            className="h-11 rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
          />
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            rows={4}
            placeholder="Notes"
            className="rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !toStr(form.replayUrl)}
            className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save replay"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContentsquareReplayCaptureModal;
