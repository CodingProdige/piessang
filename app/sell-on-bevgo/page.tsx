import type { Metadata } from "next";
import Link from "next/link";
import { RegisterSellerButton } from "@/components/seller/register-seller-button";

export const metadata: Metadata = {
  title: "Sell on Piessang",
  description:
    "Register as a seller on Piessang and choose the fulfilment model that suits your operation, from self-managed dispatch to Piessang warehousing.",
};

const options = [
  {
    title: "Sell from your own premises",
    description:
      "Keep stock in your own operation and plug into Piessang's consolidated buyer demand without adding marketplace complexity.",
    bullets: [
      "List products quickly on the Piessang Marketplace",
      "Reach hospitality, retail, and residential buyers",
      "Keep your own stock and dispatch flow",
      "Use Piessang to surface demand and manage orders",
    ],
  },
  {
    title: "Let Piessang store and fulfil",
    recommended: true,
    description:
      "Store stock with Piessang so your products can move from approved listing to customer-ready fulfilment with less overhead.",
    bullets: [
      "Inventory stored in Piessang warehousing",
      "Piessang handles pick, pack, and dispatch",
      "Faster order handling and cleaner operations",
      "Ready for a more hands-off route to market",
    ],
  },
  {
    title: "Extend into broader logistics",
    description:
      "Use Piessang for marketplace demand today, then expand into routing, storage, and broader logistics support as you grow.",
    bullets: [
      "Distribution, routing, storage, and dispatch",
      "Flexible support for growing suppliers",
      "One partner across marketplace and logistics",
      "Built to scale with your business",
    ],
  },
];

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-[820px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">{eyebrow}</p>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.05] text-[#202020] sm:text-[44px]">
        {title}
      </h1>
      <p className="mt-4 text-[15px] leading-[1.75] text-[#57636c]">{copy}</p>
    </div>
  );
}

export default function SellOnPiessangPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <section className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <SectionTitle
              eyebrow="Join the Piessang Marketplace"
              title="Start selling faster, without the marketplace drag."
              copy="Piessang is built for suppliers who want to get listed quickly, reach more buyers, and keep the process simple. No long-winded onboarding. No unnecessary steps. Just a clear path to start selling and growing your brand."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <RegisterSellerButton
                label="Register as seller"
                className="brand-button inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
              />
              <Link
                href="/products"
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Browse marketplace
              </Link>
            </div>
          </div>

          <div className="bg-[linear-gradient(135deg,#081a4f_0%,#0e2a7a_48%,#1f1146_100%)] p-6 text-white sm:p-8 lg:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#cbb26b]">Why suppliers choose Piessang</p>
            <ul className="mt-4 space-y-3 text-[14px] leading-[1.7] text-white/86">
              <li>Fast to get started, with a simpler workflow than larger marketplaces.</li>
              <li>One place for catalogue, orders, and seller tools.</li>
              <li>Reach hospitality, retail, and residential buyers from one platform.</li>
              <li>Choose the fulfilment flow that suits your operation.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Marketplace problem</p>
          <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">Fragmented ordering slows sellers down.</h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
            Selling through several separate channels can create duplicate admin, mixed delivery expectations, and a lot
            of operational noise. Piessang keeps the route to market simpler.
          </p>
        </div>
        <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Piessang solution</p>
          <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">One marketplace. Clear fulfilment. Faster starts.</h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
            Piessang consolidates demand so suppliers can list quickly, start selling sooner, and keep the customer-facing flow in one
            place.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">How it works</p>
        <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">A simple path to getting products live</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {options.map((option) => (
            <div
              key={option.title}
              className={`rounded-[8px] border p-5 shadow-[0_8px_20px_rgba(20,24,27,0.05)] ${option.recommended ? "border-[#cbb26b] bg-[#fffdf5]" : "border-black/5 bg-white"}`}
            >
              {option.recommended ? (
                <span className="inline-flex rounded-full bg-[#cbb26b] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                  Recommended
                </span>
              ) : null}
              <h3 className="mt-2 text-[18px] font-semibold text-[#202020]">{option.title}</h3>
              <p className="mt-3 text-[13px] leading-[1.7] text-[#57636c]">{option.description}</p>
              <ul className="mt-4 space-y-2 text-[13px] leading-[1.6] text-[#202020]">
                {option.bullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbb26b]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Storage</p>
          <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">Built to scale into storage and logistics later.</h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
            If you choose Piessang-managed storage, we’ll guide you through the requirements and get your products into the right fulfilment flow.
          </p>
        </div>
        <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Get started</p>
            <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">Start simple. Add products. Sell faster.</h2>
            <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
            If you’re ready to list products or explore a supplier partnership, register your seller account and we’ll help you get moving quickly.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <RegisterSellerButton
              label="Register as seller"
              className="brand-button inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
            />
            <Link
              href="/account"
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
            >
              Back to account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
