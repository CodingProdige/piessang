"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PhoneInput, combinePhoneNumber, splitPhoneNumber } from "@/components/shared/phone-input";

type OrderRecord = {
  docId?: string;
  order?: {
    orderNumber?: string;
  };
  lifecycle?: {
    orderStatus?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
  };
  timestamps?: {
    createdAt?: string;
  };
  totals?: {
    final_payable_incl?: number;
  };
  items?: Array<{
    quantity?: number;
    product_snapshot?: {
      name?: string;
    };
    selected_variant_snapshot?: {
      label?: string;
    };
  }>;
  delivery_progress?: {
    percentageDelivered?: number;
  };
};

type OrdersPayload = {
  items?: OrderRecord[];
  analytics?: {
    totals?: {
      totalOrders?: number;
      totalNotCompleted?: number;
      totalRefundedOrders?: number;
      sumPaidIncl?: number;
    };
  };
};

type AccountData = {
  account?: {
    accountName?: string;
    phoneNumber?: string;
    phoneCountryCode?: string;
  };
};

type DeliveryLocation = {
  id: string;
  locationName?: string;
  recipientName?: string;
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  suburb?: string;
  stateProvinceRegion?: string;
  postalCode?: string;
  country?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
  is_default?: boolean;
};

type CreditNote = {
  creditNoteId?: string;
  status?: string;
  amount_incl?: number;
  balance_incl?: number;
  updatedAt?: string;
  createdAt?: string;
  source?: {
    orderNumber?: string;
  };
};

type PaymentCard = {
  id?: string;
  card_id?: string;
  brand?: string;
  last4?: string;
  expiryMonth?: string | number;
  expiryYear?: string | number;
};

type FavoriteProduct = {
  id?: string;
  data?: {
    product?: {
      name?: string;
      slug?: string;
      unique_id?: string | number;
    };
    seller?: {
      vendorName?: string;
    };
    variants?: Array<{
      pricing?: {
        selling_price_incl?: number;
      };
      sale?: {
        is_on_sale?: boolean;
        sale_price_incl?: number;
      };
    }>;
  };
};

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
};

