import type { Metadata } from "next";
import Link from "next/link";
import { PageBody } from "@/components/layout/page-body";
import { ContactSupportPanel } from "@/components/support/contact-support-panel";
import { COMPANY_PUBLIC_DETAILS } from "@/lib/company/public-details";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadata("contact", {
    title: "Contact Us | Piessang",
    description: "Get in touch with Piessang for help with orders, delivery, returns, seller support, and marketplace questions.",
  });
}

function ContactCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[18px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">{eyebrow}</p>
      <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-[#202020]">{title}</h2>
      <p className="mt-2 text-[14px] leading-7 text-[#57636c]">{description}</p>
      <div className="mt-4 text-[14px] leading-7 text-[#202020]">{children}</div>
    </article>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: React.ReactNode;
}) {
  return (
    <details className="group rounded-[14px] border border-black/5 bg-[#fcfcfc] px-4 py-4 open:bg-[#fffaf0]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-[#202020]">
        <span>{question}</span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/10 text-[#6c6c6c] transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pt-3 text-[14px] leading-7 text-[#57636c]">{answer}</div>
    </details>
  );
}

export default function ContactPage() {
  return (
    <PageBody className="px-4 py-10 lg:px-6 lg:py-14">
      <section className="rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Contact us</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#202020] lg:text-[44px]">
          Get in touch with Piessang
        </h1>
        <p className="mt-4 max-w-[72ch] text-[15px] leading-7 text-[#57636c]">
          If you need help with an order, delivery issue, return, payment question, seller account, or marketplace problem,
          use the support options below and include as much detail as possible. Sharing your order number, seller name,
          and a short description of the issue helps us route your request faster.
        </p>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <ContactCard
          eyebrow="Customer support"
          title="Get support from Piessang"
          description="Choose the type of issue you need help with, tell us exactly what happened, and keep all replies in one clear support thread."
        >
          <ContactSupportPanel />
        </ContactCard>

        <ContactCard
          eyebrow="Support channels"
          title="Other ways to reach us"
          description="Need another route? Email us directly, open your account support area, or use the seller dashboard if your question is seller-specific."
        >
          <div className="space-y-3">
            <p>
              <span className="font-semibold">Direct email:</span>{" "}
              <a href="mailto:support@piessang.com" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                support@piessang.com
              </a>
            </p>
            <p className="text-[#57636c]">
              If your issue relates to an order, return, refund, delivery, or seller matter, include your order number, seller name, and any useful screenshots or notes.
            </p>
            <div className="rounded-[14px] border border-black/5 bg-[#fafafa] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Best for order-specific help</p>
              <p className="mt-2 text-[14px] leading-7 text-[#57636c]">
                Use the ticket form when your issue is tied to a specific order, return, refund, delivery, seller, or payment problem. That keeps the conversation attached to your Piessang account history.
              </p>
            </div>
            <p>
              <span className="font-semibold">Manage tickets:</span>{" "}
              <Link href="/support/tickets" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                Open my tickets
              </Link>
            </p>
          </div>
        </ContactCard>

        <ContactCard
          eyebrow="Business details"
          title="Piessang public business information"
          description="These are the public contact and business details we use across the marketplace."
        >
          <div className="space-y-3">
            <p>
              <span className="font-semibold">Business name:</span> {COMPANY_PUBLIC_DETAILS.legalName}
            </p>
            <p>
              <span className="font-semibold">Support email:</span>{" "}
              <a href={`mailto:${COMPANY_PUBLIC_DETAILS.supportEmail}`} className="text-[#0f80c3] hover:text-[#0a6ca8]">
                {COMPANY_PUBLIC_DETAILS.supportEmail}
              </a>
            </p>
            <p>
              <span className="font-semibold">Support phone:</span> {COMPANY_PUBLIC_DETAILS.supportPhone}
            </p>
            <p>
              <span className="font-semibold">Address:</span> {COMPANY_PUBLIC_DETAILS.addressLines.join(", ")}
            </p>
            <p>
              <span className="font-semibold">Registration number:</span> {COMPANY_PUBLIC_DETAILS.registrationNumber}
            </p>
            <p>
              <span className="font-semibold">VAT number:</span> {COMPANY_PUBLIC_DETAILS.vatNumber}
            </p>
          </div>
        </ContactCard>

        <ContactCard
          eyebrow="Before you contact us"
          title="What to include"
          description="Providing the right information upfront helps us resolve issues more quickly."
        >
          <ul className="list-disc space-y-2 pl-5 text-[#57636c]">
            <li>Your full name and the email address used on Piessang</li>
            <li>Your order number, if your question is order-related</li>
            <li>The seller name or product title, where relevant</li>
            <li>A clear explanation of the issue</li>
            <li>Any supporting screenshots, photos, or delivery notes if they help explain the problem</li>
          </ul>
        </ContactCard>
      </section>

      <section className="mt-8 rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">FAQ</p>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">Frequently asked questions</h2>
        <div className="mt-6 space-y-3">
          <FaqItem
            question="How many support tickets can I keep open at once?"
            answer="You can keep one active support ticket open at a time. Once it has been resolved and closed, you can open a new ticket."
          />
          <FaqItem
            question="Where do I reply after I have opened a ticket?"
            answer="Reply directly from your ticket area. We will also email you when Piessang posts an update on your ticket."
          />
          <FaqItem
            question="Can I still email Piessang directly instead of using the ticket form?"
            answer={
              <>
                Yes. You can always email{" "}
                <a href="mailto:support@piessang.com" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  support@piessang.com
                </a>
                .
              </>
            }
          />
          <FaqItem
            question="Can sellers use the same support route?"
            answer="Yes. Sellers can use the same support flow for catalogue, fulfilment, payout, returns, and marketplace-related questions."
          />
          <FaqItem
            question="What should I include in my ticket?"
            answer="Include your order number, seller name, product title, screenshots, and a clear explanation of what happened. The more specific you are, the faster we can investigate."
          />
        </div>
      </section>
    </PageBody>
  );
}
