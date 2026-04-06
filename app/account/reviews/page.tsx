import type { Metadata } from "next";
import { AccountProductReviewsWorkspace } from "@/components/account/product-reviews-workspace";
import { PageBody } from "@/components/layout/page-body";

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
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <AccountProductReviewsWorkspace />
    </PageBody>
  );
}
