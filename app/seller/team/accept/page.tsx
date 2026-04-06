"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageBody } from "@/components/layout/page-body";

function SellerTeamAcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const sellerSlug = searchParams.get("seller") ?? "";
  const { authReady, isAuthenticated, profile, openAuthModal, refreshProfile } = useAuth();
  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function acceptInvite() {
      if (!isAuthenticated || !token) return;
      setStatus("accepting");
      setMessage(null);
      try {
        const response = await fetch("/api/client/v1/accounts/seller/team/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: profile?.uid, token }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to accept invite.");
        }
        await refreshProfile();
        setStatus("accepted");
        setMessage(`You are now part of ${payload?.vendorName || "the seller team"}.`);
      } catch (cause) {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Unable to accept invite.");
      }
    }

    void acceptInvite();
  }, [isAuthenticated, profile?.uid, refreshProfile, token]);

  return (
    <PageBody className="py-10">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller team</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Accept invite</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
          {status === "accepted"
            ? message
            : status === "error"
              ? message
              : "We are checking the invite and linking you to the vendor group."}
        </p>
        {!authReady ? (
          <p className="mt-5 text-[13px] text-[#57636c]">Checking your account...</p>
        ) : !isAuthenticated ? (
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to accept your seller team invite.")}
            className="brand-button mt-5 inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
          >
            Sign in to continue
          </button>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={sellerSlug ? `/seller/team?seller=${sellerSlug}` : "/seller/team"}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
            >
              Team page
            </Link>
            <Link
              href={sellerSlug ? `/seller/catalogue/new?seller=${sellerSlug}` : "/seller/catalogue/new"}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Create product
            </Link>
          </div>
        )}
      </section>
    </PageBody>
  );
}

export default function SellerTeamAcceptPage() {
  return (
    <Suspense fallback={<PageBody className="py-10"><div /></PageBody>}>
      <SellerTeamAcceptContent />
    </Suspense>
  );
}
