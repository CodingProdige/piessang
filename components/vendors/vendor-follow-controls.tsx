"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { AppSnackbar } from "@/components/ui/app-snackbar";

function toCountLabel(value: number) {
  const count = Number(value || 0);
  if (count === 1) return "1 follower";
  return `${count} followers`;
}

export function VendorFollowControls({
  sellerCode,
  sellerSlug,
  vendorName,
  initialFollowerCount = 0,
}: {
  sellerCode: string;
  sellerSlug: string;
  vendorName: string;
  initialFollowerCount?: number;
}) {
  const { isAuthenticated, authReady, openAuthModal } = useAuth();
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const params = new URLSearchParams();
        if (sellerCode) params.set("sellerCode", sellerCode);
        if (sellerSlug) params.set("sellerSlug", sellerSlug);
        const response = await fetch(`/api/client/v1/accounts/seller/follow?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false || cancelled) return;
        setFollowing(payload?.following === true);
        setFollowerCount(Number(payload?.followerCount || 0));
      } catch {}
    }
    if (authReady) void loadState();
    return () => {
      cancelled = true;
    };
  }, [authReady, sellerCode, sellerSlug]);

  async function handleToggle() {
    if (!isAuthenticated) {
      openAuthModal(`Sign in to follow ${vendorName} and get notified about new releases.`);
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerCode,
          sellerSlug,
          action: following ? "unfollow" : "follow",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update follow state.");
      }
      setFollowing(payload?.following === true);
      setFollowerCount(Number(payload?.followerCount || 0));
      setNotice({
        tone: "success",
        message: payload?.following ? `You are now following ${vendorName}.` : `You stopped following ${vendorName}.`,
      });
    } catch (error: any) {
      setNotice({
        tone: "error",
        message: error?.message || "Unable to update follow state right now.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[rgba(203,178,107,0.12)] px-3 py-1.5 text-[12px] font-semibold text-[#907d4c]">
          {toCountLabel(followerCount)}
        </span>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className={`inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold transition-colors ${
            following
              ? "border border-black/10 bg-white text-[#202020] hover:border-[#cbb26b] hover:text-[#cbb26b]"
              : "bg-[#202020] text-white hover:bg-[#2b2b2b]"
          } ${loading ? "cursor-wait opacity-70" : ""}`}
        >
          {loading ? "Saving..." : following ? "Following" : "Follow"}
        </button>
        <Link
          href="/account/following"
          className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b]"
        >
          Following
        </Link>
      </div>
      <AppSnackbar notice={notice} onClose={() => setNotice(null)} />
    </>
  );
}
