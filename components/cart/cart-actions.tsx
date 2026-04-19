"use client";

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
  const navigateTo = (href: string) => {
    if (typeof window !== "undefined") {
      window.location.assign(href);
      return;
    }
    onNavigate?.();
  };

  return (
    <div className={`grid gap-2 ${compact ? "pt-1.5" : "pt-2"}`}>
      {showViewCart ? (
        <button
          type="button"
          onClick={() => navigateTo("/cart")}
          className={`inline-flex w-full items-center justify-center rounded-[8px] border border-black bg-white px-3 font-semibold uppercase tracking-[0.08em] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          View cart
        </button>
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
        <button
          type="button"
          onClick={() => navigateTo("/checkout")}
          className={`inline-flex w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          Proceed to checkout
        </button>
      )}
      {disableCheckout && checkoutHint ? (
        <p className="text-[11px] leading-[1.4] text-[#b91c1c]">{checkoutHint}</p>
      ) : null}
    </div>
  );
}
