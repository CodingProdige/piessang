"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";

const TICKET_CATEGORIES = [
  {
    value: "order",
    label: "Order issue",
    issues: [
      { value: "order_status", label: "Order status or missing update" },
      { value: "wrong_item", label: "Wrong item received" },
      { value: "missing_item", label: "Missing item" },
      { value: "damaged_item", label: "Damaged item" },
    ],
  },
  {
    value: "delivery",
    label: "Shipping",
    issues: [
      { value: "delivery_delay", label: "Shipping delayed" },
      { value: "delivery_fee", label: "Shipping fee question" },
      { value: "tracking_help", label: "Tracking or shipping help" },
      { value: "shipping_help", label: "Shipping issue" },
    ],
  },
  {
    value: "returns",
    label: "Returns or refund",
    issues: [
      { value: "return_request", label: "Start a return" },
      { value: "refund_status", label: "Refund status" },
      { value: "return_rejected", label: "Return rejected" },
      { value: "return_other", label: "Other return issue" },
    ],
  },
  {
    value: "account",
    label: "Account help",
    issues: [
      { value: "sign_in", label: "Sign-in issue" },
      { value: "profile", label: "Profile or address issue" },
      { value: "payment_method", label: "Saved card or payment method" },
      { value: "security", label: "Security or access concern" },
    ],
  },
  {
    value: "seller",
    label: "Seller support",
    issues: [
      { value: "catalogue", label: "Listing or catalogue issue" },
      { value: "orders", label: "Seller order issue" },
      { value: "returns", label: "Seller return issue" },
      { value: "payouts", label: "Payout or settlement issue" },
    ],
  },
  {
    value: "general",
    label: "General question",
    issues: [
      { value: "general_other", label: "General question" },
      { value: "other", label: "Other" },
    ],
  },
] as const;

function makeReadableLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function SupportTicketForm({
  activeTicketId,
  onTicketCreated,
  compact = false,
}: {
  activeTicketId?: string | null;
  onTicketCreated?: (ticketId: string) => void;
  compact?: boolean;
}) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState("general");
  const [issueType, setIssueType] = useState("general_other");
  const [otherIssue, setOtherIssue] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCategory = TICKET_CATEGORIES.find((entry) => entry.value === category) || TICKET_CATEGORIES[TICKET_CATEGORIES.length - 1];

  function updateCategory(nextCategory: string) {
    const categoryEntry = TICKET_CATEGORIES.find((entry) => entry.value === nextCategory) || TICKET_CATEGORIES[TICKET_CATEGORIES.length - 1];
    setCategory(categoryEntry.value);
    setIssueType(categoryEntry.issues[0]?.value || "other");
    setOtherIssue("");
  }

  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      openAuthModal("Sign in to submit a support ticket.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/client/v1/support/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || `${activeCategory.label}: ${issueType === "other" ? otherIssue || "Other" : makeReadableLabel(issueType)}`,
          category,
          issueType,
          otherIssue,
          message,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to create your support ticket.");
      const ticketId = payload?.data?.ticketId || "";
      setSubject("");
      setCategory("general");
      setIssueType("general_other");
      setOtherIssue("");
      setMessage("");
      setSuccess("Your support ticket has been submitted. We’ll keep all updates in your account support area.");
      if (ticketId) {
        onTicketCreated?.(ticketId);
        router.push(`/support/tickets/${ticketId}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create your support ticket.");
    } finally {
      setBusy(false);
    }
  }

  if (activeTicketId) {
    return (
      <div className="rounded-[16px] border border-[#d9e4ef] bg-[#f8fbff] p-4 text-[14px] text-[#31506a]">
        <p className="font-semibold text-[#202020]">You already have an active support ticket</p>
        <p className="mt-2 leading-6">
          We keep one active ticket open at a time so your conversation stays in one place and doesn’t get split across multiple threads.
        </p>
        <Link
          href={`/support/tickets/${activeTicketId}`}
          className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
        >
          View your active ticket
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submitTicket} className="space-y-4">
      {error ? <div className="rounded-[12px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {success ? <div className="rounded-[12px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{success}</div> : null}

      <label className="block">
        <span className="mb-2 block text-[12px] font-semibold text-[#202020]">What do you need help with?</span>
        <select
          value={category}
          onChange={(event) => updateCategory(event.target.value)}
          className="h-11 w-full rounded-[10px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b]"
        >
          {TICKET_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Choose the issue</span>
        <select
          value={issueType}
          onChange={(event) => setIssueType(event.target.value)}
          className="h-11 w-full rounded-[10px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b]"
        >
          {activeCategory.issues.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {issueType === "other" ? (
        <label className="block">
          <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Tell us the issue type</span>
          <input
            value={otherIssue}
            onChange={(event) => setOtherIssue(event.target.value)}
            className="h-11 w-full rounded-[10px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b]"
            placeholder="For example: technical bug, policy question, seller onboarding"
            required
          />
        </label>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Optional subject line</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="h-11 w-full rounded-[10px] border border-black/10 px-3 text-[14px] outline-none focus:border-[#cbb26b]"
          placeholder="Add a short subject if you want to be more specific"
          maxLength={120}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-[12px] font-semibold text-[#202020]">What happened?</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={compact ? 5 : 8}
          className="w-full rounded-[10px] border border-black/10 px-3 py-3 text-[14px] leading-6 outline-none focus:border-[#cbb26b]"
          placeholder="Include your order number, seller name, product title, and the exact problem. The more context you share, the faster we can help."
          required
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center rounded-[10px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Submitting..." : "Submit support ticket"}
      </button>
    </form>
  );
}
