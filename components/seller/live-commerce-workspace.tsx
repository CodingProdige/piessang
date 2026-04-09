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

type GeoPoint = {
  x: number;
  y: number;
  label: string;
  value: number;
};

const GEO_HINTS: Array<{ match: string; x: number; y: number }> = [
  { match: "africa", x: 55, y: 57 },
  { match: "south africa", x: 56, y: 79 },
  { match: "johannesburg", x: 58, y: 76 },
  { match: "gauteng", x: 58, y: 75 },
  { match: "cape town", x: 54, y: 82 },
  { match: "durban", x: 60, y: 78 },
  { match: "europe", x: 50, y: 29 },
  { match: "united states", x: 20, y: 37 },
  { match: "usa", x: 20, y: 37 },
  { match: "new york", x: 28, y: 35 },
  { match: "california", x: 14, y: 40 },
  { match: "canada", x: 18, y: 24 },
  { match: "brazil", x: 31, y: 68 },
  { match: "united kingdom", x: 47, y: 27 },
  { match: "uk", x: 47, y: 27 },
  { match: "england", x: 47, y: 27 },
  { match: "france", x: 49, y: 31 },
  { match: "germany", x: 52, y: 28 },
  { match: "netherlands", x: 50, y: 27 },
  { match: "spain", x: 47, y: 36 },
  { match: "italy", x: 54, y: 36 },
  { match: "middle east", x: 65, y: 45 },
  { match: "uae", x: 66, y: 46 },
  { match: "dubai", x: 67, y: 45 },
  { match: "asia", x: 77, y: 39 },
  { match: "india", x: 72, y: 48 },
  { match: "singapore", x: 78, y: 62 },
  { match: "indonesia", x: 80, y: 67 },
  { match: "china", x: 80, y: 35 },
  { match: "japan", x: 88, y: 37 },
  { match: "oceania", x: 86, y: 76 },
  { match: "australia", x: 86, y: 79 },
  { match: "uganda", x: 57, y: 61 },
  { match: "kenya", x: 59, y: 63 },
  { match: "nigeria", x: 48, y: 58 },
];

