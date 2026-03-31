"use client";

import Link from "next/link";

export function CartActionStack({
  onNavigate,
  compact = false,
  showViewCart = true,
  disableCheckout = false,
  checkoutHint = "",
}: {
  onNavigate?: () => void;
  compact?: boolean;
  showViewCart?: boolean;
  disableCheckout?: boolean;
  checkoutHint?: string;
}) {
  return (
    <div className={`grid gap-2 ${compact ? "pt-1.5" : "pt-2"}`}>
      {showViewCart ? (
        <Link
          href="/cart"
          onClick={onNavigate}
          className={`inline-flex w-full items-center justify-center rounded-[8px] border border-black bg-white px-3 font-semibold uppercase tracking-[0.08em] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          View cart
        </Link>
      ) : null}
      {disableCheckout ? (
        <button
          type="button"
          disabled
          className={`inline-flex w-full items-center justify-center rounded-[8px] bg-[#d1d5db] px-3 font-semibold uppercase tracking-[0.08em] text-white ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          Proceed to checkout
        </button>
      ) : (
        <Link
          href="/checkout"
          onClick={onNavigate}
          className={`inline-flex w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          Proceed to checkout
        </Link>
      )}
      {disableCheckout && checkoutHint ? (
        <p className="text-[11px] leading-[1.4] text-[#b91c1c]">{checkoutHint}</p>
      ) : null}
    </div>
  );
}
