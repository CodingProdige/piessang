import type { Metadata } from "next";
import { AccountProductReviewsWorkspace } from "@/components/account/product-reviews-workspace";

export const metadata: Metadata = {
  title: "Product Reviews",
  description: "View and edit the product reviews you have submitted on Piessang.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountReviewsPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <AccountProductReviewsWorkspace />
    </main>
  );
}
