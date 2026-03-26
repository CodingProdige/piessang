import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use | Piessang",
  description: "Review the detailed terms governing use of the Piessang marketplace.",
};

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

export default function TermsPage() {
  const sections = [
    { id: "application", number: "1", title: "Application of these terms" },
    { id: "marketplace", number: "2", title: "Nature of the marketplace" },
    { id: "eligibility", number: "3", title: "Eligibility and account responsibility" },
    { id: "acceptable-use", number: "4", title: "Acceptable use" },
    { id: "listings", number: "5", title: "Listings, product information, and marketplace content" },
    { id: "pricing", number: "6", title: "Pricing, promotions, and display currency" },
    { id: "cart-checkout", number: "7", title: "Cart, checkout, and stock" },
    { id: "orders-payment", number: "8", title: "Orders and payment" },
    { id: "delivery", number: "9", title: "Delivery, shipping, and collection" },
    { id: "seller-obligations", number: "10", title: "Seller obligations" },
    { id: "returns-support", number: "11", title: "Returns, refunds, disputes, and support" },
    { id: "intellectual-property", number: "12", title: "Intellectual property and platform rights" },
    { id: "suspension", number: "13", title: "Suspension, restriction, and termination" },
    { id: "liability", number: "14", title: "Disclaimers and limitation of liability" },
    { id: "changes", number: "15", title: "Changes to these terms" },
    { id: "contact", number: "16", title: "Contact and interpretation" },
  ] as const;

  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of use"
      intro="These Terms of Use govern access to and use of the Piessang marketplace, including browsing, account registration, product discovery, seller listings, ordering, payments, fulfilment, reviews, support, and other marketplace interactions. By accessing or using Piessang, you acknowledge that you have read and agree to be bound by these terms, together with any additional policies, rules, or notices expressly incorporated by reference."
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
            id="application"
            number="1"
            title="Application of these terms"
            paragraphs={[
              "1.1 These terms apply to every visitor, customer, account holder, seller, seller team member, and other user who accesses or uses Piessang, whether through the website, a mobile browser, a linked service, or any future channel made available by Piessang.",
              "1.2 Certain parts of the platform may also be subject to additional rules, policies, campaign terms, seller standards, fulfilment requirements, or operational notices. Where those additional rules apply, they supplement these terms and form part of the agreement between you and Piessang.",
              "1.3 If you do not agree to these terms, you must not access or use Piessang.",
            ]}
          />

          <Clause
            id="marketplace"
            number="2"
            title="Nature of the marketplace"
            paragraphs={[
              "2.1 Piessang operates a marketplace platform. Products offered through Piessang may be sold either by Piessang itself or by independent sellers who use Piessang as their marketplace channel.",
              "2.2 Piessang may provide platform infrastructure, catalogue tooling, product moderation, checkout functionality, payment routing, fulfilment support, analytics, trust and safety controls, customer communication tooling, and dispute handling assistance. However, unless explicitly stated otherwise, the seller responsible for a listing remains responsible for the legality, accuracy, and fulfilment commitments attached to that listing.",
              "2.3 Nothing in these terms prevents Piessang from suspending, restricting, moderating, rejecting, or removing listings, seller accounts, products, brands, reviews, or marketplace activity where Piessang reasonably believes that doing so is necessary to protect customers, sellers, rights holders, operational integrity, or legal compliance.",
            ]}
          />

          <Clause
            id="eligibility"
            number="3"
            title="Eligibility and account responsibility"
            paragraphs={[
              "3.1 You may only use Piessang if you have legal capacity to enter into a binding agreement under the laws applicable to you. If you are using Piessang on behalf of a business or other legal entity, you confirm that you have authority to bind that entity.",
              "3.2 You are responsible for ensuring that the information attached to your account is accurate, complete, and kept up to date, including your name, email address, phone number, delivery details, and any other information used for account verification, order fulfilment, or support.",
              "3.3 You are responsible for maintaining the confidentiality of your login credentials and for all activity occurring through your account unless you promptly notify Piessang of unauthorized access or a security compromise. Piessang may treat actions performed through your account as authorized by you unless there is clear evidence to the contrary.",
            ]}
          />

          <Clause
            id="acceptable-use"
            number="4"
            title="Acceptable use"
            paragraphs={[
              "4.1 You may not use Piessang in a manner that is unlawful, fraudulent, misleading, abusive, harmful, defamatory, invasive of privacy, discriminatory, infringing, or otherwise inconsistent with the legitimate operation of a trusted marketplace.",
              "4.2 Without limitation, you may not misrepresent your identity, interfere with or misuse the accounts of others, manipulate favourites, ratings, reviews, pricing signals, or product popularity indicators, abuse promotions or discounts, scrape or harvest platform data without authorization, test or probe platform vulnerabilities, distribute malware, interfere with payment flows, or submit fraudulent or bad-faith orders.",
              "4.3 Piessang may investigate suspected misuse and may suspend, limit, or terminate access, cancel affected activity, preserve records, and cooperate with law enforcement or other authorities where reasonably required.",
            ]}
          />

          <Clause
            id="listings"
            number="5"
            title="Listings, product information, and marketplace content"
            paragraphs={[
              "5.1 Product listings, images, descriptions, brand information, stock indicators, ratings, delivery messages, promotional flags, and pricing presentations are intended to assist customers in shopping on the marketplace. However, certain data may be supplied by sellers or may change over time.",
              "5.2 Piessang does not permit misleading product information. Sellers must ensure that their listings are accurate, lawful, and not deceptive. Piessang may moderate, reject, block, or remove listings or content that fail platform standards or create customer, legal, or brand risk.",
              "5.3 Customers may report products, leave reviews, and interact with listing content only in good faith. Piessang reserves the right to remove or restrict reviews, reports, comments, images, or other submissions that are false, abusive, unlawful, irrelevant, manipulative, or otherwise contrary to marketplace standards.",
            ]}
          />

          <Clause
            id="pricing"
            number="6"
            title="Pricing, promotions, and display currency"
            paragraphs={[
              "6.1 Product prices, promotions, shipping fees, delivery estimates, and related commercial information may change at any time before checkout is successfully completed. Adding an item to your cart does not reserve stock or guarantee that the same pricing, stock position, or promotion will remain available later.",
              "6.2 Piessang uses a base marketplace currency for core pricing, accounting, seller fee logic, settlement logic, and payment calculations. Where Piessang allows customers to select a browsing currency, converted amounts are shown for display convenience only unless the checkout flow expressly confirms a different charge currency.",
              "6.3 Piessang may correct errors in displayed prices, discounts, availability, shipping fees, product details, or promotional content, and may cancel or review any affected listing, order, or transaction where an obvious error occurred.",
            ]}
          />

          <Clause
            id="cart-checkout"
            number="7"
            title="Cart, checkout, and stock"
            paragraphs={[
              "7.1 Adding an item to a cart does not reserve stock. Piessang may recheck stock, pricing, delivery availability, seller settings, and order eligibility at any time before payment is confirmed.",
              "7.2 Piessang may place a short-lived stock hold during checkout for operational reasons, including to protect payment completion flows. Such a hold does not by itself create a completed order and may expire if payment is not completed in time.",
              "7.3 If stock, shipping availability, seller configuration, fraud controls, or any other operational validation fail before or during checkout, Piessang may prevent checkout, remove invalid items, require the customer to update the cart, or cancel the attempted transaction.",
            ]}
          />

          <Clause
            id="orders-payment"
            number="8"
            title="Orders and payment"
            paragraphs={[
              "8.1 An order is not treated as finally confirmed merely because a customer clicks pay or submits card details. Orders are only finalized after successful payment confirmation and any required validation, fraud screening, or gateway reconciliation.",
              "8.2 Piessang may use third-party payment service providers and payment gateways. By completing a payment, you authorize Piessang and its processors to process the transaction, including any authentication, tokenization, fraud prevention, refund, reversal, or reconciliation steps reasonably required to complete or manage the payment lifecycle.",
              "8.3 If payment fails, is declined, expires, is abandoned, or cannot be verified, the order may be treated as unsuccessful and may be deleted, cancelled, or otherwise not finalized. Piessang is not required to hold a failed order open indefinitely for later payment unless the platform expressly offers that functionality.",
            ]}
          />

          <Clause
            id="delivery"
            number="9"
            title="Delivery, shipping, and collection"
            paragraphs={[
              "9.1 Delivery and collection options depend on the product, seller settings, fulfilment mode, shipping rules, destination, and operational conditions applicable at the time of checkout.",
              "9.2 Where a seller fulfils an order directly, the seller’s configured shipping profile determines whether an item is available for the selected customer location, what delivery fee applies, whether direct delivery or collection is available, and what lead time or cutoff applies.",
              "9.3 Delivery estimates and fulfilment messages are provided in good faith to assist customer decision-making, but they remain operational estimates. Delays can arise from stock validation, address issues, payment confirmation, courier delays, weather, compliance requirements, or other circumstances outside Piessang’s direct control.",
            ]}
          />

          <Clause
            id="seller-obligations"
            number="10"
            title="Seller obligations"
            paragraphs={[
              "10.1 Sellers using Piessang must ensure that all listings, product attributes, brand references, inventory values, sale claims, shipping settings, collection rules, delivery fees, and fulfilment promises are complete, accurate, lawful, and maintained in a timely manner.",
              "10.2 Piessang may require sellers to submit products or updates for review before publication, may keep a currently approved version live while an update is under review, and may reject, block, or remove seller content or listings where policies, trust standards, or operational requirements are not met.",
              "10.3 Sellers are responsible for fulfilling the orders assigned to them through the platform in accordance with their chosen fulfilment path, including direct delivery, shipping, or collection, and for providing accurate courier or collection updates where applicable.",
            ]}
          />

          <Clause
            id="returns-support"
            number="11"
            title="Returns, refunds, disputes, and support"
            paragraphs={[
              "11.1 Returns, refunds, and product issues are governed by applicable law together with Piessang’s returns and payments policies, category restrictions, and any relevant marketplace procedures communicated through the platform.",
              "11.2 Piessang may review return requests directly, may involve the seller responsible for the relevant item, and may request supporting information such as photographs, descriptions, proof of delivery, or other operational details before deciding on the appropriate outcome.",
              "11.3 Piessang may also receive and process product reports, seller disputes, and other trust and safety submissions, and may take marketplace action where appropriate, including blocking a listing, requesting clarification, or restoring visibility after review.",
            ]}
          />

          <Clause
            id="intellectual-property"
            number="12"
            title="Intellectual property and platform rights"
            paragraphs={[
              "12.1 All rights, title, and interest in the Piessang platform, including the site design, interface, code, operational data structures, branding, trade dress, and non-user content, remain the property of Piessang or its licensors.",
              "12.2 You retain rights in content that you lawfully own and upload, submit, or publish through the platform. By doing so, you grant Piessang the rights reasonably necessary to host, reproduce, display, moderate, distribute, analyze, and use that content for the operation, protection, improvement, and promotion of the marketplace.",
              "12.3 You must not copy, adapt, reverse engineer, redistribute, frame, mirror, or otherwise exploit Piessang platform materials except where such use is expressly permitted by law or by written authorization from Piessang.",
            ]}
          />

          <Clause
            id="suspension"
            number="13"
            title="Suspension, restriction, and termination"
            paragraphs={[
              "13.1 Piessang may suspend, restrict, moderate, or terminate access to any account, listing, product, seller workspace, payment method, review, or marketplace feature where Piessang reasonably considers it necessary for legal compliance, security, fraud control, operational integrity, policy enforcement, or protection of the marketplace.",
              "13.2 Suspension or restriction may be immediate where risk is urgent. Piessang may, but is not always obliged to, provide reasons, next steps, or an opportunity to respond depending on the nature of the issue and the legal or operational context.",
              "13.3 Termination or restriction of access does not automatically remove rights or obligations that had already accrued, including payment obligations, refund rights, record-retention duties, or any rights Piessang may have in relation to misuse or enforcement.",
            ]}
          />

          <Clause
            id="liability"
            number="14"
            title="Disclaimers and limitation of liability"
            paragraphs={[
              "14.1 Piessang provides the marketplace on an 'as available' basis to the fullest extent permitted by applicable law. Piessang does not guarantee uninterrupted access, error-free operation, continuous availability of any feature, or that any third-party seller, courier, payment processor, or external service will perform without interruption or error.",
              "14.2 To the fullest extent permitted by law, Piessang is not liable for indirect, incidental, consequential, exemplary, punitive, or purely economic loss arising from use of the marketplace, including loss of profits, loss of opportunity, reputational harm, data loss, or operational interruption, whether suffered by customers, sellers, or other users.",
              "14.3 Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited under applicable law, including where mandatory consumer protection law applies.",
            ]}
          />

          <Clause
            id="changes"
            number="15"
            title="Changes to these terms"
            paragraphs={[
              "15.1 Piessang may amend these terms from time to time to reflect changes in the marketplace, legal requirements, payment or fulfilment structure, technology, operational processes, or platform features.",
              "15.2 Updated terms take effect when published on the platform or when another stated effective date applies. Continued use of Piessang after updated terms take effect constitutes acceptance of the revised terms to the extent permitted by law.",
              "15.3 If you do not agree to an updated version of these terms, you must stop using the affected services and, where appropriate, contact support before continuing to transact on the marketplace.",
            ]}
          />

          <Clause
            id="contact"
            number="16"
            title="Contact and interpretation"
            paragraphs={[
              "16.1 These terms must be read together with Piessang’s privacy, delivery, returns, and payments policies, and with any seller-specific, promotion-specific, or feature-specific rules clearly presented in context on the platform.",
              "16.2 If any provision of these terms is found to be unenforceable, invalid, or unlawful, the remaining provisions continue in full force to the maximum extent permitted by law.",
              "16.3 If you need clarification regarding these terms or any marketplace process, you should contact Piessang support before relying on an assumption about your rights or obligations under the platform.",
            ]}
          />
        </>
      }
    />
  );
}
