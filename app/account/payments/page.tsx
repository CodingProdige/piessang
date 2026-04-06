import type { Metadata } from "next";
import { AccountPaymentsPageWorkspace } from "@/components/account/payments-page-workspace";
import { PageBody } from "@/components/layout/page-body";

export const metadata: Metadata = {
  title: "Payments & Credit",
  description: "View your saved cards, credit notes, and refunds on Piessang.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountPaymentsPage() {
  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <AccountPaymentsPageWorkspace />
    </PageBody>
  );
}
