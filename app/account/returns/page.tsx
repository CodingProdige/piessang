import type { Metadata } from "next";
import { AccountReturnsWorkspace } from "@/components/account/returns-workspace";
import { PageBody } from "@/components/layout/page-body";

export const metadata: Metadata = {
  title: "Returns",
  description: "View the return requests you have submitted on Piessang.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountReturnsPage() {
  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <AccountReturnsWorkspace />
    </PageBody>
  );
}
