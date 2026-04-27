"use client";

import type { ProductShippingEligibilityResult } from "@/lib/catalogue/shipping-eligibility";

type ShippingPillTone = ProductShippingEligibilityResult["deliveryTone"];

const SHIPPING_PILL_CLASS_BY_TONE: Record<ShippingPillTone, string> = {
  success: "rounded-full bg-[rgba(26,133,83,0.1)] px-2 py-1 text-[#1a8553]",
  danger: "rounded-full bg-[rgba(185,28,28,0.08)] px-2 py-1 text-[#b91c1c]",
  warning: "rounded-full bg-[rgba(180,83,9,0.08)] px-2 py-1 text-[#b45309]",
  neutral: "rounded-full bg-[rgba(87,99,108,0.08)] px-2 py-1 text-[#57636c]",
};

export function ShippingPill({
  tone,
  label,
  className = "",
}: {
  tone: ShippingPillTone;
  label: string;
  className?: string;
}) {
  return (
    <span className={[SHIPPING_PILL_CLASS_BY_TONE[tone], className].filter(Boolean).join(" ")}>
      {label}
    </span>
  );
}

