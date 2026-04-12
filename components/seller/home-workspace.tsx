"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { formatMoneyExact } from "@/lib/money";
import { sellerDeliverySettingsReady } from "@/lib/seller/delivery-profile";

type SellerHomeWorkspaceProps = {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
  onNavigate: (section: "settings" | "products" | "create-product" | "new-orders" | "notifications" | "settlements") => void;
};

type TimeframeKey = "7d" | "30d" | "90d";

type SellerOrderSlice = {
  createdAt?: string;
  flags?: {
    new?: boolean;
    unfulfilled?: boolean;
    fulfilled?: boolean;
  };
  totals?: {
    totalIncl?: number;
  };
};

type SetupTask = {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  actionLabel: string;
  action: () => void;
};

type AssistantMessage = {
  role: "assistant" | "user";
  content: string;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number) {
  return formatMoneyExact(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function daysForTimeframe(value: TimeframeKey) {
  if (value === "7d") return 7;
  if (value === "90d") return 90;
  return 30;
}

function isWithinTimeframe(value: string, days: number) {
  const input = new Date(value);
  if (Number.isNaN(input.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return input.getTime() >= start.getTime();
}

function buildSeries(items: SellerOrderSlice[], days: number, mode: "sales" | "orders") {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { key: date.toISOString().slice(0, 10), value: 0 };
  });
  const map = new Map(buckets.map((entry) => [entry.key, entry]));

  for (const item of items) {
    const createdAt = toStr(item?.createdAt);
    if (!createdAt) continue;
    const key = createdAt.slice(0, 10);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (mode === "sales") {
      bucket.value += Number(item?.totals?.totalIncl || 0);
    } else {
      bucket.value += 1;
    }
  }

  return buckets.map((entry) => entry.value);
}

function Sparkline({ data }: { data: number[] }) {
  const safe = Array.isArray(data) && data.length ? data : [0, 0, 0, 0];
  const width = 120;
  const height = 34;
  const max = Math.max(...safe, 1);
  const points = safe.map((value, index) => {
    const x = safe.length === 1 ? width / 2 : (index / (safe.length - 1)) * width;
    const y = height - (value / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-[120px]" fill="none" aria-hidden="true">
      <path d={`M0 ${height - 1} H${width}`} stroke="rgba(15,128,195,0.16)" strokeWidth="1" />
      <polygon points={areaPoints} fill="rgba(15,128,195,0.12)" />
      <polyline points={points.join(" ")} stroke="#0f80c3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChecklistProgress({ items }: { items: SetupTask[] }) {
  const total = items.length || 1;
  const complete = items.filter((item) => item.complete).length;
  const percentage = Math.round((complete / total) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/8">
        <div className="h-full rounded-full bg-[#0f80c3] transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-[12px] font-semibold text-[#202020]">{complete}/{total}</span>
    </div>
  );
}

function buildAssistantReply(input: string) {
  const query = toStr(input).toLowerCase();
  if (!query) {
    return "Ask me about payouts, delivery rules, product publishing, orders, or returns and I’ll point you to the right Piessang workflow.";
  }
  if (query.includes("payout") || query.includes("stripe") || query.includes("bank")) {
    return "Piessang pays sellers out through Wise payout setup in your seller settings. Connect your payout profile first, then your settlements move from gross sales to fees, refund adjustments, and finally net due.";
  }
  if (query.includes("delivery") || query.includes("shipping") || query.includes("courier") || query.includes("pickup")) {
    return "Your delivery rules tell Piessang whether an order should go out by local delivery, country shipping, or collection. Set those up in Seller settings so orders can calculate the right delivery method and lead time automatically.";
  }
  if (query.includes("publish") || query.includes("product") || query.includes("catalogue")) {
    return "A product is ready to publish once its details, variants, fulfilment setup, pricing, and stock are complete. Start in Products, add your first item, then publish it once moderation and availability are in a good state.";
  }
  if (query.includes("return") || query.includes("refund") || query.includes("credit")) {
    return "Customers log returns from their order page. Once a return is approved and refunded, Piessang keeps the original invoice intact and issues a separate credit note for the adjustment so the accounting trail stays clean.";
  }
  if (query.includes("order") || query.includes("fulfil")) {
    return "New seller orders land in Orders. Move them forward in sequence, capture courier details when shipping is involved, and keep statuses moving forward only so the customer and your own timeline stay accurate.";
  }
  if (query.includes("how") || query.includes("work")) {
    return "Piessang lets you set up your seller profile, configure delivery and payouts, publish products, fulfil orders, and track settlements from one dashboard. The setup guide on this page is the fastest path to becoming sell-ready.";
  }
  return "I can help with seller setup, product publishing, delivery rules, payouts, orders, returns, and settlements. Try asking one of those directly and I’ll answer in Piessang terms.";
}

const FAQ_ITEMS = [
  {
    question: "What do I need before I can start selling?",
    answer:
      "Complete your seller business details, connect payouts, set delivery rules, and publish at least one active product. Once those core pieces are done, your setup guide disappears automatically.",
  },
  {
    question: "How do orders flow on Piessang?",
    answer:
      "Orders move from newly placed into processing, dispatch, and delivered states depending on your fulfilment method. Shipping orders should capture courier details, while local delivery and collection follow their own seller actions.",
  },
  {
    question: "How do payouts and settlements work?",
    answer:
      "Settlements show your gross sales, platform fees, refund adjustments, and net due. Payouts depend on your Wise payout setup being connected and verified.",
  },
  {
    question: "What happens when a customer requests a return?",
    answer:
      "Returns appear in your Returns workspace. Once approved and refunded, the original invoice remains unchanged and Piessang issues a linked credit note for the adjustment.",
  },
  {
    question: "How do followers and notifications help me?",
    answer:
      "Customers can follow your public seller profile. You get seller notifications for new followers and other seller events, and customers can be alerted when you release new products or when favourited items change state.",
  },
];

const ASSISTANT_SUGGESTIONS = [
  "How do payouts work on Piessang?",
  "What do I need before publishing my first product?",
  "How do delivery rules affect orders?",
  "How do returns and credit notes work?",
];

export function SellerHomeWorkspace({
  sellerSlug,
  sellerCode,
  vendorName,
  onNavigate,
}: SellerHomeWorkspaceProps) {
  const { uid } = useAuth();
  const [timeframe, setTimeframe] = useState<TimeframeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [stripeStatus, setStripeStatus] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<SellerOrderSlice[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      content:
        "Ask me about getting set up on Piessang. I can explain payouts, delivery rules, product publishing, orders, returns, and settlements.",
    },
  ]);
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ_ITEMS[0]?.question || null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!sellerSlug && !sellerCode) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const settingsPromise = fetch(`/api/client/v1/accounts/seller/settings/get?sellerSlug=${encodeURIComponent(sellerSlug)}`, { cache: "no-store" });
        const payoutStatusPromise = uid
          ? fetch(
              `/api/payouts/recipient/status?uid=${encodeURIComponent(uid)}&sellerId=${encodeURIComponent(sellerSlug)}`,
              { cache: "no-store" },
            )
          : Promise.resolve(null);
        const productsPromise = fetch(
          `/api/catalogue/v1/products/product/get?limit=all&includeUnavailable=true&vendorName=${encodeURIComponent(vendorName)}`,
          { cache: "no-store" },
        );
        const ordersPromise = fetch(
          `/api/client/v1/orders/seller/list?${sellerCode ? `sellerCode=${encodeURIComponent(sellerCode)}` : `sellerSlug=${encodeURIComponent(sellerSlug)}`}`,
          { cache: "no-store" },
        );
        const followersPromise = fetch(
          `/api/client/v1/accounts/seller/follow?${sellerCode ? `sellerCode=${encodeURIComponent(sellerCode)}` : `sellerSlug=${encodeURIComponent(sellerSlug)}`}`,
          { cache: "no-store" },
        );
        const notificationsPromise = fetch(
          `/api/client/v1/accounts/seller/notifications?${sellerCode ? `sellerCode=${encodeURIComponent(sellerCode)}` : `sellerSlug=${encodeURIComponent(sellerSlug)}`}`,
          { cache: "no-store" },
        );

        const [settingsResponse, payoutStatusResponse, productsResponse, ordersResponse, followersResponse, notificationsResponse] = await Promise.all([
          settingsPromise,
          payoutStatusPromise,
          productsPromise,
          ordersPromise,
          followersPromise,
          notificationsPromise,
        ]);

        const settingsPayload = await settingsResponse.json().catch(() => ({}));
        const payoutStatusPayload = payoutStatusResponse ? await payoutStatusResponse.json().catch(() => ({})) : {};
        const productsPayload = await productsResponse.json().catch(() => ({}));
        const ordersPayload = await ordersResponse.json().catch(() => ({}));
        const followersPayload = await followersResponse.json().catch(() => ({}));
        const notificationsPayload = await notificationsResponse.json().catch(() => ({}));

        if (!settingsResponse.ok || settingsPayload?.ok === false) {
          throw new Error(settingsPayload?.message || "Unable to load seller setup details.");
        }

        if (!cancelled) {
          setSettingsData(settingsPayload);
          setStripeStatus(payoutStatusResponse && payoutStatusResponse.ok && payoutStatusPayload?.ok !== false ? payoutStatusPayload?.data || null : null);
          setProducts(Array.isArray(productsPayload?.items) ? productsPayload.items : []);
          setOrders(Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
          setFollowerCount(Number(followersPayload?.followerCount || 0));
          setUnreadNotifications(Number(notificationsPayload?.unreadCount || 0));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load your seller home workspace.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sellerCode, sellerSlug, uid, vendorName]);

  const deliveryProfile = settingsData?.deliveryProfile || {};
  const branding = settingsData?.branding || {};
  const businessDetails = settingsData?.businessDetails || {};
  const payoutReady = Boolean(
    stripeStatus?.payoutsEnabled === true &&
      stripeStatus?.hasBankDestination === true,
  );
  const businessReady = Boolean(
    toStr(businessDetails?.companyName) &&
      (toStr(businessDetails?.email) || toStr(businessDetails?.phoneNumber)),
  );
  const brandingReady = Boolean(toStr(branding?.bannerImageUrl) && toStr(branding?.logoImageUrl));
  const deliveryReady = sellerDeliverySettingsReady(deliveryProfile);
  const publishedProducts = products.filter((item) => item?.data?.placement?.isActive).length;
  const firstProductReady = publishedProducts > 0;

  const setupTasks = useMemo<SetupTask[]>(
    () => [
      {
        id: "business",
        title: "Complete your business profile",
        description: "Add your business details so your seller profile, invoices, and account records are complete.",
        complete: businessReady,
        actionLabel: businessReady ? "Review settings" : "Add business details",
        action: () => onNavigate("settings"),
      },
      {
        id: "branding",
        title: "Upload your banner and logo",
        description: "Branding helps your public seller profile feel trustworthy and ready for customers.",
        complete: brandingReady,
        actionLabel: brandingReady ? "Review branding" : "Set branding",
        action: () => onNavigate("settings"),
      },
      {
        id: "delivery",
        title: "Configure delivery rules",
        description: "Set local delivery, country shipping, or collection so Piessang can route orders correctly.",
        complete: deliveryReady,
        actionLabel: deliveryReady ? "Review delivery setup" : "Set delivery rules",
        action: () => onNavigate("settings"),
      },
      {
        id: "payouts",
        title: "Connect payouts",
        description: "Finish your payout setup so settlements can move through to your bank account.",
        complete: payoutReady,
        actionLabel: payoutReady ? "Review payouts" : "Complete payout setup",
        action: () => onNavigate("settings"),
      },
      {
        id: "product",
        title: "Publish your first product",
        description: "Add at least one active product so customers can start discovering and buying from you.",
        complete: firstProductReady,
        actionLabel: firstProductReady ? "View products" : "Create first product",
        action: () => onNavigate(firstProductReady ? "products" : "create-product"),
      },
    ],
    [brandingReady, businessReady, deliveryReady, firstProductReady, onNavigate, payoutReady],
  );

  const setupComplete = setupTasks.every((task) => task.complete);
  const setupResolved = !loading && !error;
  const days = daysForTimeframe(timeframe);
  const currentOrders = useMemo(
    () => orders.filter((item) => isWithinTimeframe(toStr(item?.createdAt), days)),
    [days, orders],
  );

  const previousOrders = useMemo(() => {
    const now = new Date();
    const previousEnd = new Date();
    previousEnd.setHours(23, 59, 59, 999);
    previousEnd.setDate(now.getDate() - days);
    const previousStart = new Date(previousEnd);
    previousStart.setHours(0, 0, 0, 0);
    previousStart.setDate(previousEnd.getDate() - (days - 1));

    return orders.filter((item) => {
      const created = new Date(toStr(item?.createdAt));
      if (Number.isNaN(created.getTime())) return false;
      return created.getTime() >= previousStart.getTime() && created.getTime() <= previousEnd.getTime();
    });
  }, [days, orders]);

  function diffPercentage(current: number, previous: number) {
    if (previous <= 0 && current <= 0) return 0;
    if (previous <= 0) return 100;
    return ((current - previous) / previous) * 100;
  }

  const orderCount = currentOrders.length;
  const salesTotal = currentOrders.reduce((sum, item) => sum + Number(item?.totals?.totalIncl || 0), 0);
  const awaitingFulfilment = currentOrders.filter((item) => item?.flags?.unfulfilled).length;
  const fulfilledCount = currentOrders.filter((item) => item?.flags?.fulfilled).length;
  const fulfilmentRate = orderCount ? (fulfilledCount / orderCount) * 100 : 0;

  const previousOrderCount = previousOrders.length;
  const previousSalesTotal = previousOrders.reduce((sum, item) => sum + Number(item?.totals?.totalIncl || 0), 0);
  const previousAwaiting = previousOrders.filter((item) => item?.flags?.unfulfilled).length;
  const previousFulfilled = previousOrders.filter((item) => item?.flags?.fulfilled).length;
  const previousFulfilmentRate = previousOrderCount ? (previousFulfilled / previousOrderCount) * 100 : 0;

  const metricCards = [
    {
      id: "orders",
      label: "Orders",
      value: String(orderCount),
      delta: diffPercentage(orderCount, previousOrderCount),
      chart: buildSeries(currentOrders, Math.min(days, 14), "orders"),
    },
    {
      id: "sales",
      label: "Sales",
      value: formatMoney(salesTotal),
      delta: diffPercentage(salesTotal, previousSalesTotal),
      chart: buildSeries(currentOrders, Math.min(days, 14), "sales"),
    },
    {
      id: "awaiting",
      label: "Awaiting fulfilment",
      value: String(awaitingFulfilment),
      delta: diffPercentage(awaitingFulfilment, previousAwaiting),
      chart: buildSeries(currentOrders.filter((item) => item?.flags?.unfulfilled), Math.min(days, 14), "orders"),
    },
    {
      id: "rate",
      label: "Fulfilment rate",
      value: formatPercent(fulfilmentRate),
      delta: diffPercentage(fulfilmentRate, previousFulfilmentRate),
      chart: buildSeries(currentOrders.filter((item) => item?.flags?.fulfilled), Math.min(days, 14), "orders"),
    },
  ];

  async function submitAssistantPrompt(prompt: string) {
    const nextPrompt = toStr(prompt);
    if (!nextPrompt) return;
    setAssistantMessages((current) => [...current, { role: "user", content: nextPrompt }]);
    setAssistantInput("");
    setAssistantOpen(true);
    setAssistantBusy(true);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, sellerSlug, sellerCode, vendorName }),
      });
      const payload = await response.json().catch(() => ({}));
      const reply = toStr(payload?.reply || payload?.message) || buildAssistantReply(nextPrompt);
      setAssistantMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch {
      setAssistantMessages((current) => [...current, { role: "assistant", content: buildAssistantReply(nextPrompt) }]);
    } finally {
      setAssistantBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-black/6 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(246,243,236,0.98))] p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[760px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Seller home</p>
            <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">
              Let&apos;s get {vendorName || "your seller account"} selling smoothly.
            </h2>
            <p className="mt-2 text-[14px] leading-[1.7] text-[#57636c]">
              Use this page to finish setup, understand how Piessang works, and keep an eye on the metrics that matter before and after you start taking orders.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-[14px] border border-black/8 bg-white px-3 py-2 text-[13px] text-[#202020]">
              <span className="font-semibold text-[#57636c]">Timeframe</span>
              <select
                value={timeframe}
                onChange={(event) => setTimeframe(event.target.value as TimeframeKey)}
                className="bg-transparent font-semibold outline-none"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white"
            >
              Ask Piessang
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[18px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[14px] text-[#b91c1c]">{error}</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const positive = card.delta >= 0;
          return (
            <article key={card.id} className="rounded-[22px] border border-black/6 bg-white p-4 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold text-[#202020]">{card.label}</p>
                  <p className="mt-1.5 text-[24px] font-semibold tracking-[-0.05em] text-[#202020]">{card.value}</p>
                  <p className={`mt-1.5 text-[11px] font-semibold ${positive ? "text-[#1a8553]" : "text-[#b91c1c]"}`}>
                    {card.delta === 0 ? "No change" : `${positive ? "↑" : "↓"} ${Math.abs(Math.round(card.delta))}% vs previous period`}
                  </p>
                </div>
                <Sparkline data={card.chart} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {!setupResolved ? (
          <article className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="h-3 w-24 rounded-full bg-black/6" />
                <div className="mt-3 h-8 w-64 rounded-full bg-black/6" />
                <div className="mt-3 h-4 w-full max-w-[440px] rounded-full bg-black/5" />
                <div className="mt-2 h-4 w-full max-w-[360px] rounded-full bg-black/5" />
              </div>
              <div className="min-w-[180px]">
                <div className="h-2 w-full rounded-full bg-black/8" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-[18px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 rounded-full bg-black/6" />
                      <div className="min-w-0">
                        <div className="h-5 w-48 rounded-full bg-black/6" />
                        <div className="mt-2 h-4 w-full max-w-[360px] rounded-full bg-black/5" />
                        <div className="mt-2 h-4 w-full max-w-[280px] rounded-full bg-black/5" />
                      </div>
                    </div>
                    <div className="h-11 w-40 rounded-[14px] bg-black/6" />
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : !setupComplete ? (
          <article className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Setup guide</p>
                <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Complete your seller setup</h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
                  Finish these essentials so your storefront, fulfilment, and payouts are ready for real orders.
                </p>
              </div>
              <div className="min-w-[180px]">
                <ChecklistProgress items={setupTasks} />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {setupTasks.map((task, index) => (
                <div key={task.id} className="rounded-[18px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                          task.complete ? "bg-[rgba(26,133,83,0.12)] text-[#1a8553]" : "bg-[rgba(15,128,195,0.12)] text-[#0f80c3]"
                        }`}
                      >
                        {task.complete ? "✓" : index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-[#202020]">{task.title}</p>
                        <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">{task.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={task.action}
                      className={`inline-flex h-11 items-center rounded-[14px] px-4 text-[14px] font-semibold ${
                        task.complete
                          ? "border border-black/10 bg-white text-[#202020]"
                          : "bg-[#202020] text-white"
                      }`}
                    >
                      {task.actionLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : (
          <article className="rounded-[24px] border border-[#cfe8d8] bg-[linear-gradient(135deg,rgba(236,253,245,0.9),rgba(255,255,255,0.98))] p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a8553]">Setup complete</p>
            <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Your seller account is ready to trade.</h3>
            <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
              Your core setup is complete, so this space now stays focused on orders, products, and the help you might need as you grow.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => onNavigate("products")} className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white">
                View products
              </button>
              <button type="button" onClick={() => onNavigate("new-orders")} className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
                View orders
              </button>
            </div>
          </article>
        )}

        <article className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">At a glance</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-black/6 bg-[#fafafa] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Published products</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{publishedProducts}</p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[#fafafa] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Followers</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{followerCount}</p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[#fafafa] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Unread notifications</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#202020]">{unreadNotifications}</p>
            </div>
            <div className="rounded-[18px] border border-black/6 bg-[#fafafa] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Payout setup</p>
              <p className={`mt-2 text-[18px] font-semibold ${payoutReady ? "text-[#1a8553]" : "text-[#b45309]"}`}>
                {payoutReady ? "Ready for payouts" : "Still needs setup"}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Ask Piessang</p>
              <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Need help understanding how the platform works?</h3>
              <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
                Ask a question and we&apos;ll explain the Piessang flow in plain seller language, then open a side drawer conversation you can keep using.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-[20px] border border-black/8 bg-[#fafafa] p-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                placeholder="Ask about payouts, delivery rules, publishing, returns, or orders..."
                className="h-12 flex-1 rounded-[14px] border border-black/10 bg-white px-4 text-[14px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
              />
              <button
                type="button"
                onClick={() => void submitAssistantPrompt(assistantInput)}
                disabled={assistantBusy}
                className="inline-flex h-12 items-center justify-center rounded-[14px] bg-[#202020] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assistantBusy ? "Thinking..." : "Ask now"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submitAssistantPrompt(suggestion)}
                  className="inline-flex h-9 items-center rounded-full border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Seller FAQ</p>
          <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Common seller questions</h3>
          <div className="mt-5 space-y-3">
            {FAQ_ITEMS.map((item) => {
              const open = openFaq === item.question;
              return (
                <div key={item.question} className="rounded-[18px] border border-black/6 bg-[#fafafa]">
                  <button
                    type="button"
                    onClick={() => setOpenFaq((current) => (current === item.question ? null : item.question))}
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  >
                    <span className="text-[15px] font-semibold text-[#202020]">{item.question}</span>
                    <span className="text-[18px] text-[#57636c]">{open ? "−" : "+"}</span>
                  </button>
                  {open ? (
                    <div className="border-t border-black/6 px-4 py-4 text-[14px] leading-[1.7] text-[#57636c]">
                      {item.answer}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] text-[#0f80c3]">
            <button type="button" onClick={() => onNavigate("settings")} className="font-semibold underline underline-offset-2">
              Go to seller settings
            </button>
            <span className="text-[#8b94a3]">•</span>
            <button type="button" onClick={() => onNavigate("notifications")} className="font-semibold underline underline-offset-2">
              Open notifications
            </button>
            <span className="text-[#8b94a3]">•</span>
            <Link href="/support/tickets" className="font-semibold underline underline-offset-2">
              Contact support
            </Link>
          </div>
        </article>
      </section>

      <div className={`fixed inset-0 z-[170] transition ${assistantOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
        <button
          type="button"
          aria-label="Close Piessang assistant"
          onClick={() => setAssistantOpen(false)}
          className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${assistantOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute right-0 top-0 flex h-full w-[92vw] max-w-[760px] flex-col overflow-hidden bg-white shadow-[0_20px_48px_rgba(20,24,27,0.22)] transition-transform duration-300 ease-out ${assistantOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="border-b border-black/8 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Piessang assistant</p>
                <h3 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#202020]">Seller help</h3>
                <p className="mt-2 text-[14px] text-[#57636c]">Ask about setup, orders, payouts, fulfilment, or how the platform works.</p>
              </div>
              <button
                type="button"
                onClick={() => setAssistantOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-[20px] text-[#57636c]"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fafafa] px-6 py-6">
            {assistantMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-[18px] px-4 py-3 text-[14px] leading-[1.7] ${
                    message.role === "user"
                      ? "bg-[#202020] text-white"
                      : "border border-black/6 bg-white text-[#202020]"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {assistantBusy ? (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-[18px] border border-black/6 bg-white px-4 py-3 text-[14px] leading-[1.7] text-[#57636c]">
                  Piessang is thinking...
                </div>
              </div>
            ) : null}
          </div>
          <div className="border-t border-black/8 bg-white px-6 py-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void submitAssistantPrompt(suggestion)}
                    className="inline-flex h-9 items-center rounded-full border border-black/10 bg-[#fafafa] px-3 text-[12px] font-semibold text-[#202020]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <input
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitAssistantPrompt(assistantInput);
                    }
                  }}
                  placeholder="Ask Piessang anything..."
                  className="h-12 flex-1 rounded-[14px] border border-black/10 bg-white px-4 text-[14px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
                />
                <button
                  type="button"
                  onClick={() => void submitAssistantPrompt(assistantInput)}
                  disabled={assistantBusy}
                  className="inline-flex h-12 items-center rounded-[14px] bg-[#202020] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {assistantBusy ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {loading ? (
        <div className="rounded-[24px] border border-black/6 bg-white px-5 py-6 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
          Loading your seller home workspace...
        </div>
      ) : null}
    </div>
  );
}
