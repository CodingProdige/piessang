import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seller Dashboard",
  description: "Manage your Piessang seller catalogue, orders, warehouse activity, settlements, and notifications.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SellerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
