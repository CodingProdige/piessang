"use client";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onClose: () => void;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  confirmDisabled?: boolean;
  tone?: "danger" | "default";
  eyebrow?: string;
  children?: React.ReactNode;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onClose,
  onCancel,
  onConfirm,
  busy = false,
  confirmDisabled = false,
  tone = "danger",
  eyebrow,
  children,
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-[#b91c1c] text-white"
      : "bg-[#202020] text-white";
  const eyebrowClasses =
    tone === "danger"
      ? "text-[#b91c1c]"
      : "text-[#907d4c]";

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-black/45 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        {eyebrow ? (
          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${eyebrowClasses}`}>{eyebrow}</p>
        ) : null}
        <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{title}</h3>
        <p className="mt-3 text-[14px] leading-[1.6] text-[#57636c]">{description}</p>
        {children ? <div className="mt-5">{children}</div> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCancel || onClose}
            disabled={busy}
            className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy || confirmDisabled}
            className={`inline-flex h-11 items-center rounded-[14px] px-4 text-[14px] font-semibold disabled:opacity-60 ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
