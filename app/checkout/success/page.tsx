import type { Metadata } from "next";
import Link from "next/link";
import { PageBody } from "@/components/layout/page-body";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeMoneyAmount } from "@/lib/money";
import { GoogleAdsPurchaseConversion } from "@/components/analytics/google-ads-purchase-conversion";

export const metadata: Metadata = {
  title: "Order Placed",
  description: "Your Piessang order has been placed successfully.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orderId = typeof params.orderId === "string" ? params.orderId.trim() : "";
  const orderNumber = typeof params.orderNumber === "string" ? params.orderNumber.trim() : "";
  const conversionId = "AW-18066581333";
  const conversionLabel = "UbKbCJeYipgcENXO6KZD";

  let conversionValue = 0;
  let conversionCurrency = "ZAR";
  let conversionTransactionId = orderNumber || orderId;

  if (orderId) {
    try {
      const db = getAdminDb();
      const snap = db ? await db.collection("orders_v2").doc(orderId).get() : null;
      const order = snap?.exists ? snap.data() || {} : {};
      conversionValue = normalizeMoneyAmount(
        Number(order?.payment?.required_amount_incl || order?.totals?.final_payable_incl || 0),
      );
      conversionCurrency = String(order?.payment?.currency || "ZAR").trim().toUpperCase() || "ZAR";
      conversionTransactionId =
        String(order?.orderNumber || orderNumber || orderId).trim() ||
        String(orderNumber || orderId).trim();
    } catch {
      // Leave the conversion payload on safe fallbacks.
    }
  }

  return (
    <PageBody className="py-10 sm:py-14">
      {conversionValue > 0 && conversionTransactionId ? (
        <GoogleAdsPurchaseConversion
          conversionId={conversionId}
          conversionLabel={conversionLabel}
          value={conversionValue}
          currency={conversionCurrency}
          transactionId={conversionTransactionId}
        />
      ) : null}
      <section className="overflow-hidden rounded-[18px] border border-black/5 bg-white shadow-[0_18px_44px_rgba(20,24,27,0.08)]">
        <div className="border-b border-black/5 bg-[linear-gradient(135deg,#fff8d6_0%,#ffffff_45%,#fff4b3_100%)] px-6 py-8 sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#907d4c]">Order placed</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight text-[#202020] sm:text-[42px]">
            Payment successful
          </h1>
          <p className="mt-3 max-w-[560px] text-[15px] leading-7 text-[#57636c]">
            Your order <span className="font-semibold text-[#202020]">{orderNumber || orderId || "has been placed"}</span> is confirmed.
            We’ll keep you updated as your seller prepares it for fulfilment.
          </p>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <div className="rounded-[14px] border border-black/5 bg-[#faf8f1] px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">What happens next</p>
            <ul className="mt-3 space-y-2 text-[14px] leading-7 text-[#57636c]">
              <li>Your payment has been captured securely.</li>
              <li>Sellers on the order have been notified.</li>
              <li>You’ll see fulfilment updates inside your order page and by email.</li>
            </ul>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={orderId ? `/account/orders/${encodeURIComponent(orderId)}` : "/account/orders"}
              className="inline-flex h-12 items-center justify-center rounded-[10px] bg-[#202020] px-5 text-[14px] font-semibold text-white"
            >
              View order
            </Link>
            <Link
              href="/products"
              className="inline-flex h-12 items-center justify-center rounded-[10px] border border-black/10 bg-white px-5 text-[14px] font-semibold text-[#202020]"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </section>
    </PageBody>
  );
}
