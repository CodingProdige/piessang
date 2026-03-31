import { CartCheckout } from "@/components/cart/cart-checkout";

export const metadata = {
  title: "Checkout | Piessang",
};

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10">
      <CartCheckout />
    </main>
  );
}
