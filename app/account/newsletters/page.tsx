import { redirect } from "next/navigation";
import { NewsletterPreferencesWorkspace } from "@/components/account/newsletter-preferences-workspace";
import { PageBody } from "@/components/layout/page-body";
import { getServerAuthBootstrap } from "@/lib/auth/server";

export default async function AccountNewslettersPage() {
  const bootstrap = await getServerAuthBootstrap();

  if (!bootstrap.profile?.uid) {
    redirect("/");
  }

  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
        <h1 className="mt-2 text-[30px] font-semibold text-[#202020]">Newsletter subscriptions</h1>
        <p className="mt-2 max-w-[760px] text-[14px] leading-[1.6] text-[#57636c]">
          Manage which Piessang newsletters you want to receive in your inbox.
        </p>
      </section>

      <section className="mt-6">
        <NewsletterPreferencesWorkspace />
      </section>
    </PageBody>
  );
}
