"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { AppSnackbar } from "@/components/ui/app-snackbar";

type SellerIntegrationsWorkspaceProps = {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
};

type ShopifyPreviewProduct = {
  id: string;
  title: string;
  vendor: string;
  status?: string;
  imageUrl?: string;
  imageAlt?: string;
  totalInventory: number;
  variantCount: number;
  variants: Array<{ price: number }>;
};

type ShopifyPreparedImportItem = ShopifyPreviewProduct & {
  alreadyImported?: boolean;
  importable?: boolean;
  existingProductId?: string;
  existingProductTitle?: string;
  matchedVariantCount?: number;
};

type ShopifyPreparedImportJob = {
  id: string;
  status?: string;
  totals?: {
    products?: number;
    variants?: number;
  };
  selection?: ShopifyPreparedImportItem[];
};

type PreparedImportFilter = "all" | "ready" | "imported" | "draft" | "archived";

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
  importSummary?: {
    importedProducts?: number;
    importedVariants?: number;
    lastImportedAt?: string;
    recentProducts?: Array<{
      id: string;
      title?: string;
      moderationStatus?: string;
      importedAt?: string;
      variantCount?: number;
    }>;
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

function formatInventory(value?: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0 in stock";
  return `${amount} in stock`;
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
  const [snackbarNotice, setSnackbarNotice] = useState<{ tone?: "info" | "success" | "error"; message: string } | null>(null);
  const [connection, setConnection] = useState<ShopifyConnection | null>(null);
  const [preview, setPreview] = useState<ShopifyConnection["lastPreview"] | null>(null);
  const [activeFilter, setActiveFilter] = useState("All integrations");
  const [searchValue, setSearchValue] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState("shopify");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [preparedImportJob, setPreparedImportJob] = useState<ShopifyPreparedImportJob | null>(null);
  const [selectedImportProductIds, setSelectedImportProductIds] = useState<string[]>([]);
  const [preparedImportFilter, setPreparedImportFilter] = useState<PreparedImportFilter>("all");
  const [preparedImportSearch, setPreparedImportSearch] = useState("");
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
      setDrawerOpen(false);
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

  useEffect(() => {
    if (!snackbarNotice) return undefined;
    const timeout = window.setTimeout(() => setSnackbarNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [snackbarNotice]);

  async function runAction(action: "verify_connection" | "save_setup" | "prepare_import" | "disconnect" | "retry_webhooks" | "import_selected_products") {
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
          jobId: preparedImportJob?.id || "",
          productIds: selectedImportProductIds,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to complete the Shopify action.");
      }

      if (action === "verify_connection") {
        setPreview(payload?.preview || null);
        setMessage("Shopify verified. Review the preview below.");
        setSnackbarNotice({ tone: "success", message: "Shopify verified." });
      } else if (action === "save_setup") {
        setConnection((payload?.connection || null) as ShopifyConnection | null);
        setAdminAccessToken("");
        setMessage("Shopify setup saved.");
        setSnackbarNotice({ tone: "success", message: payload?.message || "Shopify setup saved." });
        await loadWorkspace();
      } else if (action === "retry_webhooks") {
        setConnection((payload?.connection || null) as ShopifyConnection | null);
        setMessage(payload?.message || "Webhook registration retried.");
        setSnackbarNotice({ tone: "success", message: payload?.message || "Webhook registration retried." });
        await loadWorkspace();
      } else if (action === "import_selected_products") {
        setConnection((payload?.connection || null) as ShopifyConnection | null);
        setImportModalOpen(false);
        setPreparedImportJob(null);
        setSelectedImportProductIds([]);
        setMessage(payload?.message || "Selected Shopify products imported.");
        setSnackbarNotice({ tone: "success", message: payload?.message || "Selected Shopify products imported." });
        await loadWorkspace();
      } else if (action === "disconnect") {
        setConnection((payload?.connection || null) as ShopifyConnection | null);
        setPreview(null);
        setAdminAccessToken("");
        setShopDomain("");
        setDisconnectConfirmOpen(false);
        setDrawerOpen(false);
        setMessage(payload?.message || "Shopify integration disconnected.");
        setSnackbarNotice({ tone: "success", message: payload?.message || "Shopify integration disconnected." });
        await loadWorkspace();
      } else {
        const preparedProducts = Number(payload?.job?.totals?.products || 0);
        const preparedVariants = Number(payload?.job?.totals?.variants || 0);
        const nextMessage = `Import snapshot prepared with ${preparedProducts} products and ${preparedVariants} variants.`;
        setConnection((payload?.connection || null) as ShopifyConnection | null);
        setPreparedImportJob((payload?.job || null) as ShopifyPreparedImportJob | null);
        setPreparedImportFilter("all");
        setPreparedImportSearch("");
        setSelectedImportProductIds(
          Array.isArray(payload?.job?.selection)
            ? payload.job.selection.filter((item: ShopifyPreparedImportItem) => item?.importable !== false).map((item: ShopifyPreparedImportItem) => toStr(item?.id)).filter(Boolean)
            : [],
        );
        setImportModalOpen(Boolean(payload?.job?.selection?.length));
        setMessage(nextMessage);
        setSnackbarNotice({ tone: "success", message: nextMessage });
        await loadWorkspace();
      }
    } catch (cause) {
      const nextError = cause instanceof Error ? cause.message : "Unable to complete the Shopify action.";
      setError(nextError);
      setSnackbarNotice({ tone: "error", message: nextError });
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
  const importedTotals = {
    products: Number(connection?.importSummary?.importedProducts || 0),
    variants: Number(connection?.importSummary?.importedVariants || 0),
  };
  const recentImportedProducts = Array.isArray(connection?.importSummary?.recentProducts)
    ? connection.importSummary.recentProducts.slice(0, 4)
    : [];
  const latestJob = Array.isArray(connection?.jobs) ? connection.jobs[0] : null;
  const previewNeedsImport = previewTotals.products > importedTotals.products;
  const catalogueHref = sellerSlug
    ? `/seller/dashboard?section=catalogue&seller=${encodeURIComponent(sellerSlug)}`
    : "/seller/dashboard?section=catalogue";
  const preparedSelection = Array.isArray(preparedImportJob?.selection) ? preparedImportJob.selection : [];
  const importablePreparedItems = preparedSelection.filter((item) => item?.importable !== false);
  const alreadyImportedPreparedItems = preparedSelection.filter((item) => item?.alreadyImported);
  const filteredPreparedSelection = preparedSelection.filter((item) => {
    const searchNeedle = preparedImportSearch.trim().toLowerCase();
    const matchesSearch =
      !searchNeedle ||
      toStr(item?.title).toLowerCase().includes(searchNeedle) ||
      toStr(item?.vendor).toLowerCase().includes(searchNeedle);
    if (!matchesSearch) return false;

    if (preparedImportFilter === "ready") return item?.importable !== false;
    if (preparedImportFilter === "imported") return Boolean(item?.alreadyImported);
    if (preparedImportFilter === "draft") return toStr(item?.status).toLowerCase() === "draft";
    if (preparedImportFilter === "archived") return toStr(item?.status).toLowerCase() === "archived";
    return true;
  });
  const selectedImportCount = selectedImportProductIds.length;

  function togglePreparedProduct(productId: string) {
    const safeId = toStr(productId);
    if (!safeId) return;
    setSelectedImportProductIds((current) =>
      current.includes(safeId) ? current.filter((item) => item !== safeId) : [...current, safeId],
    );
  }

  function selectAllPreparedProducts() {
    setSelectedImportProductIds(importablePreparedItems.map((item) => toStr(item.id)).filter(Boolean));
  }

  function clearPreparedSelection() {
    setSelectedImportProductIds([]);
  }

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
              <div
                key={item.id}
                className={`rounded-[22px] border p-4 text-left transition ${
                  isSelected
                    ? "border-[#d8cffd] bg-white shadow-[0_20px_35px_rgba(111,85,246,0.12)]"
                    : "border-black/6 bg-white shadow-[0_12px_24px_rgba(20,24,27,0.05)]"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openIntegration(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openIntegration(item.id);
                    }
                  }}
                  className="block w-full cursor-pointer text-left"
                >
                <div className={`rounded-[18px] bg-gradient-to-br ${item.accent} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white shadow-[0_10px_18px_rgba(20,24,27,0.08)]">
                      <IntegrationLogo id={item.id} />
                    </span>
                    {isShopify ? (
                      <button
                        type="button"
                        aria-label={connected ? "Disconnect Shopify" : "Open Shopify connection settings"}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (connected) {
                            setDisconnectConfirmOpen(true);
                            return;
                          }
                          openIntegration(item.id);
                        }}
                        className="rounded-full"
                      >
                        <ConnectionSwitch active={connected} />
                      </button>
                    ) : (
                      <ConnectionSwitch active={connected} disabled />
                    )}
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
                </div>
              </div>
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
              Shopify Settings
            </button>
          </div>

          {connection?.connected && visiblePreview.length ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[20px] border border-black/6 bg-[#fbfbfe] p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[16px] font-semibold text-[#202020]">Shopify connected</p>
                      <p className="mt-1 text-[13px] leading-[1.7] text-[#67727d]">
                        {connection?.shopDomain || "Connected Shopify store"} • {previewTotals.products} products ready • {importedTotals.products} imported
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void runAction("prepare_import")}
                        disabled={Boolean(busyAction) || !connection?.connected}
                        className="inline-flex h-11 items-center rounded-full bg-[#6f55f6] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyAction === "prepare_import" ? "Preparing import..." : "Prepare import"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className="inline-flex h-11 items-center rounded-full border border-black/8 bg-white px-5 text-[13px] font-semibold text-[#202020]"
                      >
                        Shopify settings
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-[16px] bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Preview</p>
                      <p className="mt-2 text-[24px] font-semibold text-[#202020]">{previewTotals.products}</p>
                    </div>
                    <div className="rounded-[16px] bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Variants</p>
                      <p className="mt-2 text-[24px] font-semibold text-[#202020]">{previewTotals.variants}</p>
                    </div>
                    <div className="rounded-[16px] bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Imported</p>
                      <p className="mt-2 text-[24px] font-semibold text-[#202020]">{importedTotals.products}</p>
                    </div>
                    <div className="rounded-[16px] bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Last refresh</p>
                      <p className="mt-2 text-[13px] font-semibold text-[#202020]">{formatTimestamp(preview?.fetchedAt)}</p>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-[#e8dcac] bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_100%)] px-4 py-3 text-[13px] leading-[1.7] text-[#67727d]">
                    {previewNeedsImport
                      ? "These products are visible from Shopify but not all represented in Piessang yet. Prepare an import to open the product picker."
                      : "Your latest Shopify preview is already represented in Piessang. Open catalogue or prepare another import after Shopify changes."}
                  </div>

                  <div className="rounded-[18px] bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[16px] font-semibold text-[#202020]">Latest products</p>
                        <p className="mt-1 text-[12px] leading-[1.7] text-[#67727d]">
                          A quick preview of the latest Shopify products available for import.
                        </p>
                      </div>
                      <Link
                        href={catalogueHref}
                        className="inline-flex h-10 items-center rounded-full border border-black/8 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                      >
                        Open catalogue
                      </Link>
                    </div>

                    <div className="mt-4 overflow-x-auto pb-2">
                      <div className="flex gap-3">
                        {visiblePreview.map((product) => {
                          const firstVariantPrice = Array.isArray(product.variants) ? product.variants[0]?.price : 0;
                          return (
                            <div
                              key={product.id}
                              className="min-w-[240px] max-w-[240px] rounded-[18px] border border-black/6 bg-[#fafafe] p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-semibold text-[#202020]">{product.title || "Untitled product"}</p>
                                  <p className="mt-1 truncate text-[12px] text-[#67727d]">{product.vendor || connection?.shopName || "Shopify"}</p>
                                </div>
                                <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#596273]">
                                  {formatStatus(product.status || "active")}
                                </span>
                              </div>

                              <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-[#67727d]">
                                <div className="rounded-[12px] bg-white px-3 py-2">
                                  <p className="font-semibold text-[#202020]">Stock</p>
                                  <p className="mt-1">{formatInventory(product.totalInventory)}</p>
                                </div>
                                <div className="rounded-[12px] bg-white px-3 py-2">
                                  <p className="font-semibold text-[#202020]">Variants</p>
                                  <p className="mt-1">{Number(product.variantCount || 0)}</p>
                                </div>
                                <div className="rounded-[12px] bg-white px-3 py-2">
                                  <p className="font-semibold text-[#202020]">From</p>
                                  <p className="mt-1">R {formatPrice(firstVariantPrice)}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="mt-5 rounded-[20px] border border-dashed border-black/10 bg-[#fbfbfe] px-5 py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-white shadow-[0_12px_24px_rgba(20,24,27,0.08)]">
                <IntegrationLogo id="shopify" />
              </div>
              <p className="mt-4 text-[18px] font-semibold text-[#202020]">
                {connection?.connected ? "No preview products yet" : "Shopify integration"}
              </p>
              <p className="mx-auto mt-2 max-w-[620px] text-[13px] leading-[1.7] text-[#67727d]">
                {connection?.connected
                  ? "The store is connected, but Piessang does not have a saved product preview yet. Open the connection settings and refresh or prepare an import to fetch the latest snapshot."
                  : "Sellers can connect Shopify, verify the connected shop, review preview products, and prepare a draft import into Piessang."}
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mt-5 inline-flex h-11 items-center rounded-full border border-black/8 bg-white px-5 text-[13px] font-semibold text-[#202020]"
              >
                Open connection settings
              </button>
            </div>
          )}
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
                    disabled={Boolean(busyAction) || !shopDomain.trim() || Boolean(connection?.connected)}
                    className="inline-flex h-11 items-center rounded-full bg-[#6f55f6] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {connection?.connected ? "Shopify connected" : "Connect Shopify"}
                  </button>
                  {connection?.connected && connection?.webhooks?.lastError ? (
                    <button
                      type="button"
                      onClick={() => void runAction("retry_webhooks")}
                      disabled={Boolean(busyAction)}
                      className="inline-flex h-11 items-center rounded-full border border-black/8 bg-white px-5 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyAction === "retry_webhooks" ? "Retrying webhooks..." : "Retry webhooks"}
                    </button>
                  ) : null}
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
                <p className="mt-2 text-[12px] leading-[1.7] text-[#67727d]">
                  This creates a fresh import snapshot from Shopify. The latest prepared job is listed below so you can confirm something actually happened.
                </p>
                {latestJob ? (
                  <div className="mt-3 rounded-[14px] bg-white px-4 py-3 text-[12px] text-[#67727d]">
                    <p className="font-semibold text-[#202020]">Latest prepared job</p>
                    <p className="mt-1">
                      {formatStatus(latestJob.status)} • {Number(latestJob?.totals?.products || 0)} products • {Number(latestJob?.totals?.variants || 0)} variants
                    </p>
                    <p className="mt-1">Created {formatTimestamp(latestJob.createdAt)}</p>
                  </div>
                ) : null}
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

      {importModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.35)] p-4">
          <button
            type="button"
            aria-label="Close import modal"
            onClick={() => {
              if (busyAction === "import_selected_products") return;
              setImportModalOpen(false);
            }}
            className="absolute inset-0"
          />
          <div className="relative z-[1] flex max-h-[90vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[28px] border border-black/8 bg-white shadow-[0_30px_70px_rgba(20,24,27,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
              <div>
                <p className="text-[24px] font-semibold tracking-[-0.04em] text-[#202020]">Import Shopify products</p>
                <p className="mt-2 max-w-[760px] text-[13px] leading-[1.7] text-[#67727d]">
                  Choose which prepared Shopify products should be created as draft products in Piessang. Already imported items stay disabled so we do not create duplicates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (busyAction === "import_selected_products") return;
                  setImportModalOpen(false);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white text-[#202020]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="grid gap-4 border-b border-black/6 bg-[#fafafe] px-6 py-4 md:grid-cols-3">
              <div className="rounded-[18px] bg-white px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Prepared</p>
                <p className="mt-2 text-[26px] font-semibold text-[#202020]">{preparedSelection.length}</p>
              </div>
              <div className="rounded-[18px] bg-white px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Ready to import</p>
                <p className="mt-2 text-[26px] font-semibold text-[#202020]">{importablePreparedItems.length}</p>
              </div>
              <div className="rounded-[18px] bg-white px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8b94a3]">Already in Piessang</p>
                <p className="mt-2 text-[26px] font-semibold text-[#202020]">{alreadyImportedPreparedItems.length}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "all", label: "All" },
                    { id: "ready", label: "Ready to import" },
                    { id: "imported", label: "Already imported" },
                    { id: "draft", label: "Draft in Shopify" },
                    { id: "archived", label: "Archived in Shopify" },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setPreparedImportFilter(filter.id as PreparedImportFilter)}
                      className={`inline-flex h-10 items-center rounded-full px-4 text-[12px] font-semibold transition ${
                        preparedImportFilter === filter.id
                          ? "bg-[#6f55f6] text-white shadow-[0_10px_24px_rgba(111,85,246,0.18)]"
                          : "border border-black/8 bg-white text-[#202020]"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="relative min-w-[240px] flex-1">
                    <input
                      value={preparedImportSearch}
                      onChange={(event) => setPreparedImportSearch(event.target.value)}
                      placeholder="Search prepared products"
                      className="h-10 w-full rounded-full border border-black/8 bg-white px-4 text-[12px] text-[#202020] outline-none transition focus:border-[#d6cffb] focus:ring-2 focus:ring-[#ebe7ff]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={selectAllPreparedProducts}
                    disabled={!importablePreparedItems.length || busyAction === "import_selected_products"}
                    className="inline-flex h-10 items-center rounded-full border border-black/8 bg-white px-4 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Select all importable
                  </button>
                  <button
                    type="button"
                    onClick={clearPreparedSelection}
                    disabled={!selectedImportCount || busyAction === "import_selected_products"}
                    className="inline-flex h-10 items-center rounded-full border border-black/8 bg-white px-4 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
              <p className="text-[12px] font-semibold text-[#67727d]">{selectedImportCount} selected</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-3">
                {filteredPreparedSelection.map((item) => {
                  const productId = toStr(item.id);
                  const checked = selectedImportProductIds.includes(productId);
                  const disabled = item.importable === false || busyAction === "import_selected_products";
                  const firstVariantPrice = Array.isArray(item.variants) ? item.variants[0]?.price : 0;
                  return (
                    <label
                      key={productId}
                      className={`flex gap-4 rounded-[20px] border p-4 transition ${
                        disabled ? "border-black/6 bg-[#f7f7fb] opacity-80" : "border-[#e5e0fb] bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => togglePreparedProduct(productId)}
                        className="mt-1 h-4 w-4 rounded border-black/20 text-[#202020] focus:ring-[#cbb26b]"
                      />
                      <div className="flex-shrink-0">
                        {item.imageUrl ? (
                          <div className="relative h-20 w-20 overflow-hidden rounded-[18px] border border-black/6 bg-[#f8f8fc]">
                            <img
                              src={item.imageUrl}
                              alt={item.imageAlt || item.title || "Shopify product image"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-[18px] border border-dashed border-black/10 bg-[#f8f8fc]">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-white shadow-[0_8px_18px_rgba(20,24,27,0.06)]">
                              <IntegrationLogo id="shopify" />
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-[16px] font-semibold text-[#202020]">{item.title || "Untitled Shopify product"}</p>
                            <p className="mt-1 text-[12px] text-[#67727d]">{item.vendor || connection?.shopName || "Shopify"}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full bg-[#f5f6fb] px-3 py-1 text-[11px] font-semibold text-[#596273]">
                              {formatStatus(item.status || "active")}
                            </span>
                            {item.alreadyImported ? (
                              <span className="inline-flex rounded-full bg-[rgba(203,178,107,0.16)] px-3 py-1 text-[11px] font-semibold text-[#907d4c]">
                                Already imported
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-[rgba(34,197,94,0.12)] px-3 py-1 text-[11px] font-semibold text-[#15803d]">
                                Ready to import
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[14px] bg-[#fafafe] px-3 py-2 text-[12px] text-[#67727d]">
                            <p className="font-semibold text-[#202020]">Inventory</p>
                            <p className="mt-1">{formatInventory(item.totalInventory)}</p>
                          </div>
                          <div className="rounded-[14px] bg-[#fafafe] px-3 py-2 text-[12px] text-[#67727d]">
                            <p className="font-semibold text-[#202020]">Variants</p>
                            <p className="mt-1">{Number(item.variantCount || 0)}</p>
                          </div>
                          <div className="rounded-[14px] bg-[#fafafe] px-3 py-2 text-[12px] text-[#67727d]">
                            <p className="font-semibold text-[#202020]">From</p>
                            <p className="mt-1">R {formatPrice(firstVariantPrice)}</p>
                          </div>
                        </div>

                        {item.alreadyImported ? (
                          <p className="mt-3 text-[12px] leading-[1.7] text-[#67727d]">
                            This Shopify product is already linked to Piessang product {item.existingProductId || item.existingProductTitle || "record"}, so it will be skipped.
                          </p>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
                {!filteredPreparedSelection.length ? (
                  <div className="rounded-[20px] border border-dashed border-black/10 bg-[#fbfbfe] px-5 py-8 text-center">
                    <p className="text-[15px] font-semibold text-[#202020]">No prepared products match this filter</p>
                    <p className="mt-2 text-[12px] leading-[1.7] text-[#67727d]">
                      Try another filter or clear the search to see the rest of the prepared Shopify snapshot.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-black/6 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] leading-[1.7] text-[#67727d]">
                Imported Shopify products are created as draft Piessang products so categories and marketplace details can still be completed safely before publishing.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  disabled={busyAction === "import_selected_products"}
                  className="inline-flex h-11 items-center rounded-full border border-black/8 bg-white px-5 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void runAction("import_selected_products")}
                  disabled={!selectedImportCount || busyAction === "import_selected_products"}
                  className="inline-flex h-11 items-center rounded-full bg-[#6f55f6] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === "import_selected_products" ? "Importing..." : `Import now (${selectedImportCount})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={disconnectConfirmOpen}
        eyebrow="Shopify"
        title="Disconnect Shopify?"
        description="This will stop Piessang-side syncing and clear the saved Shopify credentials for this seller account. The Shopify app may still appear installed in Shopify until you uninstall it there."
        confirmLabel={busyAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
        onClose={() => {
          if (busyAction === "disconnect") return;
          setDisconnectConfirmOpen(false);
        }}
        onConfirm={() => void runAction("disconnect")}
        busy={busyAction === "disconnect"}
        tone="danger"
      >
        <p className="rounded-[16px] bg-[#faf5f5] px-4 py-3 text-[12px] leading-[1.7] text-[#7f1d1d]">
          To fully remove the app, also uninstall it in Shopify admin after disconnecting it in Piessang.
        </p>
      </ConfirmModal>
      <AppSnackbar notice={snackbarNotice} onClose={() => setSnackbarNotice(null)} />
    </div>
  );
}
