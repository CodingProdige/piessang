import type { Metadata } from "next";
import { Suspense } from "react";
import { CartCheckout } from "@/components/cart/cart-checkout";
import { PageBody } from "@/components/layout/page-body";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Securely complete your Piessang order.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutPage() {
  return (
    <PageBody className="px-4 py-10">
      <Suspense fallback={<p className="text-[14px] text-[#57636c]">Loading checkout...</p>}>
        <CartCheckout />
      </Suspense>
    </PageBody>
  );
}
