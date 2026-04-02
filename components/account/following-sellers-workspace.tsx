"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FollowingSeller = {
  id: string;
  sellerCode: string;
  sellerSlug: string;
  vendorName: string;
  followedAt: string;
};

export function FollowingSellersWorkspace() {
  const [items, setItems] = useState<FollowingSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/client/v1/accounts/seller/follow?mode=following", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load followed sellers.");
      }
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (loadError: any) {
      setError(loadError?.message || "Unable to load followed sellers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function handleUnfollow(item: FollowingSeller) {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerCode: item.sellerCode,
          sellerSlug: item.sellerSlug,
          action: "unfollow",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to unfollow this seller.");
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (unfollowError: any) {
      setError(unfollowError?.message || "Unable to unfollow this seller.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[18px] font-semibold text-[#202020]">Following sellers</p>
          <p className="mt-2 max-w-[720px] text-[13px] leading-[1.7] text-[#57636c]">
            Keep track of the seller profiles you follow so you can jump back into their storefronts quickly.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 rounded-[8px] border border-black/6 bg-[rgba(32,32,32,0.02)] px-4 py-8 text-[13px] text-[#57636c]">
          Loading followed sellers...
        </div>
      ) : items.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-[8px] border border-black/6 bg-white p-4 shadow-[0_6px_18px_rgba(20,24,27,0.05)]"
            >
              <p className="text-[18px] font-semibold text-[#202020]">{item.vendorName || item.sellerSlug}</p>
              <p className="mt-1 text-[12px] text-[#8b94a3]">
                Followed {new Date(item.followedAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/vendors/${encodeURIComponent(item.sellerSlug || item.sellerCode)}`}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                >
                  View profile
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnfollow(item)}
                  disabled={busyId === item.id}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  {busyId === item.id ? "Removing..." : "Unfollow"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[8px] border border-dashed border-black/10 bg-[rgba(32,32,32,0.02)] px-4 py-8 text-[13px] text-[#57636c]">
          You are not following any seller profiles yet.
        </div>
      )}
    </div>
  );
}
