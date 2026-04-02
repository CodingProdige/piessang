import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Account",
  description: "Manage your Piessang account, orders, notifications, saved sellers, and personal details.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
