"use client";

import { useEffect, useMemo, useState } from "react";
import { SupportTicketForm } from "@/components/support/support-ticket-form";

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
    ticketId?: string;
    subject?: string;
    category?: string;
    status?: string;
    active?: boolean;
    createdAt?: string;
    updatedAt?: string;
    unreadForCustomer?: boolean;
  };
  customer?: {
    name?: string;
    email?: string;
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

export function AccountSupportWorkspace() {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  async function loadTickets(preferredTicketId?: string | null, options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/list?includeMessages=true", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load your support tickets.");
      const rows: SupportTicket[] = Array.isArray(payload?.data?.items) ? payload.data.items : Array.isArray(payload?.data) ? payload.data : [];
      setItems(rows);
      const targetId = preferredTicketId || selectedTicketId;
      const nextSelected = rows.find((row) => row.docId === targetId)?.docId || rows[0]?.docId || null;
      setSelectedTicketId(nextSelected);
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "Unable to load your support tickets.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (busy) return;
      void loadTickets(selectedTicketId, { silent: true });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [selectedTicketId, busy]);

  const activeTicket = useMemo(
    () => items.find((item) => ["open", "waiting_on_support", "waiting_on_customer"].includes(toStr(item?.ticket?.status).toLowerCase())) || null,
    [items],
  );
  const selectedTicket = useMemo(
    () => items.find((item) => item.docId === selectedTicketId) || activeTicket || null,
    [items, selectedTicketId, activeTicket],
  );

  async function sendReply() {
    if (!selectedTicket?.docId || !replyBody.trim()) return;
    setBusy(selectedTicket.docId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.docId,
          message: replyBody,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to send your reply.");
      setReplyBody("");
      setMessage("Your reply was added to the ticket.");
      await loadTickets(selectedTicket.docId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send your reply.");
    } finally {
      setBusy(null);
    }
  }

  async function closeTicket(ticketId: string) {
    setBusy(ticketId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to close that support ticket.");
      setMessage("Your ticket has been closed.");
      await loadTickets(ticketId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to close that support ticket.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        Submit a support ticket, keep all replies in one place, and close the ticket once your issue has been resolved. You can only keep one active ticket open at a time.
      </div>

      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}

      {!activeTicket ? (
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Open a new support ticket</p>
          <p className="mt-2 text-[13px] leading-6 text-[#57636c]">
            Start one conversation for your current issue and we’ll keep updates here in your account.
          </p>
          <div className="mt-5">
            <SupportTicketForm onTicketCreated={(ticketId) => void loadTickets(ticketId)} />
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[8px] bg-white p-5 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">Loading your tickets...</div>
      ) : items.length === 0 ? null : (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.4fr]">
          <div className="space-y-3">
            {items.map((item) => {
              const active = item.docId === selectedTicket?.docId;
              return (
                <button
                  key={item.docId}
                  type="button"
                  onClick={() => setSelectedTicketId(item.docId)}
                  className={`w-full rounded-[8px] border p-4 text-left transition-colors ${
                    active ? "border-[#cbb26b] bg-[#fffaf0]" : "border-black/5 bg-white hover:bg-[#fcfcfc]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-[#202020]">{item?.ticket?.subject || "Support ticket"}</p>
                      <p className="mt-1 text-[12px] text-[#8b94a3]">
                        {formatDate(item?.ticket?.updatedAt || item?.ticket?.createdAt)}
                        {item?.ticket?.unreadForCustomer ? " • New reply from Piessang" : ""}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d6940]">
                      {getStatusLabel(toStr(item?.ticket?.status))}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            {selectedTicket ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Support ticket</p>
                    <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">{selectedTicket?.ticket?.subject || "Support ticket"}</h3>
                    <p className="mt-2 text-[13px] text-[#57636c]">
                      {getStatusLabel(toStr(selectedTicket?.ticket?.status))} • Opened {formatDate(selectedTicket?.ticket?.createdAt)}
                    </p>
                  </div>
                  {toStr(selectedTicket?.ticket?.status).toLowerCase() !== "closed" ? (
                    <button
                      type="button"
                      onClick={() => void closeTicket(selectedTicket.docId)}
                      disabled={busy === selectedTicket.docId}
                      className="inline-flex h-10 items-center rounded-[8px] border border-[#f0c7cb] px-4 text-[13px] font-semibold text-[#b91c1c] disabled:opacity-50"
                    >
                      Close ticket
                    </button>
                  ) : null}
                </div>

                <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                  {(selectedTicket.messages || []).map((entry) => {
                    const isCustomer = toStr(entry?.authorType).toLowerCase() === "customer";
                    return (
                      <div key={entry.docId || entry.messageId} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-[14px] px-4 py-3 text-[13px] leading-6 shadow-[0_4px_16px_rgba(20,24,27,0.05)] ${
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

                {toStr(selectedTicket?.ticket?.status).toLowerCase() !== "closed" ? (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Reply on this ticket</span>
                      <textarea
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        rows={5}
                        className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                        placeholder="Add more detail or reply to Piessang support."
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={busy === selectedTicket.docId || !replyBody.trim()}
                      className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      Send reply
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
                    This ticket has been closed. You can open a new support ticket whenever you need more help.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
