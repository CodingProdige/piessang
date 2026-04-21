import Link from "next/link";
import { ShopifyAppRedirect } from "@/components/shopify/shopify-app-redirect";

type ShopifyAppPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toStr(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function buildSellerDashboardHref(shop: string) {
  const params = new URLSearchParams({
    section: "integrations",
  });
  if (shop) params.set("shop", shop);
  return `/seller/dashboard?${params.toString()}`;
}

export default async function ShopifyEmbeddedAppPage({ searchParams }: ShopifyAppPageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const shop = toStr(resolvedSearchParams.shop);
  const host = toStr(resolvedSearchParams.host);
  const sellerDashboardHref = buildSellerDashboardHref(shop);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f5ef_0%,#ffffff_42%,#fbfaf7_100%)] px-4 py-6 text-[#202020] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="overflow-hidden rounded-[30px] border border-black/8 bg-white shadow-[0_24px_60px_rgba(20,24,27,0.08)]">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(215,188,63,0.18),transparent_38%),linear-gradient(135deg,#ffffff_0%,#fbf8ef_100%)] px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#8a7a34]">
                  Piessang Seller Sync
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#202020] sm:text-4xl">
                  Shopify is connected to Piessang.
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#5f6874] sm:text-[16px]">
                  Use the Piessang seller dashboard to review preview products, prepare imports, and manage sync settings for
                  this Shopify store.
                </p>
                <ShopifyAppRedirect href={sellerDashboardHref} />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={sellerDashboardHref}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#6d4aff] px-6 text-[15px] font-semibold text-white shadow-[0_18px_32px_rgba(109,74,255,0.24)] transition hover:bg-[#5d3df0]"
                >
                  Open seller integrations now
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-black/10 bg-white px-6 text-[15px] font-semibold text-[#202020] transition hover:bg-[#faf9f5]"
                >
                  Open Piessang
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_16px_36px_rgba(20,24,27,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b94a1]">Connected store</p>
            <p className="mt-3 break-all text-[18px] font-semibold text-[#202020]">{shop || "Current Shopify store"}</p>
          </div>
          <div className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_16px_36px_rgba(20,24,27,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b94a1]">Next step</p>
            <p className="mt-3 text-[18px] font-semibold text-[#202020]">Prepare import</p>
            <p className="mt-2 text-[14px] leading-6 text-[#5f6874]">Review Shopify products in Piessang and import only the items you want.</p>
          </div>
          <div className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_16px_36px_rgba(20,24,27,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b94a1]">Shopify host</p>
            <p className="mt-3 break-all text-[18px] font-semibold text-[#202020]">{host || "Embedded app session"}</p>
          </div>
        </section>

        <section className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_18px_40px_rgba(20,24,27,0.06)] sm:p-8">
          <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[#202020]">How this app works</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[20px] bg-[#faf8f1] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8a7a34]">1. Connect</p>
              <p className="mt-2 text-[15px] leading-6 text-[#3e4650]">Authorize the Shopify store from the Piessang seller integrations area.</p>
            </div>
            <div className="rounded-[20px] bg-[#f7f6ff] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6d4aff]">2. Review</p>
              <p className="mt-2 text-[15px] leading-6 text-[#3e4650]">Preview Shopify products, select what to bring in, and avoid duplicates automatically.</p>
            </div>
            <div className="rounded-[20px] bg-[#f4faf6] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#2d8a57]">3. Sync</p>
              <p className="mt-2 text-[15px] leading-6 text-[#3e4650]">Use ongoing sync to keep stock and pricing aligned after import.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
