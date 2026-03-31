"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { SupportTicketForm } from "@/components/support/support-ticket-form";

export function ContactSupportPanel() {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAuthenticated) {
        if (!cancelled) setActiveTicketId(null);
        return;
      }
      const response = await fetch("/api/client/v1/support/tickets/list", { cache: "no-store" }).catch(() => null);
      const payload = await response?.json().catch(() => ({}));
      const rows = Array.isArray(payload?.data?.items) ? payload.data.items : Array.isArray(payload?.data) ? payload.data : [];
      const active = rows.find((item: any) => ["open", "waiting_on_support", "waiting_on_customer"].includes(String(item?.ticket?.status || "").toLowerCase()));
      if (!cancelled) setActiveTicketId(active?.docId || null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return (
    <div className="space-y-4">
      {!isAuthenticated ? (
        <div className="rounded-[16px] border border-[#d9e4ef] bg-[#f8fbff] p-4 text-[14px] leading-6 text-[#31506a]">
          <p className="font-semibold text-[#202020]">Sign in to submit a support ticket</p>
          <p className="mt-2">We tie tickets to your account so order details, replies, and updates stay attached to the right customer history.</p>
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to submit a support ticket.")}
            className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
          >
            Sign in to continue
          </button>
        </div>
      ) : null}

      <div className="rounded-[16px] border border-black/5 bg-[#fafafa] px-4 py-4 text-[13px] leading-6 text-[#57636c]">
        <p className="font-semibold text-[#202020]">What happens next?</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Choose the issue type so we can route your request faster.</li>
          <li>We keep one active ticket open at a time to avoid split conversations.</li>
          <li>You can reply directly from your account once Piessang responds.</li>
        </ul>
      </div>

      <SupportTicketForm activeTicketId={activeTicketId} onTicketCreated={(ticketId) => setActiveTicketId(ticketId)} compact />

      <div className="rounded-[14px] border border-black/5 bg-[#fafafa] px-4 py-4 text-[13px] leading-6 text-[#57636c]">
        Prefer email instead? Reach us directly at{" "}
        <a href="mailto:support@piessang.com" className="font-semibold text-[#0f80c3] hover:text-[#0a6ca8]">
          support@piessang.com
        </a>
        . You can also follow ticket updates in{" "}
        <Link href="/account?section=support" className="font-semibold text-[#0f80c3] hover:text-[#0a6ca8]">
          My Account
        </Link>
        .
      </div>
    </div>
  );
}
