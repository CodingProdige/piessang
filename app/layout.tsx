import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Clarity, ClarityPrivacyBoundary } from "@/components/analytics/clarity";
import { AppShell } from "@/components/layout/app-shell";
import { PointerFocusGuard } from "@/components/layout/pointer-focus-guard";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://piessang.com"),
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialAuthBootstrap = await getServerAuthBootstrap();
  const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const googleAdsId = "AW-18066581333";
  const primaryGoogleTagId = googleAnalyticsId || googleAdsId;
  const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();

  return (
    <html lang="en">
      <head>
        <style id="piessang-critical-render">
          {`
            [data-safe-page] {
              width: 100%;
              max-width: 1500px;
              margin: 0 auto;
              padding: 16px 12px 24px;
              color: #202020;
            }
            [data-safe-stack] > * + * {
              margin-top: 16px;
            }
            [data-safe-card] {
              border-radius: 8px;
              background: #ffffff;
              box-shadow: 0 8px 24px rgba(20, 24, 27, 0.07);
            }
            [data-safe-card="padded"] {
              padding: 20px;
            }
            [data-safe-card="header"] {
              padding: 16px 20px;
            }
            [data-safe-grid="product"] {
              display: grid;
              gap: 16px;
            }
            [data-safe-media] {
              position: relative;
              overflow: hidden;
              border-radius: 8px;
              background: #ffffff;
              aspect-ratio: 1 / 1;
            }
            [data-safe-title] {
              margin: 8px 0 0;
              font-size: 28px;
              line-height: 1.1;
              font-weight: 700;
              color: #202020;
            }
            [data-safe-copy] {
              color: #57636c;
              font-size: 14px;
              line-height: 1.7;
            }
            [data-safe-actions] {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
            }
            [data-safe-button] {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-height: 44px;
              border-radius: 8px;
              padding: 0 16px;
              font-size: 14px;
              font-weight: 600;
              text-decoration: none;
            }
            [data-safe-button="primary"] {
              background: #202020;
              color: #ffffff;
            }
            [data-safe-button="secondary"] {
              background: #ffffff;
              color: #202020;
              border: 1px solid rgba(20, 24, 27, 0.12);
            }
            @media (min-width: 1024px) {
              [data-safe-page] {
                padding: 16px 16px 32px;
              }
              [data-safe-grid="product"] {
                grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
                align-items: start;
              }
            }
          `}
        </style>
        {primaryGoogleTagId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${primaryGoogleTagId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                ${googleAnalyticsId ? `gtag('config', '${googleAnalyticsId}');` : ""}
                gtag('config', '${googleAdsId}');
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} bg-[var(--background)] text-[var(--foreground)] antialiased`}
      >
        <PointerFocusGuard />
        <Clarity projectId={clarityProjectId} />
        <ClarityPrivacyBoundary>
          <AppShell initialAuthBootstrap={initialAuthBootstrap}>{children}</AppShell>
        </ClarityPrivacyBoundary>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
