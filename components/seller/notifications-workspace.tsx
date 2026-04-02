"use client";

import { useEffect, useMemo, useState } from "react";

type SellerNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export function SellerNotificationsWorkspace({
  sellerSlug,
  sellerCode,
}: {
  sellerSlug: string;
  sellerCode: string;
}) {
  const [items, setItems] = useState<SellerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState("");

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (sellerCode) params.set("sellerCode", sellerCode);
      if (sellerSlug) params.set("sellerSlug", sellerSlug);
      const response = await fetch(`/api/client/v1/accounts/seller/notifications?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load seller notifications.");
      }
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (loadError: any) {
      setError(loadError?.message || "Unable to load seller notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, [sellerCode, sellerSlug]);

  const visibleItems = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.read) : items),
    [filter, items],
  );

  async function updateNotification(action: "mark-read" | "mark-all-read", notificationId = "") {
    setBusy(action === "mark-all-read" ? "all" : notificationId);
    setError("");
    try {
      const response = await fetch("/api/client/v1/accounts/seller/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notificationId,
          sellerCode,
          sellerSlug,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update seller notifications.");
      }
      if (action === "mark-all-read") {
        setItems((current) => current.map((item) => ({ ...item, read: true })));
      } else {
        setItems((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
      }
    } catch (updateError: any) {
      setError(updateError?.message || "Unable to update seller notifications.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-black/6 bg-[rgba(32,32,32,0.02)] p-4">
        <div>
          <p className="text-[18px] font-semibold text-[#202020]">Seller notifications</p>
          <p className="mt-1 text-[13px] leading-[1.7] text-[#57636c]">
            Follow profile growth, product events, and seller account updates from one inbox.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold ${filter === "all" ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#202020]"}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold ${filter === "unread" ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#202020]"}`}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={() => void updateNotification("mark-all-read")}
            disabled={busy === "all"}
            className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
          >
            {busy === "all" ? "Marking..." : "Mark all read"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[8px] border border-black/6 bg-white px-4 py-8 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
          Loading notifications...
        </div>
      ) : visibleItems.length ? (
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={`rounded-[8px] border p-4 shadow-[0_8px_24px_rgba(20,24,27,0.05)] ${
                item.read ? "border-black/6 bg-white" : "border-[#cbb26b]/25 bg-[#fffaf0]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[16px] font-semibold text-[#202020]">{item.title}</p>
                    {!item.read ? (
                      <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2 py-0.5 text-[11px] font-semibold text-[#8f7531]">
                        Unread
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] leading-[1.7] text-[#57636c]">{item.message}</p>
                  <p className="mt-2 text-[12px] text-[#8b94a3]">
                    {new Date(item.createdAt).toLocaleString("en-ZA", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.href ? (
                    <a
                      href={item.href}
                      onClick={() => {
                        if (!item.read) void updateNotification("mark-read", item.id);
                      }}
                      className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                    >
                      Open
                    </a>
                  ) : null}
                  {!item.read ? (
                    <button
                      type="button"
                      onClick={() => void updateNotification("mark-read", item.id)}
                      disabled={busy === item.id}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      {busy === item.id ? "Saving..." : "Mark read"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[8px] border border-dashed border-black/10 bg-[rgba(32,32,32,0.02)] px-4 py-8 text-[13px] text-[#57636c]">
          No seller notifications yet.
        </div>
      )}
    </div>
  );
}
