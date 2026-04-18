"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SellerIntegrationsWorkspaceProps = {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
};

type ShopifyPreviewProduct = {
  id: string;
  title: string;
  vendor: string;
  totalInventory: number;
  variantCount: number;
  variants: Array<{ price: number }>;
};

type ShopifyConnection = {
  connected?: boolean;
  shopDomain?: string;
  shopName?: string;
  tokenMasked?: string;
  verifiedAt?: string;
  syncMode?: string;
  importStatus?: string;
  autoSyncPriceStock?: boolean;
  autoImportNewProducts?: boolean;
  lastWebhookAt?: string;
  lastWebhookTopic?: string;
  lastSyncSummary?: {
    topic?: string;
    syncedProducts?: number;
    unmatchedVariants?: number;
    preparedImport?: boolean;
    createdDraftProductId?: string;
    happenedAt?: string;
  } | null;
  webhooks?: {
    registeredAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
    deliveryUrl?: string;
    topics?: Array<{
      topic?: string;
      ok?: boolean;
      duplicate?: boolean;
      subscriptionId?: string;
      errors?: Array<{ message?: string }>;
    }>;
  } | null;
  lastPreview?: {
    fetchedAt?: string;
    totals?: {
      products?: number;
      variants?: number;
    };
    products?: ShopifyPreviewProduct[];
  };
  jobs?: Array<{
    id: string;
    status: string;
    totals?: {
      products?: number;
      variants?: number;
    };
    createdAt?: string;
    updatedAt?: string;
  }>;
};

