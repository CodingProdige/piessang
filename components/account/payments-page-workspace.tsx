"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { AccountPaymentsWorkspace } from "@/components/account/account-sections";

export function AccountPaymentsPageWorkspace() {
  const { uid, isAuthenticated } = useAuth();

  if (!isAuthenticated || !uid) {
    return (
      <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        Sign in to view your payments, credits, and refunds.
      </div>
    );
  }

  return <AccountPaymentsWorkspace uid={uid} />;
}
