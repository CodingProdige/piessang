"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ShopifyAppRedirectProps = {
  href: string;
  delayMs?: number;
};

export function ShopifyAppRedirect({ href, delayMs = 1800 }: ShopifyAppRedirectProps) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, Math.ceil(delayMs / 1000)));

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, delayMs - elapsed);
      setSecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
    }, 250);

    const timeout = window.setTimeout(() => {
      router.replace(href);
    }, delayMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [delayMs, href, router]);

  return (
    <p className="mt-4 text-[14px] leading-6 text-[#5f6874]">
      Redirecting to Piessang seller integrations {secondsLeft > 0 ? `in ${secondsLeft}s` : "now"}.
    </p>
  );
}
