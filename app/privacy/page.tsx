import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Piessang",
  description: "Review the detailed privacy policy governing how Piessang collects, uses, stores, and shares information.",
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

export default function PrivacyPage() {
  const sections = [
    { id: "scope", number: "1", title: "Scope of this policy" },
    { id: "information-we-collect", number: "2", title: "Information we collect" },
    { id: "how-we-use-information", number: "3", title: "How we use information" },
    { id: "sharing", number: "4", title: "How information is shared" },
    { id: "payments-security", number: "5", title: "Payments, fraud, and security" },
    { id: "cookies-analytics", number: "6", title: "Cookies, analytics, and platform signals" },
    { id: "storage-retention", number: "7", title: "Storage and retention" },
    { id: "your-rights", number: "8", title: "Your choices and rights" },
    { id: "cross-border", number: "9", title: "International use and cross-border processing" },
    { id: "updates-contact", number: "10", title: "Policy updates and contact" },
  ] as const;

  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy policy"
      intro="This Privacy Policy explains how Piessang collects, uses, stores, protects, and shares personal and operational information in connection with the marketplace, including browsing activity, account management, checkout, payment flows, order fulfilment, seller interactions, support, and trust and safety processes."
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
              "1.1 This policy applies to information processed by Piessang when you access or use the marketplace, create or manage an account, browse products, place an order, interact with sellers, submit reviews or reports, contact support, or otherwise engage with the platform.",
              "1.2 This policy applies to customers, sellers, seller team members, visitors, and other users of Piessang, subject to any additional privacy notices that may apply to specific tools, campaigns, jurisdictions, or regulated processes.",
              "1.3 By using Piessang, you acknowledge that your information may be processed as described in this policy, subject to applicable law.",
            ]}
          />

          <Clause
            id="information-we-collect"
            number="2"
            title="Information we collect"
            paragraphs={[
              "2.1 Piessang may collect information that you provide directly, including your name, email address, phone number, delivery contact details, saved addresses, account settings, seller account details, support requests, reviews, dispute information, and other content that you submit through the platform.",
              "2.2 We may also collect transaction and marketplace information such as products viewed, favourites, cart activity, checkout activity, purchase history, order delivery selections, fulfilment updates, seller interactions, reported products, payment attempt metadata, and customer-service interactions.",
              "2.3 We may receive technical and device-related information such as browser details, IP-related usage signals, approximate or selected location information, session data, on-site behavior signals, cookie-based identifiers, and analytics events needed to run, secure, and improve the marketplace.",
            ]}
          />

          <Clause
            id="how-we-use-information"
            number="3"
            title="How we use information"
            paragraphs={[
              "3.1 Piessang uses information to operate the marketplace, authenticate accounts, process payments, coordinate orders, enable fulfilment and collection, maintain account settings, provide customer and seller support, and deliver operational communications such as payment, order, and delivery updates.",
              "3.2 We may also use information to power marketplace features such as favourites, live cart and checkout analytics, currency preferences, delivery location matching, product recommendations, review workflows, moderation tools, trust indicators, and seller performance or operational tooling.",
              "3.3 We may use information to detect fraud, enforce platform policies, investigate misuse, assess delivery or payment risk, monitor suspicious activity, prevent abuse of discounts or promotions, and maintain the integrity and safety of Piessang.",
            ]}
          />

          <Clause
            id="sharing"
            number="4"
            title="How information is shared"
            paragraphs={[
              "4.1 Piessang may share the information required to fulfil an order with the seller responsible for the relevant items, including customer delivery contact details, address information, delivery notes, order content, and fulfilment status information where reasonably necessary to complete the order.",
              "4.2 We may share information with payment processors, fraud tools, hosting providers, analytics providers, messaging providers, logistics or delivery support services, legal advisors, regulators, or other service providers acting on Piessang’s behalf where such sharing is reasonably necessary for platform operation, compliance, security, or support.",
              "4.3 Piessang does not sell personal information as a standalone product. Information is shared only where there is a legitimate marketplace, operational, legal, payment, support, or trust and safety reason to do so.",
            ]}
          />

          <Clause
            id="payments-security"
            number="5"
            title="Payments, fraud, and security"
            paragraphs={[
              "5.1 Piessang uses payment service providers and related payment infrastructure to tokenize, authorize, process, verify, and reconcile payment activity. Raw payment-card data is not intentionally exposed to sellers through ordinary marketplace operations.",
              "5.2 We may process payment-related metadata, gateway references, token references, fraud signals, failed or abandoned checkout signals, and reconciliation events in order to confirm successful payment, reduce risk, support refunds, and maintain accurate order records.",
              "5.3 Piessang takes reasonable technical and organizational measures to protect platform information, but no online system can guarantee absolute security. Users remain responsible for protecting their own credentials and reporting suspected unauthorized access promptly.",
            ]}
          />

          <Clause
            id="cookies-analytics"
            number="6"
            title="Cookies, analytics, and platform signals"
            paragraphs={[
              "6.1 Piessang may use cookies, local storage, session storage, and similar browser technologies to keep users signed in, remember preferences, support cart and favourites behavior, store selected delivery locations, maintain display-currency choices, and improve platform usability.",
              "6.2 We may generate platform analytics such as active carts, checkout sessions, product-view signals, purchase events, and product-interest trends in order to improve operations, merchandising, fulfilment planning, fraud monitoring, and marketplace decision-making.",
              "6.3 Some analytics and operational metrics may be aggregated or de-identified before use for reporting, insight generation, seller tools, or internal marketplace analysis.",
            ]}
          />

          <Clause
            id="storage-retention"
            number="7"
            title="Storage and retention"
            paragraphs={[
              "7.1 Piessang retains information for as long as reasonably necessary to operate the marketplace, meet legal and accounting requirements, resolve disputes, maintain security records, enforce platform policies, and support legitimate operational needs.",
              "7.2 Retention periods may differ depending on the type of information, including account records, order records, fulfilment updates, payment references, fraud signals, support communications, and policy-enforcement records.",
              "7.3 Where deletion is requested or appropriate, Piessang may retain limited information where continued retention is required for legal compliance, fraud prevention, security investigation, financial reconciliation, or platform record-keeping.",
            ]}
          />

          <Clause
            id="your-rights"
            number="8"
            title="Your choices and rights"
            paragraphs={[
              "8.1 You may be able to update or manage certain account information directly through the platform, including saved addresses, payment methods, favourites, delivery preferences, and other account settings.",
              "8.2 Subject to applicable law, you may request access to, correction of, deletion of, or clarification regarding personal information processed by Piessang. We may need to verify your identity before acting on such a request.",
              "8.3 Where the law grants you additional privacy rights, Piessang will handle requests in accordance with those rights, subject to lawful exceptions, identity verification, and operational requirements.",
            ]}
          />

          <Clause
            id="cross-border"
            number="9"
            title="International use and cross-border processing"
            paragraphs={[
              "9.1 Piessang is a marketplace capable of serving users, sellers, and orders across multiple locations. As a result, information may be processed, stored, or accessed in more than one jurisdiction depending on the platform architecture, service providers used, and operational requirements of the marketplace.",
              "9.2 Where cross-border processing occurs, Piessang will take reasonable steps to ensure that information is handled in a manner consistent with this policy and applicable law.",
              "9.3 Users are responsible for ensuring that their use of Piessang is lawful in their location and for understanding that local laws may affect the privacy rights available to them.",
            ]}
          />

          <Clause
            id="updates-contact"
            number="10"
            title="Policy updates and contact"
            paragraphs={[
              "10.1 Piessang may update this Privacy Policy from time to time to reflect changes in the marketplace, the law, platform operations, analytics, payment methods, fulfilment models, or security practices.",
              "10.2 Updated versions take effect when published on the platform or on another stated effective date. Continued use of Piessang after an updated policy takes effect will be treated as acknowledgment of the revised policy to the extent permitted by law.",
              "10.3 If you have questions about this Privacy Policy or would like to exercise a privacy-related request, contact Piessang support through the channels made available on the platform.",
            ]}
          />
        </>
      }
    />
  );
}
