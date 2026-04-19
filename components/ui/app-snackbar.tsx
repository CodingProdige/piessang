"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function AppSnackbar({
  notice,
  onClose,
}: {
  notice: { tone?: "info" | "success" | "error"; message: string } | null;
  onClose?: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!notice?.message) return null;
  if (!mounted || typeof document === "undefined") return null;

  const tone = notice.tone || "info";
  const borderClass =
    tone === "success" ? "border-[#1f8f55]/30" : tone === "error" ? "border-[#b91c1c]/30" : "border-[#1d4ed8]/30";
  const dotClass = tone === "success" ? "bg-[#22c55e]" : tone === "error" ? "bg-[#ef4444]" : "bg-[#3b82f6]";

  return createPortal(
    <div className="fixed inset-x-4 bottom-4 z-[190] flex justify-center md:inset-x-auto md:right-4 md:justify-end">
      <div className={`flex w-full max-w-[380px] items-start justify-between gap-3 rounded-[16px] border bg-[#202020] px-4 py-3 text-white shadow-[0_16px_36px_rgba(20,24,27,0.28)] ${borderClass}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotClass}`} />
          <p className="text-[13px] font-medium leading-[1.45] text-white/96">{notice.message}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-[16px] text-white/70 transition hover:text-white"
            aria-label="Close snackbar"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
