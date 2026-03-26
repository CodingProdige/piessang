import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Payments Policy | Piessang",
  description: "Learn how checkout, payment processing, and refunds work on Piessang.",
};

export default function PaymentsPage() {
  return (
    <LegalPage
      eyebrow="Payments"
      title="Payments policy"
      intro="This page explains how Piessang handles checkout, payment processing, display currency, refunds, and payment security across the marketplace."
      updatedLabel="Last updated: 26 March 2026"
      body={[
        "Orders are only confirmed after payment is successfully completed. If payment fails or is abandoned, the order will not remain as a completed marketplace order. Stock may be held briefly while you complete checkout, but only confirmed successful payment results in a finalized order.",
        "Piessang uses ZAR as its base marketplace currency. Where a browsing currency selector is available, converted prices are shown for display purposes to help you shop more comfortably. Display-currency conversions are estimates for browsing. The underlying marketplace pricing, fees, payment calculation, and accounting remain based on the platform’s base currency unless explicitly stated otherwise during checkout.",
        "Piessang uses trusted payment processing partners to handle card payments securely. Saved payment methods are stored and referenced through secure payment workflows rather than exposing raw card details to sellers. Additional authentication may be required depending on your bank, payment method, or the risk controls applied to a transaction.",
        "If a refund is approved, it will be processed through the relevant payment route and may take time to appear depending on the payment method and financial institution involved. If you believe there is a payment issue, contact support with your order number and we will help investigate it.",
      ]}
    />
  );
}
