"use client";

import { useEffect, useState } from "react";

type LiveCommerceSnapshot = {
  activeCarts?: number;
  checkingOut?: number;
  purchased?: number;
  todayVisitors?: number;
  checkoutSessionsToday?: number;
  convertedCartsToday?: number;
  topSoldProductsToday?: Array<{
    productId?: string;
    title?: string;
    unitsSold?: number;
  }>;
  updatedAt?: string | null;
  windows?: {
    activeCartMinutes?: number;
    checkoutMinutes?: number;
    purchasedHours?: number;
  };
};

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
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
    day: "numeric",
    month: "short",
  }).format(date)}`;
}

function MetricCard({
  label,
  value,
  tone = "default",
  helper,
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
  helper: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-[#1a8553]"
      : tone === "warning"
        ? "text-[#b45309]"
        : "text-[#202020]";

  return (
    <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">{label}</p>
      <p className={`mt-3 text-[28px] font-semibold leading-none ${toneClass}`}>{value}</p>
      <p className="mt-2 text-[12px] leading-[1.6] text-[#57636c]">{helper}</p>
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

  if (loading) {
    return (
      <div className={compact ? "grid gap-3 sm:grid-cols-3" : "space-y-4"}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-[#ece8df]" />
            <div className="mt-4 h-8 w-20 animate-pulse rounded bg-[#f1ede4]" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-[#f5f1e8]" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
        {error}
      </div>
    );
  }

  const activeCarts = Number(snapshot?.activeCarts || 0);
  const checkingOut = Number(snapshot?.checkingOut || 0);
  const purchased = Number(snapshot?.purchased || 0);
  const todayVisitors = Number(snapshot?.todayVisitors || 0);
  const checkoutSessionsToday = Number(snapshot?.checkoutSessionsToday || 0);
  const convertedCartsToday = Number(snapshot?.convertedCartsToday || 0);
  const topSoldProductsToday = Array.isArray(snapshot?.topSoldProductsToday) ? snapshot.topSoldProductsToday : [];

  return (
    <div className="space-y-4">
      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Live commerce</p>
            <h2 className="mt-1 text-[22px] font-semibold text-[#202020]">Customer activity happening right now</h2>
          </div>
          <p className="text-[12px] font-medium text-[#8b94a3]">{formatUpdatedAt(snapshot?.updatedAt)}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Active carts"
          value={activeCarts}
          tone="warning"
          helper={`Customers with items in cart in the last ${Number(snapshot?.windows?.activeCartMinutes || 60)} minutes.`}
        />
        <MetricCard
          label="Checking out"
          value={checkingOut}
          tone="default"
          helper={`Customers currently in checkout in the last ${Number(snapshot?.windows?.checkoutMinutes || 30)} minutes.`}
        />
        <MetricCard
          label="Purchased"
          value={purchased}
          tone="success"
          helper={`Paid orders captured in the last ${Number(snapshot?.windows?.purchasedHours || 24)} hours.`}
        />
      </div>

      {!compact ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Visitors today"
              value={todayVisitors}
              tone="default"
              helper="Unique shoppers who viewed products today."
            />
            <MetricCard
              label="Checkout sessions"
              value={checkoutSessionsToday}
              tone="warning"
              helper="Checkout sessions started today."
            />
            <MetricCard
              label="Converted carts"
              value={convertedCartsToday}
              tone="success"
              helper="Carts that became paid orders today."
            />
          </div>

          <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Top sold today</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">Best-selling products for today</h3>
              </div>
            </div>

            {topSoldProductsToday.length ? (
              <div className="mt-4 space-y-2">
                {topSoldProductsToday.map((product, index) => (
                  <div
                    key={`${product.productId || product.title || "product"}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">
                        #{index + 1}
                      </p>
                      <p className="mt-1 truncate text-[14px] font-semibold text-[#202020]">
                        {product?.title || "Product"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[18px] font-semibold text-[#202020]">
                        {formatCompactNumber(Number(product?.unitsSold || 0))}
                      </p>
                      <p className="text-[12px] text-[#57636c]">units sold</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                No paid product sales have been recorded yet today.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
