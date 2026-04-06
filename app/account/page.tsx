import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountHub } from "@/components/account/account-hub";
import { PageBody } from "@/components/layout/page-body";
import { getServerAuthBootstrap } from "@/lib/auth/server";

export default async function AccountPage() {
  const bootstrap = await getServerAuthBootstrap();

  if (!bootstrap.profile?.uid) {
    redirect("/");
  }

  return (
    <Suspense
      fallback={
        <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
          <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
            <div className="mt-3 h-8 w-56 rounded-[8px] bg-[#f4f4f4]" />
          </section>
        </PageBody>
      }
    >
      <AccountHub />
    </Suspense>
  );
}
