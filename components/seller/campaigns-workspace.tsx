"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CampaignAnalytics = {
  impressions?: number;
  clicks?: number;
  spend?: number;
  conversions?: number;
  revenue?: number;
};

type CampaignItem = {
  docId: string;
  sellerSlug?: string;
  sellerCode?: string;
  vendorName?: string;
  name?: string;
  type?: string;
  status?: string;
  budget?: {
    dailyBudget?: number;
    totalBudget?: number;
    maxCpc?: number;
    spentTotal?: number;
  };
  targeting?: {
    placements?: string[];
  };
  schedule?: {
    startAt?: string | null;
    endAt?: string | null;
  };
  promotedProducts?: string[];
  creative?: {
    headline?: string;
    supportingText?: string;
  };
  moderation?: {
    notes?: string | null;
  };
  analytics?: CampaignAnalytics;
  timestamps?: {
    updatedAt?: string | null;
    createdAt?: string | null;
  };
  hasPendingUpdate?: boolean;
  pendingUpdate?: {
    name?: string;
    budget?: {
      dailyBudget?: number;
      totalBudget?: number;
      maxCpc?: number;
    };
    targeting?: {
      placements?: string[];
    };
    promotedProducts?: string[];
    creative?: {
      headline?: string;
      supportingText?: string;
    };
    schedule?: {
      startAt?: string | null;
      endAt?: string | null;
    };
    moderation?: {
      decision?: string | null;
      notes?: string | null;
      submittedAt?: string | null;
    };
  } | null;
};

type SellerProduct = {
  id?: string;
  data?: {
    docId?: string;
    product?: {
      title?: string | null;
      unique_id?: string | number | null;
    };
    brand?: {
      title?: string | null;
    };
    media?: {
      images?: Array<{
        imageUrl?: string | null;
      }>;
    };
    variants?: Array<{
      pricing?: {
        selling_price_incl?: number;
      };
      sale?: {
        is_on_sale?: boolean;
        sale_price_incl?: number;
      };
    }>;
  };
};

type FormState = {
  campaignId: string;
  type: string;
  name: string;
  dailyBudget: string;
  totalBudget: string;
  maxCpc: string;
  placements: string[];
  promotedProducts: string[];
  headline: string;
  supportingText: string;
  startAt: string;
  endAt: string;
};

const EMPTY_FORM: FormState = {
  campaignId: "",
  type: "sponsored_products",
  name: "",
  dailyBudget: "250",
  totalBudget: "2500",
  maxCpc: "4.50",
  placements: ["search_results", "category_grid"],
  promotedProducts: [],
  headline: "",
  supportingText: "",
  startAt: "",
  endAt: "",
};

const CAMPAIGN_TYPE_OPTIONS = [
  {
    value: "sponsored_products",
    title: "Sponsored products",
    description: "Promote products in search and browse results where active shoppers are already discovering items.",
    enabled: true,
  },
  {
    value: "sponsored_seller",
    title: "Sponsored seller",
    description: "Promote your seller profile and storefront to shoppers who may want to browse your wider range.",
    enabled: false,
  },
  {
    value: "premium_banner",
    title: "Premium banner",
    description: "Reserve branded inventory for high-visibility homepage or seasonal promotional placements.",
    enabled: false,
  },
];

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value?: number) {
  return `R ${new Intl.NumberFormat("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(Number(value)) ? Number(value) : 0,
  )}`;
}

