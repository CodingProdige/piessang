import { AccountNotificationsWorkspace } from "@/components/account/notifications-workspace";

export const dynamic = "force-dynamic";

export default function AccountNotificationsPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <AccountNotificationsWorkspace />
    </main>
  );
}
