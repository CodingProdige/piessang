"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  BASE_CURRENCY,
  DISPLAY_CURRENCY_STORAGE_KEY,
  SUPPORTED_DISPLAY_CURRENCIES,
  formatDisplayMoney,
  getFlagEmoji,
  getDisplayCurrencyMeta,
  isSupportedDisplayCurrency,
  suggestDisplayCurrencyFromCountry,
  type SupportedDisplayCurrencyCode,
} from "@/lib/currency/display-currency";
import { readShopperDeliveryArea } from "@/components/products/delivery-area-gate";

type DisplayCurrencyContextValue = {
  currency: SupportedDisplayCurrencyCode;
  rates: Record<string, number> | null;
  loading: boolean;
  setCurrency: (next: SupportedDisplayCurrencyCode) => void;
  formatMoney: (amountZar: number) => string;
};

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue | null>(null);

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<SupportedDisplayCurrencyCode>(BASE_CURRENCY);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    if (stored && isSupportedDisplayCurrency(stored)) {
      setCurrencyState(stored);
      return;
    }
    const shopperArea = readShopperDeliveryArea();
    const suggested = suggestDisplayCurrencyFromCountry(String(shopperArea?.country || ""));
    setCurrencyState(isSupportedDisplayCurrency(suggested) ? suggested : BASE_CURRENCY);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      try {
        const response = await fetch("/api/client/v1/currency/display-rates", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load display currency rates.");
        }
        if (!cancelled) {
          setRates(payload?.data?.rates || null);
        }
      } catch {
        if (!cancelled) setRates(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRates();
    const interval = window.setInterval(loadRates, 1000 * 60 * 60 * 6);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const value = useMemo<DisplayCurrencyContextValue>(
    () => ({
      currency,
      rates,
      loading,
      setCurrency: (next) => {
        setCurrencyState(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next);
          window.dispatchEvent(new CustomEvent("piessang:display-currency-changed", { detail: { currency: next } }));
        }
      },
      formatMoney: (amountZar) => formatDisplayMoney(amountZar, currency, rates),
    }),
    [currency, loading, rates],
  );

  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency() {
  const context = useContext(DisplayCurrencyContext);
  if (!context) {
    return {
      currency: BASE_CURRENCY as SupportedDisplayCurrencyCode,
      rates: null,
      loading: false,
      setCurrency: () => undefined,
      formatMoney: (amountZar: number) => formatDisplayMoney(amountZar, BASE_CURRENCY, null),
    };
  }
  return context;
}

export function DisplayCurrencySelector({ className = "" }: { className?: string }) {
  const { currency, setCurrency } = useDisplayCurrency();

  return (
    <label className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4b5563] sm:gap-2 ${className}`}>
      <span className="hidden lg:inline">Currency</span>
      <div className="relative min-w-0">
        <select
          value={currency}
          onChange={(event) => {
            const next = event.target.value;
            if (isSupportedDisplayCurrency(next)) setCurrency(next);
          }}
          className="max-w-[88px] appearance-none rounded-[8px] border border-black/10 bg-white py-2 pl-8 pr-7 text-[11px] font-semibold text-[#202020] outline-none sm:max-w-none sm:pl-9 sm:pr-8 sm:text-[12px]"
          aria-label="Choose display currency"
        >
          {SUPPORTED_DISPLAY_CURRENCIES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.code}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px]">
          {getFlagEmoji(getDisplayCurrencyMeta(currency).flag)}
        </span>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#6b7280]" aria-hidden="true">
          <path d="M5.5 7.5 10 12l4.5-4.5" />
        </svg>
      </div>
    </label>
  );
}
