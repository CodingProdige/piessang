// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentLinkModal } from "@/components/ui/document-link-modal";
import { DocumentSnackbar } from "@/components/ui/document-snackbar";
import { formatMoneyExact } from "@/lib/money";

function formatMoney(value: unknown) {
  return formatMoneyExact(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: string | null | undefined) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "settled" || value === "paid") return "bg-[rgba(57,169,107,0.1)] text-[#166534] border-[#cfe8d8]";
  if (value === "no_charge") return "bg-[rgba(15,128,195,0.08)] text-[#0f5f8a] border-[rgba(15,128,195,0.18)]";
  if (value === "overdue") return "bg-[#fff7f8] text-[#b91c1c] border-[#f2c7cb]";
  return "bg-[rgba(203,178,107,0.12)] text-[#8f7531] border-[#eadfb8]";
}

function compactStatusLabel(status: string | null | undefined) {
  const value = String(status || "due").trim().toLowerCase();
  if (!value) return "Due";
  return value.replace(/_/g, " ");
}

function amountDueValue(cycle: any) {
  return Number(cycle?.totals?.amountDueIncl || 0);
}

function getCycleActionConfig(cycle: any) {
  const amountDue = amountDueValue(cycle);
  const settled = String(cycle?.status || "").toLowerCase() === "settled" || amountDue <= 0;
  if (settled) {
    return {
      primaryLabel: "Download invoice",
      primaryDocType: "invoice" as const,
      secondaryLabel: "Download statement",
      secondaryDocType: "statement" as const,
      primaryIsPayment: false,
    };
  }
  return {
    primaryLabel: "Pay now",
    primaryDocType: "invoice" as const,
    secondaryLabel: "Download invoice",
    secondaryDocType: "invoice" as const,
    primaryIsPayment: true,
  };
}

