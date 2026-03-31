"use client";

import { useEffect, useMemo, useState } from "react";

type SupportMessage = {
  docId?: string;
  messageId?: string;
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
    category?: string;
    createdAt?: string;
    updatedAt?: string;
    unreadForSupport?: boolean;
    lastReplyAt?: string;
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

function statusLabel(value: string) {
  const status = toStr(value).toLowerCase();
  if (status === "waiting_on_customer") return "Waiting on customer";
  if (status === "waiting_on_support") return "Waiting on support";
  if (status === "closed") return "Closed";
  return "Open";
}

function getWaitingDays(value?: string) {
  const input = toStr(value);
  if (!input) return 0;
  const ms = Date.now() - new Date(input).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function SellerSupportTicketsWorkspace() {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadTickets(preferredId?: string | null, options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/list?includeMessages=true&adminMode=true", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load support tickets.");
      const rows: SupportTicket[] = Array.isArray(payload?.data?.items) ? payload.data.items : Array.isArray(payload?.data) ? payload.data : [];
      setItems(rows);
      setSelectedId(rows.find((row) => row.docId === preferredId)?.docId || preferredId || rows[0]?.docId || null);
      setReplyById((current) => {
        const next = { ...current };
        for (const row of rows) {
          if (!(row.docId in next)) next[row.docId] = "";
        }
        return next;
      });
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "Unable to load support tickets.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (busyId) return;
      void loadTickets(selectedId, { silent: true });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [selectedId, busyId]);

  const selectedTicket = useMemo(() => items.find((item) => item.docId === selectedId) || items[0] || null, [items, selectedId]);

  async function postReply(ticketId: string) {
    const reply = toStr(replyById[ticketId]);
    if (!reply) return;
    setBusyId(ticketId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, message: reply, adminReply: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to post support reply.");
      setReplyById((current) => ({ ...current, [ticketId]: "" }));
      setMessage("Support reply sent.");
      window.dispatchEvent(new Event("piessang:refresh-admin-badges"));
      await loadTickets(ticketId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to post support reply.");
    } finally {
      setBusyId(null);
    }
  }

  async function closeTicket(ticketId: string) {
    setBusyId(ticketId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, adminClose: true, note: "Ticket closed by Piessang support." }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to close ticket.");
      setMessage("Ticket closed.");
      window.dispatchEvent(new Event("piessang:refresh-admin-badges"));
      await loadTickets(ticketId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to close ticket.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3 text-[13px] text-[#57636c]">
        Review open support tickets, reply to customers, and close the conversation once the issue has been resolved.
      </div>
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}
      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {loading ? (
        <div className="rounded-[8px] bg-white p-5 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">Loading support tickets...</div>
      ) : items.length === 0 ? (
        <div className="rounded-[8px] bg-white p-5 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">No support tickets yet.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.45fr]">
          <div className="space-y-3">
            {items.map((item) => (
              <button
                key={item.docId}
                type="button"
                onClick={() => setSelectedId(item.docId)}
                className={`w-full rounded-[8px] border p-4 text-left ${selectedTicket?.docId === item.docId ? "border-[#cbb26b] bg-[#fffaf0]" : "border-black/5 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[#202020]">{item?.ticket?.subject || "Support ticket"}</p>
                    <p className="mt-1 text-[12px] text-[#57636c]">{item?.customer?.name || "Customer"} • {item?.customer?.email || "No email"}</p>
                    <p className="mt-1 text-[11px] text-[#8b94a3]">
                      {formatDate(item?.ticket?.updatedAt || item?.ticket?.createdAt)}
                      {item?.ticket?.unreadForSupport ? " • New customer reply" : ""}
                      {toStr(item?.ticket?.status).toLowerCase() === "waiting_on_customer" && getWaitingDays(item?.ticket?.lastReplyAt) >= 2
                        ? ` • Waiting ${getWaitingDays(item?.ticket?.lastReplyAt)}d`
                        : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d6940]">
                    {statusLabel(toStr(item?.ticket?.status))}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
            {selectedTicket ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Support queue</p>
                    <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">{selectedTicket?.ticket?.subject || "Support ticket"}</h3>
                    <p className="mt-2 text-[13px] text-[#57636c]">
                      {selectedTicket?.customer?.name || "Customer"} • {selectedTicket?.customer?.email || "No email"} • {statusLabel(toStr(selectedTicket?.ticket?.status))}
                    </p>
                  </div>
                  {toStr(selectedTicket?.ticket?.status).toLowerCase() !== "closed" ? (
                    <button
                      type="button"
                      onClick={() => void closeTicket(selectedTicket.docId)}
                      disabled={busyId === selectedTicket.docId}
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
                      <div key={entry.docId || entry.messageId} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[88%] rounded-[14px] px-4 py-3 text-[13px] leading-6 shadow-[0_4px_16px_rgba(20,24,27,0.05)] ${
                          isCustomer ? "bg-white text-[#202020]" : "bg-[#202020] text-white"
                        }`}>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${isCustomer ? "text-[#907d4c]" : "text-white/70"}`}>
                            {entry?.authorName || (isCustomer ? "Customer" : "Piessang support")}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap">{entry?.body || ""}</p>
                          <p className={`mt-2 text-[11px] ${isCustomer ? "text-[#8b94a3]" : "text-white/65"}`}>{formatDate(entry?.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {toStr(selectedTicket?.ticket?.status).toLowerCase() !== "closed" ? (
                  <div className="space-y-3">
                    <textarea
                      value={replyById[selectedTicket.docId] || ""}
                      onChange={(event) => setReplyById((current) => ({ ...current, [selectedTicket.docId]: event.target.value }))}
                      rows={5}
                      className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                      placeholder="Reply to the customer from the support queue."
                    />
                    <button
                      type="button"
                      onClick={() => void postReply(selectedTicket.docId)}
                      disabled={busyId === selectedTicket.docId || !toStr(replyById[selectedTicket.docId])}
                      className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      Send support reply
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
