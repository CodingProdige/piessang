import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadata("returns", {
    title: "Returns Policy | Piessang",
    description: "Read the detailed Piessang returns, refunds, and return-responsibility policy.",
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

export default function ReturnsPage() {
  const sections = [
    { id: "scope", number: "1", title: "Scope of this policy" },
    { id: "eligibility", number: "2", title: "When a return may be requested" },
    { id: "owner-responsibility", number: "3", title: "Who manages the return" },
    { id: "request-process", number: "4", title: "How return requests are submitted" },
    { id: "review-outcomes", number: "5", title: "Review, approval, and rejection" },
    { id: "refunds", number: "6", title: "Refunds and payment reversals" },
    { id: "restricted-items", number: "7", title: "Restricted or excluded items" },
    { id: "seller-obligations", number: "8", title: "Seller obligations for seller-managed returns" },
    { id: "customer-obligations", number: "9", title: "Customer obligations and misuse" },
    { id: "updates-contact", number: "10", title: "Policy updates and contact" },
  ] as const;

  return (
    <LegalPage
      eyebrow="Returns"
      title="Returns and refunds policy"
      intro="This Returns and Refunds Policy explains how Piessang handles return requests, who is responsible for managing a return depending on the fulfilment method used for the item, how refunds are reviewed and processed, and the rules that apply to customers, sellers, and marketplace operations when an order issue arises."
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
              "1.1 This policy applies to return requests, refund requests, product issue claims, and post-delivery disputes raised through Piessang in relation to items purchased through the marketplace.",
              "1.2 Because Piessang is a marketplace, responsibility for a return may depend on how the relevant item was fulfilled. Some items are fulfilled by Piessang, while others are fulfilled directly by the seller. This policy explains how that responsibility is assigned and how return requests are managed in each case.",
              "1.3 This policy must be read together with Piessang’s Terms, Payments Policy, Delivery Policy, product-specific restrictions, applicable law, and any category-specific notices displayed on the platform.",
            ]}
          />

          <Clause
            id="eligibility"
            number="2"
            title="When a return may be requested"
            paragraphs={[
              "2.1 A return may be requested where an item is damaged, defective, materially different from its listing, incorrect, incomplete, not delivered as expected, or otherwise eligible for return under applicable law or marketplace rules.",
              "2.2 Unless a longer period is required by applicable law or a category-specific rule communicated by Piessang, return requests must be submitted within seven (7) days after the relevant item is marked as delivered. Requests submitted after that period may be refused.",
              "2.3 A return is not automatically guaranteed merely because a request is submitted. Each case may require review of the item, the delivery history, fulfilment records, product condition, supporting images, customer explanation, and any seller or operational evidence available to Piessang.",
              "2.4 Eligibility may differ by category, condition, perishability, safety rules, compliance requirements, or hygiene restrictions. Some categories may be non-returnable or may only be returnable in limited circumstances. Where possible, those restrictions should be stated on the product page or communicated during the review process.",
            ]}
          />

          <Clause
            id="owner-responsibility"
            number="3"
            title="Who manages the return"
            paragraphs={[
              "3.1 If the affected item was fulfilled by Piessang, Piessang will ordinarily manage the return review and refund decision for that item, subject to platform rules, evidence review, and applicable law.",
              "3.2 If the affected item was fulfilled directly by the seller, the seller will ordinarily be treated as the responsible return owner for that item. This includes items delivered directly by the seller, items shipped by the seller, and collection orders where the seller was the fulfilment party.",
              "3.3 Where a single order contains items with different fulfilment owners, Piessang may require separate return requests so that each case can be reviewed by the correct responsible party. Piessang retains oversight rights across the marketplace and may intervene, escalate, or override outcomes where necessary for trust, safety, policy enforcement, fraud prevention, or legal compliance.",
            ]}
          />

          <Clause
            id="request-process"
            number="4"
            title="How return requests are submitted"
            paragraphs={[
              "4.1 Customers should submit a return request through the marketplace using the relevant order reference and should clearly explain the issue, affected item or items, and the reason for the request. Customers may be asked to provide photographs, descriptions, delivery evidence, condition evidence, or any other information reasonably required to assess the case.",
              "4.2 Piessang may reject bundled requests where the selected items belong to different fulfilment owners or require different handling rules. In such cases, the customer may be asked to submit separate return requests so that each request can be reviewed correctly.",
              "4.3 Submitting a return request does not automatically create a refund, replacement, or cancellation. The request enters a review process first, and the responsible party may move it into review, approve it, reject it, resolve it, or escalate it depending on the circumstances of the case.",
            ]}
          />

          <Clause
            id="review-outcomes"
            number="5"
            title="Review, approval, and rejection"
            paragraphs={[
              "5.1 Piessang or the responsible seller may move a return request into review while evidence is considered. During that review, Piessang may contact the customer, the seller, or both for more information.",
              "5.2 A return request may be approved where the issue is supported by the available evidence and the request is consistent with marketplace rules, product restrictions, operational records, and applicable law. An approved request may lead to a refund, collection instructions, further operational handling, or another resolution pathway determined by Piessang.",
              "5.3 A return request may be rejected where the item is not eligible, the evidence does not support the claim, the issue falls outside the applicable return rules, the product is restricted from return, or the request is otherwise inconsistent with marketplace policy. Piessang may still review or override a seller-managed outcome where intervention is justified.",
            ]}
          />

          <Clause
            id="refunds"
            number="6"
            title="Refunds and payment reversals"
            paragraphs={[
              "6.1 Refunds are not processed merely because a return request exists. Under Piessang’s current return flow, refunds should only be processed once the relevant return case has been approved.",
              "6.2 Refunds are processed through the original payment lifecycle or another appropriate platform-controlled route. The refunded amount may be full or partial depending on the approved case outcome, the affected line items, and any relevant pricing, delivery, or usage factors that lawfully affect the refund calculation.",
              "6.3 Payment-processing times are not fully controlled by Piessang. Once a refund is initiated, the time it takes to reflect may depend on the payment method used, the gateway, the issuing bank, card network rules, or other financial processing factors outside Piessang’s immediate control.",
            ]}
          />

          <Clause
            id="restricted-items"
            number="7"
            title="Restricted or excluded items"
            paragraphs={[
              "7.1 Certain items may be excluded from return or subject to special handling because of hygiene concerns, perishability, safety restrictions, dangerous-goods rules, customized or made-to-order status, digital-use characteristics, or other category-specific operational constraints.",
              "7.2 Even where an item is generally non-returnable, Piessang may still review the matter where there is evidence of damage, defect, incorrect supply, misdescription, or another issue that may give rise to rights under applicable law.",
              "7.3 Piessang may maintain category-specific or product-specific return rules from time to time, and such rules may supplement this policy.",
            ]}
          />

          <Clause
            id="seller-obligations"
            number="8"
            title="Seller obligations for seller-managed returns"
            paragraphs={[
              "8.1 Where a seller is the responsible return owner, that seller must review the request promptly, act in good faith, maintain accurate fulfilment records, provide any reasonably requested evidence, and follow the applicable marketplace process for approvals, rejections, and operational next steps.",
              "8.2 Sellers may not ignore valid return requests, delay them unreasonably, misrepresent fulfilment facts, or attempt to circumvent Piessang’s review or oversight mechanisms. Piessang may intervene in such cases and may take account-level, listing-level, or financial action where required.",
              "8.3 Seller-managed returns remain subject to Piessang oversight. Piessang may require additional actions, suspend seller discretion in certain cases, or process a resolution directly where platform protection, policy enforcement, customer fairness, or legal compliance make that necessary.",
            ]}
          />

          <Clause
            id="customer-obligations"
            number="9"
            title="Customer obligations and misuse"
            paragraphs={[
              "9.1 Customers must provide accurate information when requesting a return and must not knowingly submit false, abusive, misleading, duplicate, or fraudulent claims. Piessang may request supporting evidence and may reject requests that appear abusive or unsupported.",
              "9.2 Customers must comply with reasonable operational instructions issued during the return process, including any collection, inspection, packaging, timing, or evidence requirements that are reasonably necessary to resolve the case.",
              "9.3 Abuse of the returns process may result in claim rejection, account restrictions, marketplace enforcement action, or other lawful remedies available to Piessang.",
            ]}
          />

          <Clause
            id="updates-contact"
            number="10"
            title="Policy updates and contact"
            paragraphs={[
              "10.1 Piessang may update this Returns and Refunds Policy from time to time to reflect changes in law, fulfilment methods, payment flows, seller operations, product categories, or marketplace procedures.",
              "10.2 Updated versions take effect when published on the platform or on another stated effective date. Continued use of Piessang after the updated policy takes effect will be treated as acknowledgment of the revised policy to the extent permitted by law.",
              "10.3 If you need help with a return, refund, delivery issue, or product problem, contact Piessang through the support channels made available on the platform and include your order reference and a clear explanation of the issue.",
            ]}
          />
        </>
      }
    />
  );
}
