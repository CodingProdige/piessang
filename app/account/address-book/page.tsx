import { redirect } from "next/navigation";
import { AccountProfileWorkspace } from "@/components/account/account-sections";
import { getServerAuthBootstrap } from "@/lib/auth/server";

export default async function AccountAddressBookPage() {
  const bootstrap = await getServerAuthBootstrap();

  if (!bootstrap.profile?.uid) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
        <h1 className="mt-2 text-[30px] font-semibold text-[#202020]">Address book</h1>
        <p className="mt-2 max-w-[760px] text-[14px] leading-[1.6] text-[#57636c]">
          Manage the saved delivery addresses linked to your Piessang account.
        </p>
      </section>

      <section className="mt-6">
        <AccountProfileWorkspace
          uid={bootstrap.profile.uid}
          email={bootstrap.profile.email || null}
          showPersonalDetails={false}
          showAddressBook={true}
        />
      </section>
    </main>
  );
}
