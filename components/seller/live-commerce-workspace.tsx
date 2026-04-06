"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoneyExact } from "@/lib/money";

type LocationRow = {
  label?: string;
  value?: number;
};

type TopSoldRow = {
  productId?: string;
  title?: string;
  unitsSold?: number;
  revenue?: number;
};

type ActivityRow = {
  kind?: string;
  title?: string;
  detail?: string;
  createdAt?: string | null;
};

type CustomerBehaviorRow = {
  label?: string;
  value?: number;
  color?: string;
};

type LiveCommerceSnapshot = {
  activeCarts?: number;
  checkingOut?: number;
  purchased?: number;
  viewerCountRightNow?: number;
  todayVisitors?: number;
  checkoutSessionsToday?: number;
  convertedCartsToday?: number;
  totalSalesToday?: number;
  ordersToday?: number;
  sessionsToday?: number;
  customerBehavior?: CustomerBehaviorRow[];
  customerBehaviorTotal?: number;
  sessionsByLocation?: LocationRow[];
  newVsReturning?: {
    newCustomers?: number;
    returningCustomers?: number;
  };
  topSoldProductsToday?: TopSoldRow[];
  recentActivity?: ActivityRow[];
  updatedAt?: string | null;
  windows?: {
    activeCartMinutes?: number;
    checkoutMinutes?: number;
    purchasedHours?: number;
  };
};

