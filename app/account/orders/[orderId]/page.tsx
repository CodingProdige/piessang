"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CustomerOrderDetailWorkspace } from "@/components/account/order-detail-workspace";
import { PageBody } from "@/components/layout/page-body";

export default function AccountOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { uid } = useAuth();
  const [resolvedOrderId, setResolvedOrderId] = useState("");

  useEffect(() => {
    let active = true;
    params.then((value) => {
      if (active) setResolvedOrderId(String(value?.orderId || ""));
    });
    return () => {
      active = false;
    };
  }, [params]);

  return (
    <PageBody className="px-4 py-8">
      {resolvedOrderId ? (
        <CustomerOrderDetailWorkspace uid={uid || ""} orderId={resolvedOrderId} />
      ) : (
        <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
          Loading your order…
        </div>
      )}
    </PageBody>
  );
}
