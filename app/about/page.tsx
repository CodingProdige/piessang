import type { Metadata } from "next";
import Link from "next/link";
import { PageBody } from "@/components/layout/page-body";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";
import { COMPANY_PUBLIC_DETAILS } from "@/lib/company/public-details";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadata("about", {
    title: "About Piessang | Multi-vendor marketplace for buyers and sellers",
    description:
      "Learn what Piessang is, how the multi-vendor marketplace works, and how Piessang helps buyers and sellers transact through one trusted ecommerce platform.",
  });
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_10px_24px_rgba(20,24,27,0.05)] lg:p-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#202020]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#57636c]">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main>
      <PageBody className="py-8 lg:py-10">
        <article className="space-y-6 lg:space-y-8">
          <section className="rounded-[8px] border border-black/5 bg-[linear-gradient(135deg,#faf6ea_0%,#ffffff_55%,#f7f9ff_100%)] p-6 shadow-[0_12px_32px_rgba(20,24,27,0.06)] lg:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">About Piessang</p>
            <h1 className="mt-3 max-w-[16ch] text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#202020] sm:text-[44px]">
              A multi-vendor marketplace for discovery, checkout, fulfilment, and seller growth.
            </h1>
            <p className="mt-4 max-w-[72ch] text-[15px] leading-8 text-[#57636c]">
              Piessang is a multi-vendor ecommerce marketplace that connects buyers with curated sellers, brands, and
              suppliers through one storefront. Buyers can discover products, place orders, and manage delivery and
              returns in one place, while sellers can list products, run campaigns, choose their fulfilment model, and
              manage growth from one dashboard.
            </p>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <InfoCard title="How Piessang works">
              <p>
                Piessang brings together products from multiple independent sellers into one marketplace experience. Instead of
                each seller building and marketing a standalone store from scratch, products can be listed on Piessang
                and surfaced to active shoppers across the marketplace.
              </p>
              <p>
                Sellers stay in control of product listings, pricing, campaigns, and fulfilment settings. Depending on
                the product and seller setup, orders can be fulfilled by the seller directly or with Piessang
                fulfilment support.
              </p>
              <p>
                Buyers can browse categories, search products, compare offers, check out on Piessang, and use the
                platform’s delivery, returns, and support flows where applicable.
              </p>
            </InfoCard>

            <InfoCard title="Public business details">
              <p>
                <span className="font-semibold text-[#202020]">Business name:</span> {COMPANY_PUBLIC_DETAILS.legalName}
              </p>
              <p>
                <span className="font-semibold text-[#202020]">Support email:</span>{" "}
                <a href={`mailto:${COMPANY_PUBLIC_DETAILS.supportEmail}`} className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  {COMPANY_PUBLIC_DETAILS.supportEmail}
                </a>
              </p>
              <p>
                <span className="font-semibold text-[#202020]">Support phone:</span> {COMPANY_PUBLIC_DETAILS.supportPhone}
              </p>
              <p>
                <span className="font-semibold text-[#202020]">Address:</span> {COMPANY_PUBLIC_DETAILS.addressLines.join(", ")}
              </p>
              <p>
                <span className="font-semibold text-[#202020]">Registration number:</span>{" "}
                {COMPANY_PUBLIC_DETAILS.registrationNumber}
              </p>
              <p>
                <span className="font-semibold text-[#202020]">VAT number:</span> {COMPANY_PUBLIC_DETAILS.vatNumber}
              </p>
            </InfoCard>
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            <InfoCard title="For buyers">
              <p>
                Shop from multiple sellers through one marketplace, with shared discovery, checkout, delivery, policy,
                and support information that is easier to navigate than managing separate stores.
              </p>
            </InfoCard>
            <InfoCard title="For sellers">
              <p>
                Start selling online faster, get products in front of active demand, run campaigns, and manage orders,
                listings, billing, and fulfilment through one seller workspace.
              </p>
            </InfoCard>
            <InfoCard title="Policies and support">
              <p>
                Important marketplace information is available publicly through our{" "}
                <Link href="/delivery" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  delivery
                </Link>
                ,{" "}
                <Link href="/returns" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  returns
                </Link>
                ,{" "}
                <Link href="/payments" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  payments
                </Link>
                ,{" "}
                <Link href="/privacy" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  privacy
                </Link>
                , and{" "}
                <Link href="/terms" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  terms
                </Link>{" "}
                pages, as well as our{" "}
                <Link href="/contact" className="text-[#0f80c3] hover:text-[#0a6ca8]">
                  contact
                </Link>{" "}
                page.
              </p>
            </InfoCard>
          </section>
        </article>
      </PageBody>
    </main>
  );
}
