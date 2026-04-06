import { FollowingSellersWorkspace } from "@/components/account/following-sellers-workspace";
import { PageBody } from "@/components/layout/page-body";

export const dynamic = "force-dynamic";

export default function AccountFollowingPage() {
  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <FollowingSellersWorkspace />
    </PageBody>
  );
}
