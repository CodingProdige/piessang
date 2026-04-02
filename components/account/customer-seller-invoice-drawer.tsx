"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type InvoiceSellerLine = {
  title?: string;
  variant?: string;
  quantity?: number;
  imageUrl?: string;
};

type InvoiceSellerGroup = {
  key: string;
  sellerCode?: string;
  sellerSlug?: string;
  vendorName?: string;
  totalIncl?: number;
  lines?: InvoiceSellerLine[];
};

type BusinessDetails = {
  companyName: string;
  vatNumber: string;
  registrationNumber: string;
  businessType: string;
  phoneNumber: string;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatMoney(value: number) {
  return `R${Number(value || 0).toFixed(2)}`;
}

export function CustomerSellerInvoiceDrawer({
  open,
  orderId,
  orderNumber,
  orderDate,
  sellers,
  initialBusiness,
  onClose,
  onSaveBusiness,
}: {
  open: boolean;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  sellers: InvoiceSellerGroup[];
  initialBusiness: BusinessDetails;
  onClose: () => void;
  onSaveBusiness: (details: BusinessDetails) => Promise<void>;
}) {
  const [details, setDetails] = useState<BusinessDetails>(initialBusiness);
  const [editing, setEditing] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [busySellerKey, setBusySellerKey] = useState("");
  const [modalUrl, setModalUrl] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [snackbar, setSnackbar] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDetails(initialBusiness);
    setEditing(false);
    setBusySellerKey("");
  }, [initialBusiness, open]);

  useEffect(() => {
    if (!snackbar) return;
    const timeout = window.setTimeout(() => setSnackbar(null), 3800);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const fingerprintChanged = useMemo(
    () => JSON.stringify(details) !== JSON.stringify(initialBusiness),
    [details, initialBusiness],
  );

  async function handleSaveBusiness() {
    setSavingBusiness(true);
    setSnackbar(null);
    try {
      await onSaveBusiness(details);
      setEditing(false);
      setSnackbar({ tone: "success", message: "Business details saved for future invoices." });
    } catch (cause) {
      setSnackbar({ tone: "error", message: cause instanceof Error ? cause.message : "Unable to save business details." });
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handleOpenSellerInvoice(group: InvoiceSellerGroup) {
    if (!orderId || !group?.key || busySellerKey) return;
    setBusySellerKey(group.key);
    setSnackbar(null);
    setCopyState("idle");
    try {
      const response = await fetch("/api/client/v1/orders/documents/seller-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          sellerCode: group.sellerCode,
          sellerSlug: group.sellerSlug,
          force: fingerprintChanged,
          generatedBy: "customer_seller_invoice_drawer",
          buyerBusiness: details,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to generate seller invoice.");
      const url = toStr(payload?.data?.url || payload?.url || "");
      if (!url) throw new Error("Invoice document is not available yet.");
      setModalUrl(url);
      setSnackbar({ tone: "success", message: `Invoice ready for ${group.vendorName || "seller"}.` });
    } catch (cause) {
      setSnackbar({ tone: "error", message: cause instanceof Error ? cause.message : "Unable to open seller invoice." });
    } finally {
      setBusySellerKey("");
    }
  }

  async function handleCopyLink() {
    if (!modalUrl) return;
    try {
      await navigator.clipboard.writeText(modalUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  if (!portalReady) return null;

  return createPortal(
    <>
      {snackbar ? (
        <div className="fixed inset-x-0 top-24 z-[190] flex justify-center px-4">
          <div
            className={`flex w-full max-w-[560px] items-start justify-between gap-4 rounded-[18px] border px-4 py-3 shadow-[0_16px_40px_rgba(20,24,27,0.18)] ${
              snackbar.tone === "success"
                ? "border-[#b7f0cf] bg-[#ecfdf5] text-[#166534]"
                : "border-[#f3b8bf] bg-[#fff7f8] text-[#b91c1c]"
            }`}
          >
            <p className="text-[14px] font-medium">{snackbar.message}</p>
            <button type="button" onClick={() => setSnackbar(null)} className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/15 text-[16px]">
              ×
            </button>
          </div>
        </div>
      ) : null}

      {modalUrl ? (
        <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/35 px-4" onClick={() => setModalUrl("")}>
          <div className="w-full max-w-[560px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Invoice ready</p>
                <p className="mt-2 text-[14px] text-[#57636c]">You can open this seller invoice in a new tab or copy the link.</p>
              </div>
              <button type="button" onClick={() => setModalUrl("")} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c]">
                ×
              </button>
            </div>
            <div className="mt-5 rounded-[18px] border border-black/8 bg-[#f6f7f8] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8b94a3]">Invoice link</p>
              <p className="mt-2 break-all text-[13px] text-[#202020]">{modalUrl}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={modalUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white">
                Open invoice
              </a>
              <button type="button" onClick={() => void handleCopyLink()} className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
                Copy link
              </button>
              <button type="button" onClick={() => setModalUrl("")} className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]">
                Close
              </button>
            </div>
            {copyState === "copied" ? <p className="mt-3 text-[13px] font-medium text-[#1f8f55]">Invoice link copied.</p> : null}
            {copyState === "error" ? <p className="mt-3 text-[13px] font-medium text-[#b91c1c]">Couldn’t copy automatically. You can still open or manually copy the link above.</p> : null}
          </div>
        </div>
      ) : null}

      <div className={`fixed inset-0 z-[180] ${open ? "" : "pointer-events-none"}`}>
        <button
          type="button"
          aria-label="Close invoices drawer backdrop"
          className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={onClose}
        />
        <aside
          className={`fixed bottom-0 right-0 top-0 flex w-[92vw] max-w-[460px] flex-col overflow-hidden bg-[#f7f7f7] shadow-[0_20px_48px_rgba(20,24,27,0.22)] transition-transform duration-300 md:max-w-[720px] ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
        <div className="sticky top-0 z-10 border-b border-black/8 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[32px] font-semibold tracking-[-0.04em] text-[#202020]">Invoices</p>
              <p className="mt-2 text-[14px] text-[#57636c]">Order {orderNumber || orderId}{orderDate ? `, ${orderDate}` : ""}</p>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-[20px] text-[#57636c]">
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-[#f7f7f7] p-6 pb-0">
          <section className="rounded-[18px] border border-black/6 bg-white p-5 shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[18px] font-semibold text-[#202020]">Business details</p>
                <p className="mt-1 text-[13px] text-[#57636c]">Add your business details if you want them printed on seller invoices. We’ll remember them for next time.</p>
              </div>
              <button
                type="button"
                onClick={() => (editing ? void handleSaveBusiness() : setEditing(true))}
                disabled={savingBusiness}
                className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-[#f6f7f8] px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60"
              >
                {editing ? (savingBusiness ? "Saving..." : "Save business details") : "Edit business details"}
              </button>
            </div>
            {editing ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input value={details.companyName} onChange={(e) => setDetails((c) => ({ ...c, companyName: e.target.value }))} placeholder="Business name" className="h-12 rounded-[14px] border border-black/10 px-4 text-[14px] outline-none" />
                <input value={details.vatNumber} onChange={(e) => setDetails((c) => ({ ...c, vatNumber: e.target.value }))} placeholder="VAT number" className="h-12 rounded-[14px] border border-black/10 px-4 text-[14px] outline-none" />
                <input value={details.registrationNumber} onChange={(e) => setDetails((c) => ({ ...c, registrationNumber: e.target.value }))} placeholder="Registration number" className="h-12 rounded-[14px] border border-black/10 px-4 text-[14px] outline-none" />
                <input value={details.businessType} onChange={(e) => setDetails((c) => ({ ...c, businessType: e.target.value }))} placeholder="Business type" className="h-12 rounded-[14px] border border-black/10 px-4 text-[14px] outline-none" />
                <input value={details.phoneNumber} onChange={(e) => setDetails((c) => ({ ...c, phoneNumber: e.target.value }))} placeholder="Business phone" className="h-12 rounded-[14px] border border-black/10 px-4 text-[14px] outline-none md:col-span-2" />
              </div>
            ) : (
              <div className="mt-4 rounded-[14px] border border-black/6 bg-[#fafafa] p-4 text-[13px] text-[#57636c]">
                {details.companyName || details.vatNumber || details.registrationNumber || details.businessType || details.phoneNumber ? (
                  <div className="space-y-1">
                    {details.companyName ? <p><span className="font-semibold text-[#202020]">Business:</span> {details.companyName}</p> : null}
                    {details.vatNumber ? <p><span className="font-semibold text-[#202020]">VAT:</span> {details.vatNumber}</p> : null}
                    {details.registrationNumber ? <p><span className="font-semibold text-[#202020]">Registration:</span> {details.registrationNumber}</p> : null}
                    {details.businessType ? <p><span className="font-semibold text-[#202020]">Type:</span> {details.businessType}</p> : null}
                    {details.phoneNumber ? <p><span className="font-semibold text-[#202020]">Phone:</span> {details.phoneNumber}</p> : null}
                  </div>
                ) : (
                  <p>No business details added yet.</p>
                )}
              </div>
            )}
          </section>

          {sellers.map((group) => {
            const busy = busySellerKey === group.key;
            return (
              <section key={group.key} className="rounded-[18px] border border-black/6 bg-white shadow-[0_10px_30px_rgba(20,24,27,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/6 px-5 py-4">
                  <div>
                    <p className="text-[15px] text-[#57636c]">Sold by: <span className="font-semibold text-[#202020]">{group.vendorName || "Seller"}</span></p>
                    <p className="mt-1 text-[13px] text-[#57636c]">Invoice total: <span className="font-semibold text-[#202020]">{formatMoney(Number(group.totalIncl || 0))}</span></p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleOpenSellerInvoice(group)}
                    disabled={busy || savingBusiness}
                    className="inline-flex h-11 items-center rounded-[14px] bg-[#f6f7f8] px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60"
                  >
                    {busy ? "Preparing invoice..." : "Download invoice"}
                  </button>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Invoice items</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(group.lines || []).map((line, index) => (
                      <div key={`${group.key}-${index}`} className="flex min-w-[220px] items-center gap-3 rounded-[14px] border border-black/6 bg-[#fafafa] p-3">
                        <div className="relative h-20 w-20 overflow-hidden rounded-[12px] border border-black/8 bg-white">
                          {line.imageUrl ? (
                            <Image src={line.imageUrl} alt={line.title || "Product"} fill className="object-contain p-1.5" sizes="80px" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] text-[#8b94a3]">No image</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-[#202020]">{line.title || "Product"}</p>
                          <p className="mt-1 text-[13px] text-[#57636c]">{line.variant || "Selected option"}</p>
                          <p className="mt-2 text-[12px] font-semibold text-[#202020]">x{Number(line.quantity || 0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        </aside>
      </div>
    </>
    ,
    document.body
  );
}
