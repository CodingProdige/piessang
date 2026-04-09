"use client";

import { useEffect, useRef, useState } from "react";

export function DeferredSection({
  children,
  minHeight = 320,
  rootMargin = "900px 0px",
  eager = false,
}: {
  children: React.ReactNode;
  minHeight?: number;
  rootMargin?: string;
  eager?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(eager);

  useEffect(() => {
    if (eager) {
      setActive(true);
      return;
    }
    const node = containerRef.current;
    if (!node || active) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, rootMargin]);

  return (
    <div ref={containerRef} className="w-full">
      {active ? (
        children
      ) : (
        <div
          className="w-full animate-pulse rounded-[8px] border border-black/6 bg-[linear-gradient(180deg,#f2f3f5,#f7f7f8)] shadow-[0_8px_20px_rgba(20,24,27,0.04)]"
          style={{ minHeight }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
