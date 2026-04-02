import type { Metadata } from "next";
import { CartCheckout } from "@/components/cart/cart-checkout";

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
    <main className="mx-auto max-w-[1120px] px-4 py-10">
      <CartCheckout />
    </main>
  );
}
