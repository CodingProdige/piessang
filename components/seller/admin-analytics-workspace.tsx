"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PlatformPopover, PopoverHintTrigger } from "@/components/ui/platform-popover";
import { formatMoneyExact } from "@/lib/money";

type AdminAnalyticsWorkspaceProps = {
  vendorName?: string;
};

type TimeframeKey = "7d" | "30d" | "90d";

type SellerOrderSlice = {
  orderId: string;
  orderNumber?: string;
  createdAt?: string;
  channel?: string;
  customerName?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  fulfilmentDeadline?: {
    overdue?: boolean;
  };
  counts?: {
    quantity?: number;
  };
  totals?: {
    totalIncl?: number;
  };
  lines?: {
    selfFulfilment?: any[];
    piessangFulfilment?: any[];
  };
  deliveryProgress?: {
    isComplete?: boolean;
  };
  deliveryOption?: {
    type?: string;
    label?: string;
  };
  destination?: {
    label?: string;
    city?: string;
    province?: string;
  };
};

type SellerCustomerSummary = {
  total_customers?: number;
  total_orders?: number;
  customers?: Array<{
    customer_key?: string;
    name?: string;
    orders?: number;
    total_spent_incl?: number;
    last_order_at?: string | null;
  }>;
};

type SellerReturnEntry = {
  docId?: string;
  return?: {
    status?: string;
    amountIncl?: number;
    orderNumber?: string;
  };
  timestamps?: {
    createdAt?: string;
  };
};

type SellerProductEntry = {
  id?: string;
  data?: {
    product?: {
      title?: string;
    };
    placement?: {
      isActive?: boolean;
    };
    marketplace?: {
      firstPublishedAt?: string | null;
    };
    variants?: Array<{
      quantity?: number;
      inventory?: {
        quantity?: number;
      };
      sale?: {
        is_on_sale?: boolean;
      };
    }>;
  };
};

type SellerEngagementSummary = {
  totals?: {
    impressions?: number;
    clicks?: number;
    hovers?: number;
    productViews?: number;
    ctr?: number;
  };
  topProducts?: Array<{
    productId?: string;
    title?: string;
    impressions?: number;
    clicks?: number;
    hovers?: number;
    productViews?: number;
    ctr?: number;
  }>;
  daily?: Array<{
    dayKey?: string;
    impressions?: number;
    clicks?: number;
    hovers?: number;
    productViews?: number;
  }>;
};

type DeltaTone = "up" | "down" | "neutral";
type DeltaResult = { label: string; tone: DeltaTone; detail: string };

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
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
  }).format(value);
}

