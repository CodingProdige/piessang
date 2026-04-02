import type { Metadata } from "next";
import { CustomerInvoicesWorkspace } from "@/components/account/invoices-workspace";

export const metadata: Metadata = {
  title: "Invoices",
  description: "View and open invoice documents for your Piessang orders.",
};

export default function AccountInvoicesPage() {
  return (
    <main className="mx-auto max-w-[1320px] px-4 py-8">
      <CustomerInvoicesWorkspace />
    </main>
  );
}
