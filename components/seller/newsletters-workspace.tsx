"use client";

import { useEffect, useMemo, useState } from "react";

type NewsletterItem = {
  docId: string;
  newsletter?: {
    title?: string;
    description?: string;
    audienceLabel?: string;
    status?: string;
    updatedAt?: string;
  };
  metrics?: {
    subscriberCount?: number;
  };
};

type FormState = {
  newsletterId: string;
  title: string;
  description: string;
  audienceLabel: string;
  status: string;
};

const emptyForm: FormState = {
  newsletterId: "",
  title: "",
  description: "",
  audienceLabel: "All Piessang customers",
  status: "draft",
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatDate(value?: string) {
  const input = toStr(value);
  if (!input) return "Unknown time";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export function SellerNewslettersWorkspace() {
  const [items, setItems] = useState<NewsletterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/newsletters/list?adminMode=true", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load newsletters.");
      setItems(Array.isArray(payload?.data?.items) ? payload.data.items : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load newsletters.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (toStr(item?.newsletter?.status).toLowerCase() === "active") acc.active += 1;
        if (toStr(item?.newsletter?.status).toLowerCase() === "draft") acc.draft += 1;
        return acc;
      },
      { total: 0, active: 0, draft: 0 },
    );
  }, [items]);

  async function save() {
    if (!toStr(form.title)) {
      setError("Newsletter title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/newsletters/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsletterId: form.newsletterId || undefined,
          newsletter: {
            title: form.title,
            description: form.description,
            audienceLabel: form.audienceLabel,
            status: form.status,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save newsletter.");
      setMessage(form.newsletterId ? "Newsletter updated." : "Newsletter created.");
      setForm(emptyForm);
      window.dispatchEvent(new Event("piessang:refresh-admin-badges"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save newsletter.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Total newsletters</p>
          <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.total}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Active</p>
          <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.active}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Draft</p>
          <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.draft}</p>
        </div>
      </div>

      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.2fr]">
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">{form.newsletterId ? "Edit newsletter" : "Create newsletter"}</p>
          <div className="mt-4 space-y-3">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Newsletter title"
              className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            />
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={5}
              placeholder="Describe what this newsletter is about."
              className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
            />
            <input
              value={form.audienceLabel}
              onChange={(event) => setForm((current) => ({ ...current, audienceLabel: event.target.value }))}
              placeholder="Audience label"
              className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            />
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : form.newsletterId ? "Update newsletter" : "Create newsletter"}
              </button>
              {form.newsletterId ? (
                <button
                  type="button"
                  onClick={() => setForm(emptyForm)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Newsletters</p>
          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading newsletters...</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-[13px] text-[#57636c]">No newsletters created yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <button
                  key={item.docId}
                  type="button"
                  onClick={() =>
                    setForm({
                      newsletterId: item.docId,
                      title: toStr(item?.newsletter?.title),
                      description: toStr(item?.newsletter?.description),
                      audienceLabel: toStr(item?.newsletter?.audienceLabel, "All Piessang customers"),
                      status: toStr(item?.newsletter?.status, "draft"),
                    })
                  }
                  className="w-full rounded-[8px] border border-black/5 px-4 py-4 text-left transition-colors hover:border-[#cbb26b] hover:bg-[#fffaf0]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-[#202020]">{toStr(item?.newsletter?.title, "Newsletter")}</p>
                      <p className="mt-1 text-[12px] leading-5 text-[#57636c]">{toStr(item?.newsletter?.description, "No description yet.")}</p>
                      <p className="mt-2 text-[11px] text-[#8b94a3]">
                        {toStr(item?.newsletter?.audienceLabel, "All Piessang customers")} • {Number(item?.metrics?.subscriberCount || 0)} subscriber{Number(item?.metrics?.subscriberCount || 0) === 1 ? "" : "s"} • Updated {formatDate(item?.newsletter?.updatedAt)}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d6940]">
                      {toStr(item?.newsletter?.status || "draft")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
