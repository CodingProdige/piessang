"use client";

import { useEffect, useMemo, useState } from "react";

type NewsletterItem = {
  docId: string;
  subscribed?: boolean;
  newsletter?: {
    title?: string;
    description?: string;
    audienceLabel?: string;
    status?: string;
  };
  metrics?: {
    subscriberCount?: number;
  };
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function NewsletterPreferencesWorkspace() {
  const [items, setItems] = useState<NewsletterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/newsletters/list", { cache: "no-store" });
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

  const hasAny = useMemo(() => items.length > 0, [items]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const subscriptions = items.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.docId] = Boolean(item.subscribed);
        return acc;
      }, {});
      const response = await fetch("/api/client/v1/newsletters/preferences/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save newsletter preferences.");
      setMessage("Your newsletter subscriptions were updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save newsletter preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3">
        <p className="text-[16px] font-semibold text-[#202020]">Newsletter subscriptions</p>
        <p className="mt-1 text-[13px] leading-6 text-[#57636c]">
          Choose which Piessang newsletters you want to receive. Only active newsletters from Piessang will show here.
        </p>
      </div>

      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}

      {loading ? (
        <div className="rounded-[8px] bg-white p-5 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          Loading available newsletters...
        </div>
      ) : !hasAny ? (
        <div className="rounded-[8px] bg-white p-5 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          There are no active newsletters available right now.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {items.map((item) => (
              <label
                key={item.docId}
                className="flex items-start justify-between gap-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]"
              >
                <span className="block">
                  <span className="block text-[16px] font-semibold text-[#202020]">
                    {toStr(item?.newsletter?.title, "Piessang newsletter")}
                  </span>
                  <span className="mt-1 block text-[13px] leading-6 text-[#57636c]">
                    {toStr(item?.newsletter?.description, "Stay in the loop with updates from Piessang.")}
                  </span>
                  <span className="mt-2 block text-[12px] text-[#8b94a3]">
                    {toStr(item?.newsletter?.audienceLabel, "All Piessang customers")}
                    {Number(item?.metrics?.subscriberCount || 0) > 0 ? ` • ${Number(item?.metrics?.subscriberCount || 0)} subscriber${Number(item?.metrics?.subscriberCount || 0) === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(item.subscribed)}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.docId === item.docId ? { ...entry, subscribed: event.target.checked } : entry,
                      ),
                    )
                  }
                  className="mt-1 h-4 w-4 shrink-0"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save subscriptions"}
          </button>
        </div>
      )}
    </div>
  );
}
