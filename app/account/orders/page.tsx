"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { AccountOrdersWorkspace } from "@/components/account/account-sections";

export default function AccountOrdersPage() {
  const { uid } = useAuth();

  if (!uid) {
    return (
      <main className="mx-auto max-w-[1120px] px-4 py-10">
        <section className="rounded-[10px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <h1 className="text-[24px] font-semibold text-[#202020]">Your orders</h1>
          <p className="mt-3 text-[14px] leading-7 text-[#57636c]">Sign in to view your order history.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10">
      <AccountOrdersWorkspace uid={uid} />
    </main>
  );
}
