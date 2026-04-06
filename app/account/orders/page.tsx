"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useEffect, useState } from "react";
import { PageBody } from "@/components/layout/page-body";
import { CustomerOrdersWorkspace } from "@/components/account/orders-workspace";

export default function AccountOrdersPage() {
  const { uid } = useAuth();
  const [payload, setPayload] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/orders/customer/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid }),
        });
        const next = await response.json().catch(() => ({}));
        if (!response.ok || next?.ok === false) {
          throw new Error(next?.message || "Unable to load your orders.");
        }
        const responseData = next?.data && typeof next.data === "object" ? next.data : {};
        if (!cancelled) {
          setPayload({
            items: Array.isArray(responseData?.data) ? responseData.data : [],
            analytics: responseData?.analytics || {},
          });
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your orders.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!uid) {
    return (
      <PageBody className="px-4 py-10">
        <section className="rounded-[10px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <h1 className="text-[24px] font-semibold text-[#202020]">Your orders</h1>
          <p className="mt-3 text-[14px] leading-7 text-[#57636c]">Sign in to view your order history.</p>
        </section>
      </PageBody>
    );
  }

  return (
    <PageBody className="px-4 py-8">
      <CustomerOrdersWorkspace uid={uid} payload={payload} loading={loading} error={error} />
    </PageBody>
  );
}
