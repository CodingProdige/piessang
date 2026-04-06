import type { Metadata } from "next";
import { CustomerInvoicesWorkspace } from "@/components/account/invoices-workspace";
import { PageBody } from "@/components/layout/page-body";

export const metadata: Metadata = {
  title: "Invoices",
  description: "View and open invoice documents for your Piessang orders.",
};

export default function AccountInvoicesPage() {
  return (
    <PageBody className="px-4 py-8">
      <CustomerInvoicesWorkspace />
    </PageBody>
  );
}
