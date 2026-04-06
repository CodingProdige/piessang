import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadata("delivery", {
    title: "Delivery Policy | Piessang",
    description: "Review the detailed delivery, shipping, and collection policy for the Piessang marketplace.",
  });
}

function Clause({
  id,
  number,
  title,
  paragraphs,
}: {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
}) {
  return (
    <section id={id} className="scroll-mt-28 space-y-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#202020]">
        {number}. {title}
      </h2>
      <div className="space-y-3">
        {paragraphs.map((paragraph) => (
          <p key={`${number}-${paragraph}`}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export default function DeliveryPage() {
  const sections = [
    { id: "scope", number: "1", title: "Scope of this policy" },
    { id: "marketplace-model", number: "2", title: "Marketplace delivery model" },
    { id: "delivery-options", number: "3", title: "Delivery, shipping, and collection options" },
    { id: "eligibility-location", number: "4", title: "Delivery eligibility and customer location" },
    { id: "fees", number: "5", title: "Delivery fees and fee calculation" },
    { id: "timing", number: "6", title: "Delivery estimates, lead times, and order cutoff times" },
    { id: "seller-obligations", number: "7", title: "Seller fulfilment obligations" },
    { id: "customer-obligations", number: "8", title: "Customer delivery obligations" },
    { id: "risk-delays", number: "9", title: "Delays, failed delivery, and operational limitations" },
    { id: "collection", number: "10", title: "Collection orders" },
    { id: "issues-support", number: "11", title: "Delivery issues, support, and escalation" },
    { id: "changes", number: "12", title: "Changes to this policy" },
  ] as const;

  return (
    <LegalPage
      eyebrow="Delivery"
      title="Delivery and shipping policy"
      intro="This Delivery and Shipping Policy explains how delivery, shipping, direct delivery, collection, delivery fees, customer delivery locations, operational timing, and fulfilment responsibilities work on the Piessang marketplace. Because Piessang is a marketplace, fulfilment may be performed either by Piessang or by the seller responsible for the relevant item. This policy should be read together with the Piessang Terms of Use, Returns Policy, and any order-specific delivery information shown during checkout."
      updatedLabel="Last updated: 26 March 2026"
      content={
        <>
          <div className="rounded-[14px] border border-black/5 bg-[#faf8f2] p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Sections</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="text-[14px] leading-6 text-[#4b5563] transition-colors hover:text-[#202020]"
                >
                  {section.number}. {section.title}
                </a>
              ))}
            </div>
          </div>

          <Clause
            id="scope"
            number="1"
            title="Scope of this policy"
            paragraphs={[
              "1.1 This policy applies to all delivery, shipping, direct-delivery, courier, and collection arrangements made through the Piessang marketplace, whether the relevant order is fulfilled by Piessang or by an independent seller using Piessang.",
              "1.2 This policy applies to customers, sellers, and seller team members to the extent that their conduct, fulfilment duties, order information, and delivery choices affect marketplace delivery performance, delivery liability, and customer support outcomes.",
              "1.3 This policy supplements, and does not replace, any mandatory legal rights that may apply under the laws governing the customer, seller, order, or delivery destination.",
            ]}
          />

          <Clause
            id="marketplace-model"
            number="2"
            title="Marketplace delivery model"
            paragraphs={[
              "2.1 Piessang operates a marketplace. Some items may be fulfilled directly by Piessang, while other items may be fulfilled by the seller responsible for that listing. A single order may therefore contain items with different fulfilment paths.",
              "2.2 Where Piessang fulfils an item, Piessang is generally responsible for the operational delivery handling of that item, subject to customer address accuracy, courier performance, payment confirmation, stock availability, and other operational conditions.",
              "2.3 Where a seller fulfils an item, the seller’s delivery and shipping settings govern whether the item can be delivered to the selected customer location, what delivery or shipping fee applies, whether collection is available, and what fulfilment timing or cutoff rules apply. In such cases, the seller remains operationally responsible for fulfilling those items in accordance with the applicable order.",
            ]}
          />

          <Clause
            id="delivery-options"
            number="3"
            title="Delivery, shipping, and collection options"
            paragraphs={[
              "3.1 Depending on the product, seller configuration, and destination, Piessang may present one or more of the following fulfilment paths: Piessang-managed delivery, seller direct delivery, seller-managed shipping, or customer collection.",
              "3.2 The options shown on the product page, in the cart, or during checkout are determined dynamically from the fulfilment model, seller delivery settings, destination matching, and other operational conditions known to Piessang at that time.",
              "3.3 Piessang may remove, limit, or prevent a delivery or collection option where the platform determines that the destination is unsupported, seller settings are incomplete, the product is unavailable, the address is invalid, payment has not been confirmed, or the selected option is otherwise not operationally viable.",
            ]}
          />

          <Clause
            id="eligibility-location"
            number="4"
            title="Delivery eligibility and customer location"
            paragraphs={[
              "4.1 Delivery eligibility depends on the customer location selected or supplied through the Piessang storefront, account settings, delivery address selection, or checkout process. Piessang may use the customer’s chosen delivery area, saved address, or other delivery-location signals to determine whether delivery is available.",
              "4.2 Seller-managed delivery and shipping options are matched against the seller’s configured delivery origin, direct-delivery rules, shipping zones, collection availability, and any applicable delivery radius, distance band, order-value band, or location-specific rule.",
              "4.3 It is the customer’s responsibility to ensure that the delivery location, contact details, collection preference, and any delivery notes submitted through Piessang are accurate, complete, and suitable for successful fulfilment. Piessang is not responsible for errors caused by inaccurate or incomplete customer-supplied delivery information.",
            ]}
          />

          <Clause
            id="fees"
            number="5"
            title="Delivery fees and fee calculation"
            paragraphs={[
              "5.1 Delivery fees may differ depending on whether the order is fulfilled by Piessang or by a seller, the destination, the applicable delivery rule or shipping zone, the customer’s chosen fulfilment option, distance-based rules, order-value thresholds, and any seller-configured direct-delivery or shipping pricing bands.",
              "5.2 Where a seller fulfils an order directly, Piessang may display seller-specific delivery or shipping fees separately from the item subtotal so that the customer can see which seller fee applies to which part of the order. If collection is selected for a seller’s items, the seller’s delivery fee for those collected items will ordinarily not be charged.",
              "5.3 Delivery fees shown before payment are intended to reflect the applicable fulfilment configuration at checkout. Piessang may correct obvious fee, rule, or configuration errors before final payment confirmation or where a technical or operational inconsistency is detected.",
            ]}
          />

          <Clause
            id="timing"
            number="6"
            title="Delivery estimates, lead times, and order cutoff times"
            paragraphs={[
              "6.1 Delivery estimates shown on Piessang, including messaging such as expected delivery day, delivery promise wording, or order cutoff prompts, are operational estimates only and do not constitute an absolute guarantee unless mandatory law states otherwise.",
              "6.2 Estimated timing may depend on the fulfilment owner, the seller’s configured lead time, the applicable direct-delivery rule or shipping zone, the seller’s origin timezone, any applicable order cutoff time, stock validation timing, payment confirmation, and operational availability.",
              "6.3 If a displayed delivery estimate is affected by a cutoff time, the estimate may change once that cutoff has passed. Piessang may update product-page messaging, cart messaging, or checkout messaging dynamically to reflect the best available estimate at the relevant time.",
            ]}
          />

          <Clause
            id="seller-obligations"
            number="7"
            title="Seller fulfilment obligations"
            paragraphs={[
              "7.1 Sellers using Piessang are responsible for maintaining accurate delivery and shipping settings, including their shipping origin, direct-delivery rules, shipping zones, collection rules, cutoff times, delivery fees, and any related fulfilment information required for customers to make informed checkout decisions.",
              "7.2 If a seller chooses to fulfil items directly, that seller must deliver, ship, or prepare collection for those items in accordance with the fulfilment option selected by the customer at checkout and in accordance with the seller’s own published fulfilment settings.",
              "7.3 Sellers must provide accurate fulfilment updates, courier details, collection readiness updates, or other operational confirmations through Piessang when required. Piessang may take marketplace action where a seller repeatedly fails to fulfil seller-managed orders in accordance with platform standards.",
            ]}
          />

          <Clause
            id="customer-obligations"
            number="8"
            title="Customer delivery obligations"
            paragraphs={[
              "8.1 Customers are responsible for supplying a valid delivery address, recipient name, phone number, collection preference where applicable, and any other delivery notes or access information reasonably required to complete the delivery.",
              "8.2 Customers must ensure that someone suitable is available to accept delivery where required, that collection is made within any collection window or reasonable period communicated through the order, and that delivery-related instructions are lawful, clear, and practically usable.",
              "8.3 Piessang may charge, refuse, reschedule, or otherwise limit delivery or collection outcomes where a customer is unreachable, the address is invalid, premises are inaccessible, required contact details are missing, or repeated failed delivery attempts occur due to customer-side issues.",
            ]}
          />

          <Clause
            id="risk-delays"
            number="9"
            title="Delays, failed delivery, and operational limitations"
            paragraphs={[
              "9.1 Delivery and shipping may be affected by stock constraints, seller-side delays, courier delays, traffic, weather, route restrictions, customs or regulatory requirements, public holidays, payment verification, fraud review, address errors, or other operational events outside Piessang’s direct control.",
              "9.2 Piessang may communicate delays, revised estimates, collection updates, or fulfilment exceptions through the contact details associated with the order, through order tracking views, or through seller and customer notifications where such functionality is available.",
              "9.3 Piessang is not liable for every delivery delay as a matter of strict guarantee. However, Piessang may review delivery failures, customer complaints, seller performance issues, and fulfilment disputes, and may take support, remedial, or marketplace-enforcement action where appropriate.",
            ]}
          />

          <Clause
            id="collection"
            number="10"
            title="Collection orders"
            paragraphs={[
              "10.1 Where a seller offers customer collection, Piessang may allow the customer to select collection instead of delivery for the relevant seller’s items during checkout. Collection availability depends on the seller’s settings, the selected items, and the order context.",
              "10.2 Once collection is selected, the customer is responsible for collecting the order from the agreed seller location or collection point in accordance with the information provided through the order. The seller is responsible for preparing the order for collection as communicated on Piessang.",
              "10.3 Piessang may request or require collection verification, collection readiness updates, or other operational records where necessary to support customer service, return handling, dispute resolution, or settlement accuracy.",
            ]}
          />

          <Clause
            id="issues-support"
            number="11"
            title="Delivery issues, support, and escalation"
            paragraphs={[
              "11.1 If a customer experiences a delivery issue, failed fulfilment, missing update, incorrect delivery charge, or collection problem, the customer should contact Piessang support through the available platform channels as soon as reasonably possible.",
              "11.2 Piessang may investigate delivery issues by reviewing the order, fulfilment owner, seller slice, courier details, delivery selection, address details, operational timestamps, and any relevant customer or seller communication.",
              "11.3 Where the issue concerns an item fulfilled by Piessang, Piessang will generally manage the operational support process directly. Where the issue concerns a seller-fulfilled item, Piessang may involve the seller while retaining marketplace oversight, customer-support visibility, and escalation authority where necessary.",
            ]}
          />

          <Clause
            id="changes"
            number="12"
            title="Changes to this policy"
            paragraphs={[
              "12.1 Piessang may update this Delivery and Shipping Policy from time to time to reflect changes in fulfilment structure, seller tooling, supported delivery models, operational controls, customer rights, legal obligations, or marketplace processes.",
              "12.2 Updated versions take effect when published on the platform or on another stated effective date. Continued use of Piessang after an updated policy takes effect constitutes acknowledgment of the revised policy to the extent permitted by law.",
              "12.3 If you do not understand how delivery, shipping, or collection applies to a particular product or order, you should contact Piessang support before completing the relevant purchase.",
            ]}
          />
        </>
      }
    />
  );
}
