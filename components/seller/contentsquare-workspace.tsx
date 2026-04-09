"use client";

import { useEffect, useMemo, useState } from "react";

function formatTimestamp(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

type ReplayItem = {
  id: string;
  replayUrl?: string | null;
  productSlug?: string | null;
  sellerSlug?: string | null;
  pagePath?: string | null;
  issueType?: string | null;
  title?: string | null;
  notes?: string | null;
  tags?: string[];
  createdAt?: string | null;
};

const ISSUE_TYPES = [
  "checkout",
  "product page",
  "cart",
  "search",
  "category browsing",
  "mobile menu",
  "seller dashboard",
  "broken flow",
  "other",
];

export function SellerContentsquareWorkspace() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReplayItem[]>([]);
  const [query, setQuery] = useState("");
  const [issueFilter, setIssueFilter] = useState("all");
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

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/client/v1/admin/contentsquare", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load Contentsquare replay entries.");
      }
      setItems(Array.isArray(payload?.items) ? payload.items : []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Contentsquare replay entries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveReplay() {
    setSaving(true);
    setMessage(null);
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
        throw new Error(payload?.message || "Unable to save the replay entry.");
      }
      setForm({
        title: "",
        replayUrl: "",
        productSlug: "",
        sellerSlug: "",
        pagePath: "",
        issueType: "product page",
        tags: "",
        notes: "",
      });
      setMessage("Replay entry saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the replay entry.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReplay(id: string) {
    setDeletingId(id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/admin/contentsquare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to delete the replay entry.");
      }
      setMessage("Replay entry deleted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the replay entry.");
    } finally {
      setDeletingId("");
    }
  }

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (issueFilter !== "all" && toStr(item?.issueType).toLowerCase() !== issueFilter) return false;
      if (!needle) return true;
      const haystack = [
        item?.title,
        item?.productSlug,
        item?.sellerSlug,
        item?.pagePath,
        item?.issueType,
        item?.notes,
        Array.isArray(item?.tags) ? item.tags.join(" ") : "",
      ]
        .map((value) => toStr(value).toLowerCase())
        .join(" ");
      return haystack.includes(needle);
    });
  }, [items, issueFilter, query]);

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Contentsquare replay tools</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          Save replay links against products, sellers, page paths, and issue types so the admin team can review UX evidence directly from Piessang.
        </p>
      </section>

      {message ? <div className="rounded-[8px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[13px] font-semibold text-[#202020]">Add replay link</p>
          <p className="mt-1 text-[12px] text-[#57636c]">Paste a Contentsquare replay URL and tag it with the product, seller, and issue context.</p>

          <div className="mt-4 grid gap-3">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Short title"
              className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            />
            <input
              value={form.replayUrl}
              onChange={(event) => setForm((current) => ({ ...current, replayUrl: event.target.value }))}
              placeholder="https://..."
              className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.productSlug}
                onChange={(event) => setForm((current) => ({ ...current, productSlug: event.target.value }))}
                placeholder="Product slug"
                className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
              />
              <input
                value={form.sellerSlug}
                onChange={(event) => setForm((current) => ({ ...current, sellerSlug: event.target.value }))}
                placeholder="Seller slug"
                className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <input
                value={form.pagePath}
                onChange={(event) => setForm((current) => ({ ...current, pagePath: event.target.value }))}
                placeholder="/products/la-vie-de-luc..."
                className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
              />
              <select
                value={form.issueType}
                onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value }))}
                className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
              >
                {ISSUE_TYPES.map((issue) => (
                  <option key={issue} value={issue}>
                    {issue}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="Tags, comma separated"
              className="h-11 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            />
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={5}
              placeholder="What did this replay show?"
              className="rounded-[8px] border border-black/10 bg-white px-3 py-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            />
            <button
              type="button"
              onClick={() => void saveReplay()}
              disabled={saving || !toStr(form.replayUrl)}
              className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save replay"}
            </button>
          </div>
        </div>

        <div className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#202020]">Saved replays</p>
              <p className="mt-1 text-[12px] text-[#57636c]">Search and open replay links without leaving the admin dashboard.</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving || Boolean(deletingId)}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, seller, path, notes"
              className="h-10 min-w-[220px] flex-1 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            />
            <select
              value={issueFilter}
              onChange={(event) => setIssueFilter(event.target.value)}
              className="h-10 rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#cbb26b] focus:ring-2 focus:ring-[#f3e4b8]/60"
            >
              <option value="all">All issue types</option>
              {ISSUE_TYPES.map((issue) => (
                <option key={issue} value={issue}>
                  {issue}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 overflow-hidden rounded-[8px] border border-black/10">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_140px] gap-3 border-b border-black/8 bg-[#fafafa] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
              <span>Replay</span>
              <span>Context</span>
              <span>Issue</span>
              <span>Actions</span>
            </div>
            {loading ? (
              <div className="px-4 py-5 text-[13px] text-[#57636c]">Loading replay entries...</div>
            ) : visibleItems.length ? (
              visibleItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_140px] gap-3 border-t border-black/6 px-4 py-3 text-[13px] text-[#202020] first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{toStr(item?.title, item?.productSlug || item?.pagePath || "Replay link")}</p>
                    <p className="mt-1 truncate text-[11px] text-[#7d7d7d]">{toStr(item?.replayUrl)}</p>
                    {item?.notes ? <p className="mt-1 line-clamp-2 text-[11px] text-[#57636c]">{item.notes}</p> : null}
                    {Array.isArray(item?.tags) && item.tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="inline-flex rounded-full bg-[rgba(203,178,107,0.14)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f7531]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 text-[12px] text-[#57636c]">
                    <p className="truncate">{toStr(item?.productSlug, "No product slug")}</p>
                    <p className="mt-1 truncate">{toStr(item?.sellerSlug, "No seller slug")}</p>
                    <p className="mt-1 truncate">{toStr(item?.pagePath, "No page path")}</p>
                    <p className="mt-1 truncate">{formatTimestamp(toStr(item?.createdAt))}</p>
                  </div>
                  <div className="text-[12px] font-semibold text-[#202020]">{toStr(item?.issueType, "other")}</div>
                  <div className="flex flex-col gap-2">
                    <a
                      href={toStr(item?.replayUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                    >
                      Open replay
                    </a>
                    <button
                      type="button"
                      onClick={() => void deleteReplay(item.id)}
                      disabled={deletingId === item.id}
                      className="inline-flex h-9 items-center justify-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-5 text-[13px] text-[#57636c]">No replay entries saved yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default SellerContentsquareWorkspace;
