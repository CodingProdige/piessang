"use client";

import Link from "next/link";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

function FlameIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M10.8 1.7c.2 2.2-.7 3.6-1.8 4.8-1.1 1.1-2.2 2.2-2.2 4 0 1.6 1.3 3 3.1 3 2.1 0 3.8-1.6 3.8-4.2 0-1.6-.6-2.8-1.4-4 .1 1.4-.3 2.4-1.1 3.2.1-2-.2-4.4-2.4-6.8ZM10 18c-3.8 0-6.5-2.9-6.5-6.7 0-2.8 1.4-4.8 3-6.4.9-.9 1.7-1.7 1.8-3.2a1 1 0 0 1 1.8-.5c3.3 4.2 5.4 7 5.4 10.6 0 3.7-2.4 6.2-5.5 6.2Zm-.1-2.3c1.6 0 2.7-1.1 2.7-2.8 0-1-.3-1.8-1-2.8-.2.8-.7 1.4-1.3 1.9-.5.4-1 .8-1 1.7 0 1.1.8 2 1.6 2Z" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-3.5 w-3.5 ${filled ? "fill-[#e3c52f] text-[#e3c52f]" : "fill-[#e5e7eb] text-[#e5e7eb]"}`}>
      <path d="M10 2.2l2.2 4.6 5.1.7-3.7 3.6.9 5.1L10 13.8l-4.5 2.4.9-5.1L2.7 7.5l5.1-.7L10 2.2Z" />
    </svg>
  );
}