function formatDate(value?: string | null) {
  const input = toStr(value);
  if (!input) return "Unknown time";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function placementLabel(value: string) {
  if (value === "search_results") return "Search results";
  if (value === "category_grid") return "Category grid";
  if (value === "homepage_feature") return "Homepage";
  return value.replace(/_/g, " ");
}

function statusTone(status?: string) {
  const normalized = toStr(status).toLowerCase();
  if (["active", "approved", "scheduled"].includes(normalized)) return "text-[#166534] bg-[rgba(57,169,107,0.08)]";
  if (["submitted", "in_review"].includes(normalized)) return "text-[#8a6a14] bg-[rgba(227,197,47,0.14)]";
  if (normalized === "paused") return "text-[#57636c] bg-[rgba(87,99,108,0.08)]";
  if (normalized === "rejected") return "text-[#b91c1c] bg-[#fff1f2]";
  return "text-[#57636c] bg-[rgba(87,99,108,0.08)]";
}

function formatStatus(status?: string) {
  return toStr(status || "draft", "draft").replace(/_/g, " ");
}

function getCampaignFormSource(item: CampaignItem | null) {
  if (!item) return EMPTY_FORM;
  const source = item.pendingUpdate || item;
  return {
    campaignId: item.docId,
    type: toStr(item?.type || "sponsored_products"),
    name: toStr(source?.name || item?.name),
    dailyBudget: toStr(source?.budget?.dailyBudget, "250"),
    totalBudget: toStr(source?.budget?.totalBudget, "2500"),
    maxCpc: toStr(source?.budget?.maxCpc, "4.50"),
    placements: Array.isArray(source?.targeting?.placements) && source.targeting.placements.length ? source.targeting.placements : ["search_results"],
    promotedProducts: Array.isArray(source?.promotedProducts) ? source.promotedProducts : [],
    headline: toStr(source?.creative?.headline),
    supportingText: toStr(source?.creative?.supportingText),
    startAt: toStr(source?.schedule?.startAt),
    endAt: toStr(source?.schedule?.endAt),
  };
}

function getProductId(item: SellerProduct) {
  return toStr(item?.id || item?.data?.docId || item?.data?.product?.unique_id);
}

function getProductPrice(item?: SellerProduct | null) {
  const variant = item?.data?.variants?.[0];
  const sale = Number(variant?.sale?.sale_price_incl);
  if (variant?.sale?.is_on_sale && Number.isFinite(sale) && sale > 0) return sale;
  const price = Number(variant?.pricing?.selling_price_incl);
  return Number.isFinite(price) ? price : 0;
}

function CampaignPreview({
  form,
  products,
  vendorName,
}: {
  form: FormState;
  products: SellerProduct[];
  vendorName: string;
}) {
  const selectedProduct = products.find((item) => getProductId(item) === form.promotedProducts[0]) || null;
  const title = toStr(form.headline || selectedProduct?.data?.product?.title || "Your promoted product");
  const supportingText = toStr(
    form.supportingText || "Your campaign preview updates live while you build the details on the left.",
  );
  const price = getProductPrice(selectedProduct);
  const image = selectedProduct?.data?.media?.images?.find((entry) => Boolean(entry?.imageUrl))?.imageUrl || "";

  return (
    <aside className="space-y-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Live preview</p>
        <h3 className="mt-2 text-[18px] font-semibold text-[#202020]">How your campaign can look</h3>
        <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
          This preview updates while you fill in the campaign details, so you can sense how your promoted listing will read in the marketplace.
        </p>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-black/5 bg-[#fcfbf7]">
        <div className="relative h-[220px] bg-[#f4f1e7]">
          {image ? (
            <img src={image} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#fdf070,#e3c52f)] text-[13px] font-semibold text-[#3d3420]">
              Preview image
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-[#202020] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
            Sponsored
          </span>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[16px] font-semibold leading-[1.35] text-[#202020]">{title}</p>
              <p className="mt-1 text-[12px] text-[#57636c]">{vendorName}</p>
            </div>
            <span className="rounded-full bg-[rgba(227,197,47,0.14)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7d6940]">
              {form.placements.map(placementLabel).join(" • ") || "Placement"}
            </span>
          </div>
          <p className="text-[13px] leading-[1.6] text-[#57636c]">{supportingText}</p>
          <div className="flex items-center justify-between">
            <p className="text-[20px] font-semibold text-[#202020]">{formatMoney(price)}</p>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-white"
            >
              View product
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4 text-[12px] text-[#57636c]">
        <p>Daily budget: <span className="font-semibold text-[#202020]">{formatMoney(toNum(form.dailyBudget))}</span></p>
        <p className="mt-1">Total budget: <span className="font-semibold text-[#202020]">{formatMoney(toNum(form.totalBudget))}</span></p>
        <p className="mt-1">Max CPC: <span className="font-semibold text-[#202020]">{formatMoney(toNum(form.maxCpc))}</span></p>
      </div>
    </aside>
  );
}

export function SellerCampaignsWorkspace({
  sellerSlug,
  sellerCode,
  vendorName,
}: {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const campaignView = toStr(searchParams.get("campaignView"));
  const campaignId = toStr(searchParams.get("campaignId"));
  const selectedType = toStr(searchParams.get("campaignType"));
  const isCreateFlow = campaignView === "new";
  const isTypeStep = campaignView === "choose-type";
  const isDetailView = campaignView === "detail" && campaignId;
  const isEditMode = toStr(searchParams.get("campaignMode")) === "edit";

  const [items, setItems] = useState<CampaignItem[]>([]);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [analytics, setAnalytics] = useState<{
    daily: Array<{ dayKey: string; impressions: number; clicks: number; spend: number; conversions: number; revenue: number }>;
    placements: Array<{ placement: string; clicks: number; spend: number }>;
  }>({ daily: [], placements: [] });
  const [detailAnalytics, setDetailAnalytics] = useState<{
    daily: Array<{ dayKey: string; impressions: number; clicks: number; spend: number; conversions: number; revenue: number }>;
    placements: Array<{ placement: string; clicks: number; spend: number }>;
  }>({ daily: [], placements: [] });

  function setCampaignRoute(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  async function loadCampaigns() {
    const params = new URLSearchParams({
      sellerSlug,
      sellerCode,
      includeAnalytics: "true",
    });
    if (campaignId) params.set("campaignId", campaignId);
    const response = await fetch(`/api/client/v1/campaigns/list?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load campaigns.");
    setItems(Array.isArray(payload?.data?.items) ? payload.data.items : []);
    setAnalytics({
      daily: Array.isArray(payload?.data?.analytics?.daily) ? payload.data.analytics.daily : [],
      placements: Array.isArray(payload?.data?.analytics?.placements) ? payload.data.analytics.placements : [],
    });
    setDetailAnalytics({
      daily: Array.isArray(payload?.data?.detailAnalytics?.daily) ? payload.data.detailAnalytics.daily : [],
      placements: Array.isArray(payload?.data?.detailAnalytics?.placements) ? payload.data.detailAnalytics.placements : [],
    });
  }

  async function loadProducts() {
    const response = await fetch(
      `/api/catalogue/v1/products/product/get?limit=all&sellerSlug=${encodeURIComponent(sellerSlug)}&includeUnavailable=true`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load your products.");
    setProducts(Array.isArray(payload?.items) ? payload.items : []);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadCampaigns(), loadProducts()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load campaigns.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [sellerSlug, sellerCode, campaignId]);

  const selectedCampaign = useMemo(
    () => items.find((item) => item.docId === campaignId) || null,
    [campaignId, items],
  );

  useEffect(() => {
    if (isCreateFlow) {
      setForm({
        ...EMPTY_FORM,
        type: selectedType || "sponsored_products",
      });
      return;
    }
    if (isEditMode && selectedCampaign) {
      setForm(getCampaignFormSource(selectedCampaign));
    }
  }, [isCreateFlow, isEditMode, selectedCampaign, selectedType]);

  const counts = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.total += 1;
          const status = toStr(item?.status).toLowerCase();
          if (["active", "approved", "scheduled"].includes(status)) acc.activeLike += 1;
          if (["paused", "ended", "rejected"].includes(status)) acc.inactive += 1;
          if (status === "submitted" || status === "in_review") acc.awaitingReview += 1;
          if (item?.hasPendingUpdate) acc.pendingUpdates += 1;
          return acc;
        },
        { total: 0, activeLike: 0, inactive: 0, awaitingReview: 0, pendingUpdates: 0 },
      ),
    [items],
  );

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.impressions += Number(item?.analytics?.impressions || 0);
          acc.clicks += Number(item?.analytics?.clicks || 0);
          acc.spend += Number(item?.analytics?.spend || 0);
          acc.conversions += Number(item?.analytics?.conversions || 0);
          acc.revenue += Number(item?.analytics?.revenue || 0);
          return acc;
        },
        { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 },
      ),
    [items],
  );

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  async function saveCampaign(action: "save" | "submit") {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: form.campaignId || undefined,
          action,
          sellerSlug,
          sellerCode,
          vendorName,
          campaign: {
            name: form.name,
            type: form.type,
            budget: {
              dailyBudget: form.dailyBudget,
              totalBudget: form.totalBudget,
              maxCpc: form.maxCpc,
            },
            targeting: {
              placements: form.placements,
            },
            promotedProducts: form.promotedProducts,
            creative: {
              headline: form.headline,
              supportingText: form.supportingText,
            },
            schedule: {
              startAt: form.startAt,
              endAt: form.endAt,
              timezone: "Africa/Johannesburg",
            },
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save campaign.");
      const savedId = toStr(payload?.data?.item?.docId);
      setMessage(
        action === "submit"
          ? form.campaignId
            ? "Campaign update submitted for review while your current live campaign stays in place."
            : "Campaign submitted for review."
          : form.campaignId
            ? "Campaign changes saved."
            : "Draft campaign saved.",
      );
      window.dispatchEvent(new Event("piessang:refresh-admin-badges"));
      await loadCampaigns();
      setCampaignRoute({
        campaignView: savedId ? "detail" : null,
        campaignId: savedId || null,
        campaignType: null,
        campaignMode: null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(action: "pause" | "resume", item: CampaignItem) {
    setBusyId(item.docId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: item.docId,
          action,
          sellerSlug,
          sellerCode,
          vendorName,
          campaign: getCampaignFormSource(item),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update campaign.");
      setMessage(action === "pause" ? "Campaign paused." : "Campaign resumed.");
      await loadCampaigns();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update campaign.");
    } finally {
      setBusyId(null);
    }
  }

  function togglePlacement(value: string) {
    setForm((current) => ({
      ...current,
      placements: current.placements.includes(value)
        ? current.placements.filter((item) => item !== value)
        : [...current.placements, value],
    }));
  }

  function toggleProduct(value: string) {
    setForm((current) => ({
      ...current,
      promotedProducts: current.promotedProducts.includes(value)
        ? current.promotedProducts.filter((item) => item !== value)
        : [...current.promotedProducts, value],
    }));
  }

  const selectedCampaignCtr =
    selectedCampaign && Number(selectedCampaign?.analytics?.impressions || 0) > 0
      ? (Number(selectedCampaign?.analytics?.clicks || 0) / Number(selectedCampaign?.analytics?.impressions || 0)) * 100
      : 0;
  const selectedCampaignRoas =
    selectedCampaign && Number(selectedCampaign?.analytics?.spend || 0) > 0
      ? Number(selectedCampaign?.analytics?.revenue || 0) / Number(selectedCampaign?.analytics?.spend || 0)
      : 0;

  if (loading) {
    return (
      <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <p className="text-[13px] text-[#57636c]">Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      {isTypeStep ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Create campaign</p>
              <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">Choose the type of campaign you want to run</h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                Start by choosing the ad format. We’ll then take you into the dedicated setup page for that campaign type.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCampaignRoute({ campaignView: null, campaignId: null, campaignType: null, campaignMode: null })}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
            >
              Back to campaigns
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {CAMPAIGN_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!option.enabled}
                onClick={() =>
                  option.enabled
                    ? setCampaignRoute({
                        campaignView: "new",
                        campaignType: option.value,
                        campaignId: null,
                        campaignMode: "edit",
                      })
                    : null
                }
                className={`rounded-[8px] border p-5 text-left shadow-[0_8px_24px_rgba(20,24,27,0.06)] ${
                  option.enabled
                    ? "border-black/5 bg-white transition-transform hover:-translate-y-[1px]"
                    : "border-black/5 bg-[#fafafa] opacity-70"
                }`}
              >
                <p className="text-[18px] font-semibold text-[#202020]">{option.title}</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">{option.description}</p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
                  {option.enabled ? "Available now" : "Coming soon"}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : isCreateFlow || isEditMode ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
                {form.campaignId ? "Edit campaign" : "New campaign"}
              </p>
              <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">
                {form.campaignId ? "Update your campaign without interrupting the live one" : "Build your campaign"}
              </h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                {form.campaignId
                  ? "When you submit changes to a live campaign, the current approved version keeps running until the new update is reviewed."
                  : "Set the campaign name, placements, products, and budget, then submit it for Piessang review before it can go live."}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setCampaignRoute({
                  campaignView: form.campaignId ? "detail" : null,
                  campaignId: form.campaignId || null,
                  campaignType: null,
                  campaignMode: null,
                })
              }
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
            >
              {form.campaignId ? "Back to analytics" : "Back to campaigns"}
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <section className="space-y-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Campaign name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Weekend soft drinks push"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Campaign type</span>
                  <input
                    value={CAMPAIGN_TYPE_OPTIONS.find((option) => option.value === form.type)?.title || "Sponsored products"}
                    disabled
                    className="h-11 w-full rounded-[8px] border border-black/10 bg-[#fafafa] px-3 text-[13px] text-[#57636c]"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Daily budget</span>
                  <input
                    value={form.dailyBudget}
                    onChange={(event) => setForm((current) => ({ ...current, dailyBudget: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Total budget</span>
                  <input
                    value={form.totalBudget}
                    onChange={(event) => setForm((current) => ({ ...current, totalBudget: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Max CPC</span>
                  <input
                    value={form.maxCpc}
                    onChange={(event) => setForm((current) => ({ ...current, maxCpc: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  />
                </label>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#202020]">Placements</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["search_results", "category_grid"].map((placement) => {
                    const selected = form.placements.includes(placement);
                    return (
                      <button
                        key={placement}
                        type="button"
                        onClick={() => togglePlacement(placement)}
                        className={`rounded-full px-3 py-2 text-[12px] font-semibold ${
                          selected
                            ? "bg-[rgba(227,197,47,0.18)] text-[#7d6940]"
                            : "bg-[#f5f5f5] text-[#57636c]"
                        }`}
                      >
                        {placementLabel(placement)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#202020]">Promoted products</p>
                <div className="mt-3 grid gap-2">
                  {products.length === 0 ? (
                    <p className="text-[13px] text-[#57636c]">You do not have any products ready for campaigns yet.</p>
                  ) : (
                    products.map((product) => {
                      const value = getProductId(product);
                      const checked = form.promotedProducts.includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleProduct(value)}
                          className={`flex items-center justify-between rounded-[8px] border px-3 py-3 text-left ${
                            checked ? "border-[#cbb26b] bg-[#fcfbf7]" : "border-black/10 bg-white"
                          }`}
                        >
                          <div>
                            <p className="text-[13px] font-semibold text-[#202020]">
                              {toStr(product?.data?.product?.title, "Untitled product")}
                            </p>
                            <p className="mt-1 text-[12px] text-[#57636c]">{toStr(product?.data?.brand?.title, vendorName)}</p>
                          </div>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">
                            {checked ? "Selected" : "Select"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Headline</span>
                  <input
                    value={form.headline}
                    onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Refresh your fridge favourites"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Supporting text</span>
                  <input
                    value={form.supportingText}
                    onChange={(event) => setForm((current) => ({ ...current, supportingText: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                    placeholder="Bring thirsty shoppers straight to this product."
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">Start time</span>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#202020]">End time</span>
                  <input
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[13px] outline-none focus:border-[#cbb26b]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void saveCampaign("save")}
                  disabled={saving}
                  className="inline-flex h-11 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                >
                  {form.campaignId ? "Save update draft" : "Save draft"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveCampaign("submit")}
                  disabled={saving}
                  className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {form.campaignId ? "Submit update for review" : "Submit for review"}
                </button>
              </div>
            </section>

            <CampaignPreview form={form} products={products} vendorName={vendorName} />
          </div>
        </section>
      ) : isDetailView && selectedCampaign ? (
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Campaign details</p>
              <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">{toStr(selectedCampaign?.name, "Campaign")}</h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                Review campaign-specific analytics, check whether updates are pending review, and jump into editing when you need to refine this campaign.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(selectedCampaign?.status)}`}>
                {formatStatus(selectedCampaign?.status)}
              </span>
              <button
                type="button"
                onClick={() => setCampaignRoute({ campaignView: "detail", campaignId: selectedCampaign.docId, campaignMode: "edit" })}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
              >
                Edit campaign
              </button>
              {toStr(selectedCampaign?.status).toLowerCase() === "paused" ? (
                <button
                  type="button"
                  onClick={() => void updateStatus("resume", selectedCampaign)}
                  disabled={busyId === selectedCampaign.docId}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void updateStatus("pause", selectedCampaign)}
                  disabled={busyId === selectedCampaign.docId}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
                >
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={() => setCampaignRoute({ campaignView: null, campaignId: null, campaignType: null, campaignMode: null })}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
              >
                Back to campaigns
              </button>
            </div>
          </div>

          {selectedCampaign?.hasPendingUpdate ? (
            <div className="rounded-[8px] border border-[#e8dba4] bg-[#fff9e8] px-4 py-3 text-[12px] text-[#7d6940]">
              There is an update waiting for review. Your current approved campaign stays live until Piessang reviews the pending version.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Impressions</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{toNum(selectedCampaign?.analytics?.impressions)}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Clicks</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{toNum(selectedCampaign?.analytics?.clicks)}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">CTR</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{selectedCampaignCtr.toFixed(2)}%</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Spend</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{formatMoney(selectedCampaign?.analytics?.spend)}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">ROAS</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{selectedCampaignRoas.toFixed(2)}x</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="space-y-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <div>
                <p className="text-[18px] font-semibold text-[#202020]">Campaign setup</p>
                <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                  Status, budget, placements, and promoted product selection for this campaign.
                </p>
              </div>
              <div className="space-y-2 text-[13px] text-[#57636c]">
                <p><span className="font-semibold text-[#202020]">Placements:</span> {(selectedCampaign?.targeting?.placements || []).map(placementLabel).join(" • ") || "None"}</p>
                <p><span className="font-semibold text-[#202020]">Daily budget:</span> {formatMoney(selectedCampaign?.budget?.dailyBudget)}</p>
                <p><span className="font-semibold text-[#202020]">Total budget:</span> {formatMoney(selectedCampaign?.budget?.totalBudget)}</p>
                <p><span className="font-semibold text-[#202020]">Max CPC:</span> {formatMoney(selectedCampaign?.budget?.maxCpc)}</p>
                <p><span className="font-semibold text-[#202020]">Promoted products:</span> {Number(selectedCampaign?.promotedProducts?.length || 0)}</p>
                <p><span className="font-semibold text-[#202020]">Last updated:</span> {formatDate(selectedCampaign?.timestamps?.updatedAt)}</p>
              </div>
              {selectedCampaign?.pendingUpdate ? (
                <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4 text-[12px] text-[#57636c]">
                  <p className="font-semibold text-[#202020]">Pending update</p>
                  <p className="mt-2">Campaign name: {toStr(selectedCampaign.pendingUpdate.name, selectedCampaign.name)}</p>
                  <p className="mt-1">Placements: {(selectedCampaign.pendingUpdate.targeting?.placements || []).map(placementLabel).join(" • ") || "None"}</p>
                  <p className="mt-1">Submitted: {formatDate(selectedCampaign.pendingUpdate.moderation?.submittedAt)}</p>
                  {selectedCampaign.pendingUpdate.moderation?.notes ? (
                    <p className="mt-1">Latest review note: {selectedCampaign.pendingUpdate.moderation.notes}</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="space-y-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[18px] font-semibold text-[#202020]">Campaign-specific analytics</p>
              {detailAnalytics.daily.length === 0 ? (
                <p className="text-[13px] text-[#57636c]">This campaign will show its own daily performance here once it has started serving.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-[#8b94a3]">
                      <tr>
                        <th className="pb-2 pr-4 font-semibold">Day</th>
                        <th className="pb-2 pr-4 font-semibold">Impressions</th>
                        <th className="pb-2 pr-4 font-semibold">Clicks</th>
                        <th className="pb-2 pr-4 font-semibold">Spend</th>
                        <th className="pb-2 pr-4 font-semibold">Conversions</th>
                        <th className="pb-2 font-semibold">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#202020]">
                      {detailAnalytics.daily.map((day) => (
                        <tr key={day.dayKey} className="border-t border-black/5">
                          <td className="py-2 pr-4">{day.dayKey}</td>
                          <td className="py-2 pr-4">{day.impressions}</td>
                          <td className="py-2 pr-4">{day.clicks}</td>
                          <td className="py-2 pr-4">{formatMoney(day.spend)}</td>
                          <td className="py-2 pr-4">{day.conversions}</td>
                          <td className="py-2">{formatMoney(day.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailAnalytics.placements.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {detailAnalytics.placements.map((placement) => (
                    <div key={placement.placement} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                      <p className="text-[12px] font-semibold text-[#202020]">{placementLabel(placement.placement)}</p>
                      <p className="mt-2 text-[12px] text-[#57636c]">Clicks: <span className="font-semibold text-[#202020]">{placement.clicks}</span></p>
                      <p className="mt-1 text-[12px] text-[#57636c]">Spend: <span className="font-semibold text-[#202020]">{formatMoney(placement.spend)}</span></p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Campaigns</p>
              <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">Your campaign overview</h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                Start here to see how all of your campaigns are performing, which ones are active or awaiting review, and where to jump in when you want to build another campaign.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCampaignRoute({ campaignView: "choose-type", campaignId: null, campaignType: null, campaignMode: null })}
              className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Add another campaign
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Total campaigns</p>
              <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.total}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Active or approved</p>
              <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.activeLike}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Awaiting review</p>
              <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.awaitingReview}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Pending live updates</p>
              <p className="mt-2 text-[28px] font-semibold text-[#202020]">{counts.pendingUpdates}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Impressions</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{totals.impressions}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Clicks</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{totals.clicks}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">CTR</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{ctr.toFixed(2)}%</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">Spend</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{formatMoney(totals.spend)}</p>
            </div>
            <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[12px] text-[#8b94a3]">ROAS</p>
              <p className="mt-2 text-[24px] font-semibold text-[#202020]">{roas.toFixed(2)}x</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[18px] font-semibold text-[#202020]">All campaigns</p>
              <div className="mt-4 space-y-3">
                {items.length === 0 ? (
                  <p className="text-[13px] text-[#57636c]">You have not created any campaigns yet.</p>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.docId}
                      type="button"
                      onClick={() => setCampaignRoute({ campaignView: "detail", campaignId: item.docId, campaignType: null, campaignMode: null })}
                      className="w-full rounded-[8px] border border-black/5 bg-[#fcfcfc] px-4 py-4 text-left transition-colors hover:bg-[#faf8f1]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-[#202020]">{toStr(item?.name, "Campaign")}</p>
                          <p className="mt-1 text-[12px] text-[#57636c]">
                            {toStr(item?.type).replace(/_/g, " ")} • {(item?.targeting?.placements || []).map(placementLabel).join(" • ") || "No placements yet"}
                          </p>
                          <p className="mt-2 text-[12px] text-[#57636c]">
                            Spend {formatMoney(item?.analytics?.spend)} • Revenue {formatMoney(item?.analytics?.revenue)} • Updated {formatDate(item?.timestamps?.updatedAt)}
                          </p>
                          {item?.hasPendingUpdate ? (
                            <p className="mt-1 text-[12px] text-[#8a6a14]">A pending campaign update is waiting for review.</p>
                          ) : null}
                        </div>
                        <span className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(item?.status)}`}>
                          {formatStatus(item?.status)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[18px] font-semibold text-[#202020]">Marketplace-wide campaign trend</p>
              {analytics.daily.length === 0 ? (
                <p className="text-[13px] text-[#57636c]">Performance will start appearing here once your campaigns begin serving.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-[#8b94a3]">
                      <tr>
                        <th className="pb-2 pr-4 font-semibold">Day</th>
                        <th className="pb-2 pr-4 font-semibold">Impressions</th>
                        <th className="pb-2 pr-4 font-semibold">Clicks</th>
                        <th className="pb-2 pr-4 font-semibold">Spend</th>
                        <th className="pb-2 pr-4 font-semibold">Conversions</th>
                        <th className="pb-2 font-semibold">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#202020]">
                      {analytics.daily.map((day) => (
                        <tr key={day.dayKey} className="border-t border-black/5">
                          <td className="py-2 pr-4">{day.dayKey}</td>
                          <td className="py-2 pr-4">{day.impressions}</td>
                          <td className="py-2 pr-4">{day.clicks}</td>
                          <td className="py-2 pr-4">{formatMoney(day.spend)}</td>
                          <td className="py-2 pr-4">{day.conversions}</td>
                          <td className="py-2">{formatMoney(day.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
