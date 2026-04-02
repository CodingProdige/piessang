import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSupportWorkspace } from "@/components/account/support-workspace";
import { getServerAuthBootstrap } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "My Tickets | Piessang",
  description: "View your active and previous support tickets, reply to Piessang, and close resolved conversations.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SupportTicketsPage() {
  const bootstrap = await getServerAuthBootstrap();

  if (!bootstrap.profile?.uid) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-8 lg:px-6 lg:py-12">
      <section className="rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Support</p>
        <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.03em] text-[#202020]">My tickets</h1>
        <p className="mt-3 max-w-[72ch] text-[14px] leading-7 text-[#57636c]">
          Follow your support conversations here, reply directly on the ticket, and close the thread once everything has been resolved.
        </p>
      </section>

      <section className="mt-6">
        <AccountSupportWorkspace />
      </section>
    </main>
  );
}
