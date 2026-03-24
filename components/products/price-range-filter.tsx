"use client";

import { useEffect, useMemo, useState } from "react";

function formatCurrency(value: number) {
  return `R ${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function resolveStep(min: number, max: number) {
  const span = Math.max(0, max - min);
  if (span <= 250) return 25;
  if (span <= 1000) return 50;
  if (span <= 2500) return 100;
  return 250;
}

function resolveOptionMax(max: number, step: number) {
  const epsilon = Math.max(0.0001, step * 0.0001);
  return Math.ceil((max + epsilon) / step) * step;
}

type HistogramBucket = {
  min: number;
  max: number;
  count: number;
};

export function PriceRangeFilter({
  min,
  max,
  currentMin,
  currentMax,
  compact = false,
  histogram,
}: {
  min: number;
  max: number;
  currentMin?: number;
  currentMax?: number;
  compact?: boolean;
  histogram?: HistogramBucket[];
}) {
  const step = useMemo(() => resolveStep(min, max), [min, max]);
  const uiMin = useMemo(() => Math.max(0, Math.floor(min / step) * step), [min, step]);
  const uiMax = useMemo(() => Math.max(max, resolveOptionMax(max, step)), [max, step]);
  const priceOptions = useMemo(() => {
    const values = new Set<number>();

    for (let value = uiMin; value <= uiMax; value += step) {
      values.add(Number(value.toFixed(2)));
    }
    values.add(Number(uiMin.toFixed(2)));
    values.add(Number(uiMax.toFixed(2)));
    if (typeof currentMin === "number") {
      values.add(Number(currentMin.toFixed(2)));
    }
    if (typeof currentMax === "number") {
      values.add(Number(currentMax.toFixed(2)));
    }

    return [...values].sort((a, b) => a - b);
  }, [currentMax, currentMin, uiMax, uiMin, step]);

  const [localMin, setLocalMin] = useState(currentMin ?? min);
  const [localMax, setLocalMax] = useState(currentMax ?? max);

  const activeBucketKey = `${Math.round(localMin * 100) / 100}:${Math.round(localMax * 100) / 100}`;

  useEffect(() => {
    setLocalMin(currentMin ?? min);
    setLocalMax(currentMax ?? max);
  }, [currentMin, currentMax, min, max]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("bevgo-price-range-change", {
        detail: {
          min: Math.min(Math.max(localMin, uiMin), uiMax),
          max: Math.min(Math.max(localMax, uiMin), uiMax),
        },
      }),
    );
  }, [localMin, localMax, uiMax, uiMin]);

  useEffect(() => {
    setLocalMin((value) => Math.min(Math.max(value, uiMin), uiMax - step));
    setLocalMax((value) => Math.max(Math.min(value, uiMax), uiMin + step));
  }, [step, uiMax, uiMin]);

  const rowClass = compact ? "space-y-2" : "space-y-3";
  const labelClass = compact
    ? "text-[11px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]"
    : "text-[13px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]";
  const histogramBars = histogram?.length
    ? histogram
    : [24, 42, 18, 58, 31, 74, 46, 46, 28].map((count, index, values) => ({
        min: uiMin + index * step,
        max: index === values.length - 1 ? uiMax : uiMin + (index + 1) * step,
        count,
      }));
  const maxHistogramCount = Math.max(...histogramBars.map((bucket) => bucket.count), 1);
  const rangeMinPct = ((Math.max(localMin, uiMin) - uiMin) / (uiMax - uiMin || 1)) * 100;
  const rangeMaxPct = ((Math.min(localMax, uiMax) - uiMin) / (uiMax - uiMin || 1)) * 100;
  const trackStyle = {
    background: `linear-gradient(
      to right,
      #e5e7eb 0%,
      #e5e7eb ${rangeMinPct.toFixed(2)}%,
      #cbb26b ${rangeMinPct.toFixed(2)}%,
      #cbb26b ${rangeMaxPct.toFixed(2)}%,
      #e5e7eb ${rangeMaxPct.toFixed(2)}%,
      #e5e7eb 100%
    )`,
  } as const;

  return (
    <details className={`group ${rowClass}`} open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <h3 className={labelClass}>Price</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#8b94a3]">
            {formatCurrency(localMin)} - {formatCurrency(localMax)}
          </span>
          <span className="grid h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:hidden">
            +
          </span>
          <span className="hidden h-4 w-4 place-items-center text-[16px] leading-none text-[#57636c] group-open:grid">
            −
          </span>
        </div>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="rounded-[8px] bg-[#f5f5f5] px-4 py-4">
          <div className="flex h-28 items-end gap-1.5">
            {histogramBars.map((bucket, index) => {
              const bucketKey = `${bucket.min}:${bucket.max}`;
              const active = bucketKey === activeBucketKey;
              const height = Math.max(10, (bucket.count / maxHistogramCount) * 100);
              return (
                <button
                  key={`${index}-${bucket.min}-${bucket.max}`}
                  type="button"
                  title={`${formatCurrency(bucket.min)} - ${formatCurrency(bucket.max)} (${bucket.count} products)`}
                  onClick={() => {
                    setLocalMin(bucket.min);
                    setLocalMax(bucket.max);
                  }}
                  className="group relative flex-1 h-full outline-none"
                >
                  <span
                    className={
                      active
                        ? "block w-full rounded-[8px] bg-[rgba(203,178,107,0.9)] transition-colors group-hover:bg-[rgba(203,178,107,1)]"
                        : "block w-full rounded-[8px] bg-[rgba(203,178,107,0.35)] transition-colors group-hover:bg-[rgba(203,178,107,0.65)]"
                    }
                    style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${height}%` }}
                  />
                </button>
              );
            })}
          </div>
          <div className="relative -mt-1 h-2">
            <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#e5e7eb]" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#cbb26b]"
              style={{
                left: `${rangeMinPct}%`,
                right: `${100 - rangeMaxPct}%`,
              }}
            />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={trackStyle}
            />
            <input
              type="range"
              min={uiMin}
              max={uiMax}
              step={step}
              value={Math.min(localMin, localMax - step)}
              onChange={(event) => {
                const next = Math.min(Number(event.target.value), localMax - step);
                setLocalMin(next);
              }}
              className="absolute inset-0 z-10 h-2 w-full cursor-pointer appearance-none bg-transparent accent-[#cbb26b]"
            />
            <input
              type="range"
              min={uiMin}
              max={uiMax}
              step={step}
              value={Math.max(localMax, localMin + step)}
              onChange={(event) => {
                const next = Math.max(Number(event.target.value), localMin + step);
                setLocalMax(next);
              }}
              className="absolute inset-0 z-20 h-2 w-full cursor-pointer appearance-none bg-transparent accent-[#cbb26b]"
            />
          </div>
        </div>

        <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-4"}>
          <label className="rounded-[8px] bg-[#f5f5f5] px-3 py-2.5 text-[#4b4b4b]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#757575]">From</span>
            <select
              value={String(localMin)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setLocalMin(Math.min(next, localMax - step));
              }}
              className="mt-1 w-full bg-transparent text-[14px] font-semibold text-[#4b4b4b] outline-none"
            >
              {priceOptions.map((value) => (
                <option key={`min-${value}`} value={String(value)}>
                  {formatCurrency(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="rounded-[8px] bg-[#f5f5f5] px-3 py-2.5 text-[#4b4b4b]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#757575]">To</span>
            <select
              value={String(localMax)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setLocalMax(Math.max(next, localMin + step));
              }}
              className="mt-1 w-full bg-transparent text-[14px] font-semibold text-[#4b4b4b] outline-none"
            >
              {priceOptions.map((value) => (
                <option key={`max-${value}`} value={String(value)}>
                  {formatCurrency(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </details>
  );
}
