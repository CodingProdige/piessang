"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { PageBody } from "@/components/layout/page-body";
import { SellerPageIntro } from "@/components/seller/page-intro";

const sellerLinks = [
  {
    title: "Create new product",
    description: "Start a new product listing with category, brand, description, and images.",
    href: "/seller/catalogue/new",
    cta: "Create product",
  },
  {
    title: "Manage products",
    description: "Review your existing catalogue items and prepare them for publishing.",
    href: "/seller/dashboard?section=catalogue",
    cta: "Open dashboard",
  },
  {
    title: "Track selling activity",
    description: "Use analytics and order views to follow how your products are performing.",
    href: "/seller/dashboard?section=analytics",
    cta: "View analytics",
  },
];

export default function SellerCataloguePage() {
  const { isAuthenticated, isSeller, openAuthModal, openSellerRegistrationModal, sellerStatus } = useAuth();

  const sellerStateLabel =
    sellerStatus === "active" || isSeller
      ? "Seller tools enabled"
      : sellerStatus === "requested" || sellerStatus === "pending" || sellerStatus === "under_review"
        ? "Registration in progress"
        : "Seller access required";

  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <SellerPageIntro
        title="Seller catalogue"
        description="Use this page to get into product creation and catalogue management."
      />

      <section className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href="/seller/dashboard"
          className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
        >
          Back to seller dashboard
        </Link>
        {isAuthenticated ? (
          isSeller ? (
            <Link
              href="/seller/catalogue/new"
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Create product
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openSellerRegistrationModal("Register your seller account to unlock catalogue tools.")}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Register as seller
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to access seller catalogue tools.")}
            className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
          >
            Sign in
          </button>
        )}
        <span className="inline-flex rounded-full bg-[rgba(203,178,107,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">
          {sellerStateLabel}
        </span>
      </section>

      {isSeller ? (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sellerLinks.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)] transition-shadow hover:shadow-[0_14px_30px_rgba(20,24,27,0.10)]"
            >
              <p className="text-[18px] font-semibold text-[#202020]">{item.title}</p>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">{item.description}</p>
              <p className="mt-4 text-[13px] font-semibold text-[#0f80c3] underline decoration-[#0f80c3] underline-offset-2">
                {item.cta}
              </p>
            </Link>
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[13px] font-semibold text-[#202020]">Seller access required</p>
          <p className="mt-2 max-w-[820px] text-[13px] leading-[1.7] text-[#57636c]">
            Once your seller registration is approved, this page becomes the starting point for product creation and
            catalogue management.
          </p>
        </section>
      )}
    </PageBody>
  );
}