type IntegrationCard = {
  id: string;
  name: string;
  category: string;
  description: string;
  accent: string;
  available: boolean;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatTimestamp(value?: string) {
  const safe = toStr(value);
  if (!safe) return "Not available";
  const date = new Date(safe);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(value?: string) {
  return toStr(value, "draft").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPrice(value?: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

const FILTERS = ["All integrations", "Commerce", "Marketing", "Operations"];

const INTEGRATIONS: IntegrationCard[] = [
  {
    id: "shopify",
    name: "Shopify",
    category: "Commerce",
    description: "Sync catalogue, stock, and pricing from Shopify into Piessang.",
    accent: "from-[#edf8dc] via-[#f8fcec] to-white",
    available: true,
  },
  {
    id: "meta",
    name: "Meta",
    category: "Marketing",
    description: "Future product feed and audience sync for Meta.",
    accent: "from-[#f2efff] via-[#fbfaff] to-white",
    available: false,
  },
];

function IntegrationLogo({ id }: { id: string }) {
  if (id === "shopify") {
    return <Image src="/integrations-logos/shopify.svg" alt="Shopify" width={24} height={24} className="h-6 w-6" />;
  }
  if (id === "meta") {
    return <Image src="/integrations-logos/meta.svg" alt="Meta" width={24} height={24} className="h-6 w-6" />;
  }
  return null;
}

function ConnectionSwitch({
  active,
  disabled = false,
}: {
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-7 min-w-[52px] items-center rounded-full px-1 transition ${
        active ? "bg-[#6f55f6]" : "bg-[#e7e9f1]"
      } ${disabled ? "opacity-90" : ""}`}
      aria-hidden="true"
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-[0_4px_10px_rgba(20,24,27,0.18)] transition ${
          active ? "translate-x-[24px]" : "translate-x-0"
        }`}
      />
    </span>
  );
}

export function SellerIntegrationsWorkspace({
  sellerSlug,
  sellerCode,
  vendorName,
}: SellerIntegrationsWorkspaceProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ShopifyConnection | null>(null);
  const [preview, setPreview] = useState<ShopifyConnection["lastPreview"] | null>(null);
  const [activeFilter, setActiveFilter] = useState("All integrations");
  const [searchValue, setSearchValue] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState("shopify");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [adminAccessToken, setAdminAccessToken] = useState("");
  const [syncMode, setSyncMode] = useState("import_once");
  const [importStatus, setImportStatus] = useState("draft");
  const [autoSyncPriceStock, setAutoSyncPriceStock] = useState(true);
  const [autoImportNewProducts, setAutoImportNewProducts] = useState(false);

  async function loadWorkspace() {
    if (!sellerSlug && !sellerCode) {
      setLoading(false);
      setError("Choose a seller account before opening integrations.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sellerCode) params.set("sellerCode", sellerCode);
      else params.set("sellerSlug", sellerSlug);

      const response = await fetch(`/api/client/v1/accounts/seller/shopify?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load Shopify integration details.");
      }

      const nextConnection = (payload?.connection || null) as ShopifyConnection | null;
      setConnection(nextConnection);
      setPreview(nextConnection?.lastPreview || null);
      setShopDomain(toStr(nextConnection?.shopDomain));
      setSyncMode(toStr(nextConnection?.syncMode, "import_once"));
      setImportStatus(toStr(nextConnection?.importStatus, "draft"));
      setAutoSyncPriceStock(nextConnection?.autoSyncPriceStock !== false);
      setAutoImportNewProducts(Boolean(nextConnection?.autoImportNewProducts));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Shopify integration details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerSlug, sellerCode]);

  useEffect(() => {
    const shopifySuccess = toStr(searchParams.get("shopifySuccess"));
    const shopifyError = toStr(searchParams.get("shopifyError"));
    const shopifyDetails = toStr(searchParams.get("shopifyDetails"));

    if (shopifySuccess === "connected") {
      setMessage("Shopify connected successfully.");
      setError(null);
      setSelectedIntegration("shopify");
      setDrawerOpen(true);
      void loadWorkspace();
      return;
    }

    if (shopifyError) {
      setError(shopifyDetails || "Shopify connection could not be completed.");
      setSelectedIntegration("shopify");
      setDrawerOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    const hasTransientParams =
      nextParams.has("shopifySuccess") || nextParams.has("shopifyError") || nextParams.has("shopifyDetails");
    if (!hasTransientParams) return;

    const timeout = window.setTimeout(() => {
      nextParams.delete("shopifySuccess");
      nextParams.delete("shopifyError");
      nextParams.delete("shopifyDetails");
      const nextQuery = nextParams.toString();
      const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
      window.history.replaceState(null, "", nextUrl);
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  async function runAction(action: "verify_connection" | "save_setup" | "prepare_import") {
    setBusyAction(action);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sellerSlug,
          sellerCode,
          shopDomain,
          adminAccessToken,
          syncMode,
          importStatus,
          autoSyncPriceStock,
          autoImportNewProducts,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to complete the Shopify action.");
      }

      if (action === "verify_connection") {
        setPreview(payload?.preview || null);
        setMessage("Shopify verified. Review the preview below.");
      } else if (action === "save_setup") {
        setConnection((payload?.connection || null) as ShopifyConnection | null);
        setAdminAccessToken("");
        setMessage("Shopify setup saved.");
        await loadWorkspace();
      } else {
        setMessage("Draft import prepared.");
        await loadWorkspace();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete the Shopify action.");
    } finally {
      setBusyAction("");
    }
  }

  function startOauthConnect() {
    if (!shopDomain.trim()) {
      setError("Enter your Shopify store domain first, for example your-store.myshopify.com.");
      setMessage(null);
      return;
    }

    const params = new URLSearchParams();
    if (sellerCode) params.set("sellerCode", sellerCode);
    else if (sellerSlug) params.set("sellerSlug", sellerSlug);
    params.set("shop", shopDomain.trim());
    params.set("syncMode", syncMode);
    params.set("importStatus", importStatus);
    params.set("autoSyncPriceStock", autoSyncPriceStock ? "true" : "false");
    params.set("autoImportNewProducts", autoImportNewProducts ? "true" : "false");
    window.location.href = `/api/client/v1/accounts/seller/shopify/authorize?${params.toString()}`;
  }

  const filteredIntegrations = useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    return INTEGRATIONS.filter((item) => {
      const filterMatch = activeFilter === "All integrations" || item.category === activeFilter;
      const searchMatch =
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle);
      return filterMatch && searchMatch;
    });
  }, [activeFilter, searchValue]);

  const selectedCard =
    INTEGRATIONS.find((item) => item.id === selectedIntegration) || INTEGRATIONS[0];

  const visiblePreview = useMemo(() => {
    const products = Array.isArray(preview?.products) ? preview.products : [];
    return products.slice(0, 4);
  }, [preview]);

  const previewTotals = {
    products: Number(preview?.totals?.products || 0),
    variants: Number(preview?.totals?.variants || 0),
  };

  function openIntegration(id: string) {
    setSelectedIntegration(id);
    const selected = INTEGRATIONS.find((item) => item.id === id);
    if (id === "shopify" && selected?.available) setDrawerOpen(true);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-black/6 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbff_100%)] p-5 shadow-[0_20px_45px_rgba(20,24,27,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[26px] font-semibold tracking-[-0.04em] text-[#202020]">Integrations</p>
            <p className="mt-2 max-w-[700px] text-[13px] leading-[1.7] text-[#67727d]">
              Connect the tools that matter to {vendorName || "this seller account"} and keep the page easy to understand at a glance.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[auto_auto]">
            <div className="inline-flex items-center rounded-full bg-[rgba(122,92,255,0.08)] px-4 py-2 text-[12px] font-semibold text-[#6b4ce6]">
              {connection?.connected ? "1 active integration" : "No active integrations yet"}
            </div>
            <div className="inline-flex items-center rounded-full bg-[rgba(15,128,195,0.08)] px-4 py-2 text-[12px] font-semibold text-[#0f80c3]">
              Shopify available
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`inline-flex h-10 items-center rounded-full px-4 text-[13px] font-medium transition ${
                  activeFilter === filter
                    ? "bg-[#6f55f6] text-white shadow-[0_10px_24px_rgba(111,85,246,0.22)]"
                    : "bg-[#f4f5fb] text-[#525e6b]"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:max-w-[280px]">
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search integrations"
              className="h-11 w-full rounded-full border border-black/6 bg-[#f8f8fc] px-4 pr-11 text-[13px] text-[#202020] outline-none transition focus:border-[#d6cffb] focus:ring-2 focus:ring-[#ebe7ff]"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#949fb0]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="6" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
          </div>
        </div>

        {message ? <div className="mt-4 rounded-[14px] border border-[#d1fae5] bg-[#ecfdf5] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
        {error ? <div className="mt-4 rounded-[14px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {filteredIntegrations.map((item) => {
            const isShopify = item.id === "shopify";
            const connected = isShopify ? Boolean(connection?.connected) : false;
            const isSelected = item.id === selectedCard.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openIntegration(item.id)}
                className={`rounded-[22px] border p-4 text-left transition ${
                  isSelected
                    ? "border-[#d8cffd] bg-white shadow-[0_20px_35px_rgba(111,85,246,0.12)]"
                    : "border-black/6 bg-white shadow-[0_12px_24px_rgba(20,24,27,0.05)]"
                }`}
              >
                <div className={`rounded-[18px] bg-gradient-to-br ${item.accent} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white shadow-[0_10px_18px_rgba(20,24,27,0.08)]">
                      <IntegrationLogo id={item.id} />
                    </span>
                    <ConnectionSwitch active={connected} disabled />
                  </div>
                  <p className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-[#202020]">{item.name}</p>
                  <p className="mt-2 text-[12px] leading-[1.7] text-[#6a7380]">{item.description}</p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[12px]">
                  <span className="inline-flex rounded-full bg-[#f5f6fb] px-3 py-1 font-medium text-[#6c7280]">{item.category}</span>
                  <span className={`font-semibold ${connected ? "text-[#6b4ce6]" : item.available ? "text-[#202020]" : "text-[#9aa3b2]"}`}>
                    {connected ? "Connected" : item.available ? "Open" : "Coming soon"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {selectedCard.id === "shopify" && !drawerOpen ? (
        <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_20px_45px_rgba(20,24,27,0.07)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[22px] font-semibold tracking-[-0.03em] text-[#202020]">Shopify</p>
              <p className="mt-2 max-w-[720px] text-[13px] leading-[1.7] text-[#67727d]">
                Connect a Shopify store to preview products, prepare imports, and manage ongoing sync settings from one place.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex h-10 items-center rounded-full bg-[#6f55f6] px-4 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(111,85,246,0.22)]"
            >
              Open Shopify
            </button>
          </div>

          <div className="mt-5 rounded-[20px] border border-dashed border-black/10 bg-[#fbfbfe] px-5 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-white shadow-[0_12px_24px_rgba(20,24,27,0.08)]">
              <IntegrationLogo id="shopify" />
            </div>
            <p className="mt-4 text-[18px] font-semibold text-[#202020]">Shopify integration</p>
            <p className="mx-auto mt-2 max-w-[620px] text-[13px] leading-[1.7] text-[#67727d]">
              Sellers can connect Shopify, verify the connected shop, review preview products, and prepare a draft import into Piessang.
            </p>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="mt-5 inline-flex h-11 items-center rounded-full border border-black/8 bg-white px-5 text-[13px] font-semibold text-[#202020]"
            >
              Open connection settings
            </button>
          </div>
        </section>
      ) : null}

      {drawerOpen && selectedCard.id === "shopify" && selectedCard.available ? (
        <div className="fixed inset-0 z-[90] flex justify-end bg-[rgba(20,24,27,0.22)]">
          <button
            type="button"
            aria-label="Close drawer"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative h-full w-full max-w-[430px] overflow-y-auto border-l border-black/8 bg-white p-5 shadow-[-20px_0_40px_rgba(20,24,27,0.12)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[20px] font-semibold text-[#202020]">Shopify details</p>
                <p className="mt-1 text-[12px] text-[#67727d]">Connection settings and fallback tools.</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white text-[#202020]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-[20px] border border-[#d8e8f6] bg-[linear-gradient(135deg,#f7fbff_0%,#ffffff_100%)] p-4">
                <p className="text-[15px] font-semibold text-[#202020]">Connect store</p>
                <label className="mt-4 block">
                  <span className="text-[12px] font-semibold text-[#202020]">Shop domain</span>
                  <input
                    value={shopDomain}
                    onChange={(event) => setShopDomain(event.target.value)}
                    placeholder="your-store.myshopify.com"
                    className="mt-2 h-11 w-full rounded-[14px] border border-black/8 bg-white px-4 text-[13px] text-[#202020] outline-none transition focus:border-[#d6cffb] focus:ring-2 focus:ring-[#ebe7ff]"
                  />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={startOauthConnect}
                    disabled={Boolean(busyAction) || !shopDomain.trim()}
                    className="inline-flex h-11 items-center rounded-full bg-[#6f55f6] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Connect Shopify
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadWorkspace()}
                    disabled={loading}
                    className="inline-flex h-11 items-center rounded-full border border-black/8 bg-white px-5 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="rounded-[20px] border border-black/8 bg-[#fafafe] p-4">
                <p className="text-[14px] font-semibold text-[#202020]">Sync settings</p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#202020]">Sync mode</span>
                    <select
                      value={syncMode}
                      onChange={(event) => setSyncMode(event.target.value)}
                      className="mt-2 h-11 w-full rounded-[14px] border border-black/8 bg-white px-4 text-[13px] text-[#202020] outline-none transition focus:border-[#d6cffb] focus:ring-2 focus:ring-[#ebe7ff]"
                    >
                      <option value="import_once">Import once</option>
                      <option value="ongoing_sync">Ongoing sync</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#202020]">Import destination</span>
                    <select
                      value={importStatus}
                      onChange={(event) => setImportStatus(event.target.value)}
                      className="mt-2 h-11 w-full rounded-[14px] border border-black/8 bg-white px-4 text-[13px] text-[#202020] outline-none transition focus:border-[#d6cffb] focus:ring-2 focus:ring-[#ebe7ff]"
                    >
                      <option value="draft">Draft only</option>
                      <option value="review">Ready for review</option>
                    </select>
                  </label>
                  <div className="rounded-[16px] bg-white px-4 py-3 text-[12px] leading-[1.7] text-[#67727d]">
                    <span className="block font-semibold text-[#202020]">Categories stay in Piessang</span>
                    Shopify will not overwrite the category or subcategory chosen by the seller in Piessang.
                  </div>
                  <label className="flex items-start gap-3 rounded-[16px] bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={autoSyncPriceStock}
                      onChange={(event) => setAutoSyncPriceStock(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-black/20 text-[#202020] focus:ring-[#cbb26b]"
                    />
                    <span className="text-[12px] leading-[1.7] text-[#67727d]">
                      <span className="block font-semibold text-[#202020]">Keep stock and price synced</span>
                      Shopify remains the source of truth.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-[16px] bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={autoImportNewProducts}
                      onChange={(event) => setAutoImportNewProducts(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-black/20 text-[#202020] focus:ring-[#cbb26b]"
                    />
                    <span className="text-[12px] leading-[1.7] text-[#67727d]">
                      <span className="block font-semibold text-[#202020]">Auto-import new products</span>
                      Keep this off if you want manual review first.
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-[20px] border border-black/8 bg-[#fafafe] p-4">
                <p className="text-[14px] font-semibold text-[#202020]">Connection at a glance</p>
                <div className="mt-4 space-y-3 text-[12px] text-[#67727d]">
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <p className="font-semibold text-[#202020]">Store</p>
                    <p className="mt-1">{connection?.shopName || "Not connected yet"}</p>
                  </div>
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <p className="font-semibold text-[#202020]">Domain</p>
                    <p className="mt-1">{connection?.shopDomain || shopDomain || "No domain entered"}</p>
                  </div>
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <p className="font-semibold text-[#202020]">Last verified</p>
                    <p className="mt-1">{formatTimestamp(connection?.verifiedAt)}</p>
                  </div>
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <p className="font-semibold text-[#202020]">Webhook delivery</p>
                    <p className="mt-1">{connection?.webhooks?.deliveryUrl || "Will be registered automatically after connect"}</p>
                    {connection?.webhooks?.lastError ? (
                      <p className="mt-2 text-[#b91c1c]">{connection.webhooks.lastError}</p>
                    ) : null}
                  </div>
                  <div className="rounded-[14px] bg-white px-4 py-3">
                    <p className="font-semibold text-[#202020]">Latest sync result</p>
                    <p className="mt-1">
                      {connection?.lastSyncSummary
                        ? `${connection.lastSyncSummary.syncedProducts || 0} matched, ${connection.lastSyncSummary.unmatchedVariants || 0} unmatched`
                        : "No webhook sync has been processed yet"}
                    </p>
                    {connection?.lastSyncSummary?.createdDraftProductId ? (
                      <p className="mt-2">Created draft product {connection.lastSyncSummary.createdDraftProductId}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-black/8 bg-[#fafafe] p-4">
                <p className="text-[14px] font-semibold text-[#202020]">Prepare import</p>
                <button
                  type="button"
                  onClick={() => void runAction("prepare_import")}
                  disabled={Boolean(busyAction) || !connection?.connected}
                  className="mt-4 inline-flex h-11 items-center rounded-full bg-[#6f55f6] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === "prepare_import" ? "Preparing..." : "Prepare import"}
                </button>
              </div>

              <div className="rounded-[20px] border border-black/8 bg-[#fafafe] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold text-[#202020]">Advanced fallback</p>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSetup((current) => !current)}
                    className="inline-flex h-9 items-center rounded-full border border-black/8 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                  >
                    {showAdvancedSetup ? "Hide" : "Show"}
                  </button>
                </div>
                {showAdvancedSetup ? (
                  <div className="mt-4 space-y-3">
                    <input
                      type="password"
                      value={adminAccessToken}
                      onChange={(event) => setAdminAccessToken(event.target.value)}
                      placeholder={connection?.tokenMasked ? `Saved token: ${connection.tokenMasked}` : "Admin access token"}
                      className="h-11 w-full rounded-[14px] border border-black/8 bg-white px-4 text-[13px] text-[#202020] outline-none transition focus:border-[#d6cffb] focus:ring-2 focus:ring-[#ebe7ff]"
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void runAction("verify_connection")}
                        disabled={Boolean(busyAction) || !shopDomain.trim() || !adminAccessToken.trim()}
                        className="inline-flex h-10 items-center rounded-full bg-[#202020] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyAction === "verify_connection" ? "Verifying..." : "Verify token"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("save_setup")}
                        disabled={Boolean(busyAction) || !shopDomain.trim() || (!adminAccessToken.trim() && !connection?.connected)}
                        className="inline-flex h-10 items-center rounded-full border border-black/8 bg-white px-4 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyAction === "save_setup" ? "Saving..." : "Save manual setup"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] leading-[1.7] text-[#67727d]">
                    The switch on the card does not turn on from this section until connection is genuinely saved.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
