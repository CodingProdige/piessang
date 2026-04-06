import type { Metadata } from "next";
import Link from "next/link";
import { PageBody } from "@/components/layout/page-body";
import { formatMoneyExact } from "@/lib/money";
import {
  DEFAULT_MARKETPLACE_FEE_CONFIG,
  describeMarketplaceFeeRule,
  type MarketplaceFeeConfig,
  type MarketplaceFeeRule,
} from "@/lib/marketplace/fees";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";
import { buildSeoMetadata } from "@/lib/seo/page-overrides";

export const dynamic = "force-dynamic";

async function loadPublicFeeConfig(): Promise<MarketplaceFeeConfig> {
  try {
    return await loadMarketplaceFeeConfig();
  } catch {
    return DEFAULT_MARKETPLACE_FEE_CONFIG;
  }
}

function feeLabel(rule?: MarketplaceFeeRule | null) {
  return describeMarketplaceFeeRule(rule || null);
}

function extractFeePercent(rule?: MarketplaceFeeRule | null) {
  if (!rule) return null;
  if (rule.kind === "fixed") return Number(rule.percent || 0);
  if (rule.kind === "range") return Number(rule.estimatePercent ?? rule.minPercent ?? rule.maxPercent ?? 0);
  if (rule.kind === "tiers") return Number(rule.tiers?.[0]?.percent || 0);
  return null;
}

function categoryFeeSummary(category: MarketplaceFeeConfig["categories"][number]) {
  const values = [
    extractFeePercent(category?.feeRule || null),
    ...(category?.subCategories || []).map((subCategory) => extractFeePercent(subCategory?.feeRule || null)),
  ].filter((value): value is number => Number.isFinite(value));

  if (!values.length) return feeLabel(category?.feeRule || null);

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return `${min}%`;
  return `${min}% - ${max}%`;
}

function formatVolumeRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "Any size";
  if (min == null) return `Up to ${Number(max).toLocaleString("en-ZA")} cm3`;
  if (max == null) return `${Number(min).toLocaleString("en-ZA")} cm3+`;
  return `${Number(min).toLocaleString("en-ZA")} - ${Number(max).toLocaleString("en-ZA")} cm3`;
}

