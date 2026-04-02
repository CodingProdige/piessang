"use client";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  tone?: "danger" | "default";
  eyebrow?: string;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
  busy = false,
  tone = "danger",
  eyebrow,
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
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            className={`inline-flex h-11 items-center rounded-[14px] px-4 text-[14px] font-semibold disabled:opacity-60 ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