function formatDate(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sentenceCase(value?: string | null) {
  const normalized = toStr(value).replace(/_/g, " ");
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function daysForTimeframe(value: TimeframeKey) {
  if (value === "7d") return 7;
  if (value === "90d") return 90;
  return 30;
}

function isWithinDays(value: string | undefined, days: number, offsetDays = 0) {
  const input = toStr(value);
  if (!input) return false;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - offsetDays);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function compareNumber(current: number, previous: number): DeltaResult {
  if (previous <= 0) {
    if (current <= 0) return { label: "Flat", tone: "neutral", detail: "No movement versus previous period" };
    return { label: "+100%", tone: "up", detail: "Started moving from zero in the previous period" };
  }
  const delta = ((current - previous) / previous) * 100;
  if (!Number.isFinite(delta) || Math.round(delta) === 0) {
    return { label: "Flat", tone: "neutral", detail: "Holding steady versus previous period" };
  }
  const rounded = Math.round(delta);
  return {
    label: `${rounded > 0 ? "+" : ""}${rounded}%`,
    tone: rounded > 0 ? "up" : "down",
    detail: rounded > 0 ? "Ahead of previous period" : "Behind previous period",
  };
}

function compareMoney(current: number, previous: number): DeltaResult {
  if (previous <= 0) {
    if (current <= 0) return { label: "Flat", tone: "neutral", detail: "No movement versus previous period" };
    return { label: `+${formatMoney(current)}`, tone: "up", detail: "Started generating value from zero" };
  }
  const diff = current - previous;
  if (!diff) return { label: "Flat", tone: "neutral", detail: "Holding steady versus previous period" };
  return {
    label: `${diff > 0 ? "+" : "-"}${formatMoney(Math.abs(diff))}`,
    tone: diff > 0 ? "up" : "down",
    detail: diff > 0 ? "Ahead of previous period" : "Behind previous period",
  };
}

function deltaToneClass(tone: DeltaTone) {
  if (tone === "up") return "text-[#12925d]";
  if (tone === "down") return "text-[#c0392b]";
  return "text-[#7a8594]";
}

function buildTimeSeries<T>(
  items: T[],
  days: number,
  getDate: (item: T) => string | undefined,
  getValue: (item: T) => number,
) {
  return Array.from({ length: days }, (_, index) => {
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() - (days - 1 - index));
    const key = target.toISOString().slice(0, 10);
    const bucketItems = items.filter((item) => toStr(getDate(item)).slice(0, 10) === key);
    return {
      key,
      label: new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short" }).format(target),
      value: bucketItems.reduce((sum, item) => sum + getValue(item), 0),
      count: bucketItems.length,
    };
  });
}

function buildHeatmap(orders: SellerOrderSlice[], days: number) {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: Math.min(days, 13) }, () => 0));
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  orders.forEach((order) => {
    const createdAt = new Date(toStr(order.createdAt));
    if (Number.isNaN(createdAt.getTime()) || createdAt < start) return;
    const daysSinceStart = Math.floor((createdAt.getTime() - start.getTime()) / 86_400_000);
    const weekBucket = Math.min(matrix[0].length - 1, Math.floor(daysSinceStart / Math.max(1, Math.ceil(days / matrix[0].length))));
    const weekday = (createdAt.getDay() + 6) % 7;
    matrix[weekday][weekBucket] += 1;
  });

  return {
    labels,
    matrix,
    max: Math.max(...matrix.flat(), 1),
  };
}

