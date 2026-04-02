"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type PlatformPopoverProps = {
  children: ReactNode;
  className?: string;
  caretClassName?: string;
};

export function PlatformPopover({ children, className = "", caretClassName = "" }: PlatformPopoverProps) {
  return (
    <div
      className={`absolute left-0 top-full z-30 mt-3 rounded-[22px] border border-black/10 bg-white px-5 py-4 text-left shadow-[0_18px_40px_rgba(20,24,27,0.18)] ${className}`.trim()}
    >
      <div className={`pointer-events-none absolute left-12 top-0 h-4 w-4 -translate-y-1/2 rotate-45 border-l border-t border-black/10 bg-white ${caretClassName}`.trim()} />
      {children}
    </div>
  );
}

type PlatformPortalPopoverProps = {
  children: ReactNode;
  open: boolean;
  top: number;
  left: number;
  width?: number;
  caretLeft?: number;
  className?: string;
};

export function PlatformPortalPopover({
  children,
  open,
  top,
  left,
  width,
  caretLeft = 48,
  className = "",
}: PlatformPortalPopoverProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed z-[160] rounded-[22px] border border-black/10 bg-white px-5 py-4 text-left shadow-[0_18px_40px_rgba(20,24,27,0.18)] ${className}`.trim()}
      style={{ top, left, width }}
    >
      <div
        className="pointer-events-none absolute top-0 h-4 w-4 -translate-y-1/2 rotate-45 border-l border-t border-black/10 bg-white"
        style={{ left: caretLeft }}
      />
      {children}
    </div>,
    document.body,
  );
}

type PopoverHintTriggerProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
};

export function PopoverHintTrigger({ children, active = false, className = "" }: PopoverHintTriggerProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 border-b border-dotted border-black/30 pb-[1px] text-left transition-colors ${active ? "border-black/60 text-[#202020]" : "text-[#3f3f46] hover:border-black/50 hover:text-[#202020]"} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
