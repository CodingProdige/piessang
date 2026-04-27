"use client";

import { useDisplayCurrency } from "@/components/currency/display-currency-provider";

export type ProductMoneySize = "xs" | "sm" | "md" | "lg";

export function splitDisplayMoneyParts(formattedValue?: string | null) {
  if (!formattedValue) return null;
  const normalized = String(formattedValue).trim();
  const match = normalized.match(/^([^0-9-]*)(-?[0-9\s.,]+)$/);
  if (!match) return null;
  const symbol = (match[1] || "").trimEnd();
  const numeric = (match[2] || "").trim();
  const lastSeparatorIndex = Math.max(numeric.lastIndexOf("."), numeric.lastIndexOf(","));
  if (lastSeparatorIndex === -1) return { symbol, whole: numeric, cents: "00", formatted: normalized };
  return {
    symbol,
    whole: numeric.slice(0, lastSeparatorIndex).trim(),
    cents: numeric.slice(lastSeparatorIndex + 1).padEnd(2, "0").slice(0, 2),
    formatted: normalized,
  };
}

export function ProductMoney({
  value,
  size = "md",
  tone = "default",
  strike = false,
  className = "",
}: {
  value?: number | null;
  size?: ProductMoneySize;
  tone?: "default" | "sale" | "muted";
  strike?: boolean;
  className?: string;
}) {
  const { formatMoney } = useDisplayCurrency();
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const formatted = formatMoney(value);
  const parts = splitDisplayMoneyParts(formatted);
  if (!parts) {
    return <span className={className}>{formatted}</span>;
  }

  const sizeClasses = {
    xs: { symbol: "text-[10px]", whole: "text-[16px]", cents: "text-[10px]", top: "pt-[2px]" },
    sm: { symbol: "text-[11px]", whole: "text-[20px]", cents: "text-[11px]", top: "pt-[3px]" },
    md: { symbol: "text-[13px]", whole: "text-[30px]", cents: "text-[15px]", top: "pt-[4px]" },
    lg: { symbol: "text-[16px]", whole: "text-[40px]", cents: "text-[18px]", top: "pt-[5px]" },
  }[size];
  const toneClass =
    tone === "sale" ? "text-[#cc0c39]" : tone === "muted" ? "text-[#565959]" : "text-[#0f1111]";

  return (
    <span
      className={[
        "inline-flex items-start font-normal leading-none tracking-normal",
        toneClass,
        strike ? "line-through decoration-[1.5px]" : "",
        className,
      ].filter(Boolean).join(" ")}
      aria-label={formatted}
    >
      {parts.symbol ? <span className={`${sizeClasses.symbol} ${sizeClasses.top} leading-none`}>{parts.symbol}</span> : null}
      <span className={`${sizeClasses.whole} leading-none`}>{parts.whole}</span>
      <span className={`${sizeClasses.cents} ${sizeClasses.top} ml-[1px] leading-none`}>{parts.cents}</span>
    </span>
  );
}
