"use client";

import { useEffect, useMemo, useState } from "react";

const INBOUND_ENDPOINT = "/api/client/v1/accounts/seller/inbound-bookings";
const UPLIFTMENT_ENDPOINT = "/api/client/v1/accounts/seller/stock-upliftments";

type WarehouseWorkspaceProps = {
  vendorName: string;
  sellerSlug?: string;
  sellerCode?: string;
  isSystemAdmin?: boolean;
  adminCalendarOnly?: boolean;
};

type ProductRow = {
  id: string;
  data?: {
    product?: {
      title?: string;
      vendorName?: string;
    };
    fulfillment?: {
      mode?: string | null;
    };
    grouping?: {
      category?: string | null;
      subCategory?: string | null;
    };
    variants?: Array<{
      variant_id?: string;
      label?: string | null;
      barcode?: string | null;
      total_in_stock_items_available?: number;
    }>;
  };
};

type VariantSelection = {
  variantId: string;
  label: string;
  barcode: string;
  quantity: string;
};

type MovementRow = {
  id: string;
  bookingId?: string;
  upliftmentId?: string;
  productId?: string;
  productTitle?: string | null;
  deliveryDate?: string | null;
  upliftDate?: string | null;
  createdAt?: string | null;
  receivedAt?: string | null;
  receivedBy?: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  status?: string | null;
  notes?: string | null;
  reason?: string | null;
  totalUnits?: number | null;
  variants?: Array<{
    variantId?: string;
    label?: string | null;
    quantity?: number | null;
    barcode?: string | null;
  }>;
};

type MovementStatusFilter = "all" | "scheduled" | "requested" | "completed" | "cancelled";
type WarehouseTab = "inbound" | "upliftments";
const WAREHOUSE_TABS: Array<{ key: WarehouseTab; label: string }> = [
  { key: "inbound", label: "Inbound" },
  { key: "upliftments", label: "Upliftments" },
];

type CalendarMonthCursor = {
  year: number;
  month: number;
};

type MovementKind = "inbound" | "upliftment";

type CalendarEventItem = {
  id: string;
  kind: MovementKind;
  title: string;
  date: string;
  status: string;
  row: MovementRow;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMonthLabel(cursor: CalendarMonthCursor) {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
  });
}

function shiftMonth(cursor: CalendarMonthCursor, delta: number): CalendarMonthCursor {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function buildCalendarGrid(cursor: CalendarMonthCursor) {
  const firstDay = new Date(cursor.year, cursor.month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(cursor.year, cursor.month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
    return {
      key,
      date,
      inMonth: date.getMonth() === cursor.month,
      isToday: key === toIsoDateInput(0),
    };
  });
}

function movementScheduledDate(row: MovementRow, kind: "inbound" | "upliftment") {
  return kind === "inbound" ? String(row.deliveryDate || "") : String(row.upliftDate || "");
}

function statusTone(status: string | null | undefined) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "scheduled" || value === "requested") return "border-[#eadfb8] bg-[rgba(203,178,107,0.12)] text-[#8f7531]";
  if (value === "completed" || value === "received" || value === "released") return "border-[#cfe8d8] bg-[rgba(57,169,107,0.1)] text-[#166534]";
  if (value === "cancelled") return "border-[#f2c7cb] bg-[#fff7f8] text-[#b91c1c]";
  return "border-black/10 bg-[rgba(32,32,32,0.04)] text-[#57636c]";
}

