"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { clientAuth } from "@/lib/firebase";
import { clientDb } from "@/lib/firebase";
import { EMPTY_AUTH_BOOTSTRAP, type AuthBootstrap } from "@/lib/auth/bootstrap";
import {
  SELLER_CATALOGUE_CATEGORIES,
  getSellerCatalogueSubCategories,
} from "@/lib/seller/catalogue-categories";
import {
  canCreateSellerAccount,
  getActiveSellerManagedAccount,
  hasSellerTeamMemberships,
  ownsSellerAccount,
} from "@/lib/seller/access";
import { SELLER_SERVICE_AREAS } from "@/lib/seller/service-areas";
import { getSellerReviewRequest } from "@/lib/seller/account-status";
import { titleCaseVendorName } from "@/lib/seller/vendor-name";

type AuthProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  systemAccessType: string | null;
  favoriteCount: number;
  favoriteIds: string[];
  isSeller: boolean;
  sellerAccessRequested: boolean;
  sellerStatus: string | null;
  sellerBlockedReasonCode: string | null;
  sellerBlockedReasonMessage: string | null;
  sellerBlockedAt: string | null;
  sellerBlockedBy: string | null;
  sellerReviewRequestStatus: string | null;
  sellerReviewRequestedAt: string | null;
  sellerReviewRequestedBy: string | null;
  sellerReviewRequestMessage: string | null;
  sellerReviewResponseStatus: string | null;
  sellerReviewResponseAt: string | null;
  sellerReviewResponseBy: string | null;
  sellerReviewResponseMessage: string | null;
  sellerTeamOwnerUid: string | null;
  accountName: string | null;
  sellerVendorName: string | null;
  sellerVendorDescription: string | null;
  sellerCode: string | null;
  sellerSlug: string | null;
  sellerActiveSellerSlug: string | null;
  sellerTeamRole: string | null;
  sellerCategory: string | null;
  sellerCategoryTitle: string | null;
  sellerSubCategory: string | null;
  sellerSubCategoryTitle: string | null;
  sellerManagedAccounts: Array<{
    sellerSlug?: string;
    vendorName?: string;
    sellerCode?: string;
    vendorDescription?: string;
    role?: string;
    status?: string;
    teamOwnerUid?: string;
    grantedAt?: string;
    blockedReasonCode?: string;
    blockedReasonMessage?: string;
    blockedAt?: string;
    blockedBy?: string;
    reviewRequestStatus?: string;
    reviewRequestedAt?: string;
    reviewRequestedBy?: string;
    reviewRequestMessage?: string;
    reviewResponseStatus?: string;
    reviewResponseAt?: string;
    reviewResponseBy?: string;
    reviewResponseMessage?: string;
  }> | null;
  sellerTeamMembers: Array<{ uid?: string; email?: string; role?: string; status?: string }> | null;
  sellerTeamInvites: Array<{ email?: string; role?: string; status?: string; token?: string }> | null;
};

type CartState = {
  itemCount: number;
  productCounts: Record<string, number>;
  variantCounts: Record<string, number>;
};

type AuthContextValue = {
  user: FirebaseUser | null;
  profile: AuthProfile | null;
  uid: string | null;
  isAuthenticated: boolean;
  authReady: boolean;
  isSeller: boolean;
  systemAccessType: string | null;
  favoriteCount: number;
  favoriteIds: string[];
  sellerAccessRequested: boolean;
  sellerStatus: string | null;
  sellerBlockedReasonCode: string | null;
  sellerBlockedReasonMessage: string | null;
  sellerBlockedAt: string | null;
  sellerBlockedBy: string | null;
  sellerReviewRequestStatus: string | null;
  sellerReviewRequestedAt: string | null;
  sellerReviewRequestedBy: string | null;
  sellerReviewRequestMessage: string | null;
  sellerReviewResponseStatus: string | null;
  sellerReviewResponseAt: string | null;
  sellerReviewResponseBy: string | null;
  sellerReviewResponseMessage: string | null;
  openSellerRegistrationModal: (message?: string) => void;
  closeSellerRegistrationModal: () => void;
  cartItemCount: number;
  cartProductCounts: Record<string, number>;
  cartVariantCounts: Record<string, number>;
  openAuthModal: (message?: string) => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshCart: () => Promise<void>;
  syncFavoriteState: (productId: string, isFavorite: boolean) => void;
  syncCartState: (cart: unknown) => void;
  leaveSellerTeam: (sellerSlug?: string) => Promise<void>;
};

type AuthModalState = {
  open: boolean;
  message: string;
};

type AuthMode = "sign-in" | "sign-up";

type SellerRegistrationState = {
  open: boolean;
  message: string;
  status: "form" | "success";
  vendorName: string;
  contactEmail: string;
  countryCode: string;
  contactPhone: string;
  baseLocation: string;
  category: string;
  subCategory: string;
};

type SellerSuccessState = {
  vendorName: string;
  baseLocation: string;
  categoryTitle: string;
  subCategory: string;
};