export function SellerBillingWorkspace({
  sellerSlug,
  sellerCode,
  vendorName,
}: {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [payerName, setPayerName] = useState(vendorName || ""); 
  const [billingCheckout, setBillingCheckout] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [documentModal, setDocumentModal] = useState<{ title: string; description: string; url: string; openLabel: string } | null>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const cardNumberRef = useRef<any>(null);
  const cardExpiryRef = useRef<any>(null);
  const cardCvcRef = useRef<any>(null);

  useEffect(() => {
    setPayerName(vendorName || "");
  }, [vendorName]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (sellerSlug) params.set("sellerSlug", sellerSlug);
        if (sellerCode) params.set("sellerCode", sellerCode);
        if (vendorName) params.set("vendorName", vendorName);
        params.set("months", "6");

        const response = await fetch(`/api/client/v1/accounts/seller/billing/get?${params.toString()}`, { cache: "no-store" });
        const next = await response.json().catch(() => ({}));
        if (!response.ok || next?.ok === false) {
          throw new Error(next?.message || "Unable to load seller billing.");
        }
        if (!cancelled) setPayload(next?.data || null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load seller billing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sellerCode, sellerSlug, vendorName]);

  const current = payload?.current || null;
  const cycles = Array.isArray(payload?.cycles) ? payload.cycles : [];
  const guide = payload?.guide || {};
  const currentActionConfig = getCycleActionConfig(current);
  const paymentHistory = useMemo(() => {
    return cycles
      .flatMap((cycle: any) =>
        (Array.isArray(cycle?.payments) ? cycle.payments : []).map((payment: any) => ({
          ...payment,
          billingMonthLabel: cycle?.billingMonthLabel,
          billingId: cycle?.billingId,
        })),
      )
      .sort((left: any, right: any) => String(right?.requestedAt || right?.paidAt || "").localeCompare(String(left?.requestedAt || left?.paidAt || "")));
  }, [cycles]);

  useEffect(() => {
    if (!snackbar) return undefined;
    const timer = window.setTimeout(() => setSnackbar(null), 2800);
    return () => window.clearTimeout(timer);
  }, [snackbar]);

  useEffect(() => {
    if (!cycles.length) {
      setSelectedCycleId(null);
      return;
    }
    const nextId = String(selectedCycleId || "").trim();
    if (nextId && cycles.some((cycle: any) => String(cycle?.billingId || cycle?.monthKey) === nextId)) return;
    setSelectedCycleId(null);
  }, [cycles, selectedCycleId]);

  useEffect(() => {
    if (!paymentOpen || !billingCheckout?.publishableKey) return undefined;
    let cancelled = false;

    async function loadStripeJs() {
      if (typeof window === "undefined") return null;
      if ((window as any).Stripe) return (window as any).Stripe;
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]') as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Stripe.js failed to load.")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3/";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Stripe.js failed to load."));
        document.head.appendChild(script);
      });
      return (window as any).Stripe || null;
    }

    async function mountCardElements() {
      try {
        setStripeLoading(true);
        const Stripe = await loadStripeJs();
        if (!Stripe) throw new Error("Stripe.js is not available.");
        cardNumberRef.current?.unmount?.();
        cardExpiryRef.current?.unmount?.();
        cardCvcRef.current?.unmount?.();
        const stripe = Stripe(billingCheckout.publishableKey);
        stripeRef.current = stripe;
        const elements = stripe.elements({
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#e3c52f",
              colorText: "#202020",
              colorBackground: "#ffffff",
              colorDanger: "#b91c1c",
              borderRadius: "10px",
            },
          },
        });
        elementsRef.current = elements;
        const baseStyle = {
          style: {
            base: {
              fontSize: "14px",
              color: "#202020",
              fontFamily: "var(--font-geist-sans), sans-serif",
              "::placeholder": { color: "#8a94a3" },
            },
            invalid: { color: "#b91c1c" },
          },
        };
        if (cancelled) return;
        const cardNumber = elements.create("cardNumber", baseStyle);
        const cardExpiry = elements.create("cardExpiry", baseStyle);
        const cardCvc = elements.create("cardCvc", baseStyle);
        cardNumber.mount("#seller-billing-card-number");
        cardExpiry.mount("#seller-billing-card-expiry");
        cardCvc.mount("#seller-billing-card-cvc");
        cardNumberRef.current = cardNumber;
        cardExpiryRef.current = cardExpiry;
        cardCvcRef.current = cardCvc;
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to open secure payment.");
      } finally {
        if (!cancelled) setStripeLoading(false);
      }
    }

    void mountCardElements();
    return () => {
      cancelled = true;
      cardNumberRef.current?.unmount?.();
      cardExpiryRef.current?.unmount?.();
      cardCvcRef.current?.unmount?.();
      cardNumberRef.current = null;
      cardExpiryRef.current = null;
      cardCvcRef.current = null;
    };
  }, [paymentOpen, billingCheckout]);

  async function reloadBilling() {
    const params = new URLSearchParams();
    if (sellerSlug) params.set("sellerSlug", sellerSlug);
    if (sellerCode) params.set("sellerCode", sellerCode);
    if (vendorName) params.set("vendorName", vendorName);
    params.set("months", "6");
    const response = await fetch(`/api/client/v1/accounts/seller/billing/get?${params.toString()}`, { cache: "no-store" });
    const next = await response.json().catch(() => ({}));
    if (!response.ok || next?.ok === false) throw new Error(next?.message || "Unable to load seller billing.");
    setPayload(next?.data || null);
  }

  async function openBillingDocument(docType: "invoice" | "statement", cycle: any) {
    try {
      setDocBusy(`${docType}:${cycle?.billingId || cycle?.monthKey}`);
      setSnackbar({
        tone: "info",
        message: `Preparing billing ${docType === "invoice" ? "invoice" : "statement"}...`,
      });
      const response = await fetch("/api/client/v1/accounts/seller/billing/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingId: cycle?.billingId,
          sellerSlug,
          sellerCode,
          vendorName,
          monthKey: cycle?.monthKey,
          docType,
        }),
      });
      const next = await response.json().catch(() => ({}));
      if (!response.ok || next?.ok === false) throw new Error(next?.message || `Unable to create ${docType}.`);
      const url = String(next?.data?.url || "").trim();
      if (!url) throw new Error(`Unable to open ${docType}.`);
      const title = docType === "invoice" ? "Billing invoice ready" : "Billing statement ready";
      const description =
        docType === "invoice"
          ? "You can open this billing invoice in a new tab or copy the link."
          : "You can open this billing statement in a new tab or copy the link.";
      setDocumentModal({
        title,
        description,
        url,
        openLabel: docType === "invoice" ? "Open invoice" : "Open statement",
      });
      setSnackbar({ tone: "success", message: `${docType === "invoice" ? "Billing invoice" : "Statement"} ready.` });
      await reloadBilling();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Unable to open ${docType}.`;
      setError(message);
      setSnackbar({ tone: "error", message });
    } finally {
      setDocBusy(null);
    }
  }

  async function startBillingPayment() {
    if (!current?.billingId) return;
    try {
      setPaymentBusy(true);
      setError(null);
      const response = await fetch("/api/client/v1/accounts/seller/billing/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingId: current.billingId,
          sellerSlug,
          sellerCode,
        }),
      });
      const next = await response.json().catch(() => ({}));
      if (!response.ok || next?.ok === false) throw new Error(next?.message || "Unable to prepare billing payment.");
      setBillingCheckout(next?.data || null);
      setPaymentOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare billing payment.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function confirmBillingPayment() {
    if (!billingCheckout?.clientSecret) return;
    try {
      setPaymentBusy(true);
      const stripe = stripeRef.current;
      if (!stripe) throw new Error("Stripe.js is not available.");
      const cardElement = cardNumberRef.current;
      if (!cardElement) throw new Error("Secure card fields are not ready yet.");

      const result = await stripe.confirmCardPayment(billingCheckout.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: payerName.trim() || vendorName || undefined,
          },
        },
      });

      if (result?.error) throw new Error(result.error.message || "Your payment could not be completed.");
      const paymentIntentId = String(result?.paymentIntent?.id || billingCheckout.paymentIntentId || "").trim();
      const paymentIntentStatus = String(result?.paymentIntent?.status || "").trim().toLowerCase();
      if (paymentIntentStatus !== "succeeded") throw new Error("The payment did not complete successfully.");

      const finalizeResponse = await fetch("/api/client/v1/accounts/seller/billing/payment-success", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingId: billingCheckout.billingId,
          sellerSlug,
          sellerCode,
          paymentIntentId,
        }),
      });
      const finalizeJson = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok || finalizeJson?.ok === false) throw new Error(finalizeJson?.message || "Unable to finalize billing payment.");

      setPaymentOpen(false);
      setBillingCheckout(null);
      setSnackbar({ tone: "success", message: "Billing payment successful." });
      await reloadBilling();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to complete billing payment.";
      setError(message);
      setSnackbar({ tone: "error", message });
    } finally {
      setPaymentBusy(false);
    }
  }

  const currentBreakdownRows = useMemo(() => {
    const source = current?.totals || {};
    const rawRows = [
      { label: "Sales tracked", value: Number(source?.salesIncl || 0) },
      { label: "Marketplace fee", value: Number(source?.successFeeIncl || 0) },
      { label: "Fulfilment fee", value: Number(source?.fulfilmentFeeIncl || 0) },
      { label: "Storage fee", value: Number(source?.storageFeeIncl || 0) },
      { label: "Net seller payout", value: Number(source?.netSellerPayoutIncl || 0) },
      { label: "Amount payable to Piessang", value: Number(source?.amountDueIncl || 0) },
    ];
    const visible = rawRows.filter((row) => row.label === "Sales tracked" || row.label === "Net seller payout" || row.label === "Amount payable to Piessang" || row.value > 0);
    const hiddenFeeTotal = rawRows
      .filter((row) => !visible.includes(row) && ["Marketplace fee", "Fulfilment fee", "Storage fee"].includes(row.label))
      .reduce((sum, row) => sum + row.value, 0);
    if (hiddenFeeTotal === 0) {
      visible.splice(visible.length - 2, 0, { label: "Additional fees", value: 0 });
    }
    return visible;
  }, [current]);

  return (
    <div className="space-y-4">
      <DocumentSnackbar notice={snackbar} onClose={() => setSnackbar(null)} />

      <DocumentLinkModal
        open={Boolean(documentModal?.url)}
        title={documentModal?.title || "Document ready"}
        description={documentModal?.description || "You can open this document in a new tab or copy the link."}
        url={documentModal?.url || ""}
        onClose={() => setDocumentModal(null)}
        openLabel={documentModal?.openLabel || "Open document"}
      />

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <p className="text-[22px] font-semibold tracking-[-0.03em] text-[#202020]">Billing</p>
        <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">Track your monthly seller bill, fees, and statements.</p>
      </section>

      {error ? <div className="rounded-[8px] border border-[#f2c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr_.9fr_auto_auto] lg:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Current status</p>
            {current ? (
              <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(current?.status)}`}>
                {compactStatusLabel(current?.status)}
              </span>
            ) : (
              <p className="mt-2 text-[13px] text-[#57636c]">Not available</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Amount due</p>
            <p className="mt-2 text-[32px] font-semibold tracking-[-0.04em] text-[#202020]">{loading ? "..." : formatMoney(current?.totals?.amountDueIncl || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Due date</p>
            <p className="mt-2 text-[14px] font-semibold text-[#202020]">{formatDateTime(current?.dueDate)}</p>
          </div>
          <button
            type="button"
            onClick={() => currentActionConfig.primaryIsPayment ? void startBillingPayment() : void openBillingDocument("invoice", current)}
            disabled={!current || (currentActionConfig.primaryIsPayment ? Number(current?.totals?.amountDueIncl || 0) <= 0 || paymentBusy : !!docBusy)}
            className="inline-flex h-10 items-center justify-center rounded-[12px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionConfig.primaryIsPayment ? (paymentBusy ? "Opening payment..." : currentActionConfig.primaryLabel) : (docBusy?.startsWith("invoice:") ? "Preparing invoice..." : currentActionConfig.primaryLabel)}
          </button>
          <button
            type="button"
            onClick={() => void openBillingDocument(currentActionConfig.secondaryDocType, current)}
            disabled={!current || !!docBusy}
            className="inline-flex h-10 items-center justify-center rounded-[12px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {docBusy === `${currentActionConfig.secondaryDocType}:${current?.billingId || current?.monthKey}` ? `Preparing ${currentActionConfig.secondaryDocType}...` : currentActionConfig.secondaryLabel}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#202020]">Current cycle</p>
              <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">Billing cycles cover one calendar month, are issued on the 1st of the following month, and are due by the 7th.</p>
            </div>
            {current ? <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(current?.status)}`}>{compactStatusLabel(current?.status)}</span> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["Billing month", current?.billingMonthLabel || "Not available"],
              ["Invoice number", current?.invoice?.invoiceNumber || "Pending"],
              ["Issued date", formatDateTime(current?.issuedAt)],
              ["Due date", formatDateTime(current?.dueDate)],
              ["Amount due", formatMoney(current?.totals?.amountDueIncl || 0)],
              ["Net seller payout", formatMoney(current?.totals?.netSellerPayoutIncl || 0)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{label}</p>
                <p className="mt-1 text-[14px] font-semibold text-[#202020]">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => currentActionConfig.primaryIsPayment ? void startBillingPayment() : void openBillingDocument("invoice", current)}
              disabled={!current || (currentActionConfig.primaryIsPayment ? Number(current?.totals?.amountDueIncl || 0) <= 0 || paymentBusy : !!docBusy)}
              className="inline-flex h-10 items-center rounded-[12px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {currentActionConfig.primaryIsPayment ? (paymentBusy ? "Opening payment..." : currentActionConfig.primaryLabel) : (docBusy?.startsWith("invoice:") ? "Preparing invoice..." : currentActionConfig.primaryLabel)}
            </button>
            <button
              type="button"
              onClick={() => void openBillingDocument(currentActionConfig.secondaryDocType, current)}
              disabled={!current || !!docBusy}
              className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {docBusy === `${currentActionConfig.secondaryDocType}:${current?.billingId || current?.monthKey}` ? `Preparing ${currentActionConfig.secondaryDocType}...` : currentActionConfig.secondaryLabel}
            </button>
          </div>
        </article>

        <article className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] font-semibold text-[#202020]">How this cycle was calculated</p>
          <div className="mt-3 space-y-2">
            {currentBreakdownRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3">
                <span className="text-[12px] text-[#57636c]">{row.label}</span>
                <span className={`text-[13px] font-semibold ${row.label === "Amount payable to Piessang" ? "text-[#202020]" : "text-[#202020]"}`}>{formatMoney(row.value)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="border-b border-black/5 px-4 py-3">
          <p className="text-[12px] font-semibold text-[#202020]">Billing history</p>
          <p className="mt-1 text-[12px] text-[#57636c]">Open any month to inspect the cycle and download its invoice or statement.</p>
        </div>
        <div className="grid grid-cols-[1.1fr_1fr_.8fr_.8fr_.8fr_auto] gap-3 border-b border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">
          <div>Month</div>
          <div>Invoice #</div>
          <div>Amount due</div>
          <div>Net payout</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        <div className="divide-y divide-black/5">
          {loading ? (
            <div className="px-4 py-10 text-[13px] text-[#57636c]">Loading billing cycles...</div>
          ) : cycles.length ? (
            cycles.map((cycle: any) => (
              <div key={cycle.monthKey}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCycleId((currentValue) => (currentValue === String(cycle?.billingId || cycle?.monthKey || "") ? null : String(cycle?.billingId || cycle?.monthKey || "")))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCycleId((currentValue) => (currentValue === String(cycle?.billingId || cycle?.monthKey || "") ? null : String(cycle?.billingId || cycle?.monthKey || "")));
                    }
                  }}
                  className={`grid w-full cursor-pointer grid-cols-[1.1fr_1fr_.8fr_.8fr_.8fr_auto] items-center gap-3 px-4 py-3 text-left text-[13px] transition-colors ${
                    selectedCycleId === String(cycle?.billingId || cycle?.monthKey || "")
                      ? "bg-[rgba(227,197,47,0.08)]"
                      : "hover:bg-[rgba(32,32,32,0.02)]"
                  }`}
                >
                  <div className="font-semibold text-[#202020]">{cycle.billingMonthLabel}</div>
                  <div className="text-[#57636c]">{cycle.invoice?.invoiceNumber || cycle.monthKey}</div>
                  <div className="font-semibold text-[#202020]">{formatMoney(cycle?.totals?.amountDueIncl || 0)}</div>
                  <div className="text-[#57636c]">{formatMoney(cycle?.totals?.netSellerPayoutIncl || 0)}</div>
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(cycle?.status)}`}>
                      {compactStatusLabel(cycle?.status)}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => void openBillingDocument("invoice", cycle)}
                      disabled={!!docBusy}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:opacity-60"
                    >
                      Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => void openBillingDocument("statement", cycle)}
                      disabled={!!docBusy}
                      className="inline-flex h-8 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:opacity-60"
                    >
                      Statement
                    </button>
                  </div>
                </div>

                {selectedCycleId === String(cycle?.billingId || cycle?.monthKey || "") ? (
                  <div className="border-t border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-4">
                    <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
                      <div className="space-y-3">
                        {[
                          ["Issued", formatDateTime(cycle?.issuedAt)],
                          ["Due", formatDateTime(cycle?.dueDate)],
                          ["Amount due", formatMoney(cycle?.totals?.amountDueIncl || 0)],
                          ["Net seller payout", formatMoney(cycle?.totals?.netSellerPayoutIncl || 0)],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="flex items-center justify-between gap-3 rounded-[8px] border border-black/5 bg-white px-4 py-3">
                            <span className="text-[12px] text-[#57636c]">{label}</span>
                            <span className="text-[13px] font-semibold text-[#202020]">{value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        {[
                          ["Sales tracked", cycle?.totals?.salesIncl || 0],
                          ["Marketplace fee", cycle?.totals?.successFeeIncl || 0],
                          ["Fulfilment fee", cycle?.totals?.fulfilmentFeeIncl || 0],
                          ["Storage fee", cycle?.totals?.storageFeeIncl || 0],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="flex items-center justify-between gap-3 rounded-[8px] border border-black/5 bg-white px-4 py-3">
                            <span className="text-[12px] text-[#57636c]">{label}</span>
                            <span className="text-[13px] font-semibold text-[#202020]">{formatMoney(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-[13px] text-[#57636c]">No billing cycles found yet.</div>
          )}
        </div>
      </section>

      <details className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <summary className="cursor-pointer list-none text-[12px] font-semibold text-[#202020]">How fees work</summary>
        <div className="mt-3 space-y-3 text-[12px] leading-[1.7] text-[#57636c]">
          <p><span className="font-semibold text-[#202020]">Marketplace fee:</span> {guide?.successFee || "Charged on order creation using the current category fee."}</p>
          <p><span className="font-semibold text-[#202020]">Fulfilment fee:</span> {guide?.handlingFee || "Charged when Piessang fulfils the order."}</p>
          <p><span className="font-semibold text-[#202020]">Storage fee:</span> {guide?.storageFee || "Charged when Piessang-held stock exceeds the storage threshold."}</p>
          <p><span className="font-semibold text-[#202020]">Invoice rule:</span> {guide?.invoiceRule || "Warehouse charges form the seller bill, while marketplace fees remain visible for reporting."}</p>
        </div>
      </details>

      {paymentHistory.length ? (
        <section className="rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] font-semibold text-[#202020]">Payment history</p>
          <div className="mt-3 divide-y divide-black/5">
            {paymentHistory.map((payment: any) => (
              <div key={payment.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#202020]">{payment.billingMonthLabel || "Billing cycle"}</p>
                  <p className="mt-0.5 text-[12px] text-[#57636c]">
                    {String(payment?.method || "request").replace(/_/g, " ")} • {formatDateTime(payment?.requestedAt || payment?.paidAt)}
                  </p>
                  {payment?.reference ? <p className="mt-0.5 text-[12px] text-[#57636c]">Reference: {payment.reference}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold text-[#202020]">{formatMoney(payment?.amountIncl || 0)}</span>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusTone(payment?.status)}`}>
                    {String(payment?.status || "paid").replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {paymentOpen ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 px-4 py-6" onClick={() => !paymentBusy && setPaymentOpen(false)}>
          <div className="w-full max-w-[560px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]" onClick={(event) => event.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller billing</p>
            <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Pay now with Stripe</h3>
            <p className="mt-3 text-[14px] leading-[1.6] text-[#57636c]">
              Settle this billing cycle immediately by card. Once Stripe confirms the payment, the billing cycle is marked as settled.
            </p>

            <div className="mt-5 rounded-[18px] border border-black/6 bg-[#fafafa] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[#57636c]">Amount due</span>
                <strong className="text-[22px] text-[#202020]">{formatMoney(current?.totals?.amountDueIncl || 0)}</strong>
              </div>
              <p className="mt-1 text-[12px] text-[#57636c]">{current?.billingMonthLabel || "Current billing cycle"}</p>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="text-[12px] font-semibold text-[#202020]">Cardholder name</label>
                <input
                  value={payerName}
                  onChange={(event) => setPayerName(event.target.value)}
                  className="h-11 rounded-[12px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none"
                  placeholder="Name on card"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-[12px] font-semibold text-[#202020]">Card number</label>
                <div id="seller-billing-card-number" className="rounded-[12px] border border-black/10 bg-white px-3 py-[13px]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-[12px] font-semibold text-[#202020]">Expiry</label>
                  <div id="seller-billing-card-expiry" className="rounded-[12px] border border-black/10 bg-white px-3 py-[13px]" />
                </div>
                <div className="grid gap-2">
                  <label className="text-[12px] font-semibold text-[#202020]">CVC</label>
                  <div id="seller-billing-card-cvc" className="rounded-[12px] border border-black/10 bg-white px-3 py-[13px]" />
                </div>
              </div>
              {stripeLoading ? <p className="text-[12px] text-[#57636c]">Loading secure card fields...</p> : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (paymentBusy) return;
                  setPaymentOpen(false);
                  setBillingCheckout(null);
                }}
                disabled={paymentBusy}
                className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmBillingPayment()}
                disabled={paymentBusy || stripeLoading || !billingCheckout?.clientSecret}
                className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {paymentBusy ? "Processing payment..." : "Pay now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
