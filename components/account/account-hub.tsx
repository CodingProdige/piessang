"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageBody } from "@/components/layout/page-body";
import {
  AccountListsWorkspace,
  AccountOrdersWorkspace,
  AccountPaymentsWorkspace,
} from "@/components/account/account-sections";

type AccountSection = "overview" | "orders" | "payments" | "profile" | "lists" | "following" | "notifications" | "support" | "policies" | "seller";

type AccountCard = {
  title: string;
  section: Exclude<AccountSection, "overview">;
  icon: string;
  links: Array<{ label: string; href: string }>;
  href?: string;
};

const sectionTitles: Record<AccountSection, string> = {
  overview: "My Account",
  orders: "Orders",
  payments: "Payments & Credit",
  profile: "Profile",
  lists: "My Lists",
  following: "Following",
  notifications: "Notifications",
  support: "Support",
  policies: "Policies",
  seller: "Seller Tools",
};

const accountCards: AccountCard[] = [
  {
    title: "Orders",
    section: "orders" as const,
    icon: "cart",
    links: [
      { label: "Orders", href: "/account/orders" },
      { label: "Invoices", href: "/account/orders/invoices" },
      { label: "Returns", href: "/account/returns" },
      { label: "Product reviews", href: "/account/reviews" },
    ],
    href: "/account/orders",
  },
  {
    title: "Payments & Credit",
    section: "payments" as const,
    icon: "card",
    links: [
      { label: "Credit & refunds", href: "/account/payments" },
    ],
    href: "/account/payments",
  },
  {
    title: "Profile",
    section: "profile" as const,
    icon: "profile",
    links: [
      { label: "Personal details", href: "/account/personal-details" },
      { label: "Notification preferences", href: "/account/notification-preferences" },
      { label: "Address book", href: "/account/address-book" },
      { label: "Newsletter subscriptions", href: "/account/newsletters" },
    ],
    href: "/account/personal-details",
  },
  {
    title: "My Lists",
    section: "lists" as const,
    icon: "heart",
    links: [
      { label: "My favourites", href: "/account?section=lists" },
      { label: "Saved products", href: "/account?section=lists" },
    ],
  },
  {
    title: "Following",
    section: "following" as const,
    icon: "heart",
    links: [
      { label: "Followed sellers", href: "/account/following" },
    ],
    href: "/account/following",
  },
  {
    title: "Notifications",
    section: "notifications" as const,
    icon: "help",
    links: [
      { label: "Product alerts", href: "/account/notifications" },
      { label: "Seller releases", href: "/account/notifications" },
    ],
    href: "/account/notifications",
  },
  {
    title: "Support",
    section: "support" as const,
    icon: "help",
    links: [
      { label: "My tickets", href: "/support/tickets" },
      { label: "Contact Piessang", href: "/contact" },
    ],
    href: "/support/tickets",
  },
  {
    title: "Policies",
    section: "policies" as const,
    icon: "help",
    links: [
      { label: "Delivery policy", href: "/delivery" },
      { label: "Returns policy", href: "/returns" },
      { label: "Payments", href: "/payments" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
    href: "/terms",
  },
];

function CardIcon({ icon }: { icon: string }) {
  const common = "h-6 w-6";
  switch (icon) {
    case "cart":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 4h2l2.2 11h10.6l2-8H6.2" />
          <circle cx="10" cy="19" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="19" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "card":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.8-3.5 5-5 8-5s6.2 1.5 8 5" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="currentColor">
          <path d="M12 20.2c-.2 0-.4-.1-.6-.2-2.8-1.7-8.4-5.8-9.2-10.7C1.6 6 3.5 3.7 6 3.2c1.9-.4 3.8.3 5.2 1.7 1.4-1.4 3.3-2.1 5.2-1.7 2.5.5 4.4 2.8 3.8 6.1-.8 4.9-6.4 9-9.2 10.7-.2.1-.4.2-.6.2Z" />
        </svg>
      );
    case "money":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v18" />
          <path d="M16.5 6.5c0-1.7-2-3-4.5-3S7.5 4.8 7.5 6.5 9.4 9 12 9s4.5 1.2 4.5 2.8S14.5 15 12 15s-4.5-1.2-4.5-2.8" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export function AccountHub() {
  const { isAuthenticated, isSeller, favoriteCount, uid, profile, openAuthModal, openSellerRegistrationModal } = useAuth();
  const searchParams = useSearchParams();
  const section = (searchParams.get("section") as AccountSection) || "overview";
  const activeSection = useMemo(() => (sectionTitles[section] ? section : "overview"), [section]);
  const visibleCards = useMemo(() => {
    if (!isAuthenticated) return accountCards;
    if (!isSeller) return accountCards;
    return [...accountCards];
  }, [isAuthenticated, isSeller]);

  if (!isAuthenticated) {
    return (
      <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Sign in to manage your account</h1>
          <p className="mt-2 max-w-[720px] text-[14px] leading-[1.6] text-[#57636c]">
            Your orders, favourites, delivery details, and seller access all live here once you are signed in.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to access your Piessang account.")}
            className="brand-button mt-5 inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
          >
            Sign in
          </button>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((card) => (
          <div
            key={card.title}
            className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)] transition-shadow hover:shadow-[0_14px_30px_rgba(20,24,27,0.10)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link href={card.href ?? `/account?section=${card.section}`} className="text-[18px] font-semibold text-[#202020]">
                  {card.title}
                </Link>
                <ul className="mt-3 space-y-2 text-[13px] leading-[1.4] text-[#0f80c3]">
                  {card.links.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="underline decoration-[#0f80c3] underline-offset-2">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href={card.href ?? `/account?section=${card.section}`} className="text-[#4a4545]">
                <CardIcon icon={card.icon} />
              </Link>
            </div>
          </div>
        ))}
        </section>

        <section className="mt-6 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[15px] font-semibold text-[#202020]">Sell on Piessang</p>
          <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
            Register your seller account to unlock your catalogue and analytics.
          </p>
          <button
            type="button"
            onClick={() => openSellerRegistrationModal("Register your seller account to unlock catalogue tools.")}
            className="mt-4 inline-flex h-10 items-center rounded-[8px] border border-black bg-white px-4 text-[13px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b]"
          >
            Register as seller
          </button>
        </section>
      </PageBody>
    );
  }

  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">My Account</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[30px] font-semibold text-[#202020]">My Account</h1>
            <p className="mt-2 max-w-[760px] text-[14px] leading-[1.6] text-[#57636c]">
              Browse your orders, manage your profile, review your favourites, and register as a seller when you are ready.
            </p>
            {profile?.email ? (
              <p className="mt-2 text-[12px] font-medium text-[#8b94a3]">
                Signed in as <span className="text-[#202020]">{profile.email}</span>
              </p>
            ) : null}
          </div>
          {isSeller ? (
            <div className="flex gap-2">
              <Link
                href="/seller/dashboard"
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
              >
                Seller dashboard
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visibleCards.map((card) => (
        <div
          key={card.title}
          className={`rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)] transition-shadow hover:shadow-[0_14px_30px_rgba(20,24,27,0.10)] ${activeSection === card.section ? "ring-1 ring-[#cbb26b]/40" : ""}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={card.href ?? `/account?section=${card.section}`} className="text-[18px] font-semibold text-[#202020]">
                {card.title}
              </Link>
              <ul className="mt-3 space-y-2 text-[13px] leading-[1.4] text-[#0f80c3]">
                {card.links.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="underline decoration-[#0f80c3] underline-offset-2">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href={card.href ?? `/account?section=${card.section}`} className="text-[#4a4545]">
              <CardIcon icon={card.icon} />
            </Link>
          </div>
        </div>
      ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
            {sectionTitles[activeSection]}
          </p>
          <h2 className="mt-2 text-[18px] font-semibold text-[#202020]">
            {activeSection === "orders" && "Track orders, invoices, returns, and reviews in one place."}
            {activeSection === "payments" && "View credits, refunds, and payment history for your account."}
            {activeSection === "profile" && "Update business details, security settings, and addresses."}
            {activeSection === "lists" && "Manage favourites and saved products from your storefront activity."}
            {activeSection === "following" && "Review the seller profiles you follow and jump back into their storefronts."}
            {activeSection === "notifications" && "See product alerts, seller releases, and favourite status changes in one inbox."}
            {activeSection === "support" && "Manage support conversations from the dedicated Piessang support area."}
            {activeSection === "policies" && "Read the customer-facing policies that govern shopping on Piessang."}
            {activeSection === "seller" && "Manage your seller catalogue, analytics, and order queue."}
            {activeSection === "overview" && "Everything you need to manage your Piessang profile."}
          </h2>
          <p className="mt-3 max-w-[760px] text-[13px] leading-[1.7] text-[#57636c]">
            {activeSection === "seller"
              ? "Registering as a seller unlocks the marketplace tools on your account."
              : activeSection === "support"
                ? "Open the dedicated support area to view your tickets, reply to Piessang, and close resolved conversations."
                : activeSection === "following"
                  ? "Your followed seller profiles live in their own space so you can keep tabs on the storefronts you care about."
                  : activeSection === "notifications"
                    ? "Your customer alerts now have their own inbox so seller releases and favourite product changes stay easy to follow."
                : activeSection === "policies"
                  ? "Your account actions and your marketplace policies now live in separate places so the account area stays action-focused."
                : "The sections below are now wired to your real customer data, so you can manage the important parts of your account from one place."}
          </p>
          {profile?.email ? (
            <p className="mt-3 text-[12px] font-medium text-[#8b94a3]">
              Signed in as <span className="text-[#202020]">{profile.email}</span>
            </p>
          ) : null}
        </div>

        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller access</p>
          {isSeller ? (
            <>
              <p className="mt-2 text-[13px] font-semibold text-[#202020]">Seller tools enabled</p>
              <Link
                href="/seller/dashboard"
                className="mt-3 inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
              >
                Open seller dashboard
              </Link>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-[13px] leading-[1.7] text-[#57636c]">
                Register as a seller if you want to list products, see analytics, and manage orders from the Piessang marketplace.
              </p>
              <button
                type="button"
                onClick={() => openSellerRegistrationModal("Register your seller account to unlock marketplace tools.")}
                className="brand-button inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
              >
                Register as seller
              </button>
            </div>
          )}
        </div>
      </section>

      {uid ? (
        <section className="mt-6">
          {activeSection === "orders" ? <AccountOrdersWorkspace uid={uid} /> : null}
          {activeSection === "payments" ? <AccountPaymentsWorkspace uid={uid} /> : null}
          {activeSection === "profile" ? null : null}
          {activeSection === "lists" ? <AccountListsWorkspace uid={uid} favoriteCount={favoriteCount} /> : null}
          {activeSection === "support" ? (
            <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[18px] font-semibold text-[#202020]">Support</p>
              <p className="mt-2 max-w-[760px] text-[13px] leading-[1.7] text-[#57636c]">
                Your support tickets now live in their own dedicated support area so replies and updates stay easy to follow.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/support/tickets"
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                >
                  Open my tickets
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Contact Piessang
                </Link>
              </div>
            </div>
          ) : null}
          {activeSection === "policies" ? (
            <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
              <p className="text-[18px] font-semibold text-[#202020]">Policies</p>
              <p className="mt-2 max-w-[760px] text-[13px] leading-[1.7] text-[#57636c]">
                Delivery, returns, payments, privacy, and terms now sit in their own policy area instead of being mixed into your account actions.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/delivery"
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Delivery policy
                </Link>
                <Link
                  href="/returns"
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]"
                >
                  Returns policy
                </Link>
                <Link
                  href="/terms"
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                >
                  Terms
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </PageBody>
  );
}