export function StorefrontProductCard({
  title,
  titleText,
  selectedVariantLabel,
  brandLabel,
  brandHref,
  vendorLabel,
  vendorHref,
  currentUrl,
  linkTarget,
  linkRel,
  stockLabel,
  stockTone = "neutral",
  variantCount,
  sellerOfferCount,
  reviewAverage,
  reviewCount,
  deliveryLabel,
  deliveryCutoffText,
  soldCountLabel,
  showHotSales = false,
  priceNode,
  mediaNode,
  actionNode,
  imageBadges,
  onCardClick,
  onCardKeyDown,
}: {
  title: string;
  titleText?: string;
  selectedVariantLabel?: string | null;
  brandLabel?: string | null;
  brandHref?: string;
  vendorLabel?: string | null;
  vendorHref?: string;
  currentUrl?: string;
  linkTarget?: string;
  linkRel?: string;
  stockLabel?: string | null;
  stockTone?: "success" | "danger" | "warning" | "neutral";
  variantCount?: number;
  sellerOfferCount?: number;
  reviewAverage?: number | null;
  reviewCount?: number | null;
  deliveryLabel?: string | null;
  deliveryCutoffText?: string | null;
  soldCountLabel?: string | null;
  showHotSales?: boolean;
  priceNode?: ReactNode;
  mediaNode: ReactNode;
  actionNode?: ReactNode;
  imageBadges?: ReactNode;
  onCardClick?: (event: MouseEvent<HTMLElement>) => void;
  onCardKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const reviewStars = reviewAverage ? Math.max(0, Math.min(5, Math.round(reviewAverage))) : 0;
  const titleClampStyle = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: 2,
    overflow: "hidden",
  };
  const resolvedTitle = titleText || title;

  return (
    <article
      role={onCardClick ? "link" : undefined}
      tabIndex={onCardClick ? 0 : undefined}
      onClick={onCardClick}
      onKeyDown={onCardKeyDown}
      data-clickable-container={onCardClick ? "true" : undefined}
      className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_20px_rgba(20,24,27,0.06)]"
    >
      <div className="block">
        <div className="relative aspect-[1/1] overflow-hidden bg-[#fafafa]">
          {imageBadges}
          {mediaNode}
        </div>

        <div className="space-y-1.5 px-3 py-3 sm:px-4 sm:py-4">
          <h2 title={resolvedTitle} style={titleClampStyle} className="text-[12px] font-normal leading-[1.2] text-[#202020] sm:text-[15px]">
            {title}
          </h2>

          {selectedVariantLabel ? (
            <p className="text-[10px] font-medium leading-none text-[#8b94a3] sm:text-[11px]">{selectedVariantLabel}</p>
          ) : null}

          {brandLabel || vendorLabel ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-normal leading-none sm:text-[11px]">
              {brandLabel ? (
                brandHref && brandHref !== currentUrl ? (
                  <Link
                    href={brandHref}
                    target={linkTarget}
                    rel={linkRel}
                    prefetch={false}
                    scroll={false}
                    onClick={(event) => event.stopPropagation()}
                    className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                  >
                    {brandLabel}
                  </Link>
                ) : (
                  <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">{brandLabel}</span>
                )
              ) : null}
              {brandLabel && vendorLabel ? <span className="text-[#d6d6d6]">•</span> : null}
              {vendorLabel ? (
                vendorHref && vendorHref !== currentUrl ? (
                  <Link
                    href={vendorHref}
                    target={linkTarget}
                    rel={linkRel}
                    prefetch={false}
                    scroll={false}
                    onClick={(event) => event.stopPropagation()}
                    className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2 transition-colors hover:text-[#0037cc]"
                  >
                    {vendorLabel}
                  </Link>
                ) : (
                  <span className="text-[#0049ff] underline decoration-[#0049ff] underline-offset-2">{vendorLabel}</span>
                )
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] sm:gap-2 sm:text-[10px]">
            {stockLabel ? (
              <span
                className={
                  stockTone === "success"
                    ? "text-[#1a8553]"
                    : stockTone === "danger"
                      ? "text-[#b91c1c]"
                      : stockTone === "warning"
                        ? "text-[#b45309]"
                        : "text-[#57636c]"
                }
              >
                {stockLabel}
              </span>
            ) : null}
            {stockLabel && (typeof variantCount === "number" || (sellerOfferCount ?? 0) > 1) ? <span className="text-[#d6d6d6]">•</span> : null}
            {typeof variantCount === "number" ? <span>{variantCount} variants</span> : null}
            {typeof variantCount === "number" && (sellerOfferCount ?? 0) > 1 ? <span className="text-[#d6d6d6]">•</span> : null}
            {(sellerOfferCount ?? 0) > 1 ? <span>{sellerOfferCount} sellers</span> : null}
            {reviewAverage && reviewCount ? (
              <>
                {(stockLabel || typeof variantCount === "number" || (sellerOfferCount ?? 0) > 1) ? <span className="text-[#d6d6d6]">•</span> : null}
                <span className="inline-flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <StarIcon key={`${resolvedTitle}-star-${index}`} filled={index < reviewStars} />
                  ))}
                  <span className="ml-1 text-[#4a4545]">
                    {reviewAverage.toFixed(1)} ({reviewCount})
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[#8b94a3]">No reviews yet</span>
            )}
          </div>

          {deliveryLabel ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold normal-case tracking-normal sm:text-[11px]">
              <span className="rounded-full bg-[rgba(26,133,83,0.1)] px-2 py-1 text-[#1a8553]">{deliveryLabel}</span>
              {deliveryCutoffText ? <span className="text-[#8b94a3]">{deliveryCutoffText}</span> : null}
            </div>
          ) : null}

          {soldCountLabel ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold normal-case tracking-normal sm:text-[11px]">
              <span className={showHotSales ? "inline-flex items-center gap-1 text-[#f97316]" : "text-[#57636c]"}>
                {showHotSales ? <FlameIcon /> : null}
                {soldCountLabel}
              </span>
            </div>
          ) : null}

          {priceNode}

          {actionNode ? <div className="mt-2.5 flex items-stretch gap-2 sm:mt-3">{actionNode}</div> : null}
        </div>
      </div>
    </article>
  );
}

export default StorefrontProductCard;
