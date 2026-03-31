import { redirect } from "next/navigation";
import { NotificationPreferencesWorkspace } from "@/components/account/notification-preferences-workspace";
import { getServerAuthBootstrap } from "@/lib/auth/server";

export default async function AccountNotificationPreferencesPage() {
  const bootstrap = await getServerAuthBootstrap();

  if (!bootstrap.profile?.uid) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
        <h1 className="mt-2 text-[30px] font-semibold text-[#202020]">Notification preferences</h1>
        <p className="mt-2 max-w-[760px] text-[14px] leading-[1.6] text-[#57636c]">
          Choose which Piessang updates you want to receive and which channels we can use to contact you.
        </p>
      </section>

      <section className="mt-6">
        <NotificationPreferencesWorkspace uid={bootstrap.profile.uid} />
      </section>
    </main>
  );
}
