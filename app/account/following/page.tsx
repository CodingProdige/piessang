import { FollowingSellersWorkspace } from "@/components/account/following-sellers-workspace";

export const dynamic = "force-dynamic";

export default function AccountFollowingPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <FollowingSellersWorkspace />
    </main>
  );
}
