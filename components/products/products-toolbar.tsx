"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResultsCount } from "@/components/products/results-count";

type ToolbarProps = {
  resultsCount: number;
  currentSort: string;
  openInNewTab: boolean;
};

function buildHref(
  pathname: string,
  searchParams: URLSearchParams,
  patch: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(patch)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function ProductsToolbar({
  resultsCount,
  currentSort,
  openInNewTab,
}: ToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  return (
    <div className="flex flex-col gap-2 border-b border-black/5 bg-white px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <ResultsCount
        initialCount={resultsCount}
        totalCount={resultsCount}
        mode="compact"
        className="text-[14px] font-semibold text-[#4b4b4b]"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="hidden items-center gap-2 text-[13px] font-medium text-[#4b4b4b] sm:inline-flex">
          <span>Open products in new tab</span>
          <button
            type="button"
            role="switch"
            aria-checked={openInNewTab}
            onClick={() => {
              router.replace(buildHref(pathname, params, { openInNewTab: openInNewTab ? undefined : "true" }), {
                scroll: false,
              });
            }}
            className={
              openInNewTab
                ? "relative h-7 w-12 rounded-full bg-[#cbb26b] transition-colors"
                : "relative h-7 w-12 rounded-full bg-[#d7d7d7] transition-colors"
            }
          >
            <span
              className={
                openInNewTab
                  ? "absolute left-[23px] top-1 h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(20,24,27,0.18)] transition-all"
                  : "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(20,24,27,0.18)] transition-all"
              }
            />
          </button>
        </label>

        <div className="flex items-center gap-2 text-[13px] font-medium text-[#4b4b4b]">
          <span>Sort by:</span>
          <select
            value={currentSort}
            onChange={(event) => {
              router.replace(buildHref(pathname, params, { sort: event.target.value }), { scroll: false });
            }}
            className="min-w-[160px] rounded-[8px] border border-black/5 bg-white px-3 py-2 text-[13px] text-[#4b4b4b] shadow-[0_2px_10px_rgba(20,24,27,0.06)] outline-none"
          >
            <option value="relevance">Relevance</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>
        </div>
      </div>
    </div>
  );
}