type SellerNameCheckState = {
  checking: boolean;
  unique: boolean | null;
  suggestions: string[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_MODAL_MESSAGE = "Sign in to continue.";
const DEFAULT_SELLER_MESSAGE = "Register your seller account to unlock catalogue tools.";
const SELLER_COUNTRY_CODES = [
  { code: "27", label: "+27 South Africa" },
  { code: "264", label: "+264 Namibia" },
  { code: "267", label: "+267 Botswana" },
  { code: "266", label: "+266 Lesotho" },
  { code: "268", label: "+268 Eswatini" },
  { code: "258", label: "+258 Mozambique" },
] as const;

function inferAccountName(user: FirebaseUser | null) {
  return user?.displayName ?? user?.email?.split("@")[0] ?? "Piessang user";
}

function normalizeFavoriteIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return item.trim();
      if (typeof item === "object") {
        const record = item as { unique_id?: string; uniqueId?: string; product_unique_id?: string };
        return (record.unique_id ?? record.uniqueId ?? record.product_unique_id ?? "").trim() || null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function normalizeSellerArray<T extends Record<string, unknown>>(value: unknown): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is T => Boolean(item && typeof item === "object"));
}

function sanitizeEmail(value: string) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function sanitizeEmailInput(value: string) {
  return sanitizeEmail(value).slice(0, 254);
}

function sanitizeDigits(value: string) {
  return String(value ?? "").replace(/\D+/g, "").slice(0, 9);
}

function sanitizeText(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeVendorNameInput(value: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 30);
}

function buildSellerRegistrationDefaults(profile: AuthProfile | null): SellerRegistrationState {
  return {
    open: false,
    message: DEFAULT_SELLER_MESSAGE,
    status: "form",
    vendorName: profile?.sellerVendorName ?? profile?.accountName ?? profile?.displayName ?? "",
    contactEmail: profile?.email ?? "",
    countryCode: "27",
    contactPhone: "",
    baseLocation: SELLER_SERVICE_AREAS[0],
    category: "",
    subCategory: "",
  };
}

async function loadAuthBootstrap(): Promise<AuthBootstrap> {
  try {
    const response = await fetch("/api/auth/bootstrap", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return EMPTY_AUTH_BOOTSTRAP;
    }

    return {
      user: payload?.user ?? null,
      profile: payload?.profile ?? null,
      itemCount: Number(payload?.itemCount ?? 0),
      productCounts:
        payload?.productCounts && typeof payload.productCounts === "object" ? payload.productCounts : {},
      variantCounts:
        payload?.variantCounts && typeof payload.variantCounts === "object" ? payload.variantCounts : {},
    };
  } catch {
    return EMPTY_AUTH_BOOTSTRAP;
  }
}

function buildClientProfile(user: FirebaseUser, data: Record<string, any>): AuthProfile {
  const account = data?.account && typeof data.account === "object" ? data.account : {};
  const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
  const system = data?.system && typeof data.system === "object" ? data.system : {};
  const sellerTeam = seller?.team && typeof seller.team === "object" ? seller.team : {};
  const blocked = seller?.blocked && typeof seller.blocked === "object" ? seller.blocked : {};
  const reviewRequest = data?.seller?.reviewRequest && typeof data.seller.reviewRequest === "object" ? data.seller.reviewRequest : {};
  const favorites = Array.isArray(data?.preferences?.favoriteProducts)
    ? data.preferences.favoriteProducts.filter((item: unknown) => typeof item === "string") as string[]
    : [];

  return {
    uid: user.uid,
    email: user.email ?? data.email ?? null,
    displayName: user.displayName ?? seller.vendorName ?? account.accountName ?? null,
    photoURL: user.photoURL ?? data.media?.photoUrl ?? null,
    systemAccessType: typeof system.accessType === "string" ? system.accessType : null,
    favoriteCount: favorites.length,
    favoriteIds: favorites,
    isSeller: Boolean(seller?.sellerAccess || ["active", "approved", "live"].includes(String(seller?.status ?? "").toLowerCase())),
    sellerAccessRequested: Boolean(
      ["requested", "pending", "under_review"].includes(String(seller?.status ?? "").toLowerCase()) ||
        account.requestedSellerAccess === true,
    ),
    sellerStatus: typeof seller.status === "string" ? seller.status : null,
    sellerBlockedReasonCode: typeof blocked.reasonCode === "string" ? blocked.reasonCode : null,
    sellerBlockedReasonMessage: typeof blocked.reasonMessage === "string" ? blocked.reasonMessage : null,
    sellerBlockedAt: typeof blocked.blockedAt === "string" ? blocked.blockedAt : null,
    sellerBlockedBy: typeof blocked.blockedBy === "string" ? blocked.blockedBy : null,
    sellerReviewRequestStatus: typeof reviewRequest.status === "string" ? reviewRequest.status : null,
    sellerReviewRequestedAt: typeof reviewRequest.requestedAt === "string" ? reviewRequest.requestedAt : null,
    sellerReviewRequestedBy: typeof reviewRequest.requestedBy === "string" ? reviewRequest.requestedBy : null,
    sellerReviewRequestMessage: typeof reviewRequest.message === "string" ? reviewRequest.message : null,
    sellerReviewResponseStatus: typeof reviewRequest.responseStatus === "string" ? reviewRequest.responseStatus : null,
    sellerReviewResponseAt: typeof reviewRequest.respondedAt === "string" ? reviewRequest.respondedAt : null,
    sellerReviewResponseBy: typeof reviewRequest.respondedBy === "string" ? reviewRequest.respondedBy : null,
    sellerReviewResponseMessage: typeof reviewRequest.responseMessage === "string" ? reviewRequest.responseMessage : null,
    sellerTeamOwnerUid: typeof seller.teamOwnerUid === "string" ? seller.teamOwnerUid : null,
    accountName: account.accountName ?? null,
    sellerVendorName: seller.vendorName ?? null,
    sellerVendorDescription: typeof seller.vendorDescription === "string" ? seller.vendorDescription : null,
    sellerCode: typeof seller.sellerCode === "string" ? seller.sellerCode : null,
    sellerSlug: typeof seller.sellerSlug === "string" ? seller.sellerSlug : null,
    sellerActiveSellerSlug: typeof seller.activeSellerSlug === "string" ? seller.activeSellerSlug : seller.sellerSlug ?? null,
    sellerTeamRole: typeof seller.teamRole === "string" ? seller.teamRole : null,
    sellerCategory: typeof seller.category === "string" ? seller.category : null,
    sellerCategoryTitle: null,
    sellerSubCategory: typeof seller.subCategory === "string" ? seller.subCategory : null,
    sellerSubCategoryTitle: null,
    sellerManagedAccounts: Array.isArray(seller.managedSellerAccounts) ? seller.managedSellerAccounts : null,
    sellerTeamMembers: Array.isArray(sellerTeam.members) ? sellerTeam.members : null,
    sellerTeamInvites: Array.isArray(sellerTeam.invites) ? sellerTeam.invites : null,
  };
}

function deriveCartStateFromCart(cart: any): CartState {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const productCounts: Record<string, number> = {};
  const variantCounts: Record<string, number> = {};
  let itemCount = 0;

  for (const item of items) {
    const qty = Math.max(0, Number(item?.quantity ?? item?.qty ?? 0));
    if (!qty) continue;
    itemCount += qty;

    const productId =
      String(item?.product_snapshot?.product?.unique_id || "") ||
      String(item?.product_unique_id || "") ||
      String(item?.product?.unique_id || "");
    const variantId =
      String(item?.selected_variant_snapshot?.variant_id || "") ||
      String(item?.selected_variant_id || "") ||
      String(item?.selected_variant?.variant_id || "");

    if (productId) {
      productCounts[productId] = (productCounts[productId] ?? 0) + qty;
    }
    if (productId && variantId) {
      const key = `${productId}::${variantId}`;
      variantCounts[key] = (variantCounts[key] ?? 0) + qty;
    }
  }

  return { itemCount, productCounts, variantCounts };
}

async function ensureClientUserDocument(user: FirebaseUser) {
  if (!clientDb) return null;

  const ref = doc(clientDb, "users", user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    return existing.data();
  }

  await setDoc(
    ref,
    {
      uid: user.uid,
      email: user.email ?? "",
      created_time: serverTimestamp(),
      account: {
        accountName:
          user.displayName ||
          user.email?.split("@")[0] ||
          "Piessang user",
        accountActive: false,
        onboardingComplete: false,
        accountType: null,
      },
      preferences: {
        favoriteProducts: [],
        emailNotifications: true,
        smsNotifications: true,
      },
      media: {
        photoUrl: user.photoURL ?? "",
        blurHash: "",
      },
      timestamps: {
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true },
  );

  return {
    uid: user.uid,
    email: user.email ?? "",
    created_time: new Date(),
    account: {
      accountName: user.displayName || user.email?.split("@")[0] || "Piessang user",
      accountActive: false,
      onboardingComplete: false,
      accountType: null,
    },
    preferences: {
      favoriteProducts: [],
      emailNotifications: true,
      smsNotifications: true,
    },
    media: {
      photoUrl: user.photoURL ?? "",
      blurHash: "",
    },
    timestamps: {
      updatedAt: new Date(),
    },
  };
}

async function loadAuthBootstrapForUser(user: FirebaseUser): Promise<AuthBootstrap> {
  const snapshot = await ensureClientUserDocument(user);

  try {
    const response = await fetch("/api/auth/bootstrap", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok !== false && payload?.profile) {
      return {
        user: payload?.user ?? {
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
          photoURL: user.photoURL ?? null,
        },
        profile: payload.profile,
        itemCount: Number(payload?.itemCount ?? 0),
        productCounts:
          payload?.productCounts && typeof payload.productCounts === "object" ? payload.productCounts : {},
        variantCounts:
          payload?.variantCounts && typeof payload.variantCounts === "object" ? payload.variantCounts : {},
      };
    }
  } catch {
    // fall through to client fallback
  }

  return {
    user: {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
    },
    profile: buildClientProfile(user, snapshot || {}),
    itemCount: 0,
    productCounts: {},
    variantCounts: {},
  };
}

async function syncServerSession(user: FirebaseUser | null) {
  try {
    if (!user) {
      await fetch("/api/auth/session/logout", { method: "POST" });
      return;
    }

    const idToken = await user.getIdToken();
    await fetch("/api/auth/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    // Best-effort session sync. Client auth still works even if the cookie write fails.
  }
}

export function AuthProvider({
  children,
  initialAuthBootstrap = EMPTY_AUTH_BOOTSTRAP,
}: {
  children: React.ReactNode;
  initialAuthBootstrap?: AuthBootstrap;
}) {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(initialAuthBootstrap.profile);
  const [modal, setModal] = useState<AuthModalState>({ open: false, message: DEFAULT_MODAL_MESSAGE });
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [cartState, setCartState] = useState<CartState>({
    itemCount: initialAuthBootstrap.itemCount ?? 0,
    productCounts: initialAuthBootstrap.productCounts ?? {},
    variantCounts: initialAuthBootstrap.variantCounts ?? {},
  });
  const [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pendingSellerRegistration, setPendingSellerRegistration] = useState(false);
  const [sellerModal, setSellerModal] = useState<SellerRegistrationState>(() =>
    buildSellerRegistrationDefaults(null),
  );
  const [sellerSubmitting, setSellerSubmitting] = useState(false);
  const [sellerMessage, setSellerMessage] = useState<string | null>(null);
  const [sellerSuccess, setSellerSuccess] = useState<SellerSuccessState | null>(null);
  const [sellerNameCheck, setSellerNameCheck] = useState<SellerNameCheckState>({
    checking: false,
    unique: null,
    suggestions: [],
  });
  const sellerManagedAccounts = useMemo(() => profile?.sellerManagedAccounts ?? [], [profile?.sellerManagedAccounts]);
  const sellerHasTeamMemberships = useMemo(() => hasSellerTeamMemberships(profile), [profile]);
  const activeSellerTeamMembership = useMemo(() => getActiveSellerManagedAccount(profile), [profile]);
  const sellerOwnsSellerAccount = useMemo(() => ownsSellerAccount(profile), [profile]);

  const refreshProfile = useCallback(async () => {
    const activeUser = clientAuth.currentUser ?? user;
    const bootstrap = activeUser ? await loadAuthBootstrapForUser(activeUser) : EMPTY_AUTH_BOOTSTRAP;
    setProfile(bootstrap.profile);
    setCartState({
      itemCount: bootstrap.itemCount,
      productCounts: bootstrap.productCounts,
      variantCounts: bootstrap.variantCounts,
    });
  }, []);

  const refreshCart = useCallback(async () => {
    const activeUser = clientAuth.currentUser ?? user;
    const bootstrap = activeUser ? await loadAuthBootstrapForUser(activeUser) : EMPTY_AUTH_BOOTSTRAP;
    setCartState({
      itemCount: bootstrap.itemCount,
      productCounts: bootstrap.productCounts,
      variantCounts: bootstrap.variantCounts,
    });
  }, []);

  const syncFavoriteState = useCallback((productId: string, isFavorite: boolean) => {
    const normalizedId = String(productId ?? "").trim();
    if (!normalizedId) return;

    setProfile((current) => {
      if (!current) return current;
      const currentIds = Array.isArray(current.favoriteIds) ? current.favoriteIds : [];
      const nextIds = isFavorite
        ? Array.from(new Set([...currentIds, normalizedId]))
        : currentIds.filter((entry) => entry !== normalizedId);
      return {
        ...current,
        favoriteIds: nextIds,
        favoriteCount: nextIds.length,
      };
    });
  }, []);

  const syncCartState = useCallback((cart: unknown) => {
    setCartState(deriveCartStateFromCart(cart));
  }, []);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(clientAuth, async (nextUser) => {
      setAuthReady(false);
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setCartState({ itemCount: 0, productCounts: {}, variantCounts: {} });
        setAuthReady(true);
        void syncServerSession(null);
        return;
      }

      try {
        await syncServerSession(nextUser);
        const bootstrap = await loadAuthBootstrapForUser(nextUser);
        setProfile(bootstrap.profile);
        setCartState({
          itemCount: bootstrap.itemCount,
          productCounts: bootstrap.productCounts,
          variantCounts: bootstrap.variantCounts,
        });
      } catch {
        setProfile((current) => current);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pendingSellerRegistration) return;
    const activeUid = profile?.uid ?? user?.uid ?? clientAuth.currentUser?.uid ?? null;
    if (!authReady || !activeUid || modal.open) return;
    const blockedState = canCreateSellerAccount(profile);

    setSellerModal((current) => ({
      ...current,
      open: true,
      status: "form",
      vendorName: profile?.sellerVendorName ?? profile?.accountName ?? profile?.displayName ?? current.vendorName,
      contactEmail: profile?.email ?? current.contactEmail,
      baseLocation: current.baseLocation || SELLER_SERVICE_AREAS[0],
      category: current.category || "",
      subCategory: current.subCategory,
      message: blockedState.allowed
        ? current.message || DEFAULT_SELLER_MESSAGE
        : blockedState.reason,
    }));
    setSellerMessage(blockedState.allowed ? DEFAULT_SELLER_MESSAGE : blockedState.reason);
    setSellerSuccess(null);
    setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
    setPendingSellerRegistration(false);
  }, [authReady, modal.open, pendingSellerRegistration, profile, user]);

  const openAuthModal = useCallback((message?: string) => {
    setMode("sign-in");
    setAuthMessage(null);
    setModal({ open: true, message: message?.trim() || DEFAULT_MODAL_MESSAGE });
  }, []);

  const openSellerRegistrationModal = useCallback((message?: string) => {
    const activeUid = profile?.uid ?? user?.uid ?? clientAuth.currentUser?.uid ?? null;
    const blockedState = canCreateSellerAccount(profile);
    const blockedMessage = blockedState.allowed ? null : blockedState.reason;

    if (!activeUid) {
      setPendingSellerRegistration(true);
      openAuthModal(message ?? "Sign in to register your seller account.");
      return;
    }

    setSellerModal({
      open: true,
      message: blockedMessage || message?.trim() || DEFAULT_SELLER_MESSAGE,
      status: "form",
      vendorName:
        profile?.sellerVendorName ??
        profile?.accountName ??
        profile?.displayName ??
        clientAuth.currentUser?.displayName ??
        "",
      contactEmail: profile?.email ?? clientAuth.currentUser?.email ?? "",
      countryCode: "27",
      contactPhone: "",
      baseLocation: SELLER_SERVICE_AREAS[0],
      category: "",
      subCategory: "",
    });
    setSellerMessage(null);
    setSellerSuccess(null);
    setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
  }, [openAuthModal, profile, user]);

  const closeSellerRegistrationModal = useCallback(() => {
    setSellerModal((current) => ({ ...current, open: false, status: "form" }));
    setSellerMessage(null);
    setSellerSuccess(null);
    setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
  }, []);

  const closeAuthModal = useCallback(() => {
    setModal((current) => ({ ...current, open: false }));
    setAuthMessage(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(clientAuth, provider);
      await syncServerSession(credential.user);
      await refreshProfile();
      closeAuthModal();
    } finally {
      setBusy(false);
    }
  }, [closeAuthModal, refreshProfile]);

  const handleSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOut(clientAuth);
      await syncServerSession(null);
      setProfile(null);
      setCartState({ itemCount: 0, productCounts: {}, variantCounts: {} });
      closeAuthModal();
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }, [closeAuthModal, router]);

  const handleEmailAuth = useCallback(async () => {
    setBusy(true);
    setAuthMessage(null);

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();

      if (!trimmedEmail || !trimmedPassword) {
        setAuthMessage("Please add your email and password.");
        return;
      }

      if (mode === "sign-up") {
        const trimmedDisplayName = displayName.trim();
        if (!trimmedDisplayName) {
          setAuthMessage("Please add your display name.");
          return;
        }

        const credential = await createUserWithEmailAndPassword(clientAuth, trimmedEmail, trimmedPassword);
        await updateProfile(credential.user, { displayName: trimmedDisplayName });
        await syncServerSession(credential.user);
        await refreshProfile();
        closeAuthModal();
      } else {
        const credential = await signInWithEmailAndPassword(clientAuth, trimmedEmail, trimmedPassword);
        await syncServerSession(credential.user);
        await refreshProfile();
        closeAuthModal();
      }

      setEmail("");
      setPassword("");
      setDisplayName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setAuthMessage(message);
    } finally {
      setBusy(false);
    }
  }, [closeAuthModal, displayName, email, mode, password, refreshProfile]);

  const sellerSubCategories = useMemo(
    () => getSellerCatalogueSubCategories(sellerModal.category),
    [sellerModal.category],
  );

  const sellerFormIsValid = useMemo(() => {
    const vendorName = sanitizeVendorNameInput(sellerModal.vendorName);
    const contactEmail = sanitizeEmail(sellerModal.contactEmail);
    const countryCode = sanitizeDigits(sellerModal.countryCode);
    const contactPhone = sanitizeDigits(sellerModal.contactPhone);
    const baseLocation = sanitizeText(sellerModal.baseLocation);
    const subCategory = sanitizeText(sellerModal.subCategory);

    const hasBasicFields =
      vendorName &&
      contactEmail &&
      contactEmail.includes("@") &&
      countryCode &&
      contactPhone.length === 9 &&
      baseLocation;

    const subCategoryValid =
      !sellerModal.category || !subCategory || sellerSubCategories.some((item) => item.slug === subCategory);

    return Boolean(hasBasicFields && subCategoryValid && sellerNameCheck.unique === true && !sellerNameCheck.checking);
  }, [sellerModal, sellerNameCheck.checking, sellerNameCheck.unique, sellerSubCategories]);

  const vendorNameState = useMemo(() => {
    if (sellerNameCheck.checking) return "checking";
    if (sellerNameCheck.unique === true) return "available";
    if (sellerNameCheck.unique === false) return "taken";
    return "idle";
  }, [sellerNameCheck.checking, sellerNameCheck.unique]);

  useEffect(() => {
    if (!sellerModal.open) return;

    const vendorName = sanitizeVendorNameInput(sellerModal.vendorName);
    const activeUid = profile?.uid ?? user?.uid ?? clientAuth.currentUser?.uid ?? null;
    if (!vendorName || vendorName.length < 3) {
      setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSellerNameCheck((current) => ({ ...current, checking: true }));

      try {
        const response = await fetch("/api/client/v1/accounts/seller/check-vendor-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: activeUid,
            vendorName,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to validate vendor name.");
        }

        setSellerNameCheck({
          checking: false,
          unique: payload?.unique === true,
          suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [sellerModal.open, sellerModal.vendorName]);

  const handleSellerRegistration = useCallback(async () => {
    setSellerSubmitting(true);
    setSellerMessage(null);

    try {
      const activeUid = profile?.uid ?? user?.uid ?? clientAuth.currentUser?.uid ?? null;
      if (!activeUid) {
        throw new Error("Sign in to register your seller account.");
      }
      const vendorName = sanitizeVendorNameInput(sellerModal.vendorName);
      const contactEmail = sanitizeEmail(sellerModal.contactEmail);
      const countryCode = sanitizeDigits(sellerModal.countryCode) || "27";
      const contactPhone = sanitizeDigits(sellerModal.contactPhone);
      const baseLocation = sanitizeText(sellerModal.baseLocation);
      const category = sanitizeText(sellerModal.category);
      const subCategory = sanitizeText(sellerModal.subCategory);

      const blockedState = canCreateSellerAccount(profile);
      if (!blockedState.allowed) {
        throw new Error(blockedState.reason);
      }

      if (!vendorName) throw new Error("Vendor name is required.");
      if (!contactEmail || !contactEmail.includes("@")) throw new Error("A valid contact email is required.");
      if (!countryCode) throw new Error("Country code is required.");
      if (contactPhone.length !== 9) throw new Error("Please enter a 9 digit South African phone number.");
      if (!baseLocation) throw new Error("Base location is required.");
      if (category && subCategory && !sellerSubCategories.some((item) => item.slug === subCategory)) {
        throw new Error("Please choose a valid sub category.");
      }

      const vendorNameCheckResponse = await fetch("/api/client/v1/accounts/seller/check-vendor-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: activeUid,
          vendorName,
        }),
      });

      const vendorNameCheckPayload = await vendorNameCheckResponse.json().catch(() => ({}));
      if (!vendorNameCheckResponse.ok || vendorNameCheckPayload?.ok === false) {
        throw new Error(vendorNameCheckPayload?.message || "Unable to validate vendor name.");
      }

      if (vendorNameCheckPayload?.unique !== true) {
        setSellerNameCheck({
          checking: false,
          unique: false,
          suggestions: Array.isArray(vendorNameCheckPayload?.suggestions) ? vendorNameCheckPayload.suggestions : [],
        });
        throw new Error("Please choose a unique vendor name.");
      }

      setSellerNameCheck({
        checking: false,
        unique: true,
        suggestions: [],
      });

      const response = await fetch("/api/client/v1/accounts/seller/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: activeUid,
          data: {
            seller: {
              vendorName,
              contactEmail,
              countryCode,
              phoneNumber: contactPhone,
              baseLocation,
              category: category || "",
              subCategory: category ? subCategory || "" : "",
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to register seller account.");
      }

      await refreshProfile();
      setSellerSuccess({
        vendorName,
        baseLocation,
        categoryTitle: payload?.seller?.categoryTitle || sellerModal.category || "",
        subCategory:
          payload?.seller?.subCategory ||
          (category && subCategory ? sellerSubCategories.find((item) => item.slug === subCategory)?.title || subCategory : ""),
      });
      setSellerModal((current) => ({ ...current, status: "success" }));
      setSellerMessage("Your seller account is now active.");
    } catch (error) {
      setSellerMessage(error instanceof Error ? error.message : "Unable to register seller account.");
    } finally {
      setSellerSubmitting(false);
    }
  }, [profile, refreshProfile, sellerModal, sellerSubCategories, user]);

  const leaveSellerTeam = useCallback(
    async (sellerSlug?: string) => {
      const activeUid = profile?.uid ?? user?.uid ?? clientAuth.currentUser?.uid ?? null;
      if (!activeUid) {
        throw new Error("Sign in to leave a seller team.");
      }

      const nextSellerSlug =
        String(sellerSlug ?? profile?.sellerActiveSellerSlug ?? profile?.sellerSlug ?? "").trim() ||
        sellerManagedAccounts.find((item) => String(item?.sellerSlug ?? "").trim())?.sellerSlug ||
        "";

      if (!nextSellerSlug) {
        throw new Error("No seller team was selected.");
      }

      const response = await fetch("/api/client/v1/accounts/seller/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: activeUid,
          data: {
            sellerSlug: nextSellerSlug,
            memberUid: activeUid,
            memberEmail: profile?.email ?? clientAuth.currentUser?.email ?? "",
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to leave seller team.");
      }

      await refreshProfile();
      await refreshCart();
      return payload;
    },
    [profile?.email, profile?.sellerActiveSellerSlug, profile?.sellerSlug, refreshCart, refreshProfile, user?.uid],
  );

  const deleteSellerAccount = useCallback(async () => {
    const activeUid = profile?.uid ?? user?.uid ?? clientAuth.currentUser?.uid ?? null;
    const sellerSlug = profile?.sellerActiveSellerSlug ?? profile?.sellerSlug ?? "";
    if (!activeUid || !sellerSlug) {
      throw new Error("No seller account was selected.");
    }

    const response = await fetch("/api/client/v1/accounts/seller/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: activeUid,
        sellerSlug,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message || "Unable to delete seller account.");
    }

    await refreshProfile();
    await refreshCart();
    setSellerMessage("Seller account deleted.");
  }, [profile?.sellerActiveSellerSlug, profile?.sellerSlug, profile?.uid, refreshCart, refreshProfile, user?.uid]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      uid: profile?.uid ?? user?.uid ?? null,
      isAuthenticated: Boolean(profile?.uid ?? user?.uid),
      authReady,
      isSeller: profile?.isSeller ?? false,
      systemAccessType: profile?.systemAccessType ?? null,
      favoriteCount: profile?.favoriteCount ?? 0,
      favoriteIds: profile?.favoriteIds ?? [],
      sellerAccessRequested: profile?.sellerAccessRequested ?? false,
      sellerStatus: profile?.sellerStatus ?? null,
      sellerBlockedReasonCode: profile?.sellerBlockedReasonCode ?? null,
      sellerBlockedReasonMessage: profile?.sellerBlockedReasonMessage ?? null,
      sellerBlockedAt: profile?.sellerBlockedAt ?? null,
      sellerBlockedBy: profile?.sellerBlockedBy ?? null,
      sellerReviewRequestStatus: profile?.sellerReviewRequestStatus ?? null,
      sellerReviewRequestedAt: profile?.sellerReviewRequestedAt ?? null,
      sellerReviewRequestedBy: profile?.sellerReviewRequestedBy ?? null,
      sellerReviewRequestMessage: profile?.sellerReviewRequestMessage ?? null,
      sellerReviewResponseStatus: profile?.sellerReviewResponseStatus ?? null,
      sellerReviewResponseAt: profile?.sellerReviewResponseAt ?? null,
      sellerReviewResponseBy: profile?.sellerReviewResponseBy ?? null,
      sellerReviewResponseMessage: profile?.sellerReviewResponseMessage ?? null,
      cartItemCount: cartState.itemCount,
      cartProductCounts: cartState.productCounts,
      cartVariantCounts: cartState.variantCounts,
      openAuthModal,
      closeAuthModal,
      openSellerRegistrationModal,
      closeSellerRegistrationModal,
      signInWithGoogle,
      signOut: handleSignOut,
      refreshProfile,
      refreshCart,
      syncFavoriteState,
      syncCartState,
      leaveSellerTeam,
    }),
    [
      authReady,
      closeSellerRegistrationModal,
      handleSignOut,
      openAuthModal,
      openSellerRegistrationModal,
      profile,
      refreshCart,
      refreshProfile,
      syncFavoriteState,
      syncCartState,
      leaveSellerTeam,
      signInWithGoogle,
      user,
      cartState,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}

      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center px-4 py-6 transition-opacity duration-200 ${
          modal.open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!modal.open}
      >
        <button
          type="button"
          aria-label="Close authentication modal"
          className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ${
            modal.open ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeAuthModal}
        />
        <div className="relative h-[90svh] w-full max-w-[860px] overflow-hidden rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
          <div className="grid h-full overflow-hidden lg:grid-cols-[1.02fr_0.98fr]">
            <div
              className="relative hidden overflow-hidden p-8 text-white lg:flex lg:flex-col lg:justify-between"
              style={{
                backgroundColor: "#171717",
                backgroundImage: 'url("/backgrounds/piessang-repeat-background.png")',
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                backgroundPosition: "center center",
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(17,17,17,0.86)_0%,rgba(17,17,17,0.68)_100%)]" />
              <div className="relative z-10">
                <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2dfaa]">
                  Piessang account
                </p>
                <h2 className="mt-3 max-w-[12ch] text-[34px] font-semibold leading-[0.95]">
                  Welcome to Piessang!
                </h2>
                <p className="mt-4 max-w-[36ch] text-[14px] leading-[1.7] text-white/78">
                  Use email and password first, or sign in with Google if you prefer. We use your
                  Piessang account for authentication and store your profile against the same user
                  record.
                </p>
              </div>
            </div>

            <div className="relative h-full overflow-y-auto p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Image
                    src="/logo/Piessang%20Logo.png"
                    alt="Piessang"
                    width={168}
                    height={48}
                    className="mb-3 h-9 w-auto object-contain"
                    priority
                  />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
                    Piessang account
                  </p>
                  <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#202020]">
                    {mode === "sign-up" ? "Create your account" : "Sign in to keep going"}
                  </h2>
                  <p className="mt-2 text-[13px] leading-[1.5] text-[#57636c]">
                    {modal.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAuthModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c] transition-colors hover:bg-[#ededed]"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 inline-flex rounded-[8px] border border-black/10 bg-[#fafafa] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setAuthMessage(null);
                  }}
                  className={
                    mode === "sign-in"
                    ? "rounded-[8px] bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.08)]"
                      : "rounded-[8px] px-3 py-2 text-[12px] font-semibold text-[#57636c]"
                  }
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-up");
                    setAuthMessage(null);
                  }}
                  className={
                    mode === "sign-up"
                    ? "rounded-[8px] bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.08)]"
                      : "rounded-[8px] px-3 py-2 text-[12px] font-semibold text-[#57636c]"
                  }
                >
                  Sign up
                </button>
              </div>

              {profile ? (
                <div className="mt-5 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#202020]">
                    {profile.displayName}
                  </p>
                  <p className="mt-1 text-[12px] text-[#57636c]">
                    {profile.email || "Signed in"}
                  </p>
                </div>
              ) : null}

              <form
                className="mt-5 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleEmailAuth();
                }}
              >
                {mode === "sign-up" ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                      Display name <span className="text-[#d11c1c]">*</span>
                    </span>
                    <input
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors placeholder:text-[#9aa3af] focus:border-[#cbb26b]"
                      placeholder="Your name"
                    />
                  </label>
                ) : null}

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                    Email address <span className="text-[#d11c1c]">*</span>
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value.replace(/\s+/g, ""))}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors placeholder:text-[#9aa3af] focus:border-[#cbb26b]"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                    Password <span className="text-[#d11c1c]">*</span>
                  </span>
                  <input
                    type="password"
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors placeholder:text-[#9aa3af] focus:border-[#cbb26b]"
                    placeholder="••••••••"
                  />
                </label>

                {authMessage ? (
                  <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
                    {authMessage}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center rounded-[8px] bg-[#202020] px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-wait disabled:opacity-70"
                >
                  {mode === "sign-up" ? "Create account" : "Sign in"}
                </button>
              </form>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-3 rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:bg-[rgba(203,178,107,0.08)] disabled:cursor-wait disabled:opacity-70"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                      <path fill="#4285F4" d="M24 19.5v9h12.7c-.55 3.08-2.23 5.68-4.74 7.4l7.67 5.95c4.48-4.13 7.07-10.23 7.07-17.45 0-1.68-.15-3.28-.45-4.9H24Z" />
                      <path fill="#34A853" d="M11.1 28.5 9.46 29.74l-5.82 4.53C6.96 40.45 14.78 45 24 45c6.37 0 11.72-2.08 15.62-5.67l-7.67-5.95c-2.11 1.42-4.82 2.26-7.95 2.26-6.1 0-11.28-4.12-13.12-9.68Z" />
                      <path fill="#FBBC05" d="M9.46 18.26l-1.64-1.25-5.82-4.53A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.58 10.71l6.88-5.34C8.58 27.11 8.1 25.65 8.1 24s.48-3.11 1.36-5.74Z" />
                      <path fill="#EA4335" d="M24 9.5c3.48 0 6.59 1.2 9.06 3.56l6.79-6.79C35.69 2.57 30.55 0 24 0 14.78 0 6.96 4.55 2.58 11.29l6.88 5.34C12.72 13.62 17.9 9.5 24 9.5Z" />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    </span>
                  Continue with Google
                </button>
              </div>

              {profile || user ? (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                  className="mt-3 w-full rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[13px] font-semibold text-[#57636c] transition-colors hover:border-[#cbb26b] hover:text-[#202020] disabled:cursor-wait disabled:opacity-70"
                >
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[75] flex items-center justify-center px-4 py-6 transition-opacity duration-200 ${
          sellerModal.open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!sellerModal.open}
      >
        <button
          type="button"
          aria-label="Close seller registration modal"
          className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ${
            sellerModal.open ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeSellerRegistrationModal}
        />
        <div className="relative h-[90svh] w-full max-w-[980px] overflow-hidden rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
          <div
            className={`grid h-full overflow-hidden ${
              sellerModal.status === "success" ? "lg:grid-cols-1" : "lg:grid-cols-[1fr_1.02fr]"
            }`}
          >
            {sellerModal.status === "success" ? null : (
              <div
                className="relative hidden overflow-hidden p-8 text-white lg:flex lg:flex-col lg:justify-between"
                style={{
                  backgroundColor: "#171717",
                  backgroundImage: 'url("/backgrounds/piessang-repeat-background.png")',
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                  backgroundPosition: "center center",
                }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(17,17,17,0.86)_0%,rgba(17,17,17,0.68)_100%)]" />
                <div className="relative z-10">
                  <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2dfaa]">
                    Welcome to Piessang
                  </p>
                  <h2 className="mt-3 max-w-[14ch] text-[34px] font-semibold leading-[0.95]">
                    Welcome to Piessang!
                  </h2>
                  <p className="mt-4 max-w-[36ch] text-[14px] leading-[1.7] text-white/78">
                    Set up your vendor profile and unlock access to a growing marketplace network - no
                    unnecessary steps, just what&apos;s needed to get you live and selling.
                  </p>
                </div>
              </div>
            )}

            <div className="relative h-full overflow-y-auto p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Image
                    src="/logo/Piessang%20Logo.png"
                    alt="Piessang"
                    width={168}
                    height={48}
                    className="mb-3 h-9 w-auto object-contain"
                    priority
                  />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
                    Piessang seller account
                  </p>
                  <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#202020]">
                    {sellerModal.status === "success" ? "Seller registration complete" : "Register as a seller"}
                  </h2>
                  <p className="mt-2 text-[13px] leading-[1.5] text-[#57636c]">
                    {sellerModal.status === "success"
                      ? "Your seller account is active and your dashboard is ready."
                      : sellerModal.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeSellerRegistrationModal}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c] transition-colors hover:bg-[#ededed]"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {sellerModal.status === "success" && sellerSuccess ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#39a96b]">
                      Registration successful
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.6] text-[#202020]">
                    {sellerSuccess.vendorName} is now registered as a seller on Piessang.
                    </p>
                    <dl className="mt-3 grid gap-2 text-[12px] text-[#57636c]">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="font-semibold text-[#202020]">Base location</dt>
                        <dd>{sellerSuccess.baseLocation}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="font-semibold text-[#202020]">Category</dt>
                        <dd>{sellerSuccess.categoryTitle}</dd>
                      </div>
                      {sellerSuccess.subCategory ? (
                        <div className="flex items-center justify-between gap-4">
                          <dt className="font-semibold text-[#202020]">Sub category</dt>
                          <dd>{sellerSuccess.subCategory}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={closeSellerRegistrationModal}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b]"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeSellerRegistrationModal();
                        window.location.href = "/seller/dashboard";
                      }}
                      className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
                    >
                      Go to seller dashboard
                    </button>
                  </div>
                </div>
              ) : sellerHasTeamMemberships || sellerOwnsSellerAccount ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-4">
                    <p className="text-[12px] font-semibold text-[#202020]">
                      {sellerHasTeamMemberships
                        ? "You are already part of a seller team."
                        : "You already have a seller account."}
                    </p>
                    <p className="mt-1 text-[12px] leading-[1.5] text-[#57636c]">
                      {sellerHasTeamMemberships
                        ? "Leave your current team before registering your own seller account."
                        : "You’ll need to delete this seller account before creating another one or joining a different team."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {sellerHasTeamMemberships ? (
                      <button
                        type="button"
                        onClick={() => void leaveSellerTeam(activeSellerTeamMembership?.sellerSlug)}
                        className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
                      >
                        {activeSellerTeamMembership?.vendorName
                          ? `Leave ${activeSellerTeamMembership.vendorName}`
                          : "Leave current team"}
                      </button>
                    ) : sellerOwnsSellerAccount ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            closeSellerRegistrationModal();
                            window.location.href = "/seller/dashboard";
                          }}
                          className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
                        >
                          Open seller dashboard
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSellerAccount()}
                          className="inline-flex h-10 items-center rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#ffeef0]"
                        >
                          Delete seller account
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          closeSellerRegistrationModal();
                          window.location.href = "/seller/dashboard";
                        }}
                        className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
                      >
                        Open seller dashboard
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-5 rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Only your seller details are required.</p>
                    <p className="mt-1 text-[12px] leading-[1.5] text-[#57636c]">
                      Email addresses are saved without spaces. Phone numbers must be 9 South African digits.
                      Category and sub category are optional.
                    </p>
                  </div>

                  <form
                    className="mt-5 space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSellerRegistration();
                    }}
                  >
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                        Vendor name <span className="text-[#d11c1c]">*</span>
                      </span>
                      <input
                        required
                        minLength={3}
                        value={sellerModal.vendorName}
                        onChange={(event) =>
                          setSellerModal((current) => ({
                            ...current,
                            vendorName: sanitizeVendorNameInput(event.target.value),
                          }))
                        }
                        onBlur={(event) =>
                          setSellerModal((current) => ({
                            ...current,
                            vendorName: titleCaseVendorName(event.target.value).slice(0, 30),
                          }))
                        }
                        className={`w-full rounded-[8px] bg-white px-4 py-3 text-[13px] outline-none transition-colors placeholder:text-[#9aa3af] ${
                          vendorNameState === "available"
                            ? "border border-[#39a96b] bg-[rgba(57,169,107,0.06)] focus:border-[#39a96b]"
                            : vendorNameState === "taken"
                              ? "border border-[#d11c1c] focus:border-[#d11c1c]"
                              : "border border-black/10 focus:border-[#cbb26b]"
                        }`}
                        placeholder="Your vendor name"
                      />
                      <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                        This must be unique across Piessang sellers.
                      </p>
                      {sellerNameCheck.checking ? (
                        <p className="mt-1 text-[11px] font-medium text-[#907d4c]">Checking availability...</p>
                      ) : sellerNameCheck.unique === true ? (
                        <p className="mt-1 text-[11px] font-semibold text-[#39a96b]">Vendor name available.</p>
                      ) : sellerNameCheck.unique === false ? (
                        <div className="mt-2 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-2">
                          <p className="text-[11px] font-semibold text-[#b91c1c]">Vendor name already exists.</p>
                          {sellerNameCheck.suggestions.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {sellerNameCheck.suggestions.map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  onClick={() =>
                                    setSellerModal((current) => ({ ...current, vendorName: suggestion }))
                                  }
                                  className="inline-flex items-center rounded-[8px] border border-[#d9b5b8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                        Contact email <span className="text-[#d11c1c]">*</span>
                      </span>
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="email"
                        value={sellerModal.contactEmail}
                        onChange={(event) =>
                          setSellerModal((current) => ({ ...current, contactEmail: sanitizeEmailInput(event.target.value) }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === " ") event.preventDefault();
                        }}
                        onPaste={(event) => {
                          event.preventDefault();
                          const pasted = event.clipboardData.getData("text");
                          setSellerModal((current) => ({
                            ...current,
                            contactEmail: sanitizeEmailInput(`${current.contactEmail}${pasted}`),
                          }));
                        }}
                        className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors placeholder:text-[#9aa3af] focus:border-[#cbb26b]"
                        placeholder="you@example.com"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-[0.38fr_0.62fr]">
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                          Country code <span className="text-[#d11c1c]">*</span>
                        </span>
                        <select
                          required
                          value={sellerModal.countryCode}
                          onChange={(event) =>
                            setSellerModal((current) => ({ ...current, countryCode: sanitizeDigits(event.target.value) }))
                          }
                          className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                        >
                          {SELLER_COUNTRY_CODES.map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                          Phone number <span className="text-[#d11c1c]">*</span>
                        </span>
                        <input
                          required
                          inputMode="numeric"
                          maxLength={9}
                          value={sellerModal.contactPhone}
                          onChange={(event) =>
                            setSellerModal((current) => ({
                              ...current,
                              contactPhone: sanitizeDigits(event.target.value),
                            }))
                          }
                          className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors placeholder:text-[#9aa3af] focus:border-[#cbb26b]"
                          placeholder="821234567"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                        Base location <span className="text-[#d11c1c]">*</span>
                      </span>
                      <select
                        required
                        value={sellerModal.baseLocation}
                        onChange={(event) =>
                          setSellerModal((current) => ({ ...current, baseLocation: event.target.value }))
                        }
                        className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                      >
                        {SELLER_SERVICE_AREAS.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                        Primary product category
                      </span>
                      <select
                        value={sellerModal.category}
                        onChange={(event) =>
                          setSellerModal((current) => ({
                            ...current,
                            category: event.target.value,
                            subCategory: "",
                          }))
                        }
                        className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                      >
                        <option value="">Select a category</option>
                        {SELLER_CATALOGUE_CATEGORIES.map((category) => (
                          <option key={category.slug} value={category.slug}>
                            {category.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                        Optional sub category
                      </span>
                      <select
                        value={sellerModal.subCategory}
                        onChange={(event) =>
                          setSellerModal((current) => ({ ...current, subCategory: event.target.value }))
                        }
                        disabled={!sellerModal.category}
                        className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                      >
                        <option value="">No sub category</option>
                        {sellerSubCategories.map((subCategory) => (
                          <option key={subCategory.slug} value={subCategory.slug}>
                            {subCategory.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    {sellerMessage ? (
                      <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
                        {sellerMessage}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={sellerSubmitting || !sellerFormIsValid}
                        className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-wait disabled:opacity-70"
                      >
                        {sellerSubmitting ? "Registering..." : "Register seller"}
                      </button>
                      <button
                        type="button"
                        onClick={closeSellerRegistrationModal}
                        className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