function toIsoDateInput(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPositiveInteger(value: string) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function buildVariantSelections(product: ProductRow | null): VariantSelection[] {
  const variants = Array.isArray(product?.data?.variants) ? product.data?.variants : [];
  return variants.map((variant) => ({
    variantId: String(variant?.variant_id || "").trim(),
    label: String(variant?.label || variant?.variant_id || "Variant").trim(),
    barcode: String(variant?.barcode || "").trim(),
    quantity: "",
  }));
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function SellerWarehouseWorkspace({
  vendorName,
  sellerSlug = "",
  sellerCode = "",
  isSystemAdmin = false,
  adminCalendarOnly = false,
}: WarehouseWorkspaceProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [savingInbound, setSavingInbound] = useState(false);
  const [savingUpliftment, setSavingUpliftment] = useState(false);
  const [editingInboundId, setEditingInboundId] = useState<string | null>(null);
  const [editingUpliftmentId, setEditingUpliftmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [productInboundRows, setProductInboundRows] = useState<MovementRow[]>([]);
  const [productUpliftmentRows, setProductUpliftmentRows] = useState<MovementRow[]>([]);
  const [allInboundRows, setAllInboundRows] = useState<MovementRow[]>([]);
  const [allUpliftmentRows, setAllUpliftmentRows] = useState<MovementRow[]>([]);
  const [activeTab, setActiveTab] = useState<WarehouseTab>("inbound");
  const [movementStatusFilter, setMovementStatusFilter] = useState<MovementStatusFilter>("all");
  const [movementSearch, setMovementSearch] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => toIsoDateInput(1));
  const [upliftDate, setUpliftDate] = useState(() => toIsoDateInput(1));
  const [inboundNotes, setInboundNotes] = useState("");
  const [upliftNotes, setUpliftNotes] = useState("");
  const [upliftReason, setUpliftReason] = useState("");
  const [variantSelections, setVariantSelections] = useState<VariantSelection[]>([]);
  const [calendarCursor, setCalendarCursor] = useState<CalendarMonthCursor>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [scheduleModalKind, setScheduleModalKind] = useState<MovementKind | null>(null);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEventItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoadingProducts(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: "all",
          includeUnavailable: "true",
        });
        if (sellerSlug.trim()) params.set("sellerSlug", sellerSlug.trim());
        else if (sellerCode.trim()) params.set("sellerCode", sellerCode.trim());
        else if (vendorName.trim()) params.set("vendorName", vendorName.trim());

        const response = await fetch(`/api/catalogue/v1/products/product/get?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        const fulfilmentRows = rows.filter(
          (row: ProductRow) => String(row?.data?.fulfillment?.mode || "").trim().toLowerCase() === "bevgo",
        );
        if (cancelled) return;
        setProducts(fulfilmentRows);
        setSelectedProductId((current) => current || fulfilmentRows[0]?.id || "");
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load warehouse products.");
        }
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    }

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [vendorName]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  useEffect(() => {
    setVariantSelections(buildVariantSelections(selectedProduct));
  }, [selectedProduct]);

  async function loadSellerWideMovements() {
    const params = new URLSearchParams();
    if (isSystemAdmin && sellerCode) params.set("sellerCode", sellerCode);
    if (isSystemAdmin && !sellerCode && sellerSlug) params.set("sellerSlug", sellerSlug);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const [inboundResponse, upliftmentResponse] = await Promise.all([
      fetch(`${INBOUND_ENDPOINT}${suffix}`, { cache: "no-store" }),
      fetch(`${UPLIFTMENT_ENDPOINT}${suffix}`, { cache: "no-store" }),
    ]);
    const inboundPayload = await inboundResponse.json().catch(() => ({}));
    const upliftmentPayload = await upliftmentResponse.json().catch(() => ({}));
    if (!inboundResponse.ok || inboundPayload?.ok === false) {
      throw new Error(inboundPayload?.message || "Unable to load inbound bookings.");
    }
    if (!upliftmentResponse.ok || upliftmentPayload?.ok === false) {
      throw new Error(upliftmentPayload?.message || "Unable to load stock upliftments.");
    }
    setAllInboundRows(Array.isArray(inboundPayload?.items) ? inboundPayload.items : []);
    setAllUpliftmentRows(Array.isArray(upliftmentPayload?.items) ? upliftmentPayload.items : []);
  }

  async function loadProductMovements(productId: string) {
    if (!productId) {
      setProductInboundRows([]);
      setProductUpliftmentRows([]);
      return;
    }
    const [inboundResponse, upliftmentResponse] = await Promise.all([
      fetch(`${INBOUND_ENDPOINT}?productId=${encodeURIComponent(productId)}`, { cache: "no-store" }),
      fetch(`${UPLIFTMENT_ENDPOINT}?productId=${encodeURIComponent(productId)}`, { cache: "no-store" }),
    ]);
    const inboundPayload = await inboundResponse.json().catch(() => ({}));
    const upliftmentPayload = await upliftmentResponse.json().catch(() => ({}));
    if (!inboundResponse.ok || inboundPayload?.ok === false) {
      throw new Error(inboundPayload?.message || "Unable to load inbound bookings.");
    }
    if (!upliftmentResponse.ok || upliftmentPayload?.ok === false) {
      throw new Error(upliftmentPayload?.message || "Unable to load stock upliftments.");
    }
    setProductInboundRows(Array.isArray(inboundPayload?.items) ? inboundPayload.items : []);
    setProductUpliftmentRows(Array.isArray(upliftmentPayload?.items) ? upliftmentPayload.items : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMovements() {
      setLoadingMovements(true);
      setError(null);
      try {
        await Promise.all([loadSellerWideMovements(), loadProductMovements(selectedProductId)]);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load warehouse movements.");
        }
      } finally {
        if (!cancelled) setLoadingMovements(false);
      }
    }
    void loadMovements();
    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  const selectedVariants = useMemo(
    () =>
      variantSelections
        .filter((item) => item.variantId && isPositiveInteger(item.quantity))
        .map((item) => ({
          variantId: item.variantId,
          quantity: Number(item.quantity),
        })),
    [variantSelections],
  );

  const totalSelectedUnits = useMemo(
    () => selectedVariants.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [selectedVariants],
  );

  const updateVariantQuantity = (variantId: string, quantity: string) => {
    setVariantSelections((current) =>
      current.map((item) => (item.variantId === variantId ? { ...item, quantity: quantity.replace(/[^\d]/g, "") } : item)),
    );
  };

  async function refreshMovements() {
    setLoadingMovements(true);
    try {
      await Promise.all([loadSellerWideMovements(), loadProductMovements(selectedProductId)]);
    } finally {
      setLoadingMovements(false);
    }
  }

  async function handleInboundSubmit() {
    if (!selectedProductId) {
      setError("Choose a Piessang fulfilment product first.");
      return;
    }
    if (!deliveryDate) {
      setError("Choose a delivery date for the inbound booking.");
      return;
    }
    if (!selectedVariants.length) {
      setError("Add at least one inbound quantity before saving.");
      return;
    }

    setSavingInbound(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(INBOUND_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          deliveryDate,
          notes: inboundNotes,
          variants: selectedVariants,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save the inbound booking.");
      }
      setSuccessMessage("Inbound booking saved.");
      setInboundNotes("");
      setVariantSelections(buildVariantSelections(selectedProduct));
      setScheduleModalKind(null);
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the inbound booking.");
    } finally {
      setSavingInbound(false);
    }
  }

  async function handleUpliftmentSubmit() {
    if (!selectedProductId) {
      setError("Choose a Piessang fulfilment product first.");
      return;
    }
    if (!upliftDate) {
      setError("Choose an upliftment date.");
      return;
    }
    if (!selectedVariants.length) {
      setError("Add at least one upliftment quantity before saving.");
      return;
    }

    setSavingUpliftment(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(UPLIFTMENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          upliftDate,
          notes: upliftNotes,
          reason: upliftReason,
          variants: selectedVariants,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save the stock upliftment request.");
      }
      setSuccessMessage("Stock upliftment request saved.");
      setUpliftNotes("");
      setUpliftReason("");
      setVariantSelections(buildVariantSelections(selectedProduct));
      setScheduleModalKind(null);
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the stock upliftment request.");
    } finally {
      setSavingUpliftment(false);
    }
  }

  async function updateInbound(row: MovementRow) {
    if (!row.id) return;
    setEditingInboundId(row.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(INBOUND_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: row.id,
          deliveryDate: row.deliveryDate,
          notes: row.notes || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update the inbound booking.");
      }
      setSuccessMessage("Inbound booking updated.");
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the inbound booking.");
    } finally {
      setEditingInboundId(null);
    }
  }

  async function markInboundStatus(bookingId: string, status: "received" | "completed") {
    setEditingInboundId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(INBOUND_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update the inbound lifecycle.");
      }
      setSuccessMessage(`Inbound booking marked ${status}.`);
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the inbound lifecycle.");
    } finally {
      setEditingInboundId(null);
    }
  }

  async function cancelInbound(bookingId: string) {
    setEditingInboundId(bookingId);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`${INBOUND_ENDPOINT}?bookingId=${encodeURIComponent(bookingId)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to cancel the inbound booking.");
      }
      setSuccessMessage("Inbound booking cancelled.");
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel the inbound booking.");
    } finally {
      setEditingInboundId(null);
    }
  }

  async function updateUpliftment(row: MovementRow) {
    if (!row.id) return;
    setEditingUpliftmentId(row.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(UPLIFTMENT_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upliftmentId: row.id,
          upliftDate: row.upliftDate,
          notes: row.notes || "",
          reason: row.reason || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update the stock upliftment.");
      }
      setSuccessMessage("Stock upliftment updated.");
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the stock upliftment.");
    } finally {
      setEditingUpliftmentId(null);
    }
  }

  async function markUpliftmentStatus(upliftmentId: string, status: "released" | "completed") {
    setEditingUpliftmentId(upliftmentId);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(UPLIFTMENT_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upliftmentId, status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update the upliftment lifecycle.");
      }
      setSuccessMessage(`Stock upliftment marked ${status}.`);
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the upliftment lifecycle.");
    } finally {
      setEditingUpliftmentId(null);
    }
  }

  async function cancelUpliftment(upliftmentId: string) {
    setEditingUpliftmentId(upliftmentId);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`${UPLIFTMENT_ENDPOINT}?upliftmentId=${encodeURIComponent(upliftmentId)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to cancel the stock upliftment.");
      }
      setSuccessMessage("Stock upliftment cancelled.");
      await refreshMovements();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel the stock upliftment.");
    } finally {
      setEditingUpliftmentId(null);
    }
  }

  const movementIntro = selectedProduct
    ? `${selectedProduct?.data?.product?.title || selectedProduct.id} is fulfilled by Piessang, so inbound deliveries and upliftments can be planned here.`
    : "Choose a Piessang fulfilment product to manage inbound deliveries and stock upliftments.";
  const noWarehouseProductsMessage =
    !loadingProducts && products.length === 0
      ? "No Piessang-fulfilled products are available yet. Switch a product to Piessang fulfilment first, then come back to schedule inbound or outbound stock."
      : null;

  const filteredInboundRows = useMemo(() => {
    const needle = movementSearch.trim().toLowerCase();
    return allInboundRows.filter((row) => {
      const status = normalizeStatus(row.status);
      if (movementStatusFilter !== "all" && status !== movementStatusFilter) return false;
      if (!needle) return true;
      const hay = [row.productTitle, row.bookingId, row.id, row.notes]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return hay.includes(needle);
    });
  }, [allInboundRows, movementSearch, movementStatusFilter]);

  const filteredUpliftmentRows = useMemo(() => {
    const needle = movementSearch.trim().toLowerCase();
    return allUpliftmentRows.filter((row) => {
      const status = normalizeStatus(row.status);
      if (movementStatusFilter !== "all" && status !== movementStatusFilter) return false;
      if (!needle) return true;
      const hay = [row.productTitle, row.upliftmentId, row.id, row.notes, row.reason]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return hay.includes(needle);
    });
  }, [allUpliftmentRows, movementSearch, movementStatusFilter]);

  const calendarItems = useMemo(() => {
    const inbound = allInboundRows.map((row) => ({
      id: `inbound-${row.id}`,
      kind: "inbound" as const,
      title: row.productTitle || row.productId || "Product",
      date: movementScheduledDate(row, "inbound"),
      status: normalizeStatus(row.status) || "scheduled",
      row,
    }));
    const upliftments = allUpliftmentRows.map((row) => ({
      id: `upliftment-${row.id}`,
      kind: "upliftment" as const,
      title: row.productTitle || row.productId || "Product",
      date: movementScheduledDate(row, "upliftment"),
      status: normalizeStatus(row.status) || "requested",
      row,
    }));
    return [...inbound, ...upliftments]
      .filter((item) => {
        if (!item.date) return false;
        const date = new Date(item.date);
        return !Number.isNaN(date.getTime()) && date.getFullYear() === calendarCursor.year && date.getMonth() === calendarCursor.month;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allInboundRows, allUpliftmentRows, calendarCursor]);

  const calendarDays = useMemo(() => {
    const groups = new Map<string, typeof calendarItems>();
    for (const item of calendarItems) {
      const key = item.date.slice(0, 10);
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).map(([dateKey, items]) => ({ dateKey, items }));
  }, [calendarItems]);

  const calendarItemsByDate = useMemo(() => {
    const groups = new Map<string, CalendarEventItem[]>();
    for (const item of calendarItems) {
      const key = item.date.slice(0, 10);
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }
    return groups;
  }, [calendarItems]);

  const calendarGrid = useMemo(() => buildCalendarGrid(calendarCursor), [calendarCursor]);

  if (!adminCalendarOnly) {
    return (
      <div className="space-y-4">
        <section className="rounded-[12px] border border-black/5 bg-[linear-gradient(180deg,#ffffff_0%,#f7f5ef_100%)] p-5 shadow-[0_16px_40px_rgba(20,24,27,0.06)]">
          <div className="max-w-[760px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Warehouse calendar</p>
            <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[#202020]">Schedule inbound and outbound stock like a calendar</h2>
            <p className="mt-2 text-[13px] leading-[1.7] text-[#57636c]">
              Keep track of what is heading into Piessang and what is scheduled to head back out.
            </p>
          </div>

          <div className="mt-5 rounded-[12px] border border-black/6 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(20,24,27,0.04)]">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  setDeliveryDate(toIsoDateInput(1));
                  setVariantSelections(buildVariantSelections(selectedProduct));
                  setScheduleModalKind("inbound");
                }}
                className="inline-flex h-11 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition hover:bg-black"
              >
                Book Inbound
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  setUpliftDate(toIsoDateInput(1));
                  setVariantSelections(buildVariantSelections(selectedProduct));
                  setScheduleModalKind("upliftment");
                }}
                className="inline-flex h-11 items-center rounded-[10px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.03)]"
              >
                Book Outbound
              </button>
            </div>
          </div>
        </section>

        {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
        {successMessage ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.1)] px-4 py-3 text-[12px] text-[#166534]">{successMessage}</div> : null}

        <section className="rounded-[12px] border border-black/5 bg-white p-4 shadow-[0_10px_28px_rgba(20,24,27,0.06)]">
          <div className="flex flex-col gap-3 border-b border-black/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[12px] font-semibold text-[#202020]">Monthly schedule</p>
              <p className="mt-1 text-[12px] text-[#57636c]">Click any event to view its details. Inbound and outbound bookings are color-coded.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCalendarCursor((current) => shiftMonth(current, -1))} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]">Previous</button>
              <div className="min-w-[190px] text-center text-[13px] font-semibold text-[#202020]">{getMonthLabel(calendarCursor)}</div>
              <button type="button" onClick={() => setCalendarCursor((current) => shiftMonth(current, 1))} className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]">Next</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d7d7d]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="py-2">{day}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarGrid.map((day) => {
              const items = calendarItemsByDate.get(day.key) || [];
              return (
                <div
                  key={day.key}
                  className={`min-h-[136px] rounded-[10px] border p-2 ${day.inMonth ? "border-black/8 bg-white" : "border-black/5 bg-[rgba(32,32,32,0.025)]"} ${day.isToday ? "ring-2 ring-[#cbb26b]/45" : ""}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`text-[12px] font-semibold ${day.inMonth ? "text-[#202020]" : "text-[#a3a3a3]"}`}>{day.date.getDate()}</span>
                    {items.length ? <span className="rounded-full bg-[rgba(32,32,32,0.05)] px-2 py-0.5 text-[10px] font-semibold text-[#57636c]">{items.length}</span> : null}
                  </div>
                  <div className="space-y-1.5">
                    {items.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedCalendarEvent(item)}
                        className={`w-full rounded-[8px] border px-2 py-1.5 text-left transition hover:shadow-[0_8px_20px_rgba(20,24,27,0.08)] ${item.kind === "inbound" ? "border-[#eadfb8] bg-[rgba(203,178,107,0.12)]" : "border-[#cfe8d8] bg-[rgba(57,169,107,0.08)]"}`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#57636c]">{item.kind === "inbound" ? "Inbound" : "Outbound"}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-[#202020]">{item.title}</p>
                      </button>
                    ))}
                    {items.length > 3 ? <p className="px-1 text-[10px] font-semibold text-[#57636c]">+{items.length - 3} more</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {scheduleModalKind ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4" onClick={() => setScheduleModalKind(null)}>
            <div className="w-full max-w-[760px] rounded-[14px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">{scheduleModalKind === "inbound" ? "Book Inbound" : "Book Outbound"}</p>
                  <h3 className="mt-2 text-[24px] font-semibold text-[#202020]">{scheduleModalKind === "inbound" ? "Schedule inbound stock" : "Schedule outbound stock"}</h3>
                  <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
                    {scheduleModalKind === "inbound"
                      ? "Use this to tell Piessang when you plan to send stock into the warehouse for fulfilment."
                      : "Use this to book stock that should be prepared and released back out of the Piessang warehouse."}
                  </p>
                </div>
                <button type="button" onClick={() => setScheduleModalKind(null)} className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]">Close</button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Product</span>
                  <select
                    value={selectedProductId}
                    onChange={(event) => {
                      setSelectedProductId(event.target.value);
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15"
                  >
                    <option value="">{loadingProducts ? "Loading products..." : "Choose a Piessang fulfilment product"}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{(product?.data?.product?.title || product.id).trim()}</option>
                    ))}
                  </select>
                  {noWarehouseProductsMessage ? <p className="mt-2 text-[12px] leading-[1.6] text-[#b45309]">{noWarehouseProductsMessage}</p> : null}
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{scheduleModalKind === "inbound" ? "Inbound date" : "Outbound date"}</span>
                  <input
                    type="date"
                    value={scheduleModalKind === "inbound" ? deliveryDate : upliftDate}
                    onChange={(event) => scheduleModalKind === "inbound" ? setDeliveryDate(event.target.value) : setUpliftDate(event.target.value)}
                    className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-[10px] border border-black/5">
                <div className="grid grid-cols-[1.2fr_.55fr_.55fr] gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.025)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
                  <div>Variant</div><div>Barcode</div><div>Qty</div>
                </div>
                <div className="max-h-[280px] overflow-y-auto divide-y divide-black/5">
                  {variantSelections.length ? variantSelections.map((variant) => (
                    <div key={variant.variantId} className="grid grid-cols-[1.2fr_.55fr_.55fr] gap-3 px-4 py-3 text-[13px]">
                      <div><p className="font-semibold text-[#202020]">{variant.label}</p><p className="mt-0.5 text-[11px] text-[#7d7d7d]">{variant.variantId}</p></div>
                      <div className="truncate text-[#57636c]">{variant.barcode || "No barcode"}</div>
                      <div><input inputMode="numeric" value={variant.quantity} onChange={(event) => updateVariantQuantity(variant.variantId, event.target.value)} placeholder="0" className="h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" /></div>
                    </div>
                  )) : <div className="px-4 py-8 text-[13px] text-[#57636c]">Choose a Piessang product to load its variants.</div>}
                </div>
              </div>

              {scheduleModalKind === "upliftment" ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Reason</span>
                    <input value={upliftReason} onChange={(event) => setUpliftReason(event.target.value)} placeholder="Optional reason for the upliftment request." className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</span>
                    <textarea value={upliftNotes} onChange={(event) => setUpliftNotes(event.target.value)} rows={3} placeholder="Optional upliftment notes for the warehouse team." className="mt-2 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2.5 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" />
                  </label>
                </div>
              ) : (
                <label className="mt-4 block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</span>
                  <textarea value={inboundNotes} onChange={(event) => setInboundNotes(event.target.value)} rows={3} placeholder="Optional delivery notes for the warehouse team." className="mt-2 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2.5 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" />
                </label>
              )}

              <div className="mt-5 flex items-center justify-between gap-3 rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Selected units</p>
                  <p className="mt-1 text-[18px] font-semibold text-[#202020]">{totalSelectedUnits}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void (scheduleModalKind === "inbound" ? handleInboundSubmit() : handleUpliftmentSubmit())}
                  disabled={scheduleModalKind === "inbound" ? savingInbound || !selectedProductId : savingUpliftment || !selectedProductId}
                  className="inline-flex h-11 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {scheduleModalKind === "inbound" ? (savingInbound ? "Saving..." : "Save inbound booking") : (savingUpliftment ? "Saving..." : "Save outbound booking")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {selectedCalendarEvent ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4" onClick={() => setSelectedCalendarEvent(null)}>
            <div className="w-full max-w-[640px] rounded-[14px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">{selectedCalendarEvent.kind === "inbound" ? "Inbound event" : "Outbound event"}</p>
                  <h3 className="mt-2 text-[24px] font-semibold text-[#202020]">{selectedCalendarEvent.title}</h3>
                </div>
                <button type="button" onClick={() => setSelectedCalendarEvent(null)} className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]">Close</button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Schedule date</p>
                  <p className="mt-1 text-[14px] font-semibold text-[#202020]">{formatDate(selectedCalendarEvent.date)}</p>
                </div>
                <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Status</p>
                  <p className="mt-1 text-[14px] font-semibold text-[#202020]">{selectedCalendarEvent.status.replace(/_/g, " ")}</p>
                </div>
                <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Reference</p>
                  <p className="mt-1 text-[14px] font-semibold text-[#202020]">{selectedCalendarEvent.kind === "inbound" ? selectedCalendarEvent.row.bookingId || selectedCalendarEvent.row.id : selectedCalendarEvent.row.upliftmentId || selectedCalendarEvent.row.id}</p>
                </div>
                <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Total units</p>
                  <p className="mt-1 text-[14px] font-semibold text-[#202020]">{Number(selectedCalendarEvent.row.totalUnits || 0)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-[10px] border border-black/5">
                <div className="border-b border-black/5 px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#202020]">Variants</p>
                </div>
                <div className="divide-y divide-black/5">
                  {(Array.isArray(selectedCalendarEvent.row.variants) ? selectedCalendarEvent.row.variants : []).length ? (
                    (selectedCalendarEvent.row.variants || []).map((variant, index) => (
                      <div key={`${selectedCalendarEvent.id}-${variant.variantId || index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                        <div>
                          <p className="font-semibold text-[#202020]">{variant.label || variant.variantId || "Variant"}</p>
                          <p className="mt-0.5 text-[11px] text-[#7d7d7d]">{variant.barcode || "No barcode"}</p>
                        </div>
                        <p className="font-semibold text-[#202020]">{Number(variant.quantity || 0)} units</p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-[13px] text-[#57636c]">No variant lines were saved on this booking.</div>
                  )}
                </div>
              </div>

              {selectedCalendarEvent.row.reason || selectedCalendarEvent.row.notes ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {selectedCalendarEvent.row.reason ? (
                    <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Reason</p>
                      <p className="mt-1 text-[13px] leading-[1.6] text-[#202020]">{selectedCalendarEvent.row.reason}</p>
                    </div>
                  ) : null}
                  {selectedCalendarEvent.row.notes ? (
                    <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</p>
                      <p className="mt-1 text-[13px] leading-[1.6] text-[#202020]">{selectedCalendarEvent.row.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] p-4">
        <p className="text-[12px] font-semibold text-[#202020]">
          {adminCalendarOnly ? "Warehouse calendar" : "Warehouse movements"}
        </p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
          {adminCalendarOnly
            ? "Review inbound and upliftment bookings in one admin calendar so the Piessang team can see exactly what stock is moving in and out each month."
            : "Manage stock moving into Piessang and stock being uplifted back out of the warehouse. This workspace now gives you both seller-wide movement history and product-specific planning in one place."}
        </p>
      </section>

      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {successMessage ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.1)] px-4 py-3 text-[12px] text-[#166534]">
          {successMessage}
        </div>
      ) : null}

      {adminCalendarOnly ? null : (
        <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Piessang product</label>
              <select
                value={selectedProductId}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setSuccessMessage(null);
                  setError(null);
                }}
                className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15"
              >
                <option value="">{loadingProducts ? "Loading products..." : "Choose a Piessang fulfilment product"}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {(product?.data?.product?.title || product.id).trim()}
                  </option>
                ))}
              </select>
              {noWarehouseProductsMessage ? <p className="mt-2 text-[12px] leading-[1.6] text-[#b45309]">{noWarehouseProductsMessage}</p> : null}
            </div>
            <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] leading-[1.6] text-[#57636c]">
              {movementIntro}
            </div>
          </div>
        </section>
      )}

      {isSystemAdmin ? (
      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#202020]">Warehouse calendar</p>
            <p className="mt-1 text-[12px] text-[#57636c]">Scroll month by month to see inbound and outgoing stock bookings in one linear schedule.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCalendarCursor((current) => shiftMonth(current, -1))}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
            >
              Previous
            </button>
            <div className="min-w-[180px] text-center text-[13px] font-semibold text-[#202020]">{getMonthLabel(calendarCursor)}</div>
            <button
              type="button"
              onClick={() => setCalendarCursor((current) => shiftMonth(current, 1))}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {calendarDays.length ? (
            calendarDays.map(({ dateKey, items }) => (
              <div key={dateKey} className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)]">
                <div className="border-b border-black/5 px-4 py-3">
                  <p className="text-[13px] font-semibold text-[#202020]">{formatDate(dateKey)}</p>
                </div>
                <div className="divide-y divide-black/5">
                  {items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${item.kind === "inbound" ? "border-[#eadfb8] bg-[rgba(203,178,107,0.12)] text-[#8f7531]" : "border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] text-[#166534]"}`}>
                            {item.kind === "inbound" ? "Inbound" : "Upliftment"}
                          </span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(item.status)}`}>
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-2 text-[13px] font-semibold text-[#202020]">{item.title}</p>
                        <p className="mt-1 text-[11px] text-[#7d7d7d]">{item.kind === "inbound" ? item.row.bookingId || item.row.id : item.row.upliftmentId || item.row.id}</p>
                      </div>
                      <div className="text-[12px] leading-[1.6] text-[#57636c] sm:text-right">
                        <p>{Number(item.row.totalUnits || 0)} units</p>
                        <p>{Array.isArray(item.row.variants) ? item.row.variants.length : 0} variants</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[10px] border border-dashed border-black/10 px-4 py-8 text-[13px] text-[#57636c]">
              No warehouse bookings scheduled in {getMonthLabel(calendarCursor)}.
            </div>
          )}
        </div>
      </section>
      ) : null}

      {adminCalendarOnly ? null : (

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-wrap gap-2 border-b border-black/5 pb-4">
          {WAREHOUSE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex h-10 items-center rounded-[10px] px-4 text-[13px] font-semibold ${
                activeTab === tab.key ? "bg-[#202020] text-white" : "border border-black/10 bg-white text-[#202020]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#202020]">
              {activeTab === "inbound" ? "Inbound bookings" : "Stock upliftments"}
            </p>
            <p className="mt-1 text-[12px] text-[#57636c]">
              {activeTab === "inbound"
                ? "Book inbound deliveries and review inbound history across your Piessang products."
                : "Request stock upliftments and review upliftment history across your Piessang products."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(260px,1fr)]">
            <select
              value={movementStatusFilter}
              onChange={(event) => setMovementStatusFilter(event.target.value as MovementStatusFilter)}
              className="h-11 rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15"
            >
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="requested">Requested</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              value={movementSearch}
              onChange={(event) => setMovementSearch(event.target.value)}
              placeholder="Search by product, notes, booking id, or upliftment id"
              className="h-11 rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15"
            />
          </div>
        </div>
      </section>
      )}

      {adminCalendarOnly ? null : activeTab === "inbound" ? (
        <>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#202020]">Book inbound stock</p>
              <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">
                Tell Piessang what date the stock is arriving and how many units per variant to expect.
              </p>
            </div>
            <span className="rounded-full border border-[#eadfb8] bg-[rgba(203,178,107,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f7531]">
              Inbound
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery date</label>
              <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" />
            </div>
            <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)]">
              <div className="grid grid-cols-[1.2fr_.55fr_.55fr] gap-3 border-b border-black/5 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
                <div>Variant</div><div>Barcode</div><div>Qty</div>
              </div>
              <div className="divide-y divide-black/5">
                {variantSelections.length ? variantSelections.map((variant) => (
                  <div key={variant.variantId} className="grid grid-cols-[1.2fr_.55fr_.55fr] gap-3 px-4 py-3 text-[13px]">
                    <div><p className="font-semibold text-[#202020]">{variant.label}</p><p className="mt-0.5 text-[11px] text-[#7d7d7d]">{variant.variantId}</p></div>
                    <div className="truncate text-[#57636c]">{variant.barcode || "No barcode"}</div>
                    <div><input inputMode="numeric" value={variant.quantity} onChange={(event) => updateVariantQuantity(variant.variantId, event.target.value)} placeholder="0" className="h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" /></div>
                  </div>
                )) : <div className="px-4 py-8 text-[13px] text-[#57636c]">Choose a Piessang product to load its variants.</div>}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</label>
              <textarea value={inboundNotes} onChange={(event) => setInboundNotes(event.target.value)} rows={3} placeholder="Optional delivery notes for the warehouse team." className="mt-2 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2.5 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Total inbound units</p><p className="mt-1 text-[18px] font-semibold text-[#202020]">{totalSelectedUnits}</p></div>
              <button type="button" onClick={() => void handleInboundSubmit()} disabled={savingInbound || !selectedProductId} className="inline-flex h-11 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55">{savingInbound ? "Saving..." : "Save inbound booking"}</button>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="text-[12px] font-semibold text-[#202020]">Seller-wide inbound bookings</p>
          </div>
          <div className="divide-y divide-black/5">
            {loadingMovements ? <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading inbound bookings...</div> : filteredInboundRows.length ? filteredInboundRows.map((row) => (
              <div key={row.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#202020]">{row.productTitle || row.productId || "Product"}</p>
                    <p className="mt-1 text-[11px] text-[#7d7d7d]">{row.bookingId || row.id}</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(row.status)}`}>{String(row.status || "scheduled").replace(/_/g, " ")}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto_auto] sm:items-end">
                  <div><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery date</label><input type="date" value={String(row.deliveryDate || "").slice(0, 10)} disabled={normalizeStatus(row.status) === "cancelled"} onChange={(event) => setAllInboundRows((current) => current.map((item) => item.id === row.id ? { ...item, deliveryDate: event.target.value } : item))} className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15 disabled:opacity-60" /></div>
                  <div><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</label><input value={row.notes || ""} disabled={normalizeStatus(row.status) === "cancelled"} onChange={(event) => setAllInboundRows((current) => current.map((item) => item.id === row.id ? { ...item, notes: event.target.value } : item))} className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15 disabled:opacity-60" /></div>
                  <button type="button" disabled={editingInboundId === row.id || normalizeStatus(row.status) === "cancelled"} onClick={() => void updateInbound(row)} className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55">{editingInboundId === row.id ? "Saving..." : "Update"}</button>
                  <button type="button" disabled={editingInboundId === row.id || normalizeStatus(row.status) === "cancelled"} onClick={() => void cancelInbound(row.id)} className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#f2c7cb] bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-55">Cancel</button>
                </div>
                {isSystemAdmin ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={editingInboundId === row.id || !["scheduled"].includes(normalizeStatus(row.status))}
                      onClick={() => void markInboundStatus(row.id, "received")}
                      className="inline-flex h-9 items-center rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-3 text-[12px] font-semibold text-[#166534] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mark received
                    </button>
                    <button
                      type="button"
                      disabled={editingInboundId === row.id || !["scheduled", "received"].includes(normalizeStatus(row.status))}
                      onClick={() => void markInboundStatus(row.id, "completed")}
                      className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-[rgba(32,32,32,0.04)] px-3 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mark completed
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 space-y-1 text-[11px] text-[#7d7d7d]">
                  {row.receivedAt ? <p>Received: {formatDateTime(row.receivedAt)}</p> : null}
                  {row.completedAt ? <p>Completed: {formatDateTime(row.completedAt)}</p> : null}
                  {row.cancelledAt ? <p>Cancelled: {formatDateTime(row.cancelledAt)}</p> : null}
                </div>
              </div>
            )) : <div className="px-4 py-8 text-[13px] text-[#57636c]">No inbound bookings found for the current filters.</div>}
          </div>
        </article>
        <article className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="border-b border-black/5 px-4 py-3"><p className="text-[12px] font-semibold text-[#202020]">Selected product inbound bookings</p></div>
          <div className="divide-y divide-black/5">
            {loadingMovements ? <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading inbound bookings...</div> : productInboundRows.length ? productInboundRows.map((row) => (
              <div key={row.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-semibold text-[#202020]">{formatDate(row.deliveryDate)}</p><p className="mt-1 text-[11px] text-[#7d7d7d]">{row.bookingId || row.id}</p></div><span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(row.status)}`}>{String(row.status || "scheduled").replace(/_/g, " ")}</span></div>
                <div className="mt-3 flex flex-wrap gap-2">{(Array.isArray(row.variants) ? row.variants : []).map((variant) => <span key={`${row.id}-${variant.variantId}`} className="rounded-full border border-black/10 bg-[rgba(32,32,32,0.03)] px-3 py-1 text-[11px] text-[#57636c]">{variant.label || variant.variantId}: {Number(variant.quantity || 0)}</span>)}</div>
              </div>
            )) : <div className="px-4 py-8 text-[13px] text-[#57636c]">No inbound bookings saved for this product yet.</div>}
          </div>
        </article>
      </section>
        </>
      ) : (
        <>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#202020]">Book stock upliftment</p>
              <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">Request stock back out of Piessang when you need units returned to your own operation.</p>
            </div>
            <span className="rounded-full border border-black/10 bg-[rgba(32,32,32,0.04)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57636c]">Upliftment</span>
          </div>
          <div className="mt-4 space-y-3">
            <div><label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Upliftment date</label><input type="date" value={upliftDate} onChange={(event) => setUpliftDate(event.target.value)} className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" /></div>
            <div><label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Reason</label><input value={upliftReason} onChange={(event) => setUpliftReason(event.target.value)} placeholder="Optional reason for the upliftment request." className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" /></div>
            <div><label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</label><textarea value={upliftNotes} onChange={(event) => setUpliftNotes(event.target.value)} rows={3} placeholder="Optional upliftment notes for the warehouse team." className="mt-2 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2.5 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15" /></div>
            <div className="rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[12px] leading-[1.7] text-[#57636c]">This request uses the same variant quantities you selected above. Adjust the quantities there first, then save the upliftment request here.</div>
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Total upliftment units</p><p className="mt-1 text-[18px] font-semibold text-[#202020]">{totalSelectedUnits}</p></div>
              <button type="button" onClick={() => void handleUpliftmentSubmit()} disabled={savingUpliftment || !selectedProductId} className="inline-flex h-11 items-center rounded-[10px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition hover:bg-[rgba(32,32,32,0.03)] disabled:cursor-not-allowed disabled:opacity-55">{savingUpliftment ? "Saving..." : "Save upliftment request"}</button>
            </div>
          </div>
        </article>
        <article className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="text-[12px] font-semibold text-[#202020]">Seller-wide stock upliftments</p>
          </div>
          <div className="divide-y divide-black/5">
            {loadingMovements ? <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading stock upliftments...</div> : filteredUpliftmentRows.length ? filteredUpliftmentRows.map((row) => (
              <div key={row.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#202020]">{row.productTitle || row.productId || "Product"}</p>
                    <p className="mt-1 text-[11px] text-[#7d7d7d]">{row.upliftmentId || row.id}</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(row.status)}`}>{String(row.status || "requested").replace(/_/g, " ")}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[160px_.9fr_.8fr_auto_auto] sm:items-end">
                  <div><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Upliftment date</label><input type="date" value={String(row.upliftDate || "").slice(0, 10)} disabled={normalizeStatus(row.status) === "cancelled"} onChange={(event) => setAllUpliftmentRows((current) => current.map((item) => item.id === row.id ? { ...item, upliftDate: event.target.value } : item))} className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15 disabled:opacity-60" /></div>
                  <div><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Reason</label><input value={row.reason || ""} disabled={normalizeStatus(row.status) === "cancelled"} onChange={(event) => setAllUpliftmentRows((current) => current.map((item) => item.id === row.id ? { ...item, reason: event.target.value } : item))} className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15 disabled:opacity-60" /></div>
                  <div><label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Notes</label><input value={row.notes || ""} disabled={normalizeStatus(row.status) === "cancelled"} onChange={(event) => setAllUpliftmentRows((current) => current.map((item) => item.id === row.id ? { ...item, notes: event.target.value } : item))} className="mt-2 h-10 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[13px] text-[#202020] outline-none transition focus:border-[#907d4c] focus:ring-2 focus:ring-[#907d4c]/15 disabled:opacity-60" /></div>
                  <button type="button" disabled={editingUpliftmentId === row.id || normalizeStatus(row.status) === "cancelled"} onClick={() => void updateUpliftment(row)} className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55">{editingUpliftmentId === row.id ? "Saving..." : "Update"}</button>
                  <button type="button" disabled={editingUpliftmentId === row.id || normalizeStatus(row.status) === "cancelled"} onClick={() => void cancelUpliftment(row.id)} className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#f2c7cb] bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-55">Cancel</button>
                </div>
                {isSystemAdmin ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={editingUpliftmentId === row.id || !["requested"].includes(normalizeStatus(row.status))}
                      onClick={() => void markUpliftmentStatus(row.id, "released")}
                      className="inline-flex h-9 items-center rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-3 text-[12px] font-semibold text-[#166534] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mark released
                    </button>
                    <button
                      type="button"
                      disabled={editingUpliftmentId === row.id || !["requested", "released"].includes(normalizeStatus(row.status))}
                      onClick={() => void markUpliftmentStatus(row.id, "completed")}
                      className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-[rgba(32,32,32,0.04)] px-3 text-[12px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mark completed
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 space-y-1 text-[11px] text-[#7d7d7d]">
                  {row.releasedAt ? <p>Released: {formatDateTime(row.releasedAt)}</p> : null}
                  {row.completedAt ? <p>Completed: {formatDateTime(row.completedAt)}</p> : null}
                  {row.cancelledAt ? <p>Cancelled: {formatDateTime(row.cancelledAt)}</p> : null}
                </div>
              </div>
            )) : <div className="px-4 py-8 text-[13px] text-[#57636c]">No stock upliftments found for the current filters.</div>}
          </div>
        </article>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="border-b border-black/5 px-4 py-3"><p className="text-[12px] font-semibold text-[#202020]">Selected product upliftments</p></div>
          <div className="divide-y divide-black/5">
            {loadingMovements ? <div className="px-4 py-8 text-[13px] text-[#57636c]">Loading stock upliftments...</div> : productUpliftmentRows.length ? productUpliftmentRows.map((row) => (
              <div key={row.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-semibold text-[#202020]">{formatDate(row.upliftDate)}</p><p className="mt-1 text-[11px] text-[#7d7d7d]">{row.upliftmentId || row.id}</p></div><span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(row.status)}`}>{String(row.status || "requested").replace(/_/g, " ")}</span></div>
                {row.reason ? <p className="mt-2 text-[12px] text-[#57636c]">Reason: {row.reason}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">{(Array.isArray(row.variants) ? row.variants : []).map((variant) => <span key={`${row.id}-${variant.variantId}`} className="rounded-full border border-black/10 bg-[rgba(32,32,32,0.03)] px-3 py-1 text-[11px] text-[#57636c]">{variant.label || variant.variantId}: {Number(variant.quantity || 0)}</span>)}</div>
              </div>
            )) : <div className="px-4 py-8 text-[13px] text-[#57636c]">No stock upliftments saved for this product yet.</div>}
          </div>
        </article>
      </section>
        </>
      )}
    </div>
  );
}
