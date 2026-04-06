import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageBody } from "@/components/layout/page-body";
import { RegisterSellerButton } from "@/components/seller/register-seller-button";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadata("sell_on_piessang", {
    title: "Start Selling Online Faster | Sell on Piessang",
    description:
      "Start selling online with Piessang without building your own store from scratch. List products quickly, reach more buyers, run campaigns, choose fulfilment, and grow through one marketplace.",
  });
}

const heroPoints = [
  {
    title: "List products for free",
    copy: "Get your catalogue live on Piessang without paying to create listings.",
    icon: "01",
  },
  {
    title: "Reach more buyers",
    copy: "Get in front of more people online through one marketplace built for reach.",
    icon: "02",
  },
  {
    title: "Run product campaigns",
    copy: "Push launches, promotions, and priority products when you need extra traction.",
    icon: "03",
  },
  {
    title: "Choose fulfilment your way",
    copy: "Ship yourself or let Piessang support fulfilment when you want less friction.",
    icon: "04",
  },
];

const benefits = [
  {
    title: "Start selling faster",
    copy: "Get listed quickly and go live without building a full store from scratch.",
  },
  {
    title: "Push products with campaigns",
    copy: "Promote launches, best sellers, and priority products when you need more traction.",
  },
  {
    title: "Sell locally and globally",
    copy: "Reach more people online and grow beyond your current customer base.",
  },
  {
    title: "Choose fulfilment your way",
    copy: "Ship orders yourself or let Piessang help handle fulfilment and logistics.",
  },
  {
    title: "Manage from one dashboard",
    copy: "Control listings, campaigns, orders, billing, and performance in one place.",
  },
];

const boldReasons = [
  "No need to build your own store first.",
  "No need to wait months to launch.",
  "No need to fight for traffic alone.",
  "No need to handle growth manually.",
];

