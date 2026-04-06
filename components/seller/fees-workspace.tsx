// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MARKETPLACE_FEE_CONFIG } from "@/lib/marketplace/fees";
import { formatMoneyExact } from "@/lib/money";

type FeeRule = {
  kind?: string;
  percent?: number;
  minPercent?: number;
  maxPercent?: number;
  estimatePercent?: number;
};

type CategoryItem = {
  slug: string;
  title: string;
  feeRule?: FeeRule;
  timestamps?: {
    updatedAt?: string | null;
  } | null;
  subCategories?: Array<{
    slug: string;
    title: string;
    feeRule?: FeeRule;
  }>;
};

type FulfilmentRow = {
  id: string;
  label: string;
  minVolumeCm3?: number | null;
  maxVolumeCm3?: number | null;
  prices: {
    light: number;
    heavy: number;
    heavyPlus: number;
    veryHeavy: number;
  };
  isActive?: boolean;
  timestamps?: {
    updatedAt?: string | null;
  } | null;
};

type StorageBand = {
  id?: string;
  label: string;
  minVolumeCm3?: number | null;
  maxVolumeCm3?: number | null;
  overstockedFeeIncl: number;
  timestamps?: {
    updatedAt?: string | null;
  } | null;
};

type FeeConfig = any & {
  categories: CategoryItem[];
  fulfilment?: {
    handlingFeeIncl?: number;
    rows?: FulfilmentRow[];
  };
  storage?: {
    thresholdDays?: number;
    bands?: StorageBand[];
  };
};

type TabKey = "categories" | "handling" | "storage";

function cloneDefaultConfig(): FeeConfig {
  return JSON.parse(JSON.stringify(DEFAULT_MARKETPLACE_FEE_CONFIG));
}

function toNum(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getFixedPercent(rule: FeeRule | undefined, fallback = 12) {
  if (!rule || typeof rule !== "object") return fallback;
  if (rule.kind === "fixed") return toNum(rule.percent, fallback);
  if (rule.kind === "range") return toNum(rule.estimatePercent ?? rule.minPercent ?? rule.maxPercent, fallback);
  return fallback;
}

function toFixedRule(percent: unknown) {
  return {
    kind: "fixed",
    percent: toNum(percent, 12),
  };
}

function normalizeUrl(value: string | URL | null | undefined) {
  if (!value) return "";
  try {
    return new URL(String(value), window.location.href).toString();
  } catch {
    return String(value);
  }
}

function formatMoney(value: unknown) {
  return formatMoneyExact(toNum(value, 0));
}

function formatVolumeRange(band: { minVolumeCm3?: number | null; maxVolumeCm3?: number | null }) {
  const min = band?.minVolumeCm3;
  const max = band?.maxVolumeCm3;
  if (min == null && max == null) return "Any size";
  if (min == null) return `Up to ${Number(max).toLocaleString()} cm3`;
  if (max == null) return `More than ${Number(min).toLocaleString()} cm3`;
  return `More than ${Number(min).toLocaleString()} cm3 up to ${Number(max).toLocaleString()} cm3`;
}

const WEIGHT_BAND_ORDER = ["light", "heavy", "heavyPlus", "veryHeavy"];

function formatWeightBandLabel(value: string) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "light") return "Light";
  if (key === "heavy") return "Heavy";
  if (key === "heavyplus") return "Heavy Plus";
  if (key === "veryheavy") return "Very Heavy";
  return value || "Band";
}

function formatWeightBandHint(value: string) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "light") return "Up to 7kg";
  if (key === "heavy") return "More than 7kg up to 25kg";
  if (key === "heavyplus") return "More than 25kg up to 40kg";
  if (key === "veryheavy") return "More than 40kg up to 70kg";
  return "";
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "categories", label: "Category Fees" },
  { key: "handling", label: "Fulfilment Fees" },
  { key: "storage", label: "Storage Fees" },
];

