"use client";

import { usePathname } from "next/navigation";
import { PiessangHeader } from "@/components/header/mega-menu";
import { PiessangFooter } from "@/components/footer/site-footer";
import { AuthProvider } from "@/components/auth/auth-provider";
import type { AuthBootstrap } from "@/lib/auth/bootstrap";

export function AppShell({
  children,
  initialAuthBootstrap,
}: {
  children: React.ReactNode;
  initialAuthBootstrap: AuthBootstrap;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <AuthProvider initialAuthBootstrap={initialAuthBootstrap}>
      <PiessangHeader showMegaMenu={isHome} />
      {children}
      <PiessangFooter />
    </AuthProvider>
  );
}