const sellerJourneySteps = [
  {
    step: "1",
    title: "Register",
    copy: "Create your seller account and get set up to start selling on Piessang.",
    icon: "R",
  },
  {
    step: "2",
    title: "List products",
    copy: "Add your catalogue quickly and get your products ready for buyers to discover.",
    icon: "L",
  },
  {
    step: "3",
    title: "Sell",
    copy: "Go live, reach more buyers, and grow through campaigns, visibility, and fulfilment flexibility.",
    icon: "S",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">{children}</p>;
}

function SectionTitle({
  title,
  copy,
}: {
  title: string;
  copy?: string;
}) {
  return (
    <header className="max-w-[820px]">
      <h2 className="text-[28px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#202020] sm:text-[36px]">
        {title}
      </h2>
      {copy ? <p className="mt-3 text-[15px] leading-[1.8] text-[#57636c]">{copy}</p> : null}
    </header>
  );
}

export default function SellOnPiessangPage() {
  return (
    <main>
      <PageBody className="py-6 lg:py-8">
        <article className="space-y-6 lg:space-y-8">
          <section className="overflow-hidden rounded-[8px] border border-black/5 bg-white shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
            <div className="grid lg:grid-cols-2">
              <div className="min-w-0 bg-white p-6 sm:p-8 lg:p-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Sell on Piessang</p>
                <h1 className="mt-3 max-w-[11ch] text-[34px] font-semibold leading-[0.95] tracking-[-0.05em] text-[#202020] sm:text-[56px] lg:text-[72px]">
                  Sell on Piessang. Reach buyers instantly.
                </h1>
                <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.9] text-[#57636c]">
                  Get your products in front of active shoppers across Piessang and Google, without building your own
                  store.
                </p>

                <div className="mt-8">
                  <RegisterSellerButton
                    label="Start Selling Now"
                    className="brand-button inline-flex h-14 items-center rounded-[8px] px-8 text-[18px] font-semibold shadow-[0_18px_40px_rgba(203,178,107,0.35)]"
                  />
                  <div className="mt-4">
                    <Link
                      href="/fees"
                      className="text-[14px] font-semibold text-[#907d4c] underline decoration-[#cbb26b]/55 underline-offset-4 transition-colors hover:text-[#6f5d2f]"
                    >
                      View seller fees
                    </Link>
                  </div>
                  <p className="mt-5 text-[13px] font-medium tracking-[0.01em] text-[#57636c]">
                    Start selling in minutes, not weeks. Full control over pricing and fulfilment. Sell locally or
                    expand globally.
                  </p>
                </div>
              </div>

              <div className="relative min-h-[260px] bg-[#d8dce3] sm:min-h-[340px] lg:min-h-[620px]">
                <Image
                  src="/backgrounds/monkey-on-beach-wide.png"
                  alt=""
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.12)_0%,rgba(8,8,8,0.22)_100%)]" />
              </div>
            </div>
          </section>

          <section
            id="seller-key-points"
            className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8"
          >
            <Eyebrow>Why sellers choose Piessang</Eyebrow>
            <SectionTitle title="Big reasons to move faster on one marketplace" />
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {heroPoints.map((point) => (
                <section key={point.title} className="rounded-[8px] border border-black/6 bg-[#fcfcfc] p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#202020] text-[13px] font-semibold tracking-[0.12em] text-[#f5e7b2]">
                    {point.icon}
                  </div>
                  <h3 className="mt-4 text-[20px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#202020]">
                    {point.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-[1.75] text-[#57636c]">{point.copy}</p>
                </section>
              ))}
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <Eyebrow>Sell products online</Eyebrow>
            <SectionTitle
              title="Why Piessang beats building your own store first"
              copy="If you want to sell products online, create an online store presence, list products online, and reach more customers without building everything from zero, Piessang gives you a faster route to market through one ecommerce marketplace."
            />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {boldReasons.map((item) => (
                <div key={item} className="rounded-[8px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <p className="text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#202020]">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <Eyebrow>Seller benefits</Eyebrow>
            <SectionTitle
              title="More reach. More control. Faster selling."
              copy="One seller workspace. One marketplace. More ways to get products discovered and sold."
            />
            <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="overflow-hidden rounded-[8px] border border-black/6 bg-[radial-gradient(circle_at_top_left,rgba(203,178,107,0.18),transparent_26%),linear-gradient(135deg,#161616_0%,#242424_100%)] p-6 text-white shadow-[0_18px_40px_rgba(20,24,27,0.12)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f5e7b2]">Built for growth</p>
                <h3 className="mt-3 max-w-[12ch] text-[34px] font-semibold leading-[0.98] tracking-[-0.04em] text-white">
                  Everything you need to move products faster.
                </h3>
                <p className="mt-4 max-w-[54ch] text-[15px] leading-[1.8] text-white/76">
                  Piessang gives sellers a faster route to market with listings, campaigns, fulfilment flexibility, and one dashboard to control it all.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Go live faster", value: "One seller dashboard" },
                    { label: "Promote smarter", value: "Campaign-ready products" },
                    { label: "Sell wider", value: "Local + global reach" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[8px] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-[2px]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{item.label}</p>
                      <p className="mt-2 text-[18px] font-semibold leading-[1.2] text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                {benefits.map((benefit, index) => (
                  <section
                    key={benefit.title}
                    className="rounded-[8px] border border-black/6 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbfb_100%)] p-5 shadow-[0_10px_24px_rgba(20,24,27,0.04)]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f5e7b2] text-[13px] font-semibold tracking-[0.12em] text-[#202020]">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-4 text-[20px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#202020]">
                      {benefit.title}
                    </h3>
                    <p className="mt-3 text-[14px] leading-[1.75] text-[#57636c]">{benefit.copy}</p>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[8px] border border-black/5 bg-[linear-gradient(135deg,#f7f9ff_0%,#ffffff_48%,#faf6ea_100%)] p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <Eyebrow>Google product visibility</Eyebrow>
                <SectionTitle
                  title="Get your products seen in Google product searches"
                  copy="Piessang helps sellers get products surfaced faster beyond the marketplace itself. Instead of waiting to build search visibility alone, you can list on Piessang and get products in front of buyers who are already searching through Google product discovery."
                />
              </div>

              <div className="relative overflow-hidden rounded-[8px] border border-black/6 bg-white p-3 shadow-[0_18px_40px_rgba(20,24,27,0.08)]">
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px]">
                  <Image
                    src="/clipped/google-product-adds.png"
                    alt="Piessang products appearing in Google product search results"
                    fill
                    className="object-cover object-left-top"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[8px] bg-[radial-gradient(circle_at_top_left,rgba(227,197,47,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_24%),linear-gradient(135deg,#1d1b17_0%,#2a261f_48%,#3a331f_100%)] px-6 py-8 text-white shadow-[0_12px_32px_rgba(20,24,27,0.14)] lg:px-8 lg:py-10">
            <div className="mx-auto max-w-[1200px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f5e7b2]">How it works</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-[1.03] tracking-[-0.04em] text-white sm:text-[42px]">
                Register. List. Sell.
              </h2>
              <p className="mt-3 max-w-[760px] text-[15px] leading-[1.8] text-white/78">
                The fastest path onto Piessang is simple: register your seller account, list your products, and start selling.
              </p>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {sellerJourneySteps.map((item) => (
                  <section
                    key={item.step}
                    className="rounded-[8px] border border-[#cbb26b]/18 bg-white/6 p-5 backdrop-blur-[2px]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f5e7b2] text-[22px] font-semibold text-[#202020]">
                        {item.icon}
                      </div>
                      <div className="flex h-10 min-w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 px-3 text-[18px] font-semibold text-white/92">
                        {item.step}
                      </div>
                    </div>
                    <h3 className="mt-5 text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-[14px] leading-[1.75] text-white/84">{item.copy}</p>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <Eyebrow>Fulfilment flexibility</Eyebrow>
            <SectionTitle
              title="Choose how you fulfil orders"
              copy="Ship yourself or let Piessang help. Keep control of delivery, or hand it over when you need a smoother route to market."
            />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[8px] border border-black/6 bg-[#fafafa] p-5">
                <h3 className="text-[20px] font-semibold text-[#202020]">Self-fulfil</h3>
                <p className="mt-2 text-[14px] leading-[1.75] text-[#57636c]">
                  Handle your own shipping and delivery while still selling through the marketplace.
                </p>
              </div>
              <div className="rounded-[8px] border border-black/6 bg-[#fafafa] p-5">
                <h3 className="text-[20px] font-semibold text-[#202020]">Piessang fulfilment support</h3>
                <p className="mt-2 text-[14px] leading-[1.75] text-[#57636c]">
                  Let Piessang help fulfil orders when you want less friction and more scale.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <Eyebrow>Start selling</Eyebrow>
            <SectionTitle
              title="Sell more through Piessang"
              copy="If you want to start selling online faster, list products quickly, run campaigns, choose your fulfilment model, and reach more buyers, Piessang gives you the faster route."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <RegisterSellerButton
                label="Start Selling Now"
                className="inline-flex h-12 items-center rounded-[8px] bg-[#202020] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
              />
              <Link
                href="/fees"
                className="inline-flex h-11 items-center rounded-[8px] border border-black/10 bg-white px-5 text-[14px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
              >
                Seller fees and charges
              </Link>
            </div>
          </section>
        </article>
      </PageBody>
    </main>
  );
}