function BoardCard({
  title,
  subtitle,
  helpText,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  helpText?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <section className={`relative overflow-visible rounded-[22px] border border-black/6 bg-white p-4 shadow-[0_10px_28px_rgba(20,24,27,0.05)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(20,24,27,0.08)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="relative min-w-0">
          {helpText ? (
            <button
              type="button"
              onClick={() => setInfoOpen((current) => !current)}
              onMouseEnter={() => setInfoOpen(true)}
              onMouseLeave={() => setInfoOpen(false)}
              className="text-left"
              aria-label={`About ${title}`}
            >
              <PopoverHintTrigger active={infoOpen} className="text-[15px] font-semibold text-[#202020]">
                {title}
              </PopoverHintTrigger>
            </button>
          ) : (
            <p className="text-[15px] font-semibold text-[#202020]">{title}</p>
          )}
          {subtitle ? <p className="mt-1 text-[12px] leading-[1.45] text-[#7a8594]">{subtitle}</p> : null}
          {helpText && infoOpen ? (
            <PlatformPopover className="left-0 right-auto top-7 z-20 mt-2 w-[min(280px,calc(100vw-64px))]">
              <p className="text-[14px] font-semibold text-[#202020]">{title}</p>
              <p className="mt-1 text-[12px] leading-[1.5] text-[#57636c]">{helpText}</p>
            </PlatformPopover>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function KpiTile({
  title,
  value,
  delta,
}: {
  title: string;
  value: string;
  delta: DeltaResult;
}) {
  return (
    <div className="min-w-0 rounded-[18px] border border-black/6 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(20,24,27,0.04)] transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(20,24,27,0.07)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">{title}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-[22px] font-semibold tracking-[-0.03em] text-[#202020] sm:text-[23px]">{value}</p>
        <span className={`shrink-0 text-[11px] font-semibold ${deltaToneClass(delta.tone)}`}>{delta.label}</span>
      </div>
      <p className="mt-1 text-[11px] text-[#8b94a3]">{delta.detail}</p>
    </div>
  );
}

function InteractiveLineChart({
  points,
  tone = "#3b82f6",
  mode = "money",
}: {
  points: Array<{ label: string; value: number; count?: number }>;
  tone?: string;
  mode?: "money" | "count";
}) {
  const [activeIndex, setActiveIndex] = useState(Math.max(points.length - 1, 0));
  const width = 680;
  const height = 240;
  const safePoints = points.length ? points : [{ label: "", value: 0, count: 0 }];
  const max = Math.max(...safePoints.map((point) => point.value), 1);
  const coords = safePoints.map((point, index) => {
    const x = safePoints.length === 1 ? width / 2 : (index / (safePoints.length - 1)) * width;
    const y = height - (point.value / max) * 170 - 26;
    return { ...point, x, y };
  });
  const activePoint = coords[Math.max(0, Math.min(activeIndex, coords.length - 1))];
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[220px] w-full overflow-visible"
        onMouseLeave={() => setActiveIndex(coords.length - 1)}
      >
        <defs>
          <linearGradient id="seller-analytics-area" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor={tone} stopOpacity="0.22" />
            <stop offset="100%" stopColor={tone} stopOpacity="0.02" />
          </linearGradient>
          <filter id="seller-analytics-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0.25, 0.5, 0.75].map((tick) => (
          <line
            key={tick}
            x1="0"
            x2={width}
            y1={height - tick * 180}
            y2={height - tick * 180}
            stroke="rgba(32,32,32,0.08)"
            strokeDasharray="4 6"
          />
        ))}
        <polygon points={area} fill="url(#seller-analytics-area)" />
        <polyline points={line} fill="none" stroke={tone} strokeOpacity="0.18" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" filter="url(#seller-analytics-glow)" />
        <polyline points={line} fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point, index) => (
          <g key={`${point.label}-${index}`} onMouseEnter={() => setActiveIndex(index)}>
            <circle cx={point.x} cy={point.y} r={activeIndex === index ? 8 : 6} fill={activeIndex === index ? tone : "white"} fillOpacity={activeIndex === index ? 0.12 : 1} stroke={tone} strokeWidth="3" />
            <circle cx={point.x} cy={point.y} r={activeIndex === index ? 4.5 : 3} fill={tone} />
            <rect x={point.x - 16} y={0} width={32} height={height} fill="transparent" />
          </g>
        ))}
      </svg>

      {activePoint ? (
        <div
          className="pointer-events-none absolute top-0 rounded-[14px] border border-black/8 bg-white/95 px-3 py-2 text-[12px] backdrop-blur-sm shadow-[0_14px_26px_rgba(20,24,27,0.14)]"
          style={{ left: `clamp(0px, calc(${(activePoint.x / width) * 100}% - 78px), calc(100% - 156px))` }}
        >
          <p className="font-semibold text-[#202020]">{activePoint.label}</p>
          <p className="mt-1 text-[#57636c]">
            {mode === "money" ? formatMoney(activePoint.value) : formatCompactNumber(activePoint.value)}
            {typeof activePoint.count === "number" ? ` • ${activePoint.count} orders` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DonutChart({
  items,
  centerLabel,
  centerValue,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = Math.max(items.reduce((sum, item) => sum + item.value, 0), 1);
  let offset = 0;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-[150px] w-[150px] shrink-0 sm:mx-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="40" fill="none" stroke="rgba(32,32,32,0.08)" strokeWidth="14" />
          {items.map((item) => {
            const dash = (item.value / total) * 251.2;
            const node = (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r="40"
                fill="none"
                stroke={item.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${251.2 - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += dash;
            return node;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">{centerLabel}</p>
          <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{centerValue}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-[13px]">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-[#57636c]">{item.label}</span>
            </div>
            <span className="shrink-0 font-semibold text-[#202020]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({
  items,
  formatter,
}: {
  items: Array<{ label: string; value: number; helper?: string }>;
  formatter: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="space-y-3">
      {items.length ? items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
            <div className="min-w-0">
              <p className="truncate font-medium text-[#202020]">{item.label}</p>
              {item.helper ? <p className="truncate text-[12px] text-[#8b94a3]">{item.helper}</p> : null}
            </div>
            <span className="whitespace-nowrap font-semibold text-[#202020]">{formatter(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#eef1f5]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#55b3ff,#1d7df2)]"
              style={{ width: `${Math.max(12, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </div>
      )) : <p className="text-[13px] text-[#7a8594]">No breakdown data yet for this period.</p>}
    </div>
  );
}

