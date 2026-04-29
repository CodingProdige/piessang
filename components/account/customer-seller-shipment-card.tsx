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
  title?: string;
  name?: string;
  quantity?: number;
  product_snapshot?: {
    name?: string;
    title?: string;
    product?: {
      title?: string;
      name?: string;
    };
  };
  selected_variant_snapshot?: {
    label?: string;
    title?: string;
    productTitle?: string;
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
  shortLabel?: string;
  icon: string;
  done: boolean;
  active: boolean;
};

function toText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function getShipmentItemTitle(item: SellerShipmentItem) {
  const productSnapshot = item?.product_snapshot;
  const product = productSnapshot?.product;
  const variant = item?.selected_variant_snapshot;
  const candidates = [
    product?.title,
    productSnapshot?.title,
    product?.name,
    item?.title,
    item?.name,
    variant?.productTitle,
    productSnapshot?.name,
    variant?.title,
    variant?.label,
  ];
  const title = candidates.map(toText).find((value) => value && value.toLowerCase() !== "product");
  return title || "Product";
}

function ShipmentStepIcon({ icon }: { icon: string }) {
  const common = {
    className: "h-5 w-5 sm:h-6 sm:w-6",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (icon === "process") {
    return (
      <svg {...common}>
        <path d="M20 11a8 8 0 0 0-13.6-5.7" />
        <path d="M4 5v5h5" />
        <path d="M4 13a8 8 0 0 0 13.6 5.7" />
        <path d="M20 19v-5h-5" />
      </svg>
    );
  }
  if (icon === "truck") {
    return (
      <svg {...common}>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.7" />
        <circle cx="17" cy="18" r="1.7" />
      </svg>
    );
  }
  if (icon === "box") {
    return (
      <svg {...common}>
        <path d="M21 8.5 12 4 3 8.5l9 4.5 9-4.5Z" />
        <path d="M3 8.5V16l9 4 9-4V8.5" />
        <path d="m12 13 9-4.5" />
        <path d="M8.5 11.25 17.5 6.75" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

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
    <div className="min-w-0 overflow-hidden rounded-[24px] border border-black/6 bg-[#fcfcfc] p-4 shadow-[0_8px_24px_rgba(20,24,27,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[18px] font-semibold text-[#202020]">{group.vendorName}</p>
          <p className="mt-1 text-[13px] text-[#57636c]">{group.items.length} line{group.items.length === 1 ? "" : "s"} • {group.totalQty} item{group.totalQty === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="mt-4 min-w-0 overflow-hidden rounded-[20px] border border-black/6 bg-white p-4">
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
        <div className="mt-5 min-w-0 pb-1">
          <div className="grid w-full min-w-0 grid-cols-4 gap-1 sm:gap-4">
            {steps.map((step, index) => (
              <div key={`${group.key}-${step.key}`} className="relative flex min-w-0 flex-col items-center text-center">
                {index < steps.length - 1 ? (
                  <span
                    className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[18px] border-t-2 border-dotted min-[380px]:left-[calc(50%+21px)] min-[380px]:right-[calc(-50%+21px)] min-[380px]:top-[21px] sm:left-[calc(50%+32px)] sm:right-[calc(-50%+32px)] sm:top-8 ${
                      step.done ? "border-[#37a6e6]" : "border-[#dce7f2]"
                    }`}
                  />
                ) : null}
                <div
                  className={`relative z-[1] flex h-9 w-9 items-center justify-center rounded-full border text-[15px] shadow-sm min-[380px]:h-11 min-[380px]:w-11 min-[380px]:text-[17px] sm:h-16 sm:w-16 sm:text-[22px] ${
                    step.done
                      ? "border-[#37a6e6] bg-[#e8f6ff] text-[#0f80c3]"
                      : step.active
                        ? "border-[#37a6e6] bg-white text-[#0f80c3]"
                        : "border-[#e5edf5] bg-[#f5f8fb] text-[#8b94a3]"
                  }`}
                >
                  <ShipmentStepIcon icon={step.icon} />
                  {step.done ? (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0f80c3] text-[10px] font-semibold text-white min-[380px]:h-5 min-[380px]:w-5 min-[380px]:text-[12px] sm:h-6 sm:w-6 sm:text-[14px]">
                      ✓
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 min-w-0 max-w-full">
                  <p className={`truncate px-0.5 text-[9px] font-semibold leading-tight min-[380px]:text-[10px] sm:text-[13px] ${step.done || step.active ? "text-[#0f80c3]" : "text-[#8b94a3]"}`}>
                    <span className="sm:hidden">{step.shortLabel || step.label}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </p>
                  <p className="mt-0.5 whitespace-nowrap text-[10px] text-[#8b94a3] sm:text-[11px]">{step.done ? "Completed" : step.active ? "Current" : "Waiting"}</p>
                </div>
              </div>
            ))}
          </div>
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
            const title = getShipmentItemTitle(item);
            return (
              <div key={`${group.key}-${title}-${index}`} className="flex flex-col gap-4 rounded-[18px] bg-[#fcfcfc] px-4 py-4 sm:flex-row sm:items-center">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-black/6 bg-[#f8f8f8]">
                  {image ? <Image src={image} alt={title} fill className="object-cover" sizes="64px" /> : <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[#907d4c]">Item</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-semibold leading-tight text-[#202020]">{title}</p>
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
