"use client";

export function CourierLiabilityNotice({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`rounded-[10px] border border-[#f3d2d2] bg-[#fff7f8] p-3 ${className}`.trim()}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b42318]">Seller liability notice</p>
      <p className="mt-2 text-[12px] leading-[1.5] text-[#7a271a]">
        Sellers are responsible for any extra courier charges, surcharges, delays, returns, or failed deliveries caused by incorrect product weight, dimensions, customs category, HS code, or country of origin details. Please make sure this shipping metadata is accurate before saving.
      </p>
    </div>
  );
}