function toNum(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return formatMoneyExact(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(Math.max(0, Number(value || 0)));
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return "Updating now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updating now";
  return `Updated ${new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(date)}`;
}

function formatTime(value?: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MetricTile({
  title,
  value,
  helper,
  accent = "#3b82f6",
}: {
  title: string;
  value: string;
  helper: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/6 bg-white p-4 shadow-[0_10px_26px_rgba(20,24,27,0.05)]">
      <p className="border-b border-dotted border-black/20 pb-1 text-[12px] font-semibold text-[#202020]">{title}</p>
      <p className="mt-3 text-[27px] font-semibold tracking-[-0.04em] text-[#202020]">{value}</p>
      <div className="mt-3 h-[3px] w-14 rounded-full" style={{ backgroundColor: accent }} />
      <p className="mt-3 text-[12px] leading-[1.6] text-[#6b7280]">{helper}</p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[22px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.05)] ${className}`}>
      <div>
        <p className="border-b border-dotted border-black/20 pb-1 text-[13px] font-semibold text-[#202020]">{title}</p>
        {subtitle ? <p className="mt-2 text-[13px] leading-[1.6] text-[#7a8594]">{subtitle}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function WorldPulse({
  locations,
  viewers,
  orders,
}: {
  locations: LocationRow[];
  viewers: number;
  orders: number;
}) {
  const topLocations = locations.slice(0, 5);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-[#d7eefc] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.95),rgba(221,243,255,0.88)_42%,rgba(204,232,255,0.95)_100%)]">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#9ed8fb] bg-[radial-gradient(circle_at_45%_35%,rgba(255,255,255,0.92),rgba(198,232,255,0.82)_50%,rgba(171,220,255,0.9)_100%)] shadow-[0_0_80px_rgba(125,211,252,0.28)]" />
        <div className="absolute left-[56%] top-[42%] h-3 w-3 rounded-full bg-[#8b5cf6] shadow-[0_0_0_8px_rgba(139,92,246,0.12)]" />
        <div className="absolute left-[54%] top-[44%] h-2.5 w-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_0_8px_rgba(56,189,248,0.12)]" />
        <div className="absolute bottom-4 left-4 rounded-[14px] border border-black/6 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(20,24,27,0.08)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8594]">Live pulse</p>
          <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{formatCompactNumber(viewers)}</p>
          <p className="text-[12px] text-[#6b7280]">viewers right now</p>
          <p className="mt-2 text-[14px] font-semibold text-[#202020]">{formatCompactNumber(orders)} orders today</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-[20px] border border-black/6 bg-[#fbfdff] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8594]">Signals</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f3ff] px-3 py-1 text-[12px] font-semibold text-[#6d28d9]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" />
              Orders
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#eef9ff] px-3 py-1 text-[12px] font-semibold text-[#0369a1]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#38bdf8]" />
              Visitors right now
            </span>
          </div>
        </div>

        <div className="rounded-[20px] border border-black/6 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8594]">Top locations</p>
          <div className="mt-3 space-y-3">
            {topLocations.length ? topLocations.map((entry, index) => (
              <div key={`${entry.label || "location"}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <p className="min-w-0 truncate font-medium text-[#202020]">{entry.label || "Unknown"}</p>
                  <span className="shrink-0 font-semibold text-[#202020]">{toNum(entry.value)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#edf2f7]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#8b5cf6)]"
                    style={{ width: `${Math.max(10, Math.round((toNum(entry.value) / Math.max(toNum(topLocations[0]?.value), 1)) * 100))}%` }}
                  />
                </div>
              </div>
            )) : (
              <p className="text-[13px] text-[#7a8594]">Location activity will appear here as orders and sessions come in.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SellerLiveCommerceWorkspace({ compact = false }: { compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<LiveCommerceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/client/v1/analytics/live-commerce", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load live commerce analytics.");
        }
        if (!cancelled) {
          setSnapshot(payload?.data?.snapshot ?? null);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load live commerce analytics.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const locations = useMemo(
    () => (Array.isArray(snapshot?.sessionsByLocation) ? snapshot.sessionsByLocation : []),
    [snapshot?.sessionsByLocation],
  );
  const topProducts = useMemo(
    () => (Array.isArray(snapshot?.topSoldProductsToday) ? snapshot.topSoldProductsToday : []),
    [snapshot?.topSoldProductsToday],
  );
  const recentActivity = useMemo(
    () => (Array.isArray(snapshot?.recentActivity) ? snapshot.recentActivity : []),
    [snapshot?.recentActivity],
  );
  const customerBehavior = useMemo(
    () => (Array.isArray(snapshot?.customerBehavior) ? snapshot.customerBehavior : []),
    [snapshot?.customerBehavior],
  );

  if (loading) {
    return (
      <div className="rounded-[22px] border border-black/6 bg-white px-5 py-10 text-[14px] text-[#57636c] shadow-[0_10px_28px_rgba(20,24,27,0.05)]">
        Loading live commerce view...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[16px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
        {error}
      </div>
    );
  }

  const activeCarts = toNum(snapshot?.activeCarts);
  const checkingOut = toNum(snapshot?.checkingOut);
  const purchased = toNum(snapshot?.purchased);
  const viewerCountRightNow = toNum(snapshot?.viewerCountRightNow);
  const sessionsToday = toNum(snapshot?.sessionsToday || snapshot?.todayVisitors);
  const totalSalesToday = toNum(snapshot?.totalSalesToday);
  const ordersToday = toNum(snapshot?.ordersToday);
  const checkoutSessionsToday = toNum(snapshot?.checkoutSessionsToday);
  const convertedCartsToday = toNum(snapshot?.convertedCartsToday);
  const newCustomers = toNum(snapshot?.newVsReturning?.newCustomers);
  const returningCustomers = toNum(snapshot?.newVsReturning?.returningCustomers);
  const customerTotal = Math.max(newCustomers + returningCustomers, 1);

  if (compact) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile title="Visitors now" value={String(viewerCountRightNow)} helper="Shoppers currently browsing product pages." accent="#38bdf8" />
        <MetricTile title="Sales today" value={formatMoney(totalSalesToday)} helper="Paid value captured so far today." accent="#10b981" />
        <MetricTile title="Orders today" value={String(ordersToday)} helper="Paid orders placed so far today." accent="#8b5cf6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-black/6 bg-[linear-gradient(180deg,#ffffff_0%,#f8fcff_100%)] p-5 shadow-[0_14px_34px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Live view</p>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#eefcf5] px-3 py-1 text-[12px] font-semibold text-[#13795b]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                Just now
              </span>
            </div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#202020]">Marketplace activity happening right now</h2>
            <p className="mt-2 text-[14px] leading-[1.65] text-[#57636c]">
              Follow live shopper movement, active checkout behavior, top regions, and paid order momentum across the platform.
            </p>
          </div>
          <p className="text-[12px] font-medium text-[#8b94a3]">{formatUpdatedAt(snapshot?.updatedAt)}</p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile title="Visitors right now" value={formatCompactNumber(viewerCountRightNow)} helper="Current live product viewers across the marketplace." accent="#38bdf8" />
        <MetricTile title="Total sales" value={formatMoney(totalSalesToday)} helper="Paid revenue captured so far today." accent="#10b981" />
        <MetricTile title="Sessions" value={formatCompactNumber(sessionsToday)} helper="Unique shopping sessions tracked today." accent="#0ea5e9" />
        <MetricTile title="Orders" value={formatCompactNumber(ordersToday)} helper="Paid orders placed so far today." accent="#8b5cf6" />
      </section>

      <div className="grid gap-4 2xl:grid-cols-[460px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="Customer behavior" subtitle="How shoppers are moving through the funnel right now.">
            <div className="grid gap-3 sm:grid-cols-3">
              {customerBehavior.map((entry) => (
                <div key={entry.label} className="rounded-[18px] border border-black/6 bg-[#fbfcff] p-4">
                  <p className="text-[12px] font-semibold text-[#7a8594]">{entry.label}</p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{toNum(entry.value)}</p>
                  <div className="mt-3 h-[3px] w-12 rounded-full" style={{ backgroundColor: entry.color || "#3b82f6" }} />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Sessions by location" subtitle="Where today's tracked sessions and paid orders are clustering.">
            <div className="space-y-3">
              {locations.length ? locations.map((entry, index) => (
                <div key={`${entry.label || "location"}-${index}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] font-medium text-[#202020]">{entry.label || "Unknown"}</p>
                    <span className="shrink-0 text-[13px] font-semibold text-[#202020]">{toNum(entry.value)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#edf2f7]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#0ea5e9,#38bdf8)]"
                      style={{ width: `${Math.max(12, Math.round((toNum(entry.value) / Math.max(toNum(locations[0]?.value), 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-[13px] text-[#7a8594]">Session locations will populate once more live marketplace activity is tracked.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="New vs returning customers" subtitle="Today's paid order split between first-time and repeat buyers.">
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-[12px] font-semibold">
                <span className="inline-flex items-center gap-2 text-[#0ea5e9]"><span className="h-2.5 w-2.5 rounded-full bg-[#0ea5e9]" />New</span>
                <span className="inline-flex items-center gap-2 text-[#7c3aed]"><span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" />Returning</span>
              </div>
              <div className="overflow-hidden rounded-[14px] bg-[#edf2f7]">
                <div className="flex h-12 w-full">
                  <div className="h-full bg-[#0ea5e9]" style={{ width: `${Math.round((newCustomers / customerTotal) * 100)}%` }} />
                  <div className="h-full bg-[#7c3aed]" style={{ width: `${Math.round((returningCustomers / customerTotal) * 100)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-[14px] border border-black/6 bg-[#fbfcff] p-3">
                  <p className="text-[#7a8594]">New</p>
                  <p className="mt-1 font-semibold text-[#202020]">{newCustomers}</p>
                </div>
                <div className="rounded-[14px] border border-black/6 bg-[#fbfcff] p-3">
                  <p className="text-[#7a8594]">Returning</p>
                  <p className="mt-1 font-semibold text-[#202020]">{returningCustomers}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top sales by product" subtitle="Products generating the strongest paid movement today.">
            <div className="space-y-2">
              {topProducts.length ? topProducts.map((product, index) => (
                <div key={`${product.productId || product.title || "product"}-${index}`} className="flex items-center justify-between gap-3 rounded-[16px] border border-black/6 bg-[#fbfcff] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#202020]">{product.title || "Product"}</p>
                    <p className="mt-1 text-[12px] text-[#7a8594]">{toNum(product.unitsSold)} units sold</p>
                  </div>
                  <p className="shrink-0 text-[14px] font-semibold text-[#202020]">{formatMoney(toNum(product.revenue))}</p>
                </div>
              )) : (
                <div className="rounded-[16px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                  No paid product sales have been recorded yet today.
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Live market map" subtitle="A visual pulse of where live demand and orders are showing up right now.">
            <WorldPulse locations={locations} viewers={viewerCountRightNow} orders={ordersToday} />
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Checkout pace" subtitle="How current session movement is converting into orders.">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[16px] border border-black/6 bg-[#fbfcff] p-4">
                  <p className="text-[12px] font-semibold text-[#7a8594]">Checkout sessions</p>
                  <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#202020]">{checkoutSessionsToday}</p>
                </div>
                <div className="rounded-[16px] border border-black/6 bg-[#fbfcff] p-4">
                  <p className="text-[12px] font-semibold text-[#7a8594]">Converted carts</p>
                  <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-[#202020]">{convertedCartsToday}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[18px] border border-black/6 bg-white p-4">
                <p className="text-[12px] text-[#7a8594]">Conversion pulse</p>
                <p className="mt-2 text-[22px] font-semibold text-[#202020]">
                  {checkoutSessionsToday > 0 ? `${Math.round((convertedCartsToday / checkoutSessionsToday) * 100)}%` : "0%"}
                </p>
                <p className="mt-1 text-[12px] text-[#6b7280]">Share of checkout sessions that have already turned into paid orders today.</p>
              </div>
            </SectionCard>

            <SectionCard title="Recent movement" subtitle="The latest order and checkout events coming through the platform.">
              <div className="space-y-2">
                {recentActivity.length ? recentActivity.map((entry, index) => (
                  <div key={`${entry.title || "activity"}-${index}`} className="flex items-start justify-between gap-3 rounded-[16px] border border-black/6 bg-[#fbfcff] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#202020]">{entry.title || "Activity"}</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">{entry.detail || "Live marketplace event"}</p>
                    </div>
                    <p className="shrink-0 text-[12px] font-medium text-[#7a8594]">{formatTime(entry.createdAt)}</p>
                  </div>
                )) : (
                  <div className="rounded-[16px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                    Recent live movement will appear here as activity comes in.
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SellerLiveCommerceWorkspace;
