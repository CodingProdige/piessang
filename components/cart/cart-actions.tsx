"use client";

import Link from "next/link";

export function CartActionStack({
  onNavigate,
  compact = false,
}: {
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${compact ? "pt-1.5" : "pt-2"}`}>
      <Link
        href="/cart"
        onClick={onNavigate}
        className={`inline-flex w-full items-center justify-center rounded-[8px] border border-black bg-white px-3 font-semibold uppercase tracking-[0.08em] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
      >
        View cart
      </Link>
      <Link
        href="/cart?step=checkout"
        onClick={onNavigate}
        className={`inline-flex w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
      >
        Proceed to checkout
      </Link>
    </div>
  );
}
