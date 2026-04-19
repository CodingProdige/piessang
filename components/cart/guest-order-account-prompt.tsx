"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";

export function GuestOrderAccountPrompt() {
  const { isAuthenticated, openAuthModal } = useAuth();

  if (isAuthenticated) {
    return (
      <Link
        href="/account/orders"
        className="inline-flex h-12 items-center justify-center rounded-[10px] border border-black/10 bg-white px-5 text-[14px] font-semibold text-[#202020]"
      >
        View all my orders
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openAuthModal("Create your Piessang account to manage this order and future orders in one place.")}
      className="inline-flex h-12 items-center justify-center rounded-[10px] border border-black/10 bg-white px-5 text-[14px] font-semibold text-[#202020]"
    >
      Create account to manage this order
    </button>
  );
}

