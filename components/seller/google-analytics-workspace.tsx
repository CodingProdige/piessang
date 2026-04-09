"use client";

const ANALYTICS_URL = "https://analytics.google.com/";

function InfoCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_10px_26px_rgba(20,24,27,0.05)]">
      <p className="text-[15px] font-semibold text-[#202020]">{title}</p>
      <p className="mt-2 text-[13px] leading-[1.65] text-[#6b7280]">{body}</p>
    </div>
  );
}

export function SellerGoogleAnalyticsWorkspace() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-black/6 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-[0_14px_34px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[760px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Google Analytics</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">Traffic and behavior from Google Analytics</h2>
            <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
              Use Google Analytics for audience, acquisition, and real-time traffic patterns. Piessang&apos;s native live view
              remains the source of truth for marketplace carts, checkouts, and paid orders.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={ANALYTICS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#202020] px-5 text-[13px] font-semibold text-white transition hover:bg-black"
            >
              Open Google Analytics
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Current setup</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-black/6 bg-[#fbfcff] p-4">
              <p className="text-[12px] font-semibold text-[#7a8594]">Measurement ID</p>
              <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#202020]">
                {measurementId || "Not configured"}
              </p>
              <p className="mt-2 text-[12px] leading-[1.6] text-[#6b7280]">
                This is the Google Analytics tag currently loaded on the storefront.
              </p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[#fbfcff] p-4">
              <p className="text-[12px] font-semibold text-[#7a8594]">Best use in Piessang</p>
              <p className="mt-2 text-[18px] font-semibold text-[#202020]">Traffic, geography, acquisition</p>
              <p className="mt-2 text-[12px] leading-[1.6] text-[#6b7280]">
                Keep GA focused on audience behavior while Piessang powers commerce operations and settlement truth.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-[#dceeff] bg-[linear-gradient(180deg,#f9fcff_0%,#f4f9ff_100%)] p-5">
            <p className="text-[15px] font-semibold text-[#202020]">Recommended dashboards to watch</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoCard
                title="Realtime"
                body="Use this for active users, top pages, traffic sources, and region spikes while campaigns or product drops are live."
              />
              <InfoCard
                title="Acquisition"
                body="Use this to understand where shoppers are coming from across Google, social, direct traffic, and campaign tagging."
              />
              <InfoCard
                title="Engagement"
                body="Use this for landing-page and product-page performance, average engagement time, and route-level dropoff."
              />
              <InfoCard
                title="Monetization"
                body="Use this alongside Piessang order metrics to validate purchase event flow and checkout conversion quality."
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">How it fits</p>
            <div className="mt-4 space-y-3">
              <InfoCard
                title="Google Analytics"
                body="Best for live traffic, page engagement, audience geography, acquisition, and product discovery behavior."
              />
              <InfoCard
                title="Piessang live view"
                body="Best for product viewers, active carts, checkouts, converted carts, paid orders, and marketplace operations."
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Quick note</p>
            <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
              If you want, the next step after this menu item is a proper in-dashboard GA summary card set powered by the
              Google Analytics Data API. That would let Piessang pull a trimmed realtime snapshot here instead of only linking out.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
