"use client";

import Image from "next/image";

type SellerEventEntry = {
  id?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  sellerCode?: string | null;
  sellerSlug?: string | null;
};

type SellerCreditNoteEntry = {
  creditNoteId?: string;
  creditNoteNumber?: string;
  sellerCode?: string | null;
  sellerSlug?: string | null;
  amountIncl?: number;
  issuedAt?: string;
};

type SellerShipmentItem = {
  quantity?: number;
  product_snapshot?: {
    name?: string;
  };
  selected_variant_snapshot?: {
    label?: string;
  };
  fulfillment_tracking?: {
    status?: string;
    label?: string;
    courierName?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    shipmentStatus?: string | null;
  };
};

type SellerShipmentGroup = {
  key: string;
  vendorName: string;
  sellerCode: string;
  sellerSlug: string;
  items: SellerShipmentItem[];
  totalQty: number;
  progress: number;
  latestStatus: string;
  deliveryType: string;
  trackingUrl: string;
  trackingNumber: string;
  courierName: string;
};

type ShipmentStep = {
  key: string;
  label: string;
  icon: string;
  done: boolean;
  active: boolean;
};

export function CustomerSellerShipmentCard({
  group,
  isOpen,
  summary,
  steps,
  sellerReviewExists,
  sellerEvents,
  sellerCreditNotes,
  getLineImage,
  sentenceStatus,
  fulfillmentTone,
  formatMoney,
  formatDateTime,
  getFrozenLineTotalIncl,
  onToggleDetails,
  onOpenSellerReview,
  onViewCreditNote,
}: {
  group: SellerShipmentGroup;
  isOpen: boolean;
  summary: { eyebrow: string; subtext: string; meta: string };
  steps: ShipmentStep[];
  sellerReviewExists: boolean;
  sellerEvents: SellerEventEntry[];
  sellerCreditNotes: SellerCreditNoteEntry[];
  getLineImage: (item: SellerShipmentItem) => string;
  sentenceStatus: (value?: string) => string;
  fulfillmentTone: (status?: string) => string;
  formatMoney: (value: number) => string;
  formatDateTime: (value?: string) => string;
  getFrozenLineTotalIncl: (item: SellerShipmentItem) => number;
  onToggleDetails: () => void;
  onOpenSellerReview: () => void;
  onViewCreditNote: (creditNoteId: string) => void | Promise<void>;
}) {
  return (
    <div className="rounded-[24px] border border-black/6 bg-[#fcfcfc] p-4 shadow-[0_8px_24px_rgba(20,24,27,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[18px] font-semibold text-[#202020]">{group.vendorName}</p>
          <p className="mt-1 text-[13px] text-[#57636c]">{group.items.length} line{group.items.length === 1 ? "" : "s"} • {group.totalQty} item{group.totalQty === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${fulfillmentTone(group.latestStatus)}`}>{sentenceStatus(group.latestStatus)}</span>
          {group.latestStatus === "delivered" ? (
            <button
              type="button"
              onClick={onOpenSellerReview}
              className="text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2"
            >
              {sellerReviewExists ? "Edit rating" : "Rate seller"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleDetails}
            className="text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2"
          >
            {isOpen ? "Hide details" : "View details"}
          </button>
          <span className="text-[14px] font-semibold text-[#202020]">{group.progress}%</span>
        </div>
      </div>
      <div className="mt-4 rounded-[20px] border border-black/6 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8b94a3]">{summary.eyebrow}</p>
            <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-[#202020]">{sentenceStatus(group.latestStatus)}</p>
            <p className="mt-1 text-[13px] text-[#57636c]">{summary.subtext}</p>
            {summary.meta ? <p className="mt-2 text-[12px] text-[#57636c]">{summary.meta}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {group.latestStatus === "delivered" ? (
              <button
                type="button"
                onClick={onOpenSellerReview}
                className="inline-flex h-10 items-center rounded-[14px] border border-black/10 bg-white px-3 text-[13px] font-semibold text-[#202020]"
              >
                {sellerReviewExists ? "Edit rating" : "Rate seller"}
              </button>
            ) : null}
            {group.trackingUrl ? (
              <a
                href={group.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-[14px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
              >
                Track shipment
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {steps.map((step, index) => (
            <div key={`${group.key}-${step.key}`} className="relative rounded-[16px] border border-black/6 bg-[#fcfcfc] px-3 py-3">
              {index < steps.length - 1 ? (
                <span className={`absolute left-[calc(100%-8px)] top-5 hidden h-0.5 w-4 sm:block ${step.done ? "bg-[#1f8f55]" : "bg-[#d7dde5]"}`} />
              ) : null}
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold ${
                    step.done ? "bg-[#1f8f55] text-white" : step.active ? "bg-[#202020] text-white" : "bg-[#eef1f5] text-[#7a8594]"
                  }`}
                >
                  {step.done ? "✓" : step.icon}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-[#202020]">{step.label}</p>
                  <p className="mt-0.5 text-[11px] text-[#8b94a3]">{step.done ? "Completed" : step.active ? "Current" : "Waiting"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-[20px] border border-black/6 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[16px] font-semibold text-[#202020]">Shipment events</p>
            <p className="mt-1 text-[13px] text-[#57636c]">Seller-specific updates for this part of your order.</p>
          </div>
          <button
            type="button"
            onClick={onToggleDetails}
            className="text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2"
          >
            {isOpen ? "Hide events" : "View events"}
          </button>
        </div>
        {isOpen ? (
          <div className="mt-4 space-y-3">
            {sellerEvents.map((entry, index) => (
              <div key={entry.id || `${group.key}-event-${index}`} className="relative pl-5">
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#202020]" />
                <p className="text-[13px] font-semibold text-[#202020]">{entry.title || "Order update"}</p>
                {entry.message ? <p className="mt-1 text-[13px] text-[#57636c]">{entry.message}</p> : null}
                <p className="mt-1 text-[12px] text-[#8b94a3]">{formatDateTime(entry.createdAt)}</p>
              </div>
            ))}
            {!sellerEvents.length ? <p className="text-[13px] text-[#57636c]">No seller-specific events have been recorded yet.</p> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 rounded-[20px] border border-black/6 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[16px] font-semibold text-[#202020]">Products in this shipment</p>
            <p className="mt-1 text-[13px] text-[#57636c]">Everything this seller is fulfilling as part of your order.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {group.items.map((item, index) => {
            const image = getLineImage(item);
            return (
              <div key={`${group.key}-${item?.product_snapshot?.name || "item"}-${index}`} className="flex flex-col gap-4 rounded-[18px] bg-[#fcfcfc] px-4 py-4 sm:flex-row sm:items-center">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-black/6 bg-[#f8f8f8]">
                  {image ? <Image src={image} alt={item?.product_snapshot?.name || "Product"} fill className="object-cover" sizes="64px" /> : <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[#907d4c]">Item</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-semibold leading-tight text-[#202020]">{item?.product_snapshot?.name || "Product"}</p>
                  {item?.selected_variant_snapshot?.label ? <p className="mt-1 text-[14px] text-[#57636c]">{item.selected_variant_snapshot.label}</p> : null}
                  <p className="mt-1 text-[13px] text-[#57636c]">{sentenceStatus(item?.fulfillment_tracking?.label || item?.fulfillment_tracking?.status || "not_started")}</p>
                  {item?.fulfillment_tracking?.courierName || item?.fulfillment_tracking?.trackingNumber ? (
                    <p className="mt-1 text-[12px] text-[#57636c]">
                      {[item?.fulfillment_tracking?.courierName || "", item?.fulfillment_tracking?.trackingNumber || ""].filter(Boolean).join(" • ")}
                    </p>
                  ) : null}
                  {item?.fulfillment_tracking?.shipmentStatus ? (
                    <p className="mt-1 text-[12px] text-[#8b94a3]">Shipment: {sentenceStatus(item.fulfillment_tracking.shipmentStatus)}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-[15px] text-[#57636c]">Qty {Number(item?.quantity || 0)}</p>
                  <p className="mt-1 text-[22px] font-semibold text-[#202020]">{formatMoney(getFrozenLineTotalIncl(item || {}))}</p>
                  {item?.fulfillment_tracking?.trackingUrl ? (
                    <a
                      href={item.fulfillment_tracking.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-full border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-[#202020] transition hover:border-black/20 hover:bg-[#f7f7f9]"
                    >
                      Track shipment
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {sellerCreditNotes.map((entry) => (
        <div key={entry.creditNoteId || entry.creditNoteNumber} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-black/6 bg-white px-4 py-4">
          <div>
            <p className="text-[13px] font-semibold text-[#202020]">{entry.creditNoteNumber || "Credit note"}</p>
            <p className="mt-1 text-[12px] text-[#57636c]">{formatDateTime(entry.issuedAt)} • {formatMoney(Number(entry.amountIncl || 0))}</p>
          </div>
          {entry.creditNoteId ? (
            <button
              type="button"
              onClick={() => void onViewCreditNote(entry.creditNoteId!)}
              className="text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2"
            >
              View credit note
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
