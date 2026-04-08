"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

type Props = {
  conversionId: string;
  conversionLabel: string;
  value: number;
  currency: string;
  transactionId: string;
};

export function GoogleAdsPurchaseConversion({
  conversionId,
  conversionLabel,
  value,
  currency,
  transactionId,
}: Props) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    if (!conversionId || !conversionLabel || !transactionId) return;

    const dedupeKey = `google-ads-purchase:${transactionId}`;
    try {
      if (window.sessionStorage.getItem(dedupeKey) === "1") return;
    } catch {
      // Ignore storage issues and still attempt the conversion event.
    }

    window.gtag("event", "conversion", {
      send_to: `${conversionId}/${conversionLabel}`,
      value,
      currency,
      transaction_id: transactionId,
    });

    try {
      window.sessionStorage.setItem(dedupeKey, "1");
    } catch {
      // Ignore storage issues.
    }
  }, [conversionId, conversionLabel, currency, transactionId, value]);

  return null;
}

export default GoogleAdsPurchaseConversion;
