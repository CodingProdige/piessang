"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PriceRangeFilter } from "@/components/products/price-range-filter";

type SearchParamValue = string | string[] | undefined;

type MobileFilterOptions = {
  categories?: string[];
  subCategories?: string[];
  brands?: string[];
  kinds?: string[];
  packUnits?: string[];
  attributeFilters?: Array<{
    key: string;
    title: string;
    group?: string;
    items: string[];
  }>;
  priceRange?: {
    min?: number;
    max?: number;
  };
};

type FilterCountMap = Record<string, number>;
type HistogramBucket = {
  min: number;
  max: number;
  count: number;
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

function currentParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) ?? "";
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function FilterSection({
  title,
  items,
  currentValue,
  counts,
  pathname,
  params,
  paramKey,
  onClose,
  defaultOpen = true,
  formatItemLabel = humanizeSlug,
}: {
  title: string;
  items: string[];
  currentValue: string;
  counts?: FilterCountMap;
  pathname: string;
  params: URLSearchParams;
  paramKey: string;
  onClose: () => void;
  defaultOpen?: boolean;
  formatItemLabel?: (value: string) => string;
}) {
  if (!items.length) return null;

  return (
    <details className="group border-b border-black/5 pb-4 last:border-b-0 last:pb-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">
        <span>{title}</span>
        <span className="grid h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:hidden">
          +
        </span>
        <span className="hidden h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:grid">
          −
        </span>
      </summary>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => {
          const active = currentValue === item;
          return (
            <Link
              key={item}
              href={buildHref(pathname, params, { [paramKey]: active ? undefined : item })}
              scroll={false}
              onClick={onClose}
              className={
                active
                  ? "flex items-center gap-2 rounded-[8px] bg-[rgba(203,178,107,0.12)] px-2.5 py-2 text-[11px] font-medium text-[#202020]"
                  : "flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[11px] font-medium text-[#57636c] hover:bg-[#fafafa] hover:text-[#202020]"
              }
            >
              <span
                className={
                  active
                    ? "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#cbb26b] bg-[#cbb26b] text-[8px] leading-none text-white"
                    : "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#b8bec7] bg-white text-[8px] leading-none text-transparent"
                }
              >
                ✓
              </span>
              <span className="truncate">{formatItemLabel(item)}</span>
              <span className="ml-auto text-[10px] font-semibold text-[#8b94a3]">
                {counts?.[item] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function RatingSection({
  title,
  currentMinRating,
  counts,
  pathname,
  params,
  onClose,
  defaultOpen = true,
}: {
  title: string;
  currentMinRating?: number;
  counts?: FilterCountMap;
  pathname: string;
  params: URLSearchParams;
  onClose: () => void;
  defaultOpen?: boolean;
}) {
  const ratings = [4, 3, 2, 1];

  return (
    <details className="group border-b border-black/5 pb-4 last:border-b-0 last:pb-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">
        <span>{title}</span>
        <span className="grid h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:hidden">
          +
        </span>
        <span className="hidden h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:grid">
          −
        </span>
      </summary>
      <div className="mt-2 space-y-1.5">
        {ratings.map((rating) => {
          const active = currentMinRating === rating;
          return (
            <Link
              key={rating}
              href={buildHref(pathname, params, { minRating: active ? undefined : String(rating) })}
              scroll={false}
              onClick={onClose}
              className={
                active
                  ? "flex items-center gap-2 rounded-[8px] bg-[rgba(203,178,107,0.12)] px-2.5 py-2 text-[11px] font-medium text-[#202020]"
                  : "flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[11px] font-medium text-[#57636c] hover:bg-[#fafafa] hover:text-[#202020]"
              }
            >
              <span
                className={
                  active
                    ? "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#cbb26b] bg-[#cbb26b] text-[8px] leading-none text-white"
                    : "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#b8bec7] bg-white text-[8px] leading-none text-transparent"
                }
              >
                •
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span>{rating}</span>
                <span className="text-[#cbb26b]">★</span>
                <span>and up</span>
              </span>
              <span className="ml-auto text-[10px] font-semibold text-[#8b94a3]">
                {counts?.[String(rating)] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function AttributeFilterSectionGroup({
  title,
  filters,
  currentAttributeFilters,
  counts,
  pathname,
  params,
  onClose,
}: {
  title: string;
  filters: Array<{ key: string; title: string; group?: string; items: string[] }>;
  currentAttributeFilters: Record<string, string>;
  counts?: Record<string, FilterCountMap>;
  pathname: string;
  params: URLSearchParams;
  onClose: () => void;
}) {
  if (!filters.length) return null;

  return (
    <section className="border-b border-black/5 pb-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">{title}</h3>
      <div className="mt-3 space-y-4">
        {filters.map((filter) => (
          <FilterSection
            key={filter.key}
            title={filter.title}
            items={filter.items}
            currentValue={currentAttributeFilters[filter.key] ?? ""}
            counts={counts?.[filter.key]}
            pathname={pathname}
            params={params}
            paramKey={filter.key}
            onClose={onClose}
            formatItemLabel={(value) => value}
          />
        ))}
      </div>
    </section>
  );
}

export function MobileProductFilters({
  options,
  currentCategory,
  currentSubCategory,
  currentBrand,
  currentKind,
  currentPackUnit,
  currentAttributeFilters,
  currentMinRating,
  currentInStock,
  currentOnSale,
  currentNewArrivals,
  currentFeatured,
  currentMinPrice,
  currentMaxPrice,
  histogram,
  counts,
}: {
  options: MobileFilterOptions;
  currentCategory: string;
  currentSubCategory: string;
  currentBrand: string;
  currentKind: string;
  currentPackUnit: string;
  currentAttributeFilters: Record<string, string>;
  currentMinRating?: number;
  currentInStock: boolean;
  currentOnSale: boolean;
  currentNewArrivals: boolean;
  currentFeatured: boolean;
  currentMinPrice?: number;
  currentMaxPrice?: number;
  histogram?: HistogramBucket[];
    counts?: {
      categories?: FilterCountMap;
      subCategories?: FilterCountMap;
      brands?: FilterCountMap;
      kinds?: FilterCountMap;
      packUnits?: FilterCountMap;
      attributes?: Record<string, FilterCountMap>;
      ratings?: FilterCountMap;
    };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const groupedAttributeFilters = useMemo(() => {
    const byGroup = new Map<string, Array<{ key: string; title: string; group?: string; items: string[] }>>();
    for (const filter of options.attributeFilters ?? []) {
      const group = String(filter.group || "Core options");
      const current = byGroup.get(group) ?? [];
      current.push(filter);
      byGroup.set(group, current);
    }
    return Array.from(byGroup.entries()).map(([group, filters]) => ({ group, filters }));
  }, [options.attributeFilters]);

  return (
    <div className="lg:hidden">
      <div className="mb-3 flex items-center justify-between rounded-[8px] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[14px] font-semibold text-[#4b4b4b]">Filters</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center rounded-[8px] bg-[#cbb26b] px-3 py-2 text-[11px] font-semibold text-white"
        >
          Open filters
        </button>
      </div>

      <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
        <button
          type="button"
          aria-label="Close filters backdrop"
          className={`absolute inset-0 bg-black/35 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`relative h-full w-[84vw] max-w-[360px] overflow-y-auto bg-white shadow-[0_16px_40px_rgba(0,0,0,0.24)] transition-transform duration-300 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-4">
            <p className="text-[14px] font-semibold text-[#202020]">Product filters</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center text-[24px] leading-none text-[#4b5563]"
            >
              ×
            </button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <FilterSection
              title="Category"
              items={options.categories ?? []}
              currentValue={currentCategory}
              counts={counts?.categories}
              pathname={pathname}
              params={params}
              paramKey="category"
              onClose={() => setOpen(false)}
            />
            <FilterSection
              title="Sub category"
              items={options.subCategories ?? []}
              currentValue={currentSubCategory}
              counts={counts?.subCategories}
              pathname={pathname}
              params={params}
              paramKey="subCategory"
              onClose={() => setOpen(false)}
            />
            <FilterSection
              title="Brand"
              items={options.brands ?? []}
              currentValue={currentBrand}
              counts={counts?.brands}
              pathname={pathname}
              params={params}
              paramKey="brand"
              onClose={() => setOpen(false)}
            />
            <FilterSection
              title="Type"
              items={options.kinds ?? []}
              currentValue={currentKind}
              counts={counts?.kinds}
              pathname={pathname}
              params={params}
              paramKey="kind"
              onClose={() => setOpen(false)}
            />
            <FilterSection
              title="Pack unit"
              items={options.packUnits ?? []}
              currentValue={currentPackUnit}
              counts={counts?.packUnits}
              pathname={pathname}
              params={params}
              paramKey="packUnit"
              onClose={() => setOpen(false)}
              formatItemLabel={(value) => value}
            />
            {groupedAttributeFilters.map((entry) => (
              <AttributeFilterSectionGroup
                key={entry.group}
                title={entry.group}
                filters={entry.filters}
                currentAttributeFilters={currentAttributeFilters}
                counts={counts?.attributes}
                pathname={pathname}
                params={params}
                onClose={() => setOpen(false)}
              />
            ))}
            <RatingSection
              title="Rating"
              currentMinRating={currentMinRating}
              counts={counts?.ratings}
              pathname={pathname}
              params={params}
              onClose={() => setOpen(false)}
            />

            <section className="border-b border-black/5 pb-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">
                Availability
              </h3>
              <div className="mt-2 space-y-1.5">
                {[
                  { title: "In stock", key: "inStock", enabled: currentInStock },
                  { title: "On sale", key: "onSale", enabled: currentOnSale },
                  { title: "New arrivals", key: "newArrivals", enabled: currentNewArrivals },
                  { title: "Featured", key: "isFeatured", enabled: currentFeatured },
                ].map((item) => (
                  <Link
                    key={item.key}
                    href={buildHref(pathname, params, {
                      [item.key]:
                        item.enabled && item.key !== "isFeatured" ? undefined : "true",
                    })}
                    scroll={false}
                    onClick={() => setOpen(false)}
                    className={
                      item.enabled
                        ? "flex items-center gap-2 rounded-[8px] bg-[rgba(203,178,107,0.12)] px-2.5 py-2 text-[11px] font-medium text-[#202020]"
                        : "flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[11px] font-medium text-[#57636c] hover:bg-[#fafafa] hover:text-[#202020]"
                    }
                  >
                    <span
                      className={
                        item.enabled
                          ? "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#cbb26b] bg-[#cbb26b] text-[8px] leading-none text-white"
                          : "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[#b8bec7] bg-white text-[8px] leading-none text-transparent"
                      }
                    >
                      ✓
                    </span>
                    <span>{item.title}</span>
                  </Link>
                ))}
              </div>
            </section>

            {options.priceRange?.min != null && options.priceRange?.max != null ? (
              <section className="border-b border-black/5 pb-4">
                <PriceRangeFilter
                  min={options.priceRange.min}
                  max={options.priceRange.max}
                  currentMin={currentMinPrice}
                  currentMax={currentMaxPrice}
                  compact
                  histogram={histogram}
                />
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
