import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Delivery Policy | Piessang",
  description: "Understand how delivery, shipping, and collection work on Piessang.",
};

export default function DeliveryPage() {
  return (
    <LegalPage
      eyebrow="Delivery"
      title="Delivery and shipping policy"
      intro="Piessang is a marketplace, so delivery can be handled either by Piessang or by the seller, depending on the product. This page explains how delivery promises, shipping fees, and collection options work."
      updatedLabel="Last updated: 26 March 2026"
      body={[
        "Some products are fulfilled directly by Piessang, while others are fulfilled by the seller using their own direct delivery, shipping, or collection settings. The product page, cart, and checkout will show the fulfilment path that applies to each item, together with the expected timing and any seller-specific delivery fees.",
        "Delivery estimates depend on your selected location, the seller or fulfilment method, the delivery rule that matches your order, and any order cutoff time that applies. Estimates shown on the storefront are intended to help you decide before checkout, but final timing may still depend on payment confirmation, stock availability, and operational conditions.",
        "Delivery fees may differ by seller, destination, distance, shipping zone, or order value. Those fees are shown during checkout before payment. Where a seller offers customer collection, you may be able to choose collection instead of delivery for that seller’s items. When collection is selected, any applicable seller delivery fee for those items will not be charged.",
        "If there is a delay with your order, we will do our best to keep you updated through the contact details on your order. Sellers may also provide courier tracking or collection updates where applicable. If you need help with a delivery issue, visit support from your account or contact us and we will assist with the next steps.",
      ]}
    />
  );
}
