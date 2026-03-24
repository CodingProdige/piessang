"use client";

import { useEffect, useState } from "react";

type ResultsCountProps = {
  initialCount: number;
  totalCount: number;
  mode?: "sentence" | "compact";
  className?: string;
};

type ResultsCountDetail = {
  count?: number;
};

export function ResultsCount({ initialCount, totalCount, mode = "compact", className }: ResultsCountProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ResultsCountDetail>).detail;
      if (typeof detail?.count === "number" && Number.isFinite(detail.count)) {
        setCount(detail.count);
      }
    };

    window.addEventListener("bevgo-products-results-change", handler);
    return () => window.removeEventListener("bevgo-products-results-change", handler);
  }, []);

  if (mode === "sentence") {
    return (
      <p className={className}>
        Showing {count} of {totalCount} products
      </p>
    );
  }

  return (
    <p className={className}>
      {count} results
    </p>
  );
}
