"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { readShopperDeliveryArea } from "@/components/products/delivery-area-gate";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import { resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";

type CartItem = {
  qty?: number;
  quantity?: number;
  product_snapshot?: {
    product?: {
      title?: string | null;
      sellerCode?: string | null;
    };
    seller?: {
      vendorName?: string | null;
      baseLocation?: string | null;
      sellerCode?: string | null;
      sellerSlug?: string | null;
      deliveryProfile?: {
        origin?: { city?: string | null; region?: string | null; country?: string | null; latitude?: number | null; longitude?: number | null };
        directDelivery?: { enabled?: boolean; radiusKm?: number; leadTimeDays?: number; pricingRules?: Array<unknown> };
        shippingZones?: Array<unknown>;
        pickup?: { enabled?: boolean; leadTimeDays?: number };
      };
    };
    fulfillment?: {
      mode?: string | null;
    };
  };
  selected_variant_snapshot?: {
    label?: string | null;
  };
  line_totals?: {
    final_incl?: number;
  };
  availability?: {
    status?: string;
    message?: string;
  };
};

type CartPayload = {
  items?: CartItem[];
  totals?: {
    subtotal_excl?: number;
    vat_total?: number;
    final_excl?: number;
    final_payable_incl?: number;
    final_incl?: number;
    seller_delivery_fee_incl?: number;
    seller_delivery_fee_excl?: number;
    delivery_fee_incl?: number;
    delivery_fee_excl?: number;
  };
};

type DeliveryLocation = {
  label?: string;
  recipientName?: string;
  streetAddress?: string;
  addressLine2?: string;
  suburb?: string;
  city?: string;
  stateProvinceRegion?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  phoneNumber?: string;
  instructions?: string;
  is_default?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

type SavedCard = {
  id?: string;
  brand?: string;
  last4?: string;
  expiryMonth?: string;
  expiryYear?: string;
  status?: string;
};

type NewCardState = {
  holder: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  saveCard: boolean;
};

type AddressDraft = {
  locationName: string;
  recipientName: string;
  streetAddress: string;
  addressLine2: string;
  suburb: string;
  city: string;
  stateProvinceRegion: string;
  postalCode: string;
  country: string;
  phoneNumber: string;
  instructions: string;
  is_default: boolean;
  latitude: string;
  longitude: string;
};

function getCartTotalIncl(cart: CartPayload | null) {
  return Number(cart?.totals?.final_payable_incl ?? cart?.totals?.final_incl ?? 0);
}

function getItemCount(cart: CartPayload | null) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  return items.reduce((sum, item) => sum + Math.max(0, Number(item?.qty ?? item?.quantity ?? 0)), 0);
}

function getSellerGroupLabel(item: CartItem) {
  return item?.product_snapshot?.seller?.vendorName?.trim() || "Piessang seller";
}

function getSellerGroupKey(item: CartItem) {
  return String(
    item?.product_snapshot?.product?.sellerCode ||
      item?.product_snapshot?.seller?.sellerCode ||
      item?.product_snapshot?.seller?.sellerSlug ||
      "",
  ).trim();
}

function getSellerFulfillmentSummary(items: CartItem[]) {
  const modes = new Set(
    items
      .map((item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (modes.has("bevgo") && modes.has("seller")) return "Some items ship from Piessang and some ship from the seller.";
  if (modes.has("bevgo")) return "Piessang handles shipping for these items.";
  return "The seller handles shipping for these items.";
}

function getSellerDeliverySummary(items: CartItem[], selectedLocation?: DeliveryLocation | null, pickupSelections: string[] = []) {
  const fallbackArea = readShopperDeliveryArea();
  const sellerItems = items.filter(
    (item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase() === "seller",
  );
  if (!sellerItems.length) return null;

  const seller = sellerItems[0]?.product_snapshot?.seller;
  const deliveryProfile = seller?.deliveryProfile;
  const sellerKey = getSellerGroupKey(sellerItems[0]);
  const pickupSelected = Boolean(sellerKey && pickupSelections.includes(sellerKey));
  if (pickupSelected && deliveryProfile?.pickup?.enabled) {
    return { label: "Collection from seller", amount: 0, isPickup: true };
  }
  if (!deliveryProfile) return { label: "Seller shipping settings still need to be confirmed", amount: 0 };
  const shopperArea = {
    city: selectedLocation?.city || selectedLocation?.suburb || fallbackArea?.city || "",
    suburb: selectedLocation?.suburb || "",
    province: selectedLocation?.province || selectedLocation?.stateProvinceRegion || fallbackArea?.province || "",
    stateProvinceRegion: selectedLocation?.stateProvinceRegion || selectedLocation?.province || fallbackArea?.province || "",
    postalCode: selectedLocation?.postalCode || "",
    country: selectedLocation?.country || "South Africa",
  };
  const resolved = resolveSellerDeliveryOption({
    profile: deliveryProfile,
    sellerBaseLocation: seller?.baseLocation || "",
    shopperArea: shopperArea as any,
  });
  return { label: resolved.label, amount: Number(resolved.amountIncl || 0), isPickup: resolved.kind === "collection" };
}

function formatAddress(location: DeliveryLocation) {
  const lines = [
    location?.label,
    (location as DeliveryLocation & { locationName?: string }).locationName,
    location?.streetAddress,
    location?.addressLine2,
    location?.suburb,
    location?.city,
    location?.stateProvinceRegion || location?.province,
    location?.postalCode,
    location?.country,
  ].filter(Boolean);
  return lines.join(", ");
}

function formatCard(card: SavedCard) {
  const brand = String(card?.brand || "Card").toUpperCase();
  const last4 = String(card?.last4 || "0000");
  const expiryMonth = String(card?.expiryMonth || "").padStart(2, "0");
  const expiryYear = String(card?.expiryYear || "");
  return `${brand} ending ${last4}${expiryMonth && expiryYear ? ` · ${expiryMonth}/${expiryYear}` : ""}`;
}

function detectCardBrand(number: string) {
  const clean = String(number || "").replace(/\D+/g, "");
  if (/^4/.test(clean)) return "VISA";
  if (/^5[1-5]/.test(clean) || /^2(2[2-9]|[3-6]|7[01])/.test(clean)) return "MASTER";
  return "VISA";
}

function sanitizeCardNumber(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 19);
}

function sanitizeMonth(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 2);
}

function sanitizeYear(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 4);
}

function sanitizeCvv(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 4);
}

