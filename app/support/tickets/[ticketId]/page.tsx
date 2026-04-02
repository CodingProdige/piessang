import type { Metadata } from "next";
import { SupportTicketDetailPage } from "@/components/support/support-ticket-detail-page";

export const metadata: Metadata = {
  title: "Support Ticket | Piessang",
  description: "View and reply to your Piessang support ticket.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <SupportTicketDetailPage ticketId={ticketId} />;
}
