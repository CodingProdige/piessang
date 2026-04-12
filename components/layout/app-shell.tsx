"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PiessangHeader } from "@/components/header/mega-menu";
import { ClientTitleSync } from "@/components/layout/client-title-sync";
import { PiessangFooter } from "@/components/footer/site-footer";
import { AuthProvider } from "@/components/auth/auth-provider";
import { DisplayCurrencyProvider } from "@/components/currency/display-currency-provider";
import type { AuthBootstrap } from "@/lib/auth/bootstrap";

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
        <Suspense fallback={children}>
          <AppShellFrame>{children}</AppShellFrame>
        </Suspense>
      </DisplayCurrencyProvider>
    </AuthProvider>
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
  const hideFooter =
    isLandingPreview ||
    pathname === "/seller/dashboard" &&
    searchParams.get("section") === "admin-landing-builder";
  const hideHeader = isLandingPreview;

  return (
    <>
      <ClientTitleSync />
      {!hideHeader ? <PiessangHeader showMegaMenu={isHome} /> : null}
      {children}
      {!hideFooter ? <PiessangFooter /> : null}
    </>
  );
}
