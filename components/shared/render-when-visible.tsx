"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type RenderWhenVisibleProps = {
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
  rootMargin?: string;
  triggerOnce?: boolean;
  onVisible?: () => void;
};

export function RenderWhenVisible({
  children,
  className = "",
  fallback = null,
  rootMargin = "240px 0px",
  triggerOnce = true,
  onVisible,
}: RenderWhenVisibleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        if (triggerOnce) {
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin, triggerOnce]);

  useEffect(() => {
    if (!isVisible) return;
    onVisible?.();
  }, [isVisible, onVisible]);

  return (
    <div ref={containerRef} className={className}>
      {isVisible ? children : fallback}
    </div>
  );
}
