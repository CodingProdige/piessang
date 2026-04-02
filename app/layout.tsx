import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AppShell } from "@/components/layout/app-shell";
import { getServerAuthBootstrap } from "@/lib/auth/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://piessang.co.za"),
  title: {
    default: "Piessang | Marketplace, Delivery, and Seller Tools",
    template: "%s | Piessang",
  },
  description:
    "Piessang is a curated marketplace where customers discover products, track fulfilment, and shop across trusted sellers with secure checkout and delivery support.",
  applicationName: "Piessang",
  openGraph: {
    type: "website",
    siteName: "Piessang",
    title: "Piessang | Marketplace, Delivery, and Seller Tools",
    description:
      "Discover products from trusted sellers, check out securely, and manage orders, delivery, and seller tools through Piessang.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Piessang | Marketplace, Delivery, and Seller Tools",
    description:
      "Discover products from trusted sellers, check out securely, and manage orders, delivery, and seller tools through Piessang.",
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialAuthBootstrap = await getServerAuthBootstrap();
  const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  return (
    <html lang="en">
      <head>
        {googleAnalyticsId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${googleAnalyticsId}');
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} bg-[var(--background)] text-[var(--foreground)] antialiased`}
      >
        <AppShell initialAuthBootstrap={initialAuthBootstrap}>{children}</AppShell>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
