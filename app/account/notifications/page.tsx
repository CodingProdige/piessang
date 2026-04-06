import { AccountNotificationsWorkspace } from "@/components/account/notifications-workspace";
import { PageBody } from "@/components/layout/page-body";

export const dynamic = "force-dynamic";

export default function AccountNotificationsPage() {
  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <AccountNotificationsWorkspace />
    </PageBody>
  );
}