function normalizeGeoLabel(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function resolveGeoPoint(label: string, value: number): GeoPoint | null {
  const normalized = normalizeGeoLabel(label);
  const match = GEO_HINTS.find((entry) => normalized.includes(entry.match));
  if (!match) return null;
  return { x: match.x, y: match.y, label, value };
}

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
  const mappedLocations = topLocations
    .map((entry) => resolveGeoPoint(entry.label || "", toNum(entry.value)))
    .filter(Boolean) as GeoPoint[];
  const highlightedLocations = mappedLocations.slice(0, 3);
  const locationPeak = Math.max(...topLocations.map((entry) => toNum(entry.value)), 1);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-[#d7eefc] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.98),rgba(232,244,255,0.94)_42%,rgba(214,236,255,0.98)_100%)]">
        <svg
          viewBox="0 0 1000 520"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="world-water" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fdff" />
              <stop offset="100%" stopColor="#d6efff" />
            </linearGradient>
            <linearGradient id="world-land" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e5f6ff" />
            </linearGradient>
            <filter id="map-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="16" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.32 0"
              />
            </filter>
          </defs>
          <rect width="1000" height="520" fill="url(#world-water)" />
          <g stroke="rgba(14,165,233,0.14)" strokeWidth="1">
            <path d="M0 120H1000" />
            <path d="M0 200H1000" />
            <path d="M0 280H1000" />
            <path d="M0 360H1000" />
            <path d="M150 0V520" />
            <path d="M320 0V520" />
            <path d="M500 0V520" />
            <path d="M680 0V520" />
            <path d="M850 0V520" />
          </g>
          <g fill="url(#world-land)" stroke="#9ed8fb" strokeWidth="2" opacity="0.98">
            <path d="M84 138c28-30 83-41 125-32 25 5 36 18 57 24 27 7 55 4 81 18 17 9 30 25 35 46-11 17-27 25-47 31-18 5-39 3-58 5-28 2-59 17-82 3-15-9-19-30-39-38-23-8-52 1-68-18-13-16-16-27-4-39z" />
            <path d="M268 314c18-11 44-13 62-8 10 3 16 12 25 18 13 8 31 12 38 27 7 15 1 31-10 42-13 14-35 19-54 19-22 0-47-8-61-26-14-18-13-56 0-72z" />
            <path d="M440 132c24-19 70-25 103-20 31 4 57 21 78 44 13 15 29 26 44 37 15 12 31 30 25 50-5 17-25 24-43 29-33 10-69 1-103 3-25 1-46 13-70 16-29 3-62-4-76-28-15-25-10-63 8-88 11-15 19-32 34-43z" />
            <path d="M508 315c18-12 40-16 59-14 18 2 35 11 47 24 9 10 18 22 18 37 0 18-13 33-29 40-20 9-44 11-64 5-21-7-39-26-41-49-2-18-4-33 10-43z" />
            <path d="M680 164c38-25 97-29 143-19 30 7 57 23 76 47 18 21 39 35 58 53 13 12 23 31 15 47-9 17-34 21-55 24-39 5-79-3-118-1-25 1-48 10-73 10-24 0-54-5-70-24-17-21-20-53-9-78 7-16 18-32 33-41z" />
            <path d="M791 374c26-12 56-14 83-10 28 4 52 18 73 36 10 9 25 21 22 37-4 18-27 24-45 26-35 4-71 1-107 2-31 1-68 7-89-17-18-20-10-54 11-74 14-13 33-21 52-25z" />
          </g>
          {mappedLocations.map((entry, index) => {
            const pinX = entry.x * 10;
            const pinY = entry.y * 5.2;
            const pinColor = index === 0 ? "#8b5cf6" : "#0ea5e9";
            const pinSize = 6 + Math.round((entry.value / locationPeak) * 4);
            return (
              <g key={`${entry.label}-${index}`} transform={`translate(${pinX}, ${pinY})`}>
                <circle r={pinSize * 2.2} fill={pinColor} opacity="0.12" filter="url(#map-glow)" />
                <circle r={pinSize + 2} fill="#ffffff" opacity="0.92" />
                <circle r={pinSize} fill={pinColor} />
                <path d="M0 8 L0 24" stroke={pinColor} strokeWidth="3" strokeLinecap="round" />
              </g>
            );
          })}
          {highlightedLocations.map((entry, index) => {
            const pinX = entry.x * 10;
            const pinY = entry.y * 5.2;
            const pinColor = index === 0 ? "#8b5cf6" : "#0ea5e9";
            const labelDirection = pinX > 720 ? -1 : 1;
            const labelWidth = Math.min(260, Math.max(140, entry.label.length * 6));
            const labelX = pinX + labelDirection * 20;
            const labelY = Math.max(40, pinY - 36);
            return (
              <g key={`label-${entry.label}-${index}`}>
                <path
                  d={`M${pinX} ${pinY + 18} L${labelX} ${labelY + 18}`}
                  stroke={pinColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 5"
                  opacity="0.65"
                />
                <g transform={`translate(${labelDirection < 0 ? labelX - labelWidth : labelX}, ${labelY})`}>
                  <rect
                    width={labelWidth}
                    height="42"
                    rx="16"
                    fill="rgba(255,255,255,0.94)"
                    stroke={pinColor}
                    strokeOpacity="0.22"
                  />
                  <text x="14" y="17" fill="#202020" fontSize="12" fontWeight="700">
                    {entry.label.length > 28 ? `${entry.label.slice(0, 28)}...` : entry.label}
                  </text>
                  <text x="14" y="31" fill="#64748b" fontSize="11" fontWeight="600">
                    {entry.value} live signals
                  </text>
                </g>
              </g>
            );
          })}
          <g fill="#8aa4ba" fontSize="10" fontWeight="700" letterSpacing="0.16em" opacity="0.8">
            <text x="92" y="84">NORTH AMERICA</text>
            <text x="440" y="88">EUROPE</text>
            <text x="468" y="206">AFRICA</text>
            <text x="690" y="110">ASIA</text>
            <text x="794" y="402">AUSTRALIA</text>
            <text x="230" y="356">SOUTH AMERICA</text>
          </g>
          <g stroke="rgba(14,165,233,0.18)" strokeWidth="2" fill="none">
            <path d="M78 244c72 22 138 14 215-6 81-22 150-28 230-12 88 18 151 17 228-4 74-20 131-14 178 3" />
            <path d="M94 308c61 18 126 18 210 5 92-15 163-10 247 7 90 18 165 15 244-5 68-18 119-17 169-6" opacity="0.6" />
          </g>
          {!mappedLocations.length ? (
            <g>
              <text x="500" y="248" textAnchor="middle" fill="#64748b" fontSize="18" fontWeight="600">
                Waiting for enough location signals to plot the live map
              </text>
              <text x="500" y="274" textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight="500">
                Session and order geography will appear here automatically
              </text>
            </g>
          ) : null}
        </svg>
        <div className="absolute bottom-4 left-4 rounded-[14px] border border-black/6 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(20,24,27,0.08)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8594]">Live pulse</p>
          <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{formatCompactNumber(viewers)}</p>
          <p className="text-[12px] text-[#6b7280]">viewers right now</p>
          <p className="mt-2 text-[14px] font-semibold text-[#202020]">{formatCompactNumber(orders)} orders today</p>
        </div>
        <div className="absolute right-4 top-4 rounded-[14px] border border-black/6 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(20,24,27,0.08)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8594]">Map source</p>
          <p className="mt-2 text-[13px] font-semibold text-[#202020]">Live session + order regions</p>
          <p className="mt-1 max-w-[180px] text-[12px] leading-[1.5] text-[#6b7280]">
            Plotted from current marketplace activity. GA can be layered in later for richer traffic geography.
          </p>
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
    const interval = window.setInterval(load, 5000);
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
