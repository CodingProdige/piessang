import { Suspense } from "react";
import { CartPageClient } from "./cart-page-client";
import { PageBody } from "@/components/layout/page-body";

export default function CartPage() {
  return (
    <Suspense
      fallback={
        <PageBody className="px-4 py-10">
          <p className="text-[14px] text-[#57636c]">Loading cart...</p>
        </PageBody>
      }
    >
      <CartPageClient />
    </Suspense>
  );
}