export function SellerFeesWorkspace() {
  const [config, setConfig] = useState<FeeConfig>(cloneDefaultConfig());
  const [savedConfig, setSavedConfig] = useState<FeeConfig>(cloneDefaultConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("categories");
  const [availableCatalogueCategories, setAvailableCatalogueCategories] = useState<Array<{ slug: string; title: string }>>([]);

  const [editingCategorySlug, setEditingCategorySlug] = useState<string | null>(null);
  const [editingFulfilmentId, setEditingFulfilmentId] = useState<string | null>(null);
  const [editingStorageLabel, setEditingStorageLabel] = useState<string | null>(null);
  const [addingCategoryFee, setAddingCategoryFee] = useState(false);
  const [addingFulfilmentFee, setAddingFulfilmentFee] = useState(false);
  const [addingStorageFee, setAddingStorageFee] = useState(false);

  const [draftPercent, setDraftPercent] = useState("12");
  const [draftFulfilmentLightFee, setDraftFulfilmentLightFee] = useState("0");
  const [draftFulfilmentHeavyFee, setDraftFulfilmentHeavyFee] = useState("0");
  const [draftFulfilmentHeavyPlusFee, setDraftFulfilmentHeavyPlusFee] = useState("0");
  const [draftFulfilmentVeryHeavyFee, setDraftFulfilmentVeryHeavyFee] = useState("0");
  const [draftStorageFee, setDraftStorageFee] = useState("0");
  const [draftThresholdDays, setDraftThresholdDays] = useState("35");
  const [draftCategorySlug, setDraftCategorySlug] = useState("");
  const [draftCategoryTitle, setDraftCategoryTitle] = useState("");
  const [draftFulfilmentLabel, setDraftFulfilmentLabel] = useState("");
  const [draftFulfilmentMinVolume, setDraftFulfilmentMinVolume] = useState("");
  const [draftFulfilmentMaxVolume, setDraftFulfilmentMaxVolume] = useState("");
  const [draftStorageLabelText, setDraftStorageLabelText] = useState("");
  const [draftStorageMinVolume, setDraftStorageMinVolume] = useState("");
  const [draftStorageMaxVolume, setDraftStorageMaxVolume] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/admin/marketplace-fees", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false || !payload?.config) {
          throw new Error(payload?.message || "Unable to load marketplace fees.");
        }
        if (!cancelled) {
          setConfig(payload.config);
          setSavedConfig(payload.config);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load marketplace fees.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogueCategories() {
      try {
        const response = await fetch("/api/catalogue/v1/categories/list?isActive=true", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) return;
        if (!cancelled) {
          setAvailableCatalogueCategories(Array.isArray(payload?.items) ? payload.items.filter(Boolean) : []);
        }
      } catch {
      }
    }

    void loadCatalogueCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => (Array.isArray(config?.categories) ? config.categories : []), [config]);
  const savedCategories = useMemo(() => (Array.isArray(savedConfig?.categories) ? savedConfig.categories : []), [savedConfig]);
  const fulfilmentRows = useMemo(() => (Array.isArray(config?.fulfilment?.rows) ? config.fulfilment.rows : []), [config]);
  const savedFulfilmentRows = useMemo(
    () => (Array.isArray(savedConfig?.fulfilment?.rows) ? savedConfig.fulfilment.rows : []),
    [savedConfig],
  );
  const storageBands = useMemo(() => (Array.isArray(config?.storage?.bands) ? config.storage.bands : []), [config]);
  const savedStorageBands = useMemo(
    () => (Array.isArray(savedConfig?.storage?.bands) ? savedConfig.storage.bands : []),
    [savedConfig],
  );

  const editingCategory = useMemo(
    () => categories.find((item) => item.slug === editingCategorySlug) ?? null,
    [categories, editingCategorySlug],
  );
  const editingFulfilmentRow = useMemo(
    () => fulfilmentRows.find((item) => item.id === editingFulfilmentId) ?? null,
    [fulfilmentRows, editingFulfilmentId],
  );
  const editingStorageBand = useMemo(
    () => storageBands.find((item) => item.label === editingStorageLabel) ?? null,
    [storageBands, editingStorageLabel],
  );
  const fulfilmentMatrixRows = useMemo(
    () =>
      [...fulfilmentRows].sort((left, right) => {
        const leftMin = toNum(left?.minVolumeCm3, -1);
        const rightMin = toNum(right?.minVolumeCm3, -1);
        if (leftMin !== rightMin) return leftMin - rightMin;
        return String(left?.label || "").localeCompare(String(right?.label || ""));
      }),
    [fulfilmentRows],
  );

  const hasUnsavedChanges = useMemo(() => JSON.stringify(config) !== JSON.stringify(savedConfig), [config, savedConfig]);
  const missingCategoryOptions = useMemo(() => {
    const existing = new Set(categories.map((item) => String(item.slug || "").trim().toLowerCase()));
    return availableCatalogueCategories.filter((item) => {
      const slug = String(item?.slug || "").trim().toLowerCase();
      return slug && !existing.has(slug);
    });
  }, [availableCatalogueCategories, categories]);

  const categoryLastUpdated = useMemo(
    () =>
      categories
        .map((item) => item?.timestamps?.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    [categories],
  );
  const handlingLastUpdated = useMemo(
    () =>
      fulfilmentRows
        .map((item) => item?.timestamps?.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    [fulfilmentRows],
  );
  const storageLastUpdated = useMemo(
    () =>
      storageBands
        .map((item) => item?.timestamps?.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    [storageBands],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    const currentUrl = window.location.href;
    const historyState = window.history.state;
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    let bypassGuard = false;

    function confirmLeave() {
      return window.confirm("You have unsaved fee changes. Save before leaving this page or your updates will be lost.");
    }

    function shouldAllowNavigation(nextUrl: string | URL | null | undefined) {
      const next = normalizeUrl(nextUrl);
      if (!next || next === currentUrl) return true;
      return confirmLeave();
    }

    window.history.pushState = function pushState(state, unused, url) {
      if (bypassGuard || shouldAllowNavigation(url)) {
        return originalPushState(state, unused, url);
      }
      return undefined;
    };

    window.history.replaceState = function replaceState(state, unused, url) {
      if (bypassGuard || shouldAllowNavigation(url)) {
        return originalReplaceState(state, unused, url);
      }
      return undefined;
    };

    originalPushState({ ...historyState, __feesGuard: true }, "", currentUrl);

    function handlePopState() {
      if (bypassGuard) return;
      if (confirmLeave()) {
        bypassGuard = true;
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("popstate", handlePopState);
        window.history.back();
        return;
      }
      bypassGuard = true;
      originalPushState({ ...historyState, __feesGuard: true }, "", currentUrl);
      bypassGuard = false;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsavedChanges]);

  function closeAllModals() {
    setEditingCategorySlug(null);
    setEditingFulfilmentId(null);
    setEditingStorageLabel(null);
    setAddingCategoryFee(false);
    setAddingFulfilmentFee(false);
    setAddingStorageFee(false);
    setDraftPercent("12");
    setDraftFulfilmentLightFee("0");
    setDraftFulfilmentHeavyFee("0");
    setDraftFulfilmentHeavyPlusFee("0");
    setDraftFulfilmentVeryHeavyFee("0");
    setDraftStorageFee("0");
    setDraftThresholdDays(String(toNum(config?.storage?.thresholdDays, 35)));
    setDraftCategorySlug("");
    setDraftCategoryTitle("");
    setDraftFulfilmentLabel("");
    setDraftFulfilmentMinVolume("");
    setDraftFulfilmentMaxVolume("");
    setDraftStorageLabelText("");
    setDraftStorageMinVolume("");
    setDraftStorageMaxVolume("");
  }

  function formatUpdatedAt(value: string | null | undefined) {
    if (!value) return "No recent update";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No recent update";
    return date.toLocaleString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function openCategoryModal(category: CategoryItem) {
    closeAllModals();
    setEditingCategorySlug(category.slug);
    setDraftPercent(String(getFixedPercent(category.feeRule, 12)));
  }

  function openAddCategoryModal() {
    closeAllModals();
    setAddingCategoryFee(true);
    const first = missingCategoryOptions[0] || null;
    setDraftCategorySlug(String(first?.slug || ""));
    setDraftCategoryTitle(String(first?.title || ""));
    setDraftPercent("12");
  }

  function openFulfilmentModal(row: FulfilmentRow) {
    closeAllModals();
    setEditingFulfilmentId(row.id);
    setDraftFulfilmentLabel(String(row.label || ""));
    setDraftFulfilmentMinVolume(row.minVolumeCm3 == null ? "" : String(row.minVolumeCm3));
    setDraftFulfilmentMaxVolume(row.maxVolumeCm3 == null ? "" : String(row.maxVolumeCm3));
    setDraftFulfilmentLightFee(String(toNum(row.prices?.light, 0)));
    setDraftFulfilmentHeavyFee(String(toNum(row.prices?.heavy, 0)));
    setDraftFulfilmentHeavyPlusFee(String(toNum(row.prices?.heavyPlus, 0)));
    setDraftFulfilmentVeryHeavyFee(String(toNum(row.prices?.veryHeavy, 0)));
  }

  function openAddFulfilmentModal() {
    closeAllModals();
    setAddingFulfilmentFee(true);
  }

  function openStorageModal(band: StorageBand) {
    closeAllModals();
    setEditingStorageLabel(band.label);
    setDraftStorageFee(String(toNum(band.overstockedFeeIncl, 0)));
    setDraftThresholdDays(String(toNum(config?.storage?.thresholdDays, 35)));
  }

  function openAddStorageModal() {
    closeAllModals();
    setAddingStorageFee(true);
    setDraftThresholdDays(String(toNum(config?.storage?.thresholdDays, 35)));
  }

  function applyCategoryPercent() {
    if (!editingCategory) return;
    const nextPercent = Math.max(0, toNum(draftPercent, 12));

    setConfig((current: FeeConfig) => ({
      ...current,
      categories: (current.categories || []).map((category) => {
        if (category.slug !== editingCategory.slug) return category;
        return {
          ...category,
          feeRule: toFixedRule(nextPercent),
          subCategories: Array.isArray(category.subCategories)
            ? category.subCategories.map((subCategory) => ({
                ...subCategory,
                feeRule: toFixedRule(nextPercent),
              }))
            : [],
        };
      }),
    }));

    closeAllModals();
  }

  function deleteCategoryFee() {
    if (!editingCategory) return;
    setConfig((current: FeeConfig) => ({
      ...current,
      categories: (current.categories || []).filter((category) => category.slug !== editingCategory.slug),
    }));
    setError(null);
    closeAllModals();
  }

  function addCategoryFee() {
    const nextSlug = String(draftCategorySlug || "").trim().toLowerCase();
    const nextTitle = String(draftCategoryTitle || "").trim();
    const nextPercent = Math.max(0, toNum(draftPercent, 12));
    if (!nextSlug || !nextTitle) {
      setError("Select a valid catalogue category before creating a success fee.");
      return;
    }
    if (categories.some((item) => String(item.slug || "").trim().toLowerCase() === nextSlug)) {
      setError("That category fee already exists.");
      return;
    }

    setConfig((current: FeeConfig) => ({
      ...current,
      categories: [
        ...(current.categories || []),
        {
          slug: nextSlug,
          title: nextTitle,
          feeRule: toFixedRule(nextPercent),
          subCategories: [],
        },
      ].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""))),
    }));
    setError(null);
    closeAllModals();
  }

  function buildFulfilmentDraftRow(existingId?: string | null) {
    const label = String(draftFulfilmentLabel || "").trim();
    if (!label) return null;
    return {
      id: existingId || label.toLowerCase().replace(/\s+/g, "-"),
      label,
      minVolumeCm3: draftFulfilmentMinVolume === "" ? null : Math.max(0, toNum(draftFulfilmentMinVolume, 0)),
      maxVolumeCm3: draftFulfilmentMaxVolume === "" ? null : Math.max(0, toNum(draftFulfilmentMaxVolume, 0)),
      prices: {
        light: Math.max(0, toNum(draftFulfilmentLightFee, 0)),
        heavy: Math.max(0, toNum(draftFulfilmentHeavyFee, 0)),
        heavyPlus: Math.max(0, toNum(draftFulfilmentHeavyPlusFee, 0)),
        veryHeavy: Math.max(0, toNum(draftFulfilmentVeryHeavyFee, 0)),
      },
      isActive: true,
    };
  }

  function applyFulfilmentRow() {
    if (!editingFulfilmentRow) return;
    const nextRow = buildFulfilmentDraftRow(editingFulfilmentRow.id);
    if (!nextRow) {
      setError("Enter a fulfilment row label and its volume range before saving.");
      return;
    }

    setConfig((current: FeeConfig) => ({
      ...current,
      fulfilment: {
        ...(current.fulfilment || {}),
        rows: (current.fulfilment?.rows || []).map((row) => (row.id === editingFulfilmentRow.id ? nextRow : row)),
      },
    }));

    closeAllModals();
  }

  function deleteFulfilmentRow() {
    if (!editingFulfilmentRow) return;
    setConfig((current: FeeConfig) => ({
      ...current,
      fulfilment: {
        ...(current.fulfilment || {}),
        rows: (current.fulfilment?.rows || []).filter((row) => row.id !== editingFulfilmentRow.id),
      },
    }));
    setError(null);
    closeAllModals();
  }

  function addFulfilmentRow() {
    const nextRow = buildFulfilmentDraftRow();
    if (!nextRow) {
      setError("Enter a fulfilment row label and its volume range before creating it.");
      return;
    }
    if (fulfilmentRows.some((item) => item.id === nextRow.id)) {
      setError("That fulfilment fee row already exists.");
      return;
    }

    setConfig((current: FeeConfig) => ({
      ...current,
      fulfilment: {
        ...(current.fulfilment || {}),
        rows: [...(current.fulfilment?.rows || []), nextRow],
      },
    }));
    setError(null);
    closeAllModals();
  }

  function applyStorageBand() {
    if (!editingStorageBand) return;
    const nextStorageFee = Math.max(0, toNum(draftStorageFee, 0));
    const nextThresholdDays = Math.max(0, toNum(draftThresholdDays, 35));

    setConfig((current: FeeConfig) => ({
      ...current,
      stockCoverThresholdDays: nextThresholdDays,
      storage: {
        ...(current.storage || {}),
        thresholdDays: nextThresholdDays,
        bands: (current.storage?.bands || []).map((band) =>
          band.label === editingStorageBand.label
            ? {
                ...band,
                overstockedFeeIncl: nextStorageFee,
              }
            : band,
        ),
      },
    }));

    closeAllModals();
  }

  function deleteStorageBand() {
    if (!editingStorageBand) return;
    setConfig((current: FeeConfig) => ({
      ...current,
      storage: {
        ...(current.storage || {}),
        bands: (current.storage?.bands || []).filter((band) => band.label !== editingStorageBand.label),
      },
    }));
    setError(null);
    closeAllModals();
  }

  function addStorageBand() {
    const label = String(draftStorageLabelText || "").trim();
    if (!label) {
      setError("Enter a size-band label before creating a storage fee row.");
      return;
    }
    if (storageBands.some((item) => String(item.label || "").trim().toLowerCase() === label.toLowerCase())) {
      setError("That storage fee row already exists.");
      return;
    }

    const nextThresholdDays = Math.max(0, toNum(draftThresholdDays, 35));
    setConfig((current: FeeConfig) => ({
      ...current,
      stockCoverThresholdDays: nextThresholdDays,
      storage: {
        ...(current.storage || {}),
        thresholdDays: nextThresholdDays,
        bands: [
          ...(current.storage?.bands || []),
          {
            label,
            minVolumeCm3: draftStorageMinVolume === "" ? null : Math.max(0, toNum(draftStorageMinVolume, 0)),
            maxVolumeCm3: draftStorageMaxVolume === "" ? null : Math.max(0, toNum(draftStorageMaxVolume, 0)),
            overstockedFeeIncl: Math.max(0, toNum(draftStorageFee, 0)),
          },
        ],
      },
    }));
    setError(null);
    closeAllModals();
  }

  async function saveConfig() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/admin/marketplace-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save marketplace fees.");
      }
      const nextConfig = payload.config || config;
      setConfig(nextConfig);
      setSavedConfig(nextConfig);
      setMessage("Marketplace fees saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save marketplace fees.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">Marketplace fees</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          This page controls how Piessang charges sellers across the marketplace. Fees stay live for product previews and
          checkout, then get locked onto the order when the order is created.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] font-semibold text-[#202020]">Category success fees</p>
          <p className="mt-2 text-[12px] leading-[1.7] text-[#57636c]">
            This is the marketplace success fee percentage. It applies to products in the selected category and is taken
            from the VAT-inclusive selling price when an order is created.
          </p>
        </article>
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] font-semibold text-[#202020]">Fulfilment fees</p>
          <p className="mt-2 text-[12px] leading-[1.7] text-[#57636c]">
            These only apply when Piessang fulfils the order. The fee is selected from the operational matrix by cubic size
            band, category class, and weight band. These warehouse fees are VAT exclusive.
          </p>
        </article>
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] font-semibold text-[#202020]">Storage fees</p>
          <p className="mt-2 text-[12px] leading-[1.7] text-[#57636c]">
            Storage fees apply only to Piessang-fulfilled stock when stock cover goes above the threshold. The threshold is
            the number of days of stock a seller can hold before the overstock fee begins to apply. These warehouse fees are
            VAT exclusive.
          </p>
        </article>
      </section>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex h-10 items-center rounded-[8px] px-4 text-[12px] font-semibold ${
              activeTab === tab.key ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#202020]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {hasUnsavedChanges ? (
        <div className="rounded-[8px] border border-[#b7e4c7] bg-[#f1fbf4] px-4 py-3 text-[12px] text-[#166534]">
          You have unsaved fee changes. Save before leaving this page or your updates will be lost.
        </div>
      ) : null}

      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      {activeTab === "categories" ? (
        <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Category fees</p>
              <p className="mt-1 text-[12px] text-[#57636c]">Last updated: {formatUpdatedAt(categoryLastUpdated)}</p>
            </div>
            <button
              type="button"
              onClick={openAddCategoryModal}
              disabled={!missingCategoryOptions.length}
              className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add fee
            </button>
          </div>
          <div className="grid grid-cols-[1.5fr_.9fr_.8fr_auto] gap-3 border-b border-black/5 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
            <div>Category</div>
            <div>Slug</div>
            <div>Success fee</div>
            <div className="text-right">Action</div>
          </div>

          <div className="divide-y divide-black/5">
            {loading ? (
              <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading fees...</div>
            ) : categories.length ? (
              categories.map((category) => {
                const savedCategory = savedCategories.find((item) => item.slug === category.slug);
                const currentPercent = getFixedPercent(category.feeRule, 12);
                const savedPercent = getFixedPercent(savedCategory?.feeRule, 12);
                const isChanged = Math.abs(currentPercent - savedPercent) > 0.001;

                return (
                  <div
                    key={category.slug}
                    className={`grid grid-cols-[1.5fr_.9fr_.8fr_auto] items-center gap-3 px-4 py-3 text-[13px] ${isChanged ? "bg-[#f1fbf4]" : ""}`}
                  >
                    <div className="min-w-0">
                      <span className={`block truncate font-semibold ${isChanged ? "text-[#166534]" : "text-[#202020]"}`}>{category.title}</span>
                      <span className="mt-0.5 block text-[11px] text-[#7d7d7d]">
                        {(category.subCategories || []).length} sub-categor{(category.subCategories || []).length === 1 ? "y" : "ies"}
                      </span>
                    </div>
                    <div className={`truncate ${isChanged ? "text-[#166534]" : "text-[#57636c]"}`}>{category.slug}</div>
                    <div className={`font-semibold ${isChanged ? "text-[#166534]" : "text-[#202020]"}`}>
                      {currentPercent.toFixed(1)}%
                      {isChanged ? <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.08em]">Unsaved</span> : null}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openCategoryModal(category)}
                        className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-10 text-[13px] text-[#57636c]">No categories found.</div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "handling" ? (
        <section className="space-y-3">
          <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
            <p className="text-[12px] font-semibold text-[#202020]">How fulfilment fees work</p>
            <p className="mt-1 text-[12px] leading-[1.7] text-[#57636c]">
              This should be read as a fulfilment matrix. Sellers only incur these fees when Piessang fulfils the order. Each
              item fee is chosen from one cubic size row and one weight column, and there is no separate handling fee.
            </p>
          </div>

          <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Fulfilment fee matrix</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Last updated: {formatUpdatedAt(handlingLastUpdated)}</p>
              </div>
              <button
                type="button"
                onClick={openAddFulfilmentModal}
                className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Add matrix row
              </button>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading fees...</div>
              ) : fulfilmentMatrixRows.length ? (
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-[#1178b9] text-white">
                    <tr>
                      <th className="px-4 py-3 text-[12px] font-semibold">Size</th>
                      {WEIGHT_BAND_ORDER.map((weightBand) => (
                        <th key={weightBand} className="px-4 py-3 text-[12px] font-semibold">
                          <span className="block">{formatWeightBandLabel(weightBand)}</span>
                          <span className="mt-1 block text-[10px] font-medium text-white/85">{formatWeightBandHint(weightBand)}</span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[12px] font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fulfilmentMatrixRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`${
                          JSON.stringify(row) !== JSON.stringify(savedFulfilmentRows.find((item) => item.id === row.id))
                            ? "bg-[#f1fbf4]"
                            : index % 2 === 0
                              ? "bg-white"
                              : "bg-[#f6fafe]"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <p className={`font-semibold ${JSON.stringify(row) !== JSON.stringify(savedFulfilmentRows.find((item) => item.id === row.id)) ? "text-[#166534]" : "text-[#202020]"}`}>{row.label}</p>
                          <p className={`mt-1 text-[12px] leading-[1.5] ${JSON.stringify(row) !== JSON.stringify(savedFulfilmentRows.find((item) => item.id === row.id)) ? "text-[#166534]" : "text-[#57636c]"}`}>{formatVolumeRange(row)}</p>
                          {JSON.stringify(row) !== JSON.stringify(savedFulfilmentRows.find((item) => item.id === row.id)) ? <span className="mt-2 inline-flex rounded-full bg-[#dcfce7] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#166534]">Unsaved</span> : null}
                        </td>
                      {WEIGHT_BAND_ORDER.map((weightBand) => {
                          return (
                            <td key={weightBand} className={`px-4 py-3 text-[16px] font-semibold ${JSON.stringify(row) !== JSON.stringify(savedFulfilmentRows.find((item) => item.id === row.id)) ? "text-[#166534]" : "text-[#202020]"}`}>
                              {formatMoney(row?.prices?.[weightBand])}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openFulfilmentModal(row)}
                            className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                          >
                            Edit row
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-10 text-[13px] text-[#57636c]">No fulfilment fee rows found.</div>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "storage" ? (
        <section className="space-y-3">
          <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <p className="text-[13px] leading-[1.7] text-[#57636c]">
              Free storage on fast-moving lines is still up to Piessang. Products with stock cover of {toNum(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays, 35)} days or less receive free storage at our distribution centres. Sellers can alternatively use lead time and only deliver what has already sold to avoid storage charges.
            </p>
            <div className="mt-4 inline-flex rounded-[2px] bg-[#efefef] px-4 py-3 text-[14px] font-semibold text-[#4b5563]">
              Formula: Stock Cover = ( Total Stock / Sales unit in the last 30 days ) * 30
            </div>
            <h3 className="mt-8 text-[24px] font-semibold text-[#3f3f46]">Storage Fees</h3>
            <p className="mt-5 text-[13px] leading-[1.7] text-[#57636c]">
              Eligible products are charged on the 1st day of the following month. For example, December storage is charged on 1 January.
            </p>
            <p className="mt-2 text-[12px] text-[#57636c]">Last updated: {formatUpdatedAt(storageLastUpdated)}</p>
          </div>

          <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Storage fee table</p>
                <p className="mt-1 text-[12px] text-[#57636c]">All warehouse storage fees are VAT exclusive.</p>
              </div>
              <button
                type="button"
                onClick={openAddStorageModal}
                className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Add fee
              </button>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading fees...</div>
              ) : storageBands.length ? (
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#1178b9] text-white">
                      <th colSpan={4} className="px-4 py-4 text-center text-[16px] font-semibold">
                        Storage Fee per item/month (Rands)*
                      </th>
                    </tr>
                    <tr className="bg-[#1178b9] text-white">
                      <th className="border-t border-white/40 px-4 py-4 text-center text-[15px] font-semibold">Size of packaged product in cm3</th>
                      <th className="border-l border-t border-white/40 px-4 py-4 text-center text-[15px] font-semibold">0 - {toNum(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays, 35)} stock days cover</th>
                      <th className="border-l border-t border-white/40 px-4 py-4 text-center text-[15px] font-semibold">{toNum(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays, 35)}+ stock days cover (Overstocked)</th>
                      <th className="border-l border-t border-white/40 px-4 py-4 text-center text-[15px] font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageBands.map((band, index) => {
                      const savedBand = savedStorageBands.find((item) => item.label === band.label);
                      const currentThreshold = toNum(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays, 35);
                      const savedThreshold = toNum(savedConfig?.storage?.thresholdDays ?? savedConfig?.stockCoverThresholdDays, 35);
                      const changed =
                        Math.abs(toNum(savedBand?.overstockedFeeIncl, 0) - toNum(band.overstockedFeeIncl, 0)) > 0.001 ||
                        Math.abs(savedThreshold - currentThreshold) > 0.001;

                      return (
                        <tr key={band.label} className={`${changed ? "bg-[#f1fbf4]" : index % 2 === 0 ? "bg-white" : "bg-[#eef4fb]"}`}>
                          <td className="border-t border-[#d7d7d7] px-5 py-5 align-top">
                            <p className={`text-[18px] font-semibold ${changed ? "text-[#166534]" : "text-[#3f3f46]"}`}>{band.label}</p>
                            <p className={`mt-2 text-[12px] font-medium ${changed ? "text-[#166534]" : "text-[#52525b]"}`}>{formatVolumeRange(band)}</p>
                            {changed ? <span className="mt-3 inline-flex rounded-full bg-[#dcfce7] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#166534]">Unsaved</span> : null}
                          </td>
                          <td className={`border-l border-t border-[#d7d7d7] px-4 py-5 text-center text-[22px] font-semibold ${changed ? "text-[#166534]" : "text-[#52525b]"}`}>R0</td>
                          <td className={`border-l border-t border-[#d7d7d7] px-4 py-5 text-center text-[22px] font-semibold ${changed ? "text-[#166534]" : "text-[#52525b]"}`}>{formatMoney(band.overstockedFeeIncl).replace(".00", "")}</td>
                          <td className="border-l border-t border-[#d7d7d7] px-4 py-5 text-center">
                            <button
                              type="button"
                              onClick={() => openStorageModal(band)}
                              className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-10 text-[13px] text-[#57636c]">No storage fee rows found.</div>
              )}
            </div>
          </section>
        </section>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={loading || saving}
          className="inline-flex h-11 items-center rounded-[8px] bg-[#202020] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : loading ? "Loading..." : "Save marketplace fees"}
        </button>
      </div>

      {editingCategory ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={closeAllModals}>
          <div className="w-full max-w-[480px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Edit fee</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{editingCategory.title}</h3>
              </div>
              <button type="button" onClick={closeAllModals} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020]" aria-label="Close">
                ×
              </button>
            </div>

            <div className="mt-5 rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Current fee</p>
              <p className="mt-1 text-[20px] font-semibold text-[#202020]">{getFixedPercent(editingCategory.feeRule, 12).toFixed(1)}%</p>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">New fee</span>
              <input type="number" min="0" step="0.1" value={draftPercent} onChange={(event) => setDraftPercent(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
            </label>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button type="button" onClick={deleteCategoryFee} className="inline-flex h-10 items-center rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 text-[13px] font-semibold text-[#b91c1c]">
                Delete fee
              </button>
              <div className="flex items-center gap-2">
              <button type="button" onClick={closeAllModals} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={applyCategoryPercent} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
                Update fee
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addingCategoryFee ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={closeAllModals}>
          <div className="w-full max-w-[520px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Add fee</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">New category success fee</h3>
                <p className="mt-1 text-[12px] text-[#57636c]">Only catalogue categories that do not already have a fee row can be selected here.</p>
              </div>
              <button type="button" onClick={closeAllModals} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020]" aria-label="Close">
                ×
              </button>
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Category</span>
              <select
                value={draftCategorySlug}
                onChange={(event) => {
                  const nextSlug = event.target.value;
                  const nextCategory = missingCategoryOptions.find((item) => item.slug === nextSlug) || null;
                  setDraftCategorySlug(nextSlug);
                  setDraftCategoryTitle(String(nextCategory?.title || ""));
                }}
                className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]"
              >
                {missingCategoryOptions.length ? (
                  missingCategoryOptions.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.title}
                    </option>
                  ))
                ) : (
                  <option value="">No available categories</option>
                )}
              </select>
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Success fee</span>
              <input type="number" min="0" step="0.1" value={draftPercent} onChange={(event) => setDraftPercent(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={closeAllModals} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={addCategoryFee} disabled={!missingCategoryOptions.length} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                Add fee
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingFulfilmentRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={closeAllModals}>
          <div className="w-full max-w-[520px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Edit fulfilment row</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{editingFulfilmentRow.label}</h3>
                <p className="mt-1 text-[12px] text-[#57636c]">{formatVolumeRange(editingFulfilmentRow)}</p>
              </div>
              <button type="button" onClick={closeAllModals} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020]" aria-label="Close">
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Row label</span>
                <input type="text" value={draftFulfilmentLabel} onChange={(event) => setDraftFulfilmentLabel(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Min volume cm3</span>
                <input type="number" min="0" step="1" value={draftFulfilmentMinVolume} onChange={(event) => setDraftFulfilmentMinVolume(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Max volume cm3</span>
                <input type="number" min="0" step="1" value={draftFulfilmentMaxVolume} onChange={(event) => setDraftFulfilmentMaxVolume(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Light fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentLightFee} onChange={(event) => setDraftFulfilmentLightFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Heavy fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentHeavyFee} onChange={(event) => setDraftFulfilmentHeavyFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Heavy Plus fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentHeavyPlusFee} onChange={(event) => setDraftFulfilmentHeavyPlusFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Very Heavy fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentVeryHeavyFee} onChange={(event) => setDraftFulfilmentVeryHeavyFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button type="button" onClick={deleteFulfilmentRow} className="inline-flex h-10 items-center rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 text-[13px] font-semibold text-[#b91c1c]">
                Delete row
              </button>
              <div className="flex items-center gap-2">
              <button type="button" onClick={closeAllModals} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={applyFulfilmentRow} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
                Update fee
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addingFulfilmentFee ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={closeAllModals}>
          <div className="w-full max-w-[520px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Add fee</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">New fulfilment row</h3>
                <p className="mt-1 text-[12px] text-[#57636c]">Define the volume range for this row, then set the fee for each weight tier.</p>
              </div>
              <button type="button" onClick={closeAllModals} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020]" aria-label="Close">
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Row label</span>
                <input type="text" value={draftFulfilmentLabel} onChange={(event) => setDraftFulfilmentLabel(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Min volume cm3</span>
                <input type="number" min="0" step="1" value={draftFulfilmentMinVolume} onChange={(event) => setDraftFulfilmentMinVolume(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Max volume cm3</span>
                <input type="number" min="0" step="1" value={draftFulfilmentMaxVolume} onChange={(event) => setDraftFulfilmentMaxVolume(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Light fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentLightFee} onChange={(event) => setDraftFulfilmentLightFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Heavy fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentHeavyFee} onChange={(event) => setDraftFulfilmentHeavyFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Heavy Plus fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentHeavyPlusFee} onChange={(event) => setDraftFulfilmentHeavyPlusFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Very Heavy fee</span>
                <input type="number" min="0" step="0.01" value={draftFulfilmentVeryHeavyFee} onChange={(event) => setDraftFulfilmentVeryHeavyFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={closeAllModals} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={addFulfilmentRow} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
                Add fee
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingStorageBand ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={closeAllModals}>
          <div className="w-full max-w-[520px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Edit storage fee</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">{editingStorageBand.label}</h3>
              </div>
              <button type="button" onClick={closeAllModals} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020]" aria-label="Close">
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Current storage fee</p>
                <p className="mt-1 text-[20px] font-semibold text-[#202020]">{formatMoney(editingStorageBand.overstockedFeeIncl)}</p>
              </div>
              <div className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Current threshold</p>
                <p className="mt-1 text-[20px] font-semibold text-[#202020]">{toNum(config?.storage?.thresholdDays ?? config?.stockCoverThresholdDays, 35)} days</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">New storage fee</span>
                <input type="number" min="0" step="0.01" value={draftStorageFee} onChange={(event) => setDraftStorageFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Threshold days</span>
                <input type="number" min="0" step="1" value={draftThresholdDays} onChange={(event) => setDraftThresholdDays(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
            </div>

            <p className="mt-3 text-[12px] leading-[1.6] text-[#57636c]">
              The threshold applies across Piessang-held stock. Updating it here will affect storage charging across all size
              bands once you save.
            </p>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button type="button" onClick={deleteStorageBand} className="inline-flex h-10 items-center rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 text-[13px] font-semibold text-[#b91c1c]">
                Delete fee
              </button>
              <div className="flex items-center gap-2">
              <button type="button" onClick={closeAllModals} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={applyStorageBand} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
                Update fee
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addingStorageFee ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={closeAllModals}>
          <div className="w-full max-w-[520px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Add fee</p>
                <h3 className="mt-1 text-[18px] font-semibold text-[#202020]">New storage row</h3>
              </div>
              <button type="button" onClick={closeAllModals} className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#202020]" aria-label="Close">
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Size band label</span>
                <input type="text" value={draftStorageLabelText} onChange={(event) => setDraftStorageLabelText(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Min volume cm3</span>
                <input type="number" min="0" step="1" value={draftStorageMinVolume} onChange={(event) => setDraftStorageMinVolume(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Max volume cm3</span>
                <input type="number" min="0" step="1" value={draftStorageMaxVolume} onChange={(event) => setDraftStorageMaxVolume(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Storage fee</span>
                <input type="number" min="0" step="0.01" value={draftStorageFee} onChange={(event) => setDraftStorageFee(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Threshold days</span>
                <input type="number" min="0" step="1" value={draftThresholdDays} onChange={(event) => setDraftThresholdDays(event.target.value)} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#cbb26b]" />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={closeAllModals} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
                Cancel
              </button>
              <button type="button" onClick={addStorageBand} className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
                Add fee
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
