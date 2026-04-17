"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { ClientTitleSync } from "@/components/layout/client-title-sync";
import { SiteBreadcrumbs } from "@/components/layout/site-breadcrumbs";
import { PiessangFooter } from "@/components/footer/site-footer";
import { AuthProvider } from "@/components/auth/auth-provider";
import { DisplayCurrencyProvider } from "@/components/currency/display-currency-provider";
import type { AuthBootstrap } from "@/lib/auth/bootstrap";

const PiessangHeader = dynamic(
  () => import("@/components/header/mega-menu").then((mod) => mod.PiessangHeader),
  {
    ssr: false,
    loading: () => (
      <div className="border-b border-black/6 bg-white/95 shadow-[0_6px_18px_rgba(20,24,27,0.04)]">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-3 py-3 lg:px-4">
          <div className="h-11 w-[160px] rounded-[14px] bg-[linear-gradient(135deg,#f7edbf,#f2d774)]" />
          <div className="h-11 flex-1 rounded-[14px] bg-[#f3f4f6]" />
          <div className="hidden h-11 w-[132px] rounded-[14px] bg-[#f3f4f6] sm:block" />
        </div>
      </div>
    ),
  },
);

export function AppShell({
  children,
  initialAuthBootstrap,
}: {
  children: React.ReactNode;
  initialAuthBootstrap?: AuthBootstrap;
}) {
  return (
    <AuthProvider initialAuthBootstrap={initialAuthBootstrap}>
      <DisplayCurrencyProvider>
        <Suspense fallback={<AppShellFallback>{children}</AppShellFallback>}>
          <AppShellFrame>{children}</AppShellFrame>
        </Suspense>
      </DisplayCurrencyProvider>
    </AuthProvider>
  );
}

function AppShellFallback({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="border-b border-black/6 bg-white/95 shadow-[0_6px_18px_rgba(20,24,27,0.04)]">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-3 py-3 lg:px-4">
          <div className="h-11 w-[160px] rounded-[14px] bg-[linear-gradient(135deg,#f7edbf,#f2d774)]" />
          <div className="h-11 flex-1 rounded-[14px] bg-[#f3f4f6]" />
          <div className="hidden h-11 w-[132px] rounded-[14px] bg-[#f3f4f6] sm:block" />
        </div>
      </div>
      <div className="flex-1">{children}</div>
      <div className="mt-8 border-t border-black/6 bg-white">
        <div className="mx-auto w-full max-w-[1500px] px-3 py-8 lg:px-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-4 w-24 rounded-full bg-[#eceff3]" />
            <div className="h-4 w-28 rounded-full bg-[#eceff3]" />
            <div className="h-4 w-20 rounded-full bg-[#eceff3]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShellFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHome = pathname === "/";
  const isLandingPreview = pathname === "/preview/landing-page";
  const hideFooter = isLandingPreview || (pathname === "/seller/dashboard" && searchParams.get("section") === "admin-landing-builder");
  const hideHeader = isLandingPreview;

  return (
    <div className="flex min-h-screen flex-col">
      <ClientTitleSync />
      {!hideHeader ? <PiessangHeader showMegaMenu={isHome} /> : null}
      {!hideHeader ? <SiteBreadcrumbs /> : null}
      <div className="flex-1">{children}</div>
      {!hideFooter ? <PiessangFooter /> : null}
    </div>
  );
}
