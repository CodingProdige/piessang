"use client";

export function CartActionStack({
  onNavigate,
  compact = false,
  showViewCart = true,
  disableCheckout = false,
  checkoutHint = "",
  viewCartHref = "/cart",
  checkoutHref = "/checkout",
}: {
  onNavigate?: () => void;
  compact?: boolean;
  showViewCart?: boolean;
  disableCheckout?: boolean;
  checkoutHint?: string;
  viewCartHref?: string;
  checkoutHref?: string;
}) {
  const handleNavigate = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (typeof window !== "undefined") {
      window.location.href = href;
      return;
    }
    onNavigate?.();
  };

  return (
    <div className={`grid gap-2 ${compact ? "pt-1.5" : "pt-2"}`}>
      {showViewCart ? (
        <a
          href={viewCartHref}
          onClick={handleNavigate(viewCartHref)}
          className={`inline-flex w-full items-center justify-center rounded-[8px] border border-black bg-white px-3 font-semibold uppercase tracking-[0.08em] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          View cart
        </a>
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
        <a
          href={checkoutHref}
          onClick={handleNavigate(checkoutHref)}
          className={`inline-flex w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#cbb26b] ${compact ? "h-8 text-[10px]" : "h-9 text-[11px]"}`}
        >
          Proceed to checkout
        </a>
      )}
      {disableCheckout && checkoutHint ? (
        <p className="text-[11px] leading-[1.4] text-[#b91c1c]">{checkoutHint}</p>
      ) : null}
    </div>
  );
}
