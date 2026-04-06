"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CartCheckout } from "@/components/cart/cart-checkout";
import { LiveCart } from "@/components/cart/live-cart";
import { PageBody } from "@/components/layout/page-body";

function CheckoutResult({
  orderId,
  orderNumber,
  paymentId,
  checkoutSessionId,
  merchantTransactionId,
}: {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  checkoutSessionId: string;
  merchantTransactionId: string;
}) {
  const [state, setState] = useState<"loading" | "success" | "failed">(
    paymentId || checkoutSessionId ? "loading" : "success",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!paymentId && !checkoutSessionId) return;
    let active = true;

    (async () => {
      try {
        const statusUrl = checkoutSessionId
          ? `/api/client/v1/payments/stripe/session-status?sessionId=${encodeURIComponent(checkoutSessionId)}&orderId=${encodeURIComponent(orderId)}`
          : `/api/client/v1/payments/peach/payment-status?paymentId=${encodeURIComponent(paymentId)}&poll=true`;
        const statusResponse = await fetch(statusUrl, { cache: "no-store" });
        const statusPayload = await statusResponse.json().catch(() => ({}));
        const paymentStatus = String(
          checkoutSessionId
            ? statusPayload?.data?.paymentStatus || statusPayload?.paymentStatus || ""
            : statusPayload?.status || "",
        )
          .trim()
          .toLowerCase();

        if (!active) return;

        if (paymentStatus === "succeeded") {
          setState("success");
          return;
        }

        await fetch("/api/client/v1/orders/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(orderId ? { orderId } : {}),
            ...(orderNumber ? { orderNumber } : {}),
            ...(merchantTransactionId ? { merchantTransactionId } : {}),
          }),
        }).catch(() => null);

        setState("failed");
        setMessage(
          paymentStatus === "pending"
            ? "We couldn’t confirm your payment. No order was kept."
            : statusPayload?.message || "Your payment did not complete, so no order was kept.",
        );
      } catch {
        if (!active) return;
        setState("failed");
        setMessage("We couldn’t confirm your payment, so no order was kept.");
      }
    })();

    return () => {
      active = false;
    };
  }, [checkoutSessionId, merchantTransactionId, orderId, orderNumber, paymentId]);

  if (state === "loading") {
    return (
      <PageBody className="px-4 py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Confirming payment</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Checking your payment status</h1>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
            We’re confirming your payment with the gateway now.
          </p>
        </section>
      </PageBody>
    );
  }

  if (state === "failed") {
    return (
      <PageBody className="px-4 py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Payment not completed</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Your payment did not go through</h1>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
            {message || "No order was kept. You can return to your cart and try again."}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/checkout" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
              Try payment again
            </Link>
            <Link href="/cart" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
              Back to cart
            </Link>
          </div>
        </section>
      </PageBody>
    );
  }

  return (
    <PageBody className="px-4 py-10">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Order placed</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Payment successful</h1>
        <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
          Your order <span className="font-semibold text-[#202020]">{orderNumber || orderId || "has been placed"}</span> has been placed successfully.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/account?section=orders" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
            View my orders
          </Link>
          <Link href="/products" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
            Continue shopping
          </Link>
        </div>
      </section>
    </PageBody>
  );
}

export default function CartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = String(searchParams.get("step") || "").trim().toLowerCase();
  const isCheckout = step === "checkout";
  const isSuccess = step === "success";
  const orderNumber = String(searchParams.get("orderNumber") || "").trim();
  const orderId = String(searchParams.get("orderId") || "").trim();
  const paymentId = String(searchParams.get("paymentId") || "").trim();
  const checkoutSessionId = String(searchParams.get("checkoutSessionId") || "").trim();
  const merchantTransactionId = String(searchParams.get("merchantTransactionId") || "").trim();

  useEffect(() => {
    if (isCheckout) {
      router.replace("/checkout");
      return;
    }
    if (isSuccess) {
      const next = new URLSearchParams();
      if (orderId) next.set("orderId", orderId);
      if (orderNumber) next.set("orderNumber", orderNumber);
      if (paymentId) next.set("paymentId", paymentId);
      if (checkoutSessionId) next.set("checkoutSessionId", checkoutSessionId);
      if (merchantTransactionId) next.set("merchantTransactionId", merchantTransactionId);
      router.replace(`/checkout/success${next.toString() ? `?${next.toString()}` : ""}`);
    }
  }, [checkoutSessionId, isCheckout, isSuccess, merchantTransactionId, orderId, orderNumber, paymentId, router]);

  if (isSuccess) {
    return (
      <CheckoutResult
        orderId={orderId}
        orderNumber={orderNumber}
        paymentId={paymentId}
        checkoutSessionId={checkoutSessionId}
        merchantTransactionId={merchantTransactionId}
      />
    );
  }

  return (
    <PageBody className="px-4 py-10">
      {isCheckout ? <CartCheckout /> : <LiveCart />}
    </PageBody>
  );
}
