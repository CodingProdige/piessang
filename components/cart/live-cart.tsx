"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CartActionStack } from "@/components/cart/cart-actions";
import { CartItemCard } from "@/components/cart/cart-item-card";

type CartItem = {
  qty?: number;
  quantity?: number;
  sale_qty?: number;
  regular_qty?: number;
  line_totals?: {
    final_incl?: number;
    final_excl?: number;
  };
  product_snapshot?: {
    product?: {
      title?: string | null;
    };
    media?: {
      images?: Array<{ imageUrl?: string | null }>;
    };
  };
  selected_variant_snapshot?: {
    label?: string | null;
    pricing?: {
      selling_price_excl?: number;
    };
  };
};

type CartPayload = {
  items?: CartItem[];
  totals?: {
    subtotal_excl?: number;
    deposit_total_excl?: number;
    vat_total?: number;
    final_payable_incl?: number;
    final_incl?: number;
  };
  cart?: {
    item_count?: number;
  };
};

const money = (value?: number) =>
  `R ${new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(typeof value === "number" && Number.isFinite(value) ? value : 0)}`;

export function LiveCart({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, uid, openAuthModal } = useAuth();
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !uid) {
      setCart(null);
      return;
    }

    let mounted = true;
    setLoading(true);

    fetch("/api/client/v1/carts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!mounted) return;
        setCart((payload?.data?.cart ?? null) as CartPayload | null);
      })
      .catch(() => {
        if (!mounted) return;
        setCart(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, uid]);

  if (!isAuthenticated) {
    return (
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Your cart</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
          Sign in to see your live cart and continue to checkout.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal("Sign in to manage your cart.")}
          className="mt-5 inline-flex items-center rounded-[8px] bg-[#cbb26b] px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Sign in
        </button>
      </section>
    );
  }

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const itemCount = cart?.cart?.item_count ?? items.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 0), 0);
  const totalIncl = cart?.totals?.final_payable_incl ?? cart?.totals?.final_incl ?? 0;

  return (
    <section className={`rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Cart</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">
            {itemCount} items
          </h1>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Total</p>
          <p className="mt-1 text-[22px] font-semibold text-[#202020]">{money(totalIncl)}</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
          Loading cart...
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {items.length ? (
          items.map((item, index) => {
            return (
              <CartItemCard key={`${item.product_snapshot?.product?.title ?? "item"}-${index}`} item={item} />
            );
          })
        ) : (
          <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-6 text-[13px] text-[#57636c]">
            Your cart is empty right now.
          </div>
        )}
      </div>

      <CartActionStack />
    </section>
  );
}
