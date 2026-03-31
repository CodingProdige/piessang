"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SupportMessage = {
  messageId?: string;
  docId?: string;
  authorType?: string;
  authorName?: string;
  body?: string;
  createdAt?: string;
};

type SupportTicket = {
  docId: string;
  ticket?: {
    subject?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  messages?: SupportMessage[];
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatDate(value?: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function getStatusLabel(status: string) {
  const value = toStr(status).toLowerCase();
  if (value === "waiting_on_support") return "Waiting on support";
  if (value === "waiting_on_customer") return "Waiting on you";
  if (value === "closed") return "Closed";
  return "Open";
}

export function SupportTicketDetailPage({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadTicket(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/list?includeMessages=true", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load your support ticket.");
      const rows: SupportTicket[] = Array.isArray(payload?.data?.items) ? payload.data.items : Array.isArray(payload?.data) ? payload.data : [];
      const current = rows.find((row) => row.docId === ticketId) || null;
      if (!current) throw new Error("We could not find that support ticket in your account.");
      setTicket(current);
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "Unable to load your support ticket.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTicket();
  }, [ticketId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (busy) return;
      void loadTicket({ silent: true });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [ticketId, busy]);

  async function sendReply() {
    if (!ticket?.docId || !replyBody.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.docId, message: replyBody }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to send your reply.");
      setReplyBody("");
      setMessage("Your reply was added to the ticket.");
      await loadTicket();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send your reply.");
    } finally {
      setBusy(false);
    }
  }

  async function closeTicket() {
    if (!ticket?.docId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.docId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to close your support ticket.");
      setMessage("Your support ticket has been closed.");
      await loadTicket();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to close your support ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[980px] px-4 py-8 lg:px-6 lg:py-12">
      <div className="rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Support ticket</p>
            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#202020]">{ticket?.ticket?.subject || "Support conversation"}</h1>
            <p className="mt-3 text-[14px] leading-7 text-[#57636c]">
              View updates from Piessang, reply directly on the ticket, and close the conversation once the issue has been resolved.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f4f1e8] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d6940]">
              {getStatusLabel(toStr(ticket?.ticket?.status))}
            </span>
            <Link href="/account?section=support" className="inline-flex h-10 items-center rounded-[10px] border border-black/10 px-4 text-[13px] font-semibold text-[#202020]">
              Back to support
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-[18px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(20,24,27,0.06)] lg:p-8">
        {error ? <div className="rounded-[12px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
        {message ? <div className="mb-4 rounded-[12px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
        {loading ? (
          <div className="text-[14px] text-[#57636c]">Loading your support ticket...</div>
        ) : ticket ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="text-[13px] text-[#57636c]">
                <p>Opened {formatDate(ticket?.ticket?.createdAt)} • Last updated {formatDate(ticket?.ticket?.updatedAt)}</p>
                <p className="mt-1">Ticket ID: <span className="font-semibold text-[#202020]">{ticket.docId}</span></p>
              </div>
              {toStr(ticket?.ticket?.status).toLowerCase() !== "closed" ? (
                <button
                  type="button"
                  onClick={() => void closeTicket()}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-[10px] border border-[#f0c7cb] px-4 text-[13px] font-semibold text-[#b91c1c] disabled:opacity-50"
                >
                  Close ticket
                </button>
              ) : null}
            </div>
            <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-[14px] border border-black/5 bg-[#fafafa] p-4">
              {(ticket.messages || []).map((entry) => {
                const isCustomer = toStr(entry?.authorType).toLowerCase() === "customer";
                return (
                  <div key={entry.docId || entry.messageId} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-[14px] px-4 py-3 text-[14px] leading-6 shadow-[0_4px_16px_rgba(20,24,27,0.05)] ${
                      isCustomer ? "bg-[#202020] text-white" : "bg-white text-[#202020]"
                    }`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${isCustomer ? "text-white/70" : "text-[#907d4c]"}`}>
                        {isCustomer ? "You" : entry?.authorName || "Piessang support"}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">{entry?.body || ""}</p>
                      <p className={`mt-2 text-[11px] ${isCustomer ? "text-white/65" : "text-[#8b94a3]"}`}>{formatDate(entry?.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {toStr(ticket?.ticket?.status).toLowerCase() !== "closed" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Reply on this ticket</span>
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    rows={6}
                    className="w-full rounded-[10px] border border-black/10 px-3 py-3 text-[14px] outline-none focus:border-[#cbb26b]"
                    placeholder="Reply to Piessang support here."
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={busy || !replyBody.trim()}
                  className="inline-flex h-11 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  Send reply
                </button>
              </div>
            ) : (
              <div className="rounded-[12px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
                This ticket has been closed. If you still need help, you can open a new support ticket from the contact or account support page.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