function formatCardNumberInput(value: string) {
  const clean = sanitizeCardNumber(value);
  return clean.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatMonthInput(value: string) {
  const clean = sanitizeMonth(value);
  if (clean.length === 1 && Number(clean) > 1) return `0${clean}`;
  return clean;
}

function validateExpiryMonth(value: string) {
  const month = Number(sanitizeMonth(value));
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function validateExpiryYear(value: string) {
  const raw = sanitizeYear(value);
  if (raw.length < 2) return false;
  const fullYear = raw.length === 2 ? Number(`20${raw}`) : Number(raw);
  const currentYear = new Date().getFullYear();
  return Number.isInteger(fullYear) && fullYear >= currentYear && fullYear <= currentYear + 20;
}

function defaultAddressDraft(profile?: { accountName?: string | null; displayName?: string | null }) {
  return {
    locationName: "",
    recipientName: profile?.accountName || profile?.displayName || "",
    streetAddress: "",
    addressLine2: "",
    suburb: "",
    city: "",
    stateProvinceRegion: "",
    postalCode: "",
    country: "South Africa",
    phoneNumber: "",
    instructions: "",
    is_default: true,
    latitude: "",
    longitude: "",
  };
}

function resolveLocationTitle(location: DeliveryLocation, index: number) {
  return location.label || (location as DeliveryLocation & { locationName?: string }).locationName || location.recipientName || `Address ${index + 1}`;
}

function deriveAddressNameFromPlace(value: {
  suburb?: string;
  city?: string;
  region?: string;
  country?: string;
}) {
  return [value.suburb, value.city, value.region, value.country]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)[0] || "";
}

function togglePickupSelection(current: string[], sellerKey: string, enabled: boolean) {
  const normalized = String(sellerKey || "").trim();
  if (!normalized) return current;
  if (enabled) {
    return current.includes(normalized) ? current : [...current, normalized];
  }
  return current.filter((entry) => entry !== normalized);
}

export function CartCheckout() {
  const router = useRouter();
  const { isAuthenticated, uid, profile, openAuthModal, refreshCart } = useAuth();
  const { formatMoney } = useDisplayCurrency();
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [cardsModalOpen, setCardsModalOpen] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState("");
  const [addressesModalOpen, setAddressesModalOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [addressEditing, setAddressEditing] = useState(false);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const [pickupSelections, setPickupSelections] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<"saved" | "new">("saved");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [newCard, setNewCard] = useState<NewCardState>({
    holder: profile?.accountName || profile?.displayName || "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    saveCard: true,
  });
  const [cardTouched, setCardTouched] = useState<Record<string, boolean>>({});
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(() => defaultAddressDraft());
  const [addressSaving, setAddressSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [checkoutReserveLoading, setCheckoutReserveLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<{ orderNumber: string; orderId: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !uid) return;
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/client/v1/accounts/locations/get?userId=${encodeURIComponent(uid)}`, {
        cache: "no-store",
      }).then((response) => response.json().catch(() => ({}))),
      fetch("/api/client/v1/accounts/paymentMethods/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      }).then((response) => response.json().catch(() => ({}))),
    ])
      .then(([locationsPayload, cardsPayload]) => {
        if (!mounted) return;
        const nextLocations = Array.isArray(locationsPayload?.data?.deliveryLocations)
          ? locationsPayload.data.deliveryLocations
          : [];
        const nextCards = Array.isArray(cardsPayload?.data?.paymentMethods?.cards)
          ? cardsPayload.data.paymentMethods.cards
          : [];
        setLocations(nextLocations);
        setCards(nextCards);
        const defaultLocationIndex = nextLocations.findIndex((location: DeliveryLocation) => location?.is_default === true);
        setSelectedLocationIndex(defaultLocationIndex >= 0 ? defaultLocationIndex : 0);
        setSelectedCardId(String(nextCards[0]?.id || ""));
        setPaymentMode(nextCards.length ? "saved" : "new");
      })
      .catch(() => {
        if (!mounted) return;
        setErrorMessage("We could not load your checkout details right now.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, profile?.accountName, profile?.displayName, uid]);

  const selectedLocation = locations[selectedLocationIndex] || null;

  useEffect(() => {
    if (!uid) return;
    let mounted = true;
    setDeliveryFeeLoading(true);
    setCheckoutReserveLoading(true);
    fetch("/api/client/v1/carts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          deliveryAddress: selectedLocation,
          pickupSelections,
        }),
      })
      .then((response) => response.json().catch(() => ({})))
      .then(async (payload) => {
        if (!mounted) return;
        setCart((payload?.data?.cart ?? null) as CartPayload | null);
        const reserveResponse = await fetch("/api/client/v1/carts/checkout-reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        }).catch(() => null);
        const reservePayload = reserveResponse ? await reserveResponse.json().catch(() => ({})) : null;
        if (!mounted) return;
        if (reservePayload?.message) {
          setErrorMessage(reservePayload.message);
          setSnackbarMessage(reservePayload.message);
        }
        const refreshedCartResponse = await fetch("/api/client/v1/carts/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid,
            deliveryAddress: selectedLocation,
            pickupSelections,
          }),
        }).catch(() => null);
        const refreshedCartPayload = refreshedCartResponse
          ? await refreshedCartResponse.json().catch(() => ({}))
          : null;
        if (!mounted) return;
        if (refreshedCartResponse?.ok && refreshedCartPayload?.ok !== false) {
          setCart((refreshedCartPayload?.data?.cart ?? null) as CartPayload | null);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCart(null);
      })
      .finally(() => {
        if (!mounted) return;
        setDeliveryFeeLoading(false);
        setCheckoutReserveLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [pickupSelections, selectedLocation, uid]);

  useEffect(() => {
    setAddressDraft(defaultAddressDraft(profile ?? undefined));
  }, [profile?.accountName, profile?.displayName]);

  useEffect(() => {
    if (!snackbarMessage) return undefined;
    const timer = window.setTimeout(() => setSnackbarMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [snackbarMessage]);

  const cartTotalIncl = getCartTotalIncl(cart);
  const productsTotalIncl = Number(
    (
      Number((cart as any)?.totals?.subtotal_excl || 0) +
      Number((cart as any)?.totals?.vat_total || 0)
    ).toFixed(2),
  );
  const cartItems = Array.isArray(cart?.items) ? cart.items : [];
  const deliveryAmount = Number(
    (cart as any)?.totals?.delivery_fee_incl ??
      (cart as any)?.totals?.delivery_fee_excl ??
      0,
  );
  const sellerDeliveryAmount = Number(
    (cart as any)?.totals?.seller_delivery_fee_incl ??
      (cart as any)?.totals?.seller_delivery_fee_excl ??
      0,
  );
  const payableIncl = useMemo(() => Number(cartTotalIncl.toFixed(2)), [cartTotalIncl]);
  const selectedCard = cards.find((card) => String(card?.id || "") === selectedCardId) || null;
  const sellerGroups = cartItems.reduce<Array<{ seller: string; sellerKey: string; items: CartItem[]; pickupAvailable: boolean }>>((groups, item) => {
    const seller = getSellerGroupLabel(item);
    const sellerKey = getSellerGroupKey(item) || seller;
    const pickupAvailable = item?.product_snapshot?.seller?.deliveryProfile?.pickup?.enabled === true;
    const existing = groups.find((group) => group.sellerKey === sellerKey);
    if (existing) existing.items.push(item);
    else groups.push({ seller, sellerKey, items: [item], pickupAvailable });
    return groups;
  }, []);
  const sellerDeliverySummaries = sellerGroups
    .map((group) => ({
      seller: group.seller,
      summary: getSellerDeliverySummary(group.items, selectedLocation, pickupSelections),
    }))
    .filter((entry) => entry.summary);
  const unavailableItems = cartItems.filter(
    (item) => String(item?.availability?.status || "").trim().toLowerCase() === "out_of_stock",
  );
  const checkoutBlocked = unavailableItems.length > 0;
  const canUseSavedCard = paymentMode === "saved" && Boolean(selectedCard?.id);
  const canUseNewCard =
    paymentMode === "new" &&
    newCard.holder.trim().length > 1 &&
    sanitizeCardNumber(newCard.number).length >= 13 &&
    validateExpiryMonth(newCard.expiryMonth) &&
    validateExpiryYear(newCard.expiryYear) &&
    sanitizeCvv(newCard.cvv).length >= 3;
  const cardErrors = {
    holder: newCard.holder.trim().length > 1 ? "" : "Enter the name exactly as it appears on the card.",
    number: sanitizeCardNumber(newCard.number).length >= 13 ? "" : "Enter a valid card number.",
    expiryMonth: validateExpiryMonth(newCard.expiryMonth) ? "" : "Use a valid month from 01 to 12.",
    expiryYear: validateExpiryYear(newCard.expiryYear) ? "" : "Use a valid future expiry year.",
    cvv: sanitizeCvv(newCard.cvv).length >= 3 ? "" : "Enter the card security code.",
  };

  async function refreshSavedCards() {
    if (!uid) return;
    const response = await fetch("/api/client/v1/accounts/paymentMethods/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid }),
    });
    const payload = await response.json().catch(() => ({}));
    const nextCards = Array.isArray(payload?.data?.paymentMethods?.cards)
      ? payload.data.paymentMethods.cards
      : [];
    setCards(nextCards);
    setSelectedCardId((current) => {
      if (nextCards.some((card: SavedCard) => String(card?.id || "") === current)) return current;
      return String(nextCards[0]?.id || "");
    });
    setPaymentMode(nextCards.length ? "saved" : "new");
  }

  async function handleDeleteSavedCard(cardId: string) {
    if (!uid || !cardId) return;
    setDeletingCardId(cardId);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/paymentMethods/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, cardId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not delete that card right now.");
      }
      await refreshSavedCards();
      setSnackbarMessage("Card removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not delete that card right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setDeletingCardId("");
    }
  }

  async function handleCreateAddress() {
    if (!uid) return;
    if (!addressDraft.locationName.trim() || !addressDraft.streetAddress.trim()) {
      setErrorMessage("Add a name for this address and a street address before saving it.");
      setSnackbarMessage("Please complete the required address fields.");
      return;
    }

    setAddressSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/locations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          location: {
            locationName: addressDraft.locationName.trim(),
            recipientName: addressDraft.recipientName.trim(),
            streetAddress: addressDraft.streetAddress.trim(),
            addressLine2: addressDraft.addressLine2.trim(),
            suburb: addressDraft.suburb.trim(),
            city: addressDraft.city.trim(),
            stateProvinceRegion: addressDraft.stateProvinceRegion.trim(),
            postalCode: addressDraft.postalCode.trim(),
            country: addressDraft.country.trim(),
            phoneNumber: addressDraft.phoneNumber.trim(),
            deliveryInstructions: addressDraft.instructions.trim(),
            is_default: addressDraft.is_default,
            latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
            longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not save that address right now.");
      }

      const nextLocations = Array.isArray(payload?.data?.deliveryLocations)
        ? payload.data.deliveryLocations
        : [];
      setLocations(nextLocations);
      setSelectedLocationIndex(Math.max(0, nextLocations.length - 1));
      setShowAddAddress(false);
      setAddressDraft(defaultAddressDraft(profile ?? undefined));
      setSnackbarMessage("Address saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save that address right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setAddressSaving(false);
    }
  }

  async function handleUpdateAddress() {
    if (!uid || !editingLocationId) return;
    if (!addressDraft.locationName.trim() || !addressDraft.streetAddress.trim()) {
      setErrorMessage("Add a name for this address and a street address before saving it.");
      setSnackbarMessage("Please complete the required address fields.");
      return;
    }

    setAddressEditing(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/locations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          locationId: editingLocationId,
          updates: {
            locationName: addressDraft.locationName.trim(),
            label: addressDraft.locationName.trim(),
            recipientName: addressDraft.recipientName.trim(),
            streetAddress: addressDraft.streetAddress.trim(),
            addressLine2: addressDraft.addressLine2.trim(),
            suburb: addressDraft.suburb.trim(),
            city: addressDraft.city.trim(),
            stateProvinceRegion: addressDraft.stateProvinceRegion.trim(),
            province: addressDraft.stateProvinceRegion.trim(),
            postalCode: addressDraft.postalCode.trim(),
            country: addressDraft.country.trim(),
            phoneNumber: addressDraft.phoneNumber.trim(),
            deliveryInstructions: addressDraft.instructions.trim(),
            instructions: addressDraft.instructions.trim(),
            is_default: addressDraft.is_default,
            latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
            longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not update that address right now.");
      }
      const nextLocations = Array.isArray(payload?.data?.deliveryLocations)
        ? payload.data.deliveryLocations
        : [];
      setLocations(nextLocations);
      const updatedIndex = nextLocations.findIndex((location: any) => String(location?.id || "") === editingLocationId);
      if (updatedIndex >= 0) setSelectedLocationIndex(updatedIndex);
      setEditingLocationId("");
      setAddressDraft(defaultAddressDraft(profile ?? undefined));
      setSnackbarMessage("Address updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not update that address right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setAddressEditing(false);
    }
  }

  async function handleCheckout() {
    if (!uid) {
      openAuthModal("Sign in to continue to checkout.");
      return;
    }
    if (!selectedLocation) {
      setErrorMessage("Choose a delivery address before placing your order.");
      return;
    }
    if (checkoutBlocked) {
      setErrorMessage("Remove the out-of-stock items from your cart before placing your order.");
      setSnackbarMessage("Remove the out-of-stock items from your cart before placing your order.");
      return;
    }
    if (!canUseSavedCard && !canUseNewCard) {
      if (paymentMode === "new") {
        setCardTouched({
          holder: true,
          number: true,
          expiryMonth: true,
          expiryYear: true,
          cvv: true,
        });
      }
      setErrorMessage(
        paymentMode === "saved"
          ? "Choose a saved card before placing your order."
          : "Complete your new card details before placing your order.",
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    let createdOrderId = "";
    let createdOrderNumber = "";
    let createdMerchantTransactionId = "";

    try {
      const createResponse = await fetch("/api/client/v1/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartId: uid,
          customerId: uid,
          deliveryAddress: selectedLocation,
          pickupSelections,
          source: "web",
        }),
      });
      const createPayload = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || createPayload?.ok === false) {
        throw new Error(createPayload?.message || "We could not create your order.");
      }

      const orderId = String(createPayload?.data?.orderId || "");
      const orderNumber = String(createPayload?.data?.orderNumber || "");
      const merchantTransactionId = String(createPayload?.data?.merchantTransactionId || "");
      if (!orderId || !merchantTransactionId) {
        throw new Error("The order was created without the payment details we expected.");
      }
      createdOrderId = orderId;
      createdOrderNumber = orderNumber;
      createdMerchantTransactionId = merchantTransactionId;

      const chargeEndpoint = paymentMode === "saved"
        ? "/api/client/v1/payments/peach/charge-token"
        : "/api/client/v1/payments/peach/charge-card";
      const paymentRequestBody =
        paymentMode === "saved"
          ? {
              userId: uid,
              cardId: selectedCard?.id,
              amount: payableIncl,
              currency: "ZAR",
              merchantTransactionId,
            }
          : {
              shopperResultUrl:
                typeof window !== "undefined"
                  ? `${window.location.origin}/cart?step=success&orderId=${encodeURIComponent(orderId)}&orderNumber=${encodeURIComponent(orderNumber || merchantTransactionId)}`
                  : undefined,
              userId: uid,
              amount: payableIncl,
              currency: "ZAR",
              merchantTransactionId,
              saveCard: newCard.saveCard,
              customer: {
                email: profile?.email || "unknown@piessang.co.za",
              },
              billing: {
                name: newCard.holder.trim(),
              },
              card: {
                brand: detectCardBrand(newCard.number),
                holder: newCard.holder.trim(),
                number: sanitizeCardNumber(newCard.number),
                expiryMonth: sanitizeMonth(newCard.expiryMonth),
                expiryYear: sanitizeYear(newCard.expiryYear),
                cvv: sanitizeCvv(newCard.cvv),
              },
            };
      const chargeResponse = await fetch(chargeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentRequestBody),
      });
      const chargeJson = await chargeResponse.json().catch(() => ({}));
      if (!chargeResponse.ok || chargeJson?.ok === false) {
        throw new Error(chargeJson?.message || "Your payment could not be completed.");
      }

      if (paymentMode === "new") {
        const redirectUrl = String(chargeJson?.shopperResultUrl || "").trim();
        if (redirectUrl) {
          window.location.assign(redirectUrl);
          return;
        }
      }

      await fetch("/api/client/v1/carts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      }).catch(() => null);

      await refreshCart();
      const finalOrderNumber = orderNumber || merchantTransactionId;
      setSuccessState({ orderNumber: finalOrderNumber, orderId });
      setCart({ items: [], totals: { final_incl: 0, final_payable_incl: 0 } });
      setSnackbarMessage("Payment successful.");
      router.replace(
        `/cart?step=success&orderId=${encodeURIComponent(orderId)}&orderNumber=${encodeURIComponent(finalOrderNumber)}`,
      );
    } catch (error) {
      if (createdOrderId || createdOrderNumber || createdMerchantTransactionId) {
        await fetch("/api/client/v1/orders/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(createdOrderId ? { orderId: createdOrderId } : {}),
            ...(createdOrderNumber ? { orderNumber: createdOrderNumber } : {}),
            ...(createdMerchantTransactionId ? { merchantTransactionId: createdMerchantTransactionId } : {}),
          }),
        }).catch(() => null);
      }
      const message = error instanceof Error ? error.message : "We could not complete your checkout.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Checkout</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Sign in to continue</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
          We need your account to load saved addresses, payment methods, and your live cart.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal("Sign in to continue to checkout.")}
          className="mt-5 inline-flex items-center rounded-[8px] bg-[#cbb26b] px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Sign in
        </button>
      </section>
    );
  }

  if (successState) {
    return (
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Order placed</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Payment successful</h1>
        <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
          Your order <span className="font-semibold text-[#202020]">{successState.orderNumber}</span> has been placed successfully.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/account?section=orders" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
            View my orders
          </Link>
          <Link href="/products" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
            Continue shopping
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
    <section className="space-y-5">
      <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Checkout</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Review and pay</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
          Choose your delivery address, confirm how you want to pay, and place your order.
        </p>
      </div>

      <div className="rounded-[8px] border border-[#e5dcc7] bg-[#fbf7ef] px-5 py-4 text-[14px] font-medium text-[#6b5b34] shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        Stock is reserved for a brief period while you complete checkout!
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="h-4 w-28 animate-pulse rounded bg-[#ece8df]" />
              <div className="mt-4 h-16 animate-pulse rounded-[8px] bg-[#f5f1e8]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_380px]">
          <div className="space-y-5">
            <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold text-[#202020]">Delivery address</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddAddress((current) => !current)}
                    className="text-[12px] font-semibold text-[#907d4c]"
                  >
                    {showAddAddress ? "Close" : "Add new address"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddressesModalOpen(true)}
                    className="text-[12px] font-semibold text-[#907d4c]"
                  >
                    Manage addresses
                  </button>
                </div>
              </div>
              {checkoutBlocked ? (
                <div className="mt-4 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
                  One or more items in your cart are now out of stock. Remove them from your cart before continuing.
                </div>
              ) : null}
              {showAddAddress ? (
                <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setAddressPickerOpen(true)}
                        className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                      >
                        Search address on map
                      </button>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Address name</label>
                      <input
                        value={addressDraft.locationName}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, locationName: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Home, Work, Office"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Recipient name</label>
                      <input
                        value={addressDraft.recipientName}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, recipientName: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Who will receive the order?"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Street address</label>
                      <input
                        value={addressDraft.streetAddress}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, streetAddress: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Street number and street name"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Address line 2</label>
                      <input
                        value={addressDraft.addressLine2}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, addressLine2: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Apartment, unit, building, floor"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Suburb</label>
                      <input
                        value={addressDraft.suburb}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, suburb: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Suburb"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">City</label>
                      <input
                        value={addressDraft.city}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Province</label>
                      <input
                        value={addressDraft.stateProvinceRegion}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, stateProvinceRegion: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Province"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Postal code</label>
                      <input
                        value={addressDraft.postalCode}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, postalCode: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Postal code"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Country</label>
                      <input
                        value={addressDraft.country}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, country: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Country"
                      />
                    </div>
                    <div className="sm:col-span-2 rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c]">
                      {addressDraft.latitude && addressDraft.longitude
                        ? `Pinned location: ${addressDraft.latitude}, ${addressDraft.longitude}`
                        : "No map pin selected yet. Use the map search above for more accurate delivery matching."}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery notes</label>
                      <input
                        value={addressDraft.instructions}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, instructions: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Anything the driver should know?"
                      />
                    </div>
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                    <input
                      type="checkbox"
                      checked={addressDraft.is_default}
                      onChange={(event) => setAddressDraft((current) => ({ ...current, is_default: event.target.checked }))}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    Set this as my default delivery address
                  </label>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCreateAddress()}
                      disabled={addressSaving}
                      className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addressSaving ? "Saving..." : "Save address"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddAddress(false);
                        setAddressDraft(defaultAddressDraft(profile ?? undefined));
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {locations.length ? (
                <div className="mt-4 space-y-3">
                  {locations.map((location, index) => (
                    <button
                      key={`${location.label || "address"}-${index}`}
                      type="button"
                      onClick={() => setSelectedLocationIndex(index)}
                      className={
                        index === selectedLocationIndex
                          ? "w-full rounded-[8px] border border-[rgba(203,178,107,0.7)] bg-[rgba(203,178,107,0.08)] p-4 text-left"
                          : "w-full rounded-[8px] border border-black/10 bg-white p-4 text-left"
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-[#202020]">{resolveLocationTitle(location, index)}</p>
                          <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">{formatAddress(location)}</p>
                        </div>
                        {location?.is_default ? (
                          <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">
                            Default
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-4 text-[13px] text-[#57636c]">
                  You do not have a saved delivery address yet.
                </div>
              )}
            </section>

            <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold text-[#202020]">Payment method</h2>
                <button
                  type="button"
                  onClick={() => setCardsModalOpen(true)}
                  className="text-[12px] font-semibold text-[#907d4c]"
                >
                  Manage cards
                </button>
              </div>
              <div className="mt-4 inline-flex rounded-[8px] bg-[#f6f3eb] p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMode("saved")}
                  disabled={!cards.length}
                  className={
                    paymentMode === "saved"
                      ? "rounded-[8px] bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] shadow-[0_4px_10px_rgba(20,24,27,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                      : "rounded-[8px] px-3 py-2 text-[12px] font-semibold text-[#7a7a7a] disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  Saved card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("new")}
                  className={
                    paymentMode === "new"
                      ? "rounded-[8px] bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] shadow-[0_4px_10px_rgba(20,24,27,0.08)]"
                      : "rounded-[8px] px-3 py-2 text-[12px] font-semibold text-[#7a7a7a]"
                  }
                >
                  New card
                </button>
              </div>

              {paymentMode === "saved" && cards.length ? (
                <div className="mt-4 space-y-3">
                  {cards.map((card) => (
                    <button
                      key={String(card?.id || "")}
                      type="button"
                      onClick={() => setSelectedCardId(String(card?.id || ""))}
                      className={
                        String(card?.id || "") === selectedCardId
                          ? "w-full rounded-[8px] border border-[rgba(203,178,107,0.7)] bg-[rgba(203,178,107,0.08)] p-4 text-left"
                          : "w-full rounded-[8px] border border-black/10 bg-white p-4 text-left"
                      }
                    >
                      <p className="text-[14px] font-semibold text-[#202020]">{formatCard(card)}</p>
                    </button>
                  ))}
                </div>
              ) : paymentMode === "saved" ? (
                <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-4 text-[13px] text-[#57636c]">
                  You do not have a saved card yet. Add one before completing checkout.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Card holder</label>
                    <input
                      value={newCard.holder}
                      onChange={(event) => setNewCard((current) => ({ ...current, holder: event.target.value }))}
                      onBlur={() => setCardTouched((current) => ({ ...current, holder: true }))}
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="Name on card"
                    />
                    {cardTouched.holder && cardErrors.holder ? <p className="mt-2 text-[12px] text-[#b91c1c]">{cardErrors.holder}</p> : null}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Card number</label>
                    <input
                      inputMode="numeric"
                      value={formatCardNumberInput(newCard.number)}
                      onChange={(event) => setNewCard((current) => ({ ...current, number: sanitizeCardNumber(event.target.value) }))}
                      onBlur={() => setCardTouched((current) => ({ ...current, number: true }))}
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="0000 0000 0000 0000"
                    />
                    <p className="mt-2 text-[12px] text-[#7a7a7a]">{detectCardBrand(newCard.number) === "MASTER" ? "Mastercard" : "Visa"} card</p>
                    {cardTouched.number && cardErrors.number ? <p className="mt-2 text-[12px] text-[#b91c1c]">{cardErrors.number}</p> : null}
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Expiry month</label>
                    <input
                      inputMode="numeric"
                      value={newCard.expiryMonth}
                      onChange={(event) => setNewCard((current) => ({ ...current, expiryMonth: formatMonthInput(event.target.value) }))}
                      onBlur={() => setCardTouched((current) => ({ ...current, expiryMonth: true }))}
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="MM"
                    />
                    {cardTouched.expiryMonth && cardErrors.expiryMonth ? <p className="mt-2 text-[12px] text-[#b91c1c]">{cardErrors.expiryMonth}</p> : null}
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Expiry year</label>
                    <input
                      inputMode="numeric"
                      value={newCard.expiryYear}
                      onChange={(event) => setNewCard((current) => ({ ...current, expiryYear: sanitizeYear(event.target.value) }))}
                      onBlur={() => setCardTouched((current) => ({ ...current, expiryYear: true }))}
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="YYYY"
                    />
                    {cardTouched.expiryYear && cardErrors.expiryYear ? <p className="mt-2 text-[12px] text-[#b91c1c]">{cardErrors.expiryYear}</p> : null}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">CVV</label>
                    <input
                      inputMode="numeric"
                      value={newCard.cvv}
                      onChange={(event) => setNewCard((current) => ({ ...current, cvv: sanitizeCvv(event.target.value) }))}
                      onBlur={() => setCardTouched((current) => ({ ...current, cvv: true }))}
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="CVV"
                    />
                    {cardTouched.cvv && cardErrors.cvv ? <p className="mt-2 text-[12px] text-[#b91c1c]">{cardErrors.cvv}</p> : null}
                  </div>
                  <label className="sm:col-span-2 mt-1 inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                    <input
                      type="checkbox"
                      checked={newCard.saveCard}
                      onChange={(event) => setNewCard((current) => ({ ...current, saveCard: event.target.checked }))}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    Save this card for faster checkout next time
                  </label>
                </div>
              )}
            </section>

            <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <h2 className="text-[18px] font-semibold text-[#202020]">Items in your order</h2>
              <div className="mt-4 space-y-3">
                {sellerGroups.map((group) => (
                  <div key={group.seller} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                    <div className="border-b border-black/5 pb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Sold by</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[16px] font-semibold text-[#202020]">{group.seller}</p>
                        <div className="text-right">
                          <p className="text-[12px] text-[#57636c]">{getSellerFulfillmentSummary(group.items)}</p>
                          {getSellerDeliverySummary(group.items, selectedLocation, pickupSelections) ? (
                            <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                              {getSellerDeliverySummary(group.items, selectedLocation, pickupSelections)?.label}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {group.pickupAvailable ? (
                        <label className="mt-3 inline-flex items-center gap-2 text-[12px] font-medium text-[#202020]">
                          <input
                            type="checkbox"
                            checked={pickupSelections.includes(group.sellerKey)}
                            onChange={(event) =>
                              setPickupSelections((current) =>
                                togglePickupSelection(current, group.sellerKey, event.target.checked),
                              )
                            }
                            className="h-4 w-4 rounded border-black/20"
                          />
                          Collect these items from the seller instead
                        </label>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-3">
                      {group.items.map((item, index) => (
                        <div key={`${item?.product_snapshot?.product?.title || "item"}-${index}`} className="rounded-[8px] border border-black/5 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[14px] font-semibold text-[#202020]">{item?.product_snapshot?.product?.title || "Product"}</p>
                              <p className="mt-1 text-[12px] text-[#57636c]">{item?.selected_variant_snapshot?.label || "Selected variant"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[12px] text-[#57636c]">Qty {Math.max(0, Number(item?.qty ?? item?.quantity ?? 0))}</p>
                              <p className="mt-1 text-[14px] font-semibold text-[#202020]">{formatMoney(item?.line_totals?.final_incl || 0)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)] lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-[18px] font-semibold text-[#202020]">Order summary</h2>
            {selectedLocation ? (
              <div className="mt-5 rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Delivering to</p>
                <p className="mt-2 text-[14px] font-semibold text-[#202020]">
                  {resolveLocationTitle(selectedLocation, selectedLocationIndex)}
                </p>
                <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">{formatAddress(selectedLocation)}</p>
              </div>
            ) : null}
            <div className="mt-5 space-y-3 text-[13px] text-[#57636c]">
              <div className="flex items-center justify-between gap-3">
                <span>Items</span>
                <span className="font-semibold text-[#202020]">{getItemCount(cart)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Products total</span>
                <span className="font-semibold text-[#202020]">{formatMoney(productsTotalIncl)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Piessang delivery</span>
                <span className="font-semibold text-[#202020]">
                  {deliveryFeeLoading || checkoutReserveLoading ? "Calculating..." : formatMoney(deliveryAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Seller delivery</span>
                <span className="font-semibold text-[#202020]">
                  {deliveryFeeLoading || checkoutReserveLoading ? "Calculating..." : formatMoney(sellerDeliveryAmount)}
                </span>
              </div>
              {sellerDeliverySummaries.length ? (
                <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Seller delivery</p>
                  <div className="mt-2 space-y-2">
                    {sellerDeliverySummaries.map((entry) => (
                      <div key={entry.seller} className="flex items-start justify-between gap-3">
                        <span>{entry.seller}</span>
                        <span className="text-right font-semibold text-[#202020]">{entry.summary?.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 border-t border-black/5 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold text-[#202020]">Amount to pay</span>
                <span className="text-[22px] font-semibold text-[#202020]">{formatMoney(payableIncl)}</span>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-[8px] border border-[rgba(185,28,28,0.16)] bg-[rgba(185,28,28,0.05)] px-4 py-3 text-[12px] text-[#b91c1c]">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={
                submitting ||
                checkoutBlocked ||
                !locations.length ||
                !cart?.items?.length ||
                (paymentMode === "saved" ? !selectedCard?.id : !canUseNewCard)
              }
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Placing your order..." : "Pay and place order"}
            </button>

            <Link href="/cart" className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
              Back to cart
            </Link>
          </aside>
        </div>
      )}
    </section>
    {snackbarMessage ? (
      <div className="fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#202020] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_12px_28px_rgba(20,24,27,0.18)]">
        {snackbarMessage}
      </div>
    ) : null}
    <GooglePlacePickerModal
      open={addressPickerOpen}
      title="Choose your delivery address"
      initialValue={{
        country: addressDraft.country,
        region: addressDraft.stateProvinceRegion,
        city: addressDraft.city,
        suburb: addressDraft.suburb,
        postalCode: addressDraft.postalCode,
        latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
        longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
      }}
      onClose={() => setAddressPickerOpen(false)}
      onSelect={(value) => {
        setAddressDraft((current) => ({
          ...current,
          locationName: current.locationName || deriveAddressNameFromPlace(value),
          streetAddress: String(value.streetAddress || value.formattedAddress || current.streetAddress),
          addressLine2: String(value.addressLine2 || current.addressLine2),
          country: String(value.country || current.country),
          stateProvinceRegion: String(value.region || current.stateProvinceRegion),
          city: String(value.city || current.city),
          suburb: String(value.suburb || current.suburb),
          postalCode: String(value.postalCode || current.postalCode),
          latitude: value.latitude == null ? "" : String(value.latitude),
          longitude: value.longitude == null ? "" : String(value.longitude),
        }));
        setAddressPickerOpen(false);
      }}
    />
    {cardsModalOpen ? (
      <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close saved cards modal"
          className="absolute inset-0 bg-black/45"
          onClick={() => setCardsModalOpen(false)}
        />
        <div className="relative w-full max-w-[560px] rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Saved cards</p>
              <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">Manage your payment methods</h3>
            </div>
            <button
              type="button"
              onClick={() => setCardsModalOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
              aria-label="Close saved cards modal"
            >
              ×
            </button>
          </div>
          <div className="max-h-[70svh] overflow-y-auto px-5 py-4">
            {cards.length ? (
              <div className="space-y-3">
                {cards.map((card) => {
                  const cardId = String(card?.id || "");
                  return (
                    <div key={cardId} className="flex items-center justify-between gap-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#202020]">{formatCard(card)}</p>
                        <p className="mt-1 text-[12px] text-[#57636c]">
                          {cardId === selectedCardId ? "Selected for this checkout" : "Saved for faster checkout"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSavedCard(cardId)}
                        disabled={deletingCardId === cardId}
                        className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[rgba(185,28,28,0.16)] bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingCardId === cardId ? "Removing..." : "Delete"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                You do not have any saved cards yet.
              </div>
            )}
          </div>
          <div className="flex items-center justify-end border-t border-black/5 px-5 py-4">
            <button
              type="button"
              onClick={() => setCardsModalOpen(false)}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {addressesModalOpen ? (
      <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close saved addresses modal"
          className="absolute inset-0 bg-black/45"
          onClick={() => {
            setAddressesModalOpen(false);
            setEditingLocationId("");
            setAddressDraft(defaultAddressDraft(profile ?? undefined));
          }}
        />
        <div className="relative w-full max-w-[760px] rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Saved addresses</p>
              <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">Manage your delivery addresses</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setAddressesModalOpen(false);
                setEditingLocationId("");
                setAddressDraft(defaultAddressDraft(profile ?? undefined));
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
              aria-label="Close saved addresses modal"
            >
              ×
            </button>
          </div>
          <div className="grid max-h-[75svh] gap-0 overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="overflow-y-auto border-r border-black/5 p-4">
              <div className="space-y-3">
                {locations.length ? locations.map((location, index) => {
                  const locationId = String((location as any)?.id || "");
                  const selected = String(locationId) === String(editingLocationId);
                  return (
                    <button
                      key={`${locationId || location.label || "address"}-${index}`}
                      type="button"
                      onClick={() => {
                        setEditingLocationId(locationId);
                        setAddressDraft({
                          locationName: (location as any)?.locationName || location.label || "",
                          recipientName: location.recipientName || "",
                          streetAddress: location.streetAddress || "",
                          addressLine2: location.addressLine2 || "",
                          suburb: location.suburb || "",
                          city: location.city || "",
                          stateProvinceRegion: location.stateProvinceRegion || location.province || "",
                          postalCode: location.postalCode || "",
                          country: location.country || "",
                          phoneNumber: location.phoneNumber || "",
                          instructions: location.instructions || "",
                          is_default: location.is_default === true,
                          latitude: location.latitude == null ? "" : String(location.latitude),
                          longitude: location.longitude == null ? "" : String(location.longitude),
                        });
                      }}
                      className={
                        selected
                          ? "w-full rounded-[8px] border border-[rgba(203,178,107,0.7)] bg-[rgba(203,178,107,0.08)] p-4 text-left"
                          : "w-full rounded-[8px] border border-black/10 bg-[#fafafa] p-4 text-left"
                      }
                    >
                      <p className="text-[14px] font-semibold text-[#202020]">{resolveLocationTitle(location, index)}</p>
                      <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">{formatAddress(location)}</p>
                    </button>
                  );
                }) : (
                  <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                    You do not have any saved delivery addresses yet.
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              {editingLocationId ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-[18px] font-semibold text-[#202020]">Edit address</h4>
                    <button
                      type="button"
                      onClick={() => setAddressPickerOpen(true)}
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                    >
                      Search address on map
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Address name</label>
                      <input
                        value={addressDraft.locationName}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, locationName: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Recipient name</label>
                      <input
                        value={addressDraft.recipientName}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, recipientName: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Street address</label>
                      <input
                        value={addressDraft.streetAddress}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, streetAddress: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Address line 2</label>
                      <input
                        value={addressDraft.addressLine2}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, addressLine2: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Suburb</label>
                      <input
                        value={addressDraft.suburb}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, suburb: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">City</label>
                      <input
                        value={addressDraft.city}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Province</label>
                      <input
                        value={addressDraft.stateProvinceRegion}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, stateProvinceRegion: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Postal code</label>
                      <input
                        value={addressDraft.postalCode}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, postalCode: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Country</label>
                      <input
                        value={addressDraft.country}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, country: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery notes</label>
                      <input
                        value={addressDraft.instructions}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, instructions: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                    <input
                      type="checkbox"
                      checked={addressDraft.is_default}
                      onChange={(event) => setAddressDraft((current) => ({ ...current, is_default: event.target.checked }))}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    Set this as my default delivery address
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleUpdateAddress()}
                      disabled={addressEditing}
                      className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addressEditing ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLocationId("");
                        setAddressDraft(defaultAddressDraft(profile ?? undefined));
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                  Select an address on the left to edit it.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
