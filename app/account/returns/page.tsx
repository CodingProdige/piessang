import type { Metadata } from "next";
import { AccountReturnsWorkspace } from "@/components/account/returns-workspace";

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
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <AccountReturnsWorkspace />
    </main>
  );
}