function TableHeader({
  columns,
}: {
  columns: string[];
}) {
  return (
    <thead>
      <tr className="bg-[#202020] text-[#f5e7b2]">
        {columns.map((column, index) => (
          <th
            key={column}
            className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.14em] ${
              index < columns.length - 1 ? "border-r border-[#cbb26b]/18" : ""
            }`}
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function SectionIntro({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <header className="max-w-[880px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-semibold leading-[1.03] tracking-[-0.04em] text-[#202020] sm:text-[36px]">
        {title}
      </h2>
      <p className="mt-3 text-[15px] leading-[1.8] text-[#57636c]">{copy}</p>
    </header>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return buildSeoMetadata("fees", {
    title: "Seller Fees and Charges | Piessang",
    description:
      "View Piessang seller fees and charges, including marketplace success fees, fulfilment fees, and storage fees.",
  });
}

export default async function FeesPage() {
  const config = await loadPublicFeeConfig();
  const categories = Array.isArray(config?.categories) ? config.categories : [];
  const fulfilmentRows = Array.isArray(config?.fulfilment?.rows) ? config.fulfilment.rows : [];
  const storageBands = (Array.isArray(config?.storage?.bands) ? config.storage.bands : []).sort((a, b) => {
    const aMin = a?.minVolumeCm3 ?? 0;
    const bMin = b?.minVolumeCm3 ?? 0;
    return aMin - bMin;
  });
  const thresholdDays = Number(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays ?? 35);

  return (
    <main>
      <PageBody className="py-8 lg:py-10">
        <article className="space-y-6 lg:space-y-8">
          <section className="overflow-hidden rounded-[8px] border border-black/5 bg-[linear-gradient(135deg,#faf6ea_0%,#ffffff_55%,#f7f9ff_100%)] shadow-[0_12px_32px_rgba(20,24,27,0.06)]">
            <div className="p-6 lg:p-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Seller fees</p>
                <h1 className="mt-3 text-[34px] font-semibold leading-[0.98] tracking-[-0.04em] text-[#202020] sm:text-[46px]">
                  Seller fees and charges on Piessang
                </h1>
                <p className="mt-4 max-w-[70ch] text-[15px] leading-[1.85] text-[#57636c]">
                  Piessang charges marketplace success fees when products sell, optional fulfilment fees when Piessang
                  handles warehouse dispatch, and storage fees for aged warehouse stock. This page is the live reference
                  for those charges.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/sell-on-piessang"
                    className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
                  >
                    Sell on Piessang
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex h-11 items-center rounded-[8px] border border-black/10 bg-white px-5 text-[14px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
                  >
                    Register as seller
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <SectionIntro
              eyebrow="Marketplace fees"
              title="Category success fee table"
              copy="Success fees are Piessang's marketplace referral fees. They help cover transactional costs, customer support, and all-round platform support. They are calculated as a percentage of the VAT-inclusive product selling price per item sold, excluding shipping. If an item is returned, that success fee is credited back."
            />

            <div className="mt-6 overflow-hidden rounded-[8px] border border-black/8">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <TableHeader columns={["Product category", "Success fee %"]} />
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.slug}>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[15px] font-semibold text-[#202020]">
                        {category.title}
                      </td>
                      <td className="border-b border-black/6 px-4 py-4 text-[15px] text-[#202020]">
                        {categoryFeeSummary(category)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <SectionIntro
              eyebrow="Fulfilment fees"
              title="When Piessang handles dispatch"
              copy="These charges only apply if you choose Piessang fulfilment for the order. If you handle shipping and delivery yourself, these fulfilment fees do not apply. Where Piessang is fulfilling the order, the fee is based on the size band and weight band of the product."
            />

            <div className="mt-6 overflow-hidden rounded-[8px] border border-black/8">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <TableHeader columns={["Size band", "Volume", "Light", "Heavy", "Heavy Plus", "Very Heavy"]} />
                <tbody>
                  {fulfilmentRows.map((row) => (
                    <tr key={row.id || row.label}>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[15px] font-semibold text-[#202020]">{row.label}</td>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[14px] text-[#57636c]">
                        {formatVolumeRange(row.minVolumeCm3, row.maxVolumeCm3)}
                      </td>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[14px] text-[#202020]">{formatMoneyExact(Number(row?.prices?.light || 0))}</td>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[14px] text-[#202020]">{formatMoneyExact(Number(row?.prices?.heavy || 0))}</td>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[14px] text-[#202020]">{formatMoneyExact(Number(row?.prices?.heavyPlus || 0))}</td>
                      <td className="border-b border-black/6 px-4 py-4 text-[14px] text-[#202020]">{formatMoneyExact(Number(row?.prices?.veryHeavy || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <SectionIntro
              eyebrow="Storage fees"
              title="Aged stock in Piessang fulfilment"
              copy={`These storage fees only apply to stock held in Piessang fulfilment. If you do not use Piessang fulfilment, these storage fees do not apply. Warehouse stock is currently covered for the first ${thresholdDays} days, and after that the overstocked storage fee applies based on the product size band shown below.`}
            />

            <div className="mt-6 overflow-hidden rounded-[8px] border border-black/8">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <TableHeader columns={["Size band", "Volume", "Storage fee"]} />
                <tbody>
                  <tr>
                    <td className="border-b border-r border-black/6 px-4 py-4 text-[15px] font-semibold text-[#202020]">Included stock cover</td>
                    <td className="border-b border-r border-black/6 px-4 py-4 text-[14px] text-[#57636c]">First {thresholdDays} days</td>
                    <td className="border-b border-black/6 px-4 py-4 text-[14px] text-[#202020]">{formatMoneyExact(0)}</td>
                  </tr>
                  {storageBands.map((band) => (
                    <tr key={band.label}>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[15px] font-semibold text-[#202020]">{band.label}</td>
                      <td className="border-b border-r border-black/6 px-4 py-4 text-[14px] text-[#57636c]">
                        {formatVolumeRange(band.minVolumeCm3, band.maxVolumeCm3)}
                      </td>
                      <td className="border-b border-black/6 px-4 py-4 text-[14px] text-[#202020]">
                        {formatMoneyExact(Number(band.overstockedFeeIncl || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-white p-6 shadow-[0_12px_32px_rgba(20,24,27,0.05)] lg:p-8">
            <SectionIntro
              eyebrow="FAQ"
              title="Quick answers"
              copy="The main questions sellers ask before listing products on Piessang."
            />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Are fees charged only by category?",
                  copy: "The public fees page shows category fee percentages or category fee ranges, depending on the category.",
                },
                {
                  title: "Do fulfilment fees always apply?",
                  copy: "No. Fulfilment fees only apply when you choose Piessang fulfilment and Piessang is handling dispatch for the order.",
                },
                {
                  title: "Do storage fees apply immediately?",
                  copy: `No. Storage fees only apply to stock held in Piessang fulfilment, and only after the current ${thresholdDays}-day stock cover window.`,
                },
                {
                  title: "Where do I see the selling opportunity?",
                  copy: "Use the Sell on Piessang page to understand the growth, reach, campaigns, and fulfilment flexibility available to sellers.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-[8px] border border-black/6 bg-[#fafafa] p-5">
                  <h3 className="text-[18px] font-semibold text-[#202020]">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-[1.75] text-[#57636c]">{item.copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[8px] border border-black/5 bg-[linear-gradient(135deg,#101010_0%,#202020_100%)] p-6 text-white shadow-[0_12px_32px_rgba(20,24,27,0.12)] lg:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#cbb26b]">Next step</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[40px]">
              Ready to start selling?
            </h2>
            <p className="mt-4 max-w-[72ch] text-[15px] leading-[1.8] text-white/78">
              Review the fee structure, then move to seller registration and start building your catalogue on Piessang.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/sell-on-piessang"
                className="inline-flex h-11 items-center rounded-[8px] bg-white px-5 text-[14px] font-semibold text-[#202020] transition-colors hover:bg-[#f7f7f7]"
              >
                Sell on Piessang
              </Link>
              <Link
                href="/register"
                className="inline-flex h-11 items-center rounded-[8px] border border-white/15 bg-white/8 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-white/12"
              >
                Register as seller
              </Link>
            </div>
          </section>
        </article>
      </PageBody>
    </main>
  );
}
