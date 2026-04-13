"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type FocusEvent, type MouseEvent, type TouchEvent } from "react";

type ProductLinkProps = LinkProps & {
  href: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
  target?: string;
  rel?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function ProductLink({
  href,
  className,
  children,
  title,
  target,
  rel,
  onClick,
  ...rest
}: ProductLinkProps) {
  const router = useRouter();
  const prefetchedRef = useRef(false);

  const prefetchHref = () => {
    if (prefetchedRef.current || !href) return;
    prefetchedRef.current = true;
    void router.prefetch(href);
  };

  useEffect(() => {
    prefetchedRef.current = false;
  }, [href]);

  useEffect(() => {
    if (!href || typeof window === "undefined") return;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedulePrefetch = () => {
      prefetchHref();
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(schedulePrefetch, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(schedulePrefetch, 250);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [href]);

  const handleMouseEnter = () => {
    prefetchHref();
  };

  const handleTouchStart = (_event: TouchEvent<HTMLAnchorElement>) => {
    prefetchHref();
  };

  const handleFocus = (_event: FocusEvent<HTMLAnchorElement>) => {
    prefetchHref();
  };

  const resolvedTarget = target ?? "_blank";
  const resolvedRel = rel ?? "noreferrer noopener";

  return (
    <Link
      {...rest}
      href={href}
      className={className}
      title={title}
      target={resolvedTarget}
      rel={resolvedRel}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
      onFocus={handleFocus}
    >
      {children}
    </Link>
  );
}