function r2(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

function formatCurrency(value: unknown) {
  return `R ${r2(value)}`;
}

function formatDate(value?: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleDateString("en-ZA", { dateStyle: "medium" });
}

function sentenceStatus(value?: string) {
  const normalized = String(value || "unknown")
    .replace(/_/g, " ")
    .trim();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function progressBarTone(percent: number) {
  if (percent >= 100) return "bg-[#1f8f55]";
  if (percent >= 50) return "bg-[#e3c52f]";
  return "bg-[#202020]";
}

function productHref(item: FavoriteProduct) {
  const slug = String(item?.data?.product?.slug || "").trim();
  const uniqueId = String(item?.data?.product?.unique_id || item?.id || "").trim();
  if (!slug || !uniqueId) return "/products";
  return `/products/${slug}?unique_id=${encodeURIComponent(uniqueId)}`;
}

function firstVariantPrice(item: FavoriteProduct) {
  const variant = Array.isArray(item?.data?.variants) ? item.data.variants[0] : null;
  if (!variant) return null;
  const salePrice = Number(variant?.sale?.sale_price_incl);
  if (variant?.sale?.is_on_sale && Number.isFinite(salePrice) && salePrice > 0) return salePrice;
  const price = Number(variant?.pricing?.selling_price_incl);
  return Number.isFinite(price) ? price : null;
}

function WorkspaceShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3">
        <p className="text-[16px] font-semibold text-[#202020]">{title}</p>
        <p className="mt-1 text-[13px] leading-6 text-[#57636c]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-[440px] rounded-[12px] bg-white p-5 shadow-[0_16px_40px_rgba(20,24,27,0.24)]">
        <p className="text-[18px] font-semibold text-[#202020]">{state.title}</p>
        <p className="mt-2 text-[14px] leading-6 text-[#57636c]">{state.description}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={state.busy}
            className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void state.onConfirm()}
            disabled={state.busy}
            className="inline-flex h-10 items-center rounded-[8px] bg-[#b91c1c] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountOrdersWorkspace({ uid }: { uid: string }) {
  const [payload, setPayload] = useState<OrdersPayload>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const items = Array.isArray(payload.items) ? payload.items : [];
  const totals = payload.analytics?.totals || {};

  return (
    <WorkspaceShell
      title="Your orders"
      description="Track what you’ve bought, what is still in progress, and what has already been refunded or completed."
    >
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Total orders</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{Number(totals.totalOrders || 0)}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Still active</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{Number(totals.totalNotCompleted || 0)}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Refunded orders</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{Number(totals.totalRefundedOrders || 0)}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Total paid</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{formatCurrency(totals.sumPaidIncl || 0)}</p>
        </div>
      </div>

      <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[18px] font-semibold text-[#202020]">Recent orders</p>
          <Link href="/account/orders" className="text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2">
            View returns in your orders
          </Link>
        </div>
        {loading ? (
          <p className="mt-4 text-[13px] text-[#57636c]">Loading your orders...</p>
        ) : items.length ? (
          <div className="mt-4 space-y-3">
            {items.slice(0, 8).map((order) => (
              <div key={order.docId} className="rounded-[8px] border border-black/5 px-4 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <Link
                      href={order?.docId ? `/account/orders/${encodeURIComponent(order.docId)}` : "/account/orders"}
                      className="text-[14px] font-semibold text-[#202020] underline decoration-transparent underline-offset-2 transition hover:decoration-[#202020]"
                    >
                      Order {order?.order?.orderNumber || order?.docId || "Unknown"}
                    </Link>
                    <p className="mt-1 text-[12px] text-[#8b94a3]">
                      {formatDate(order?.timestamps?.createdAt)}
                      {order?.items?.[0]?.product_snapshot?.name ? ` • ${order.items[0].product_snapshot.name}` : ""}
                      {Array.isArray(order?.items) && order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}
                    </p>
                  </div>
                  <div className="text-[12px] text-[#57636c] md:text-right">
                    <p>{sentenceStatus(order?.lifecycle?.orderStatus)}</p>
                    <p className="mt-1">{sentenceStatus(order?.lifecycle?.paymentStatus)} payment</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#57636c]">
                  <span>Total: <span className="font-semibold text-[#202020]">{formatCurrency(order?.totals?.final_payable_incl || 0)}</span></span>
                  <span>Fulfilment: <span className="font-semibold text-[#202020]">{sentenceStatus(order?.lifecycle?.fulfillmentStatus)}</span></span>
                  <span>Delivered: <span className="font-semibold text-[#202020]">{Number(order?.delivery_progress?.percentageDelivered || 0)}%</span></span>
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-[#57636c]">
                    <span>Delivery progress</span>
                    <span className="font-semibold text-[#202020]">{Number(order?.delivery_progress?.percentageDelivered || 0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eceff3]">
                    <div
                      className={`h-full rounded-full transition-all ${progressBarTone(Number(order?.delivery_progress?.percentageDelivered || 0))}`}
                      style={{ width: `${Math.max(0, Math.min(100, Number(order?.delivery_progress?.percentageDelivered || 0)))}%` }}
                    />
                  </div>
                </div>
                {Array.isArray(order?.items) && order.items.length ? (
                  <div className="mt-4">
                    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Products in this order</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {order.items.map((item, index) => (
                        <div
                          key={`${order?.docId || "order"}-${item?.product_snapshot?.name || "item"}-${index}`}
                          className="min-w-[220px] rounded-[10px] bg-[#faf8f2] px-4 py-3"
                        >
                          <p className="text-[13px] font-semibold leading-5 text-[#202020]">
                            {item?.product_snapshot?.name || "Product"}
                          </p>
                          <p className="mt-1 text-[12px] text-[#57636c]">
                            {item?.selected_variant_snapshot?.label || "Default option"}
                          </p>
                          <p className="mt-2 text-[12px] font-semibold text-[#202020]">
                            Qty {Number(item?.quantity || 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-[#57636c]">You haven’t placed any orders yet.</p>
        )}
      </div>
    </WorkspaceShell>
  );
}

export function AccountPaymentsWorkspace({ uid }: { uid: string }) {
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cardsResponse, notesResponse] = await Promise.all([
        fetch("/api/client/v1/accounts/paymentMethods/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid }),
        }),
        fetch("/api/client/v1/credit-notes/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: uid }),
        }),
      ]);
      const cardsPayload = await cardsResponse.json().catch(() => ({}));
      const notesPayload = await notesResponse.json().catch(() => ({}));
      if (!cardsResponse.ok || cardsPayload?.ok === false) throw new Error(cardsPayload?.message || "Unable to load your saved cards.");
      if (!notesResponse.ok || notesPayload?.ok === false) throw new Error(notesPayload?.message || "Unable to load your credit notes.");
      setCards(Array.isArray(cardsPayload?.data?.paymentMethods?.cards) ? cardsPayload.data.paymentMethods.cards : []);
      setNotes(Array.isArray(notesPayload?.data) ? notesPayload.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your payment information.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [uid]);

  const totalCredit = useMemo(
    () => notes.reduce((sum, note) => sum + Number(note?.balance_incl ?? note?.amount_incl ?? 0), 0),
    [notes],
  );

  async function removeCard(card: PaymentCard) {
    const cardId = String(card?.id || card?.card_id || "").trim();
    if (!cardId) return;
    setBusyCardId(cardId);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/accounts/paymentMethods/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, cardId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to remove that card.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove that card.");
    } finally {
      setBusyCardId(null);
      setConfirmState(null);
    }
  }

  return (
    <WorkspaceShell
      title="Payments and credit"
      description="Review your saved cards, credit notes, and refund value already available on your account."
    >
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Saved cards</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{cards.length}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Credit notes</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{notes.length}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Available credit</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{formatCurrency(totalCredit)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Saved cards</p>
          <p className="mt-2 text-[13px] leading-6 text-[#57636c]">
            Cards saved during checkout appear here. You can remove cards you no longer want to keep on file.
          </p>
          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading your saved cards...</p>
          ) : cards.length ? (
            <div className="mt-4 space-y-3">
              {cards.map((card) => {
                const cardId = String(card?.id || card?.card_id || "").trim();
                return (
                  <div key={cardId} className="rounded-[8px] border border-black/5 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold text-[#202020]">
                          {(card?.brand || "Card").toUpperCase()} ending in {card?.last4 || "0000"}
                        </p>
                        <p className="mt-1 text-[12px] text-[#8b94a3]">
                          Expires {String(card?.expiryMonth || "").padStart(2, "0")}/{card?.expiryYear || ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            title: "Remove saved card?",
                            description: "This saved card will be removed from your account and will no longer be available during checkout.",
                            confirmLabel: "Remove card",
                            busy: busyCardId === cardId,
                            onConfirm: () => removeCard(card),
                          })
                        }
                        disabled={busyCardId === cardId}
                        className="text-[12px] font-semibold text-[#b91c1c] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#57636c]">You do not have any saved cards yet.</p>
          )}
        </div>

        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Credit and refunds</p>
          <p className="mt-2 text-[13px] leading-6 text-[#57636c]">
            Credit notes issued against your orders will show up here once they are created on your account.
          </p>
          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading your credit notes...</p>
          ) : notes.length ? (
            <div className="mt-4 space-y-3">
              {notes.slice(0, 8).map((note) => (
                <div key={note.creditNoteId} className="rounded-[8px] border border-black/5 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-[#202020]">
                        Credit note {note?.creditNoteId || "Unknown"}
                      </p>
                      <p className="mt-1 text-[12px] text-[#8b94a3]">
                        {note?.source?.orderNumber ? `Order ${note.source.orderNumber} • ` : ""}
                        {formatDate(note?.updatedAt || note?.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-semibold text-[#202020]">{formatCurrency(note?.balance_incl ?? note?.amount_incl ?? 0)}</p>
                      <p className="mt-1 text-[12px] text-[#8b94a3]">{sentenceStatus(note?.status)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#57636c]">You do not have any credit notes yet.</p>
          )}
          <div className="mt-5 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
            Coupons, offers, and gift-voucher redemption will be added here next.
          </div>
        </div>
      </div>
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </WorkspaceShell>
  );
}

const emptyLocationForm = {
  locationName: "",
  recipientName: "",
  streetAddress: "",
  addressLine2: "",
  suburb: "",
  city: "",
  stateProvinceRegion: "",
  postalCode: "",
  country: "",
  phoneNumber: "",
  phoneCountryCode: "27",
  is_default: false,
};

export function AccountProfileWorkspace({
  uid,
  email,
  showPersonalDetails = true,
  showAddressBook = true,
}: {
  uid: string;
  email?: string | null;
  showPersonalDetails?: boolean;
  showAddressBook?: boolean;
}) {
  const [accountName, setAccountName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("27");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [form, setForm] = useState(emptyLocationForm);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const orderedLocations = useMemo(
    () =>
      [...locations].sort((a, b) => {
        if (a.is_default === b.is_default) return 0;
        return a.is_default ? -1 : 1;
      }),
    [locations],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [accountResponse, locationsResponse] = await Promise.all([
        fetch("/api/client/v1/accounts/account/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        }),
        fetch(`/api/client/v1/accounts/locations/get?userId=${encodeURIComponent(uid)}`, { cache: "no-store" }),
      ]);
      const accountPayload = await accountResponse.json().catch(() => ({}));
      const locationsPayload = await locationsResponse.json().catch(() => ({}));
      if (!accountResponse.ok || accountPayload?.ok === false) throw new Error(accountPayload?.message || "Unable to load your account.");
      if (!locationsResponse.ok || locationsPayload?.ok === false) throw new Error(locationsPayload?.message || "Unable to load your addresses.");
      const account: AccountData = accountPayload?.data || {};
      setAccountName(String(account?.account?.accountName || ""));
      const accountPhone = splitPhoneNumber(
        String(account?.account?.phoneNumber || ""),
        String(account?.account?.phoneCountryCode || "27"),
      );
      setPhoneCountryCode(accountPhone.countryCode);
      setPhoneNumber(accountPhone.localNumber);
      setLocations(Array.isArray(locationsPayload?.data?.deliveryLocations) ? locationsPayload.data.deliveryLocations : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your account.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [uid]);

  async function saveAccount() {
    setSavingAccount(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/account/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          data: {
            account: {
              accountName,
              phoneCountryCode,
              phoneNumber: combinePhoneNumber(phoneCountryCode, phoneNumber),
            },
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save your details.");
      setMessage("Your personal details were updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your details.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function saveLocation() {
    if (!form.locationName.trim() || !form.streetAddress.trim()) {
      setError("Please add at least a location name and street address.");
      return;
    }
    setSavingLocation(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint = editingLocationId
        ? "/api/client/v1/accounts/locations/update"
        : "/api/client/v1/accounts/locations/create";
      const body = editingLocationId
        ? { userId: uid, locationId: editingLocationId, updates: form }
        : { userId: uid, location: form };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save that address.");
      setForm(emptyLocationForm);
      setEditingLocationId(null);
      setAddressModalOpen(false);
      setMessage(editingLocationId ? "Your address was updated." : "Your address was added.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save that address.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function deleteLocation(locationId: string) {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/locations/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, locationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to delete that address.");
      setMessage("Your address was removed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete that address.");
    } finally {
      setConfirmState(null);
    }
  }

  function beginEdit(location: DeliveryLocation) {
    setEditingLocationId(location.id);
    setForm({
      locationName: location.locationName || "",
      recipientName: location.recipientName || "",
      streetAddress: location.streetAddress || "",
      addressLine2: location.addressLine2 || "",
      suburb: location.suburb || "",
      city: location.city || "",
      stateProvinceRegion: location.stateProvinceRegion || "",
      postalCode: location.postalCode || "",
      country: location.country || "",
      phoneNumber: location.phoneNumber || "",
      phoneCountryCode: location.phoneCountryCode || splitPhoneNumber(location.phoneNumber || "").countryCode,
      is_default: location.is_default === true,
    });
    setAddressModalOpen(true);
  }

  return (
    <WorkspaceShell
      title={
        showPersonalDetails && showAddressBook
          ? "Profile and addresses"
          : showPersonalDetails
            ? "Personal details"
            : "Address book"
      }
      description={
        showPersonalDetails && showAddressBook
          ? "Keep your personal details current and manage the delivery addresses you use during checkout."
          : showPersonalDetails
            ? "Keep your personal details current so your Piessang account stays up to date."
            : "Manage the delivery addresses you want available during checkout."
      }
    >
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}

      <div
        className={`grid gap-4 ${
          showPersonalDetails && showAddressBook ? "lg:grid-cols-[0.95fr_1.05fr]" : ""
        }`}
      >
        {showPersonalDetails ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Personal details</p>
          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading your account details...</p>
          ) : (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Account name</span>
                <input
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  className="h-11 w-full rounded-[8px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b]"
                />
              </label>
              <PhoneInput
                label="Mobile number"
                countryCode={phoneCountryCode}
                localNumber={phoneNumber}
                onCountryCodeChange={setPhoneCountryCode}
                onLocalNumberChange={setPhoneNumber}
              />
              <label className="block">
                <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Email address</span>
                <input
                  value={email || ""}
                  disabled
                  className="h-11 w-full rounded-[8px] border border-black/10 bg-[#fafafa] px-3 text-[14px] text-[#8b94a3]"
                />
              </label>
              <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
                Security settings and newsletter preferences can be expanded here next.
              </div>
              <button
                type="button"
                onClick={() => void saveAccount()}
                disabled={savingAccount}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Save details
              </button>
            </div>
          )}
        </div>
        ) : null}

        {showAddressBook ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[18px] font-semibold text-[#202020]">Address book</p>
            <button
              type="button"
              onClick={() => {
                setEditingLocationId(null);
                setForm(emptyLocationForm);
                setAddressModalOpen(true);
              }}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Add address
            </button>
          </div>

          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading your addresses...</p>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                {orderedLocations.length ? orderedLocations.map((location) => (
                  <div key={location.id} className="rounded-[8px] border border-black/5 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-semibold text-[#202020]">
                            {location.locationName || "Delivery address"}
                          </p>
                          {location.is_default ? (
                            <span className="rounded-full bg-[rgba(26,133,83,0.1)] px-2 py-0.5 text-[11px] font-semibold text-[#1a8553]">
                              Default
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-[#57636c]">
                          {[location.streetAddress, location.addressLine2, location.suburb, location.city, location.postalCode, location.country]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                        {location.phoneNumber ? (
                          <p className="mt-1 text-[12px] text-[#8b94a3]">{location.phoneNumber}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-3 text-[12px] font-semibold">
                        <button type="button" onClick={() => beginEdit(location)} className="text-[#0f80c3]">Edit</button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              title: "Delete address?",
                              description: "This delivery address will be removed from your account and won’t be available during checkout anymore.",
                              confirmLabel: "Delete address",
                              onConfirm: () => deleteLocation(location.id),
                            })
                          }
                          className="text-[#b91c1c]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-[13px] text-[#57636c]">You do not have any saved delivery addresses yet.</p>
                )}
              </div>

            </>
          )}
        </div>
        ) : null}
      </div>

      {showAddressBook && addressModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="max-h-[88vh] w-full max-w-[860px] overflow-y-auto rounded-[12px] bg-white p-5 shadow-[0_16px_40px_rgba(20,24,27,0.24)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[18px] font-semibold text-[#202020]">
                {editingLocationId ? "Edit address" : "Add a new address"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setAddressModalOpen(false);
                  setEditingLocationId(null);
                  setForm(emptyLocationForm);
                }}
                className="text-[13px] font-semibold text-[#57636c]"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["locationName", "Location name"],
                ["recipientName", "Recipient name"],
                ["streetAddress", "Street address"],
                ["addressLine2", "Address line 2"],
                ["suburb", "Suburb"],
                ["city", "City"],
                ["stateProvinceRegion", "State / region"],
                ["postalCode", "Postal code"],
                ["country", "Country"],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-2 block text-[12px] font-semibold text-[#202020]">{label}</span>
                  <input
                    value={form[key as keyof typeof form] as string | number | readonly string[] | undefined}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="h-11 w-full rounded-[8px] border border-black/10 bg-white px-3 text-[14px] outline-none focus:border-[#cbb26b]"
                  />
                </label>
              ))}
              <div className="md:col-span-2">
                <PhoneInput
                  label="Mobile number"
                  countryCode={String((form as any).phoneCountryCode || "27")}
                  localNumber={String((form as any).phoneNumber || "")}
                  onCountryCodeChange={(value) => setForm((current) => ({ ...current, phoneCountryCode: value } as typeof current))}
                  onLocalNumberChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
                />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px] text-[#57636c]">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
              />
              Make this my default delivery address
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddressModalOpen(false);
                  setEditingLocationId(null);
                  setForm(emptyLocationForm);
                }}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveLocation()}
                disabled={savingLocation}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {editingLocationId ? "Update address" : "Add address"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </WorkspaceShell>
  );
}

export function AccountProfileLinksWorkspace() {
  return (
    <WorkspaceShell
      title="Profile"
      description="Use the dedicated profile pages below to manage your personal details and saved delivery addresses."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/account/personal-details"
          className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)] transition-colors hover:bg-[#fcfcfc]"
        >
          <p className="text-[18px] font-semibold text-[#202020]">Personal details</p>
          <p className="mt-2 text-[13px] leading-6 text-[#57636c]">
            Update the name, email-linked account details, and phone number connected to your Piessang profile.
          </p>
        </Link>
        <Link
          href="/account/address-book"
          className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)] transition-colors hover:bg-[#fcfcfc]"
        >
          <p className="text-[18px] font-semibold text-[#202020]">Address book</p>
          <p className="mt-2 text-[13px] leading-6 text-[#57636c]">
            Add, edit, remove, and choose the delivery addresses you want available during checkout.
          </p>
        </Link>
      </div>
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        Security settings and newsletter preferences can be expanded into dedicated pages next.
      </div>
    </WorkspaceShell>
  );
}

export function AccountListsWorkspace({ uid, favoriteCount }: { uid: string; favoriteCount: number }) {
  const [items, setItems] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/catalogue/v1/products/product/get?favoritesOnly=true&limit=all&userId=${encodeURIComponent(uid)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load your favourites.");
        }
        if (!cancelled) {
          setItems(Array.isArray(payload?.items) ? payload.items : []);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your favourites.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <WorkspaceShell
      title="Your saved products"
      description="Keep an eye on the products you have favourited and jump back into the catalogue from here."
    >
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Favourites</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{favoriteCount}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Saved products</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">{items.length}</p>
        </div>
        <div className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[12px] text-[#8b94a3]">Lists</p>
          <p className="mt-2 text-[24px] font-semibold text-[#202020]">1</p>
        </div>
      </div>

      <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[18px] font-semibold text-[#202020]">My favourites</p>
            <p className="mt-2 text-[13px] leading-6 text-[#57636c]">
              Saved products appear here first. Dedicated customer-created lists can be layered on top of this next.
            </p>
          </div>
          <Link
            href="/products?favoritesOnly=true"
            className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
          >
            Browse favourites
          </Link>
        </div>

        {loading ? (
          <p className="mt-4 text-[13px] text-[#57636c]">Loading your favourites...</p>
        ) : items.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {items.slice(0, 8).map((item) => (
              <Link
                key={String(item?.id || item?.data?.product?.unique_id || Math.random())}
                href={productHref(item)}
                className="rounded-[8px] border border-black/5 px-4 py-4 transition-colors hover:bg-[#fcfcfc]"
              >
                <p className="text-[14px] font-semibold text-[#202020]">{item?.data?.product?.name || "Saved product"}</p>
                <p className="mt-1 text-[12px] text-[#8b94a3]">{item?.data?.seller?.vendorName || "Piessang"}</p>
                <p className="mt-3 text-[14px] font-semibold text-[#202020]">
                  {firstVariantPrice(item) != null ? formatCurrency(firstVariantPrice(item)) : "View product"}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-[#57636c]">You have not favourited any products yet.</p>
        )}
      </div>
    </WorkspaceShell>
  );
}