function HeatmapCard({
  labels,
  matrix,
  max,
}: {
  labels: string[];
  matrix: number[][];
  max: number;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[320px] grid-cols-[48px_repeat(13,minmax(18px,1fr))] gap-1.5">
        {Array.from({ length: 14 }).map((_, columnIndex) => (
          <div key={`top-${columnIndex}`} className="h-4 text-[10px] text-[#8b94a3]">
            {columnIndex === 0 ? "" : `W${columnIndex}`}
          </div>
        ))}
        {labels.map((label, rowIndex) => (
          <div key={label} className="contents">
            <div className="flex items-center text-[11px] font-medium text-[#57636c]">{label}</div>
            {matrix[rowIndex].map((value, columnIndex) => {
              const intensity = value <= 0 ? 0.06 : 0.18 + (value / max) * 0.82;
              return (
                <div
                  key={`${label}-${columnIndex}`}
                  className="flex aspect-square items-center justify-center rounded-[7px] text-[10px] font-semibold text-[#202020] transition-transform duration-150 hover:scale-[1.06]"
                  style={{ backgroundColor: `rgba(48,106,255,${intensity})` }}
                  title={`${label} • ${value} orders`}
                >
                  {value > 0 ? value : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "blue" | "slate" }) {
  const toneClass =
    tone === "green"
      ? "border-[#d1fae5] bg-[#ecfdf5] text-[#166534]"
      : tone === "amber"
        ? "border-[#fde68a] bg-[#fff7ed] text-[#8f7531]"
        : tone === "blue"
          ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
          : "border-black/8 bg-[#f8fafc] text-[#475569]";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{label}</span>;
}

function MiniActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-[12px] border border-black/8 bg-white px-3 text-[12px] font-semibold text-[#202020] transition hover:bg-[#f7f7f7]"
    >
      {children}
    </button>
  );
}

export function SellerAdminAnalyticsWorkspace({ vendorName = "Marketplace" }: AdminAnalyticsWorkspaceProps) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/client/v1/admin/analytics?timeframe=${encodeURIComponent(timeframe)}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load marketplace analytics.");
        }

        if (!cancelled) {
          setAnalyticsData(payload?.data || null);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load marketplace analytics.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [timeframe]);

  useEffect(() => {
    if (!copiedMessage) return undefined;
    const timeout = window.setTimeout(() => setCopiedMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [copiedMessage]);

  const safeAnalytics = useMemo(
    () =>
      analyticsData || {
        current: { revenue: 0, orders: 0, units: 0, delivered: 0, overdue: 0, avgOrder: 0 },
        previous: { revenue: 0, orders: 0, units: 0, delivered: 0, overdue: 0, avgOrder: 0 },
        salesSeries: [],
        orderSeries: [],
        topProducts: [],
        channelRevenue: [],
        deliveryMix: [],
        regionMix: [],
        totalCustomers: 0,
        repeatRate: 0,
        lastCustomer: null,
        currentReturns: [],
        openReturns: [],
        liveProductsCount: 0,
        outOfStockCount: 0,
        onSaleCount: 0,
        recentOrders: [],
        engagementCurrent: { impressions: 0, clicks: 0, hovers: 0, productViews: 0, ctr: 0 },
        engagementPrevious: { impressions: 0, clicks: 0, hovers: 0, productViews: 0, ctr: 0 },
        topEngagementProducts: [],
        engagementSeries: [],
        activeSellerCount: 0,
        orderSellerCount: 0,
      },
    [analyticsData],
  );
  const analyticsBoard = safeAnalytics;
  const analytics = analyticsBoard;

  const revenueDelta = compareMoney(analyticsBoard.current.revenue, analyticsBoard.previous.revenue);
  const ordersDelta = compareNumber(analyticsBoard.current.orders, analyticsBoard.previous.orders);
  const averageDelta = compareMoney(analyticsBoard.current.avgOrder, analyticsBoard.previous.avgOrder);
  const viewsDelta = compareNumber(analyticsBoard.engagementCurrent.productViews, analyticsBoard.engagementPrevious.productViews);
  const clicksDelta = compareNumber(analyticsBoard.engagementCurrent.clicks, analyticsBoard.engagementPrevious.clicks);
  const ctrDelta = compareNumber(analyticsBoard.engagementCurrent.ctr, analyticsBoard.engagementPrevious.ctr);
  const periodLabel = timeframe === "7d" ? "Last 7 days" : timeframe === "30d" ? "Last 30 days" : "Last 90 days";
  const nextPayoutLabel = analyticsBoard.current.overdue
    ? `${analyticsBoard.current.overdue} overdue marketplace order${analyticsBoard.current.overdue === 1 ? "" : "s"}`
    : analyticsBoard.current.delivered > 0
      ? `${analyticsBoard.current.delivered} delivered marketplace order${analyticsBoard.current.delivered === 1 ? "" : "s"}`
      : "No deliveries yet";

  const deliveryDonut = analyticsBoard.deliveryMix.map((entry: { label: string; value: number }, index: number) => ({
    ...entry,
    color: ["#3b82f6", "#14b8a6", "#a855f7", "#f59e0b"][index % 4],
  }));

  function exportBoardSummary() {
    const lines = [
      `${vendorName || "Marketplace"} analytics`,
      `Timeframe: ${periodLabel}`,
      `Gross sales: ${formatMoney(analyticsBoard.current.revenue)}`,
      `Orders: ${analyticsBoard.current.orders}`,
      `Average order: ${formatMoney(analyticsBoard.current.avgOrder)}`,
      `Items sold: ${analyticsBoard.current.units}`,
    ];
    void navigator.clipboard.writeText(lines.join("\n")).then(() => setCopiedMessage("Analytics summary copied."));
  }

  function shareRevenueSnapshot() {
    const text = `${vendorName || "Marketplace"} • ${periodLabel} • ${formatMoney(analyticsBoard.current.revenue)} from ${analyticsBoard.current.orders} orders`;
    void navigator.clipboard.writeText(text).then(() => setCopiedMessage("Revenue snapshot copied."));
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-black/6 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_14px_34px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Analytics overview</p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#202020]">{vendorName || "Marketplace"} performance</h2>
            <p className="mt-2 text-[14px] leading-[1.65] text-[#57636c]">
              A compact board of sales, product movement, fulfilment health, and where demand is coming from.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["7d", "30d", "90d"] as TimeframeKey[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTimeframe(option)}
                className={`inline-flex h-11 items-center rounded-[14px] border px-4 text-[14px] font-semibold transition ${
                  timeframe === option
                    ? "border-[#202020] bg-[#202020] text-white"
                    : "border-black/10 bg-white text-[#202020]"
                }`}
              >
                {option === "7d" ? "Last 7 days" : option === "30d" ? "Last 30 days" : "Last 90 days"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[22px] border border-black/6 bg-white px-5 py-10 text-[14px] text-[#57636c] shadow-[0_10px_28px_rgba(20,24,27,0.05)]">
          Loading analytics...
        </div>
      ) : error ? (
        <div className="rounded-[22px] border border-[#f0c7cb] bg-[#fff7f8] px-5 py-4 text-[13px] text-[#b91c1c] shadow-[0_10px_28px_rgba(20,24,27,0.05)]">
          {error}
        </div>
      ) : (
        <>
          {copiedMessage ? (
            <div className="rounded-[14px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] font-semibold text-[#166534] shadow-[0_10px_24px_rgba(20,24,27,0.06)]">
              {copiedMessage}
            </div>
          ) : null}

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <KpiTile title="Gross sales" value={formatMoney(analytics.current.revenue)} delta={revenueDelta} />
            <KpiTile title="Orders" value={String(analytics.current.orders)} delta={ordersDelta} />
            <KpiTile title="Average order" value={formatMoney(analytics.current.avgOrder)} delta={averageDelta} />
            <KpiTile title="Product views" value={formatCompactNumber(analytics.engagementCurrent.productViews)} delta={viewsDelta} />
          </section>

          <section className="columns-1 gap-4 md:columns-2 xl:columns-3">
            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Sales over time"
                subtitle={`${periodLabel} revenue trend and order pace.`}
                helpText="Tracks seller revenue across the selected timeframe using frozen seller order totals, with comparison against the immediately previous period."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label={nextPayoutLabel} tone={analytics.current.overdue ? "amber" : "green"} />
                    <MiniActionButton onClick={shareRevenueSnapshot}>Copy snapshot</MiniActionButton>
                  </div>
                }
              >
                <div className="space-y-3">
                  <div className="rounded-[18px] border border-black/6 bg-[linear-gradient(180deg,#fbfdff_0%,#ffffff_100%)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Total sales</p>
                        <p className="mt-2 text-[27px] font-semibold tracking-[-0.04em] text-[#202020] sm:text-[29px]">{formatMoney(analytics.current.revenue)}</p>
                        <p className={`mt-2 text-[13px] font-semibold ${deltaToneClass(revenueDelta.tone)}`}>{revenueDelta.label} vs previous period</p>
                      </div>
                      <div className="rounded-[16px] border border-black/6 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(20,24,27,0.04)]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Orders this period</p>
                        <p className="mt-2 text-[20px] font-semibold text-[#202020]">{analytics.current.orders}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <InteractiveLineChart points={analytics.salesSeries} tone="#3b82f6" mode="money" />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_8px_18px_rgba(20,24,27,0.04)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Previous period</p>
                      <p className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-[#202020]">{formatMoney(analytics.previous.revenue)}</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">
                        {analytics.previous.orders ? `${analytics.previous.orders} orders in the prior window` : "No previous-period sales yet"}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_8px_18px_rgba(20,24,27,0.04)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Repeat rate</p>
                      <p className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-[#202020]">{analytics.repeatRate}%</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">Share of tracked customers placing more than one order</p>
                    </div>
                    <div className="rounded-[18px] border border-black/6 bg-white p-4 shadow-[0_8px_18px_rgba(20,24,27,0.04)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Marketplace health</p>
                      <div className="mt-3 space-y-2 text-[13px]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#57636c]">Overdue orders</span>
                          <span className="font-semibold text-[#202020]">{analytics.current.overdue}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#57636c]">Open returns</span>
                          <span className="font-semibold text-[#202020]">{analytics.openReturns.length}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[#57636c]">Out of stock</span>
                          <span className="font-semibold text-[#202020]">{analytics.outOfStockCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Revenue breakdown"
                subtitle="Where current sales are coming from."
                helpText="Shows how much revenue each sales channel contributed in the selected timeframe, so you can see where current demand is actually landing."
                actions={<MiniActionButton onClick={exportBoardSummary}>Copy board</MiniActionButton>}
              >
                <div className="space-y-4">
                  <HorizontalBars
                    items={analytics.channelRevenue.map((entry: { label: string; value: number }) => ({
                      label: entry.label,
                      value: entry.value,
                      helper: `${Math.round((entry.value / Math.max(analytics.current.revenue, 1)) * 100)}% of sales`,
                    }))}
                    formatter={(value) => formatMoney(value)}
                  />
                </div>
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Delivery mix"
                subtitle="How this period's orders were fulfilled."
                helpText="Breaks orders down by the selected delivery method labels captured on seller orders for this period."
              >
                <DonutChart
                  items={deliveryDonut.length ? deliveryDonut : [{ label: "No orders", value: 1, color: "#cbd5e1" }]}
                  centerLabel="Orders"
                  centerValue={String(analytics.current.orders)}
                />
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Order volume trend"
                subtitle="Daily order count across the selected period."
                helpText="Shows how many seller orders landed each day in the selected timeframe, helping you spot bursts and quieter stretches."
              >
                <InteractiveLineChart points={analytics.orderSeries} tone="#14b8a6" mode="count" />
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Product engagement"
                subtitle="What shoppers are noticing and opening."
                helpText="Combines tracked product-card impressions, card clicks, hover intent, and product-detail views so you can see which catalogue items are actually attracting attention."
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Views</p>
                      <p className="mt-2 truncate text-[20px] font-semibold text-[#202020] sm:text-[22px]">{analytics.engagementCurrent.productViews}</p>
                      <p className={`mt-1 text-[11px] font-semibold ${deltaToneClass(viewsDelta.tone)}`}>{viewsDelta.label}</p>
                    </div>
                    <div className="min-w-0 rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Clicks</p>
                      <p className="mt-2 truncate text-[20px] font-semibold text-[#202020] sm:text-[22px]">{analytics.engagementCurrent.clicks}</p>
                      <p className={`mt-1 text-[11px] font-semibold ${deltaToneClass(clicksDelta.tone)}`}>{clicksDelta.label}</p>
                    </div>
                    <div className="min-w-0 rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">CTR</p>
                      <p className="mt-2 truncate text-[20px] font-semibold text-[#202020] sm:text-[22px]">{analytics.engagementCurrent.ctr.toFixed(2)}%</p>
                      <p className={`mt-1 text-[11px] font-semibold ${deltaToneClass(ctrDelta.tone)}`}>{ctrDelta.label}</p>
                    </div>
                    <div className="min-w-0 rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Hovers</p>
                      <p className="mt-2 truncate text-[20px] font-semibold text-[#202020] sm:text-[22px]">{analytics.engagementCurrent.hovers}</p>
                      <p className="mt-1 text-[11px] text-[#8b94a3]">{analytics.engagementCurrent.impressions} impressions</p>
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-black/6 bg-[linear-gradient(180deg,#fbfdff_0%,#ffffff_100%)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">View trend</p>
                    <div className="mt-3">
                      <InteractiveLineChart
                        points={
                          analytics.engagementSeries.length
                            ? analytics.engagementSeries
                            : [{ label: periodLabel, value: 0, count: 0 }]
                        }
                        tone="#2563eb"
                        mode="count"
                      />
                    </div>
                  </div>
                  {analytics.topEngagementProducts.length ? (
                    <div className="space-y-2">
                      {analytics.topEngagementProducts.slice(0, 5).map((product: any) => (
                        <div key={product.productId || product.title} className="rounded-[14px] border border-black/6 bg-[#fafafa] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-[#202020]">{product.title || "Product"}</p>
                              <p className="mt-1 text-[12px] text-[#57636c]">
                                {toNum(product.productViews)} views • {toNum(product.clicks)} clicks • {toNum(product.impressions)} impressions
                              </p>
                            </div>
                            <span className="shrink-0 text-[12px] font-semibold text-[#2563eb]">{toNum(product.ctr).toFixed(2)}%</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                            <div className="rounded-[10px] border border-black/6 bg-white px-2 py-2">
                              <p className="text-[#8b94a3]">Views</p>
                              <p className="mt-1 font-semibold text-[#202020]">{toNum(product.productViews)}</p>
                            </div>
                            <div className="rounded-[10px] border border-black/6 bg-white px-2 py-2">
                              <p className="text-[#8b94a3]">Clicks</p>
                              <p className="mt-1 font-semibold text-[#202020]">{toNum(product.clicks)}</p>
                            </div>
                            <div className="rounded-[10px] border border-black/6 bg-white px-2 py-2">
                              <p className="text-[#8b94a3]">Hovers</p>
                              <p className="mt-1 font-semibold text-[#202020]">{toNum(product.hovers)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-6 text-[13px] text-[#7a8594]">
                      Product engagement will populate once shoppers start viewing and opening this seller&apos;s products.
                    </div>
                  )}
                </div>
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Top products"
                subtitle="The products pulling the most revenue in this period."
                helpText="Ranks the seller's strongest products in the selected timeframe by revenue contribution, with units and order reach beside each one."
              >
                {analytics.topProducts.length ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                      <div className="grid grid-cols-[minmax(0,1.5fr)_110px_90px_90px_70px] gap-3 border-b border-black/6 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">
                        <span>Product</span>
                        <span>Revenue</span>
                        <span>Units</span>
                        <span>Orders</span>
                        <span>Share</span>
                      </div>
                      <div className="divide-y divide-black/6">
                        {analytics.topProducts.map((product: any) => {
                          const share = analytics.current.revenue > 0 ? Math.round((product.revenue / analytics.current.revenue) * 100) : 0;
                          return (
                            <div key={product.title} className="grid grid-cols-[minmax(0,1.5fr)_110px_90px_90px_70px] items-center gap-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-semibold text-[#202020]">{product.title}</p>
                                <p className="mt-1 text-[12px] text-[#8b94a3]">{product.orders} order{product.orders === 1 ? "" : "s"} • {product.units} units</p>
                              </div>
                              <div className="text-[13px] font-semibold text-[#202020]">{formatMoney(product.revenue)}</div>
                              <div className="text-[13px] text-[#57636c]">{product.units}</div>
                              <div className="text-[13px] text-[#57636c]">{product.orders}</div>
                              <div className="text-[13px] font-semibold text-[#2563eb]">{share}%</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-6 text-[13px] text-[#7a8594]">
                    Top products will appear here once this seller has enough sales activity in the selected period.
                  </div>
                )}
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Sales by region"
                subtitle="Where orders are being placed from."
                helpText="Shows which destination provinces or cities are driving the most order volume in the selected timeframe."
              >
                <HorizontalBars
                  items={analytics.regionMix.map((entry: { label: string; value: number }) => ({ label: entry.label, value: entry.value }))}
                  formatter={(value) => `${value} orders`}
                />
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Customers"
                subtitle="A compact view of buyer activity."
                helpText="Summarizes customer count, repeat rate, and the latest known buyer activity for this seller in the selected period."
              >
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Count</p>
                      <p className="mt-2 text-[21px] font-semibold text-[#202020]">{analytics.totalCustomers}</p>
                    </div>
                    <div className="rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Repeat</p>
                      <p className="mt-2 text-[21px] font-semibold text-[#202020]">{analytics.repeatRate}%</p>
                    </div>
                    <div className="rounded-[16px] border border-black/6 bg-[#fbfbfb] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Live products</p>
                      <p className="mt-2 text-[21px] font-semibold text-[#202020]">{analytics.liveProductsCount}</p>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-black/6 bg-[#fafafa] p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Last customer</p>
                    {analytics.lastCustomer ? (
                      <>
                        <p className="mt-2 text-[16px] font-semibold text-[#202020]">{analytics.lastCustomer.name || "Customer"}</p>
                        <p className="mt-1 text-[12px] text-[#57636c]">
                          {analytics.lastCustomer.orders || 0} order{toNum(analytics.lastCustomer.orders) === 1 ? "" : "s"} • last seen {formatDate(analytics.lastCustomer.last_order_at)}
                        </p>
                      </>
                    ) : (
                      <div className="mt-2 rounded-[14px] border border-dashed border-black/10 bg-white px-3 py-4 text-[13px] text-[#7a8594]">
                        No customer activity yet in this timeframe.
                      </div>
                    )}
                  </div>
                </div>
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Recent order movement"
                subtitle="The latest orders contributing to this period."
                helpText="Shows the newest seller orders in the current timeframe so you can quickly see what is contributing to recent movement."
              >
                <div className="space-y-2">
                  {analytics.recentOrders.length ? analytics.recentOrders.map((order: any) => (
                    <div key={`${order.orderId}-${order.orderNumber || "order"}`} className="rounded-[16px] border border-black/6 bg-[#fafafa] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-[#202020]">{order.orderNumber || order.orderId}</p>
                          <p className="mt-1 text-[12px] text-[#57636c]">{order.customerName || "Customer"} • {formatDateTime(order.createdAt)}</p>
                        </div>
                        <span className="text-[13px] font-semibold text-[#202020]">{formatMoney(toNum(order?.amount))}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[18px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-6 text-[13px] text-[#7a8594]">
                      No recent order movement in this period yet.
                    </div>
                  )}
                </div>
              </BoardCard>
            </div>

            <div className="mb-4 [break-inside:avoid]">
              <BoardCard
                title="Store watchlist"
                subtitle="The things most likely to need attention next."
                helpText="Flags the operational states most likely to affect seller performance next, including overdue fulfilment, returns, stock gaps, and live sale pressure."
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-[16px] border border-black/6 bg-[#fbfbfb] px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#202020]">Overdue fulfilment</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">Orders that have passed the seller lead time</p>
                    </div>
                    <StatusPill label={String(analytics.current.overdue)} tone={analytics.current.overdue ? "amber" : "green"} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[16px] border border-black/6 bg-[#fbfbfb] px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#202020]">Open returns</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">Returns still waiting for closure</p>
                    </div>
                    <StatusPill label={String(analytics.openReturns.length)} tone={analytics.openReturns.length ? "amber" : "green"} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[16px] border border-black/6 bg-[#fbfbfb] px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#202020]">Out of stock</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">Live products with no sellable stock</p>
                    </div>
                    <StatusPill label={String(analytics.outOfStockCount)} tone={analytics.outOfStockCount ? "amber" : "green"} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[16px] border border-black/6 bg-[#fbfbfb] px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#202020]">Products on sale</p>
                      <p className="mt-1 text-[12px] text-[#7a8594]">Live products currently discounted</p>
                    </div>
                    <StatusPill label={String(analytics.onSaleCount)} tone={analytics.onSaleCount ? "blue" : "slate"} />
                  </div>
                </div>
              </BoardCard>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default SellerAdminAnalyticsWorkspace;
