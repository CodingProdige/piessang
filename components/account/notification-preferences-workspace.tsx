"use client";

import { useEffect, useState } from "react";

type NotificationPreferences = {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  notificationTopics: {
    orders: boolean;
    delivery: boolean;
    returns: boolean;
    support: boolean;
    promotions: boolean;
    account: boolean;
    following: boolean;
    favorites: boolean;
  };
};

const defaultPreferences: NotificationPreferences = {
  emailNotifications: true,
  smsNotifications: true,
  pushNotifications: true,
  notificationTopics: {
    orders: true,
    delivery: true,
    returns: true,
    support: true,
    promotions: false,
    account: true,
    following: true,
    favorites: true,
  },
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-[8px] border border-black/5 px-4 py-4">
      <span className="block">
        <span className="block text-[14px] font-semibold text-[#202020]">{label}</span>
        <span className="mt-1 block text-[13px] leading-6 text-[#57636c]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0"
      />
    </label>
  );
}

export function NotificationPreferencesWorkspace({ uid }: { uid: string }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/client/v1/accounts/preferences/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load your notification preferences.");
        }
        if (!cancelled) {
          setPreferences(payload?.data?.preferences || defaultPreferences);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your notification preferences.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/preferences/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, preferences }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save your notification preferences.");
      }
      setPreferences(payload?.data?.preferences || preferences);
      setMessage("Your notification preferences were updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-4 py-3">
        <p className="text-[16px] font-semibold text-[#202020]">Notification preferences</p>
        <p className="mt-1 text-[13px] leading-6 text-[#57636c]">
          Choose which Piessang updates you want to receive and which channels we can use to contact you.
        </p>
      </div>

      {error ? <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">{error}</div> : null}
      {message ? <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">{message}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Channels</p>
          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading your notification channels...</p>
          ) : (
            <div className="mt-4 space-y-3">
              <ToggleRow
                label="Email notifications"
                description="Receive order, support, returns, and account updates by email."
                checked={preferences.emailNotifications}
                onChange={(checked) => setPreferences((current) => ({ ...current, emailNotifications: checked }))}
              />
              <ToggleRow
                label="SMS notifications"
                description="Receive time-sensitive updates like fulfilment and support messages by SMS."
                checked={preferences.smsNotifications}
                onChange={(checked) => setPreferences((current) => ({ ...current, smsNotifications: checked }))}
              />
              <ToggleRow
                label="Push notifications"
                description="Receive Piessang notifications on supported devices when push is available."
                checked={preferences.pushNotifications}
                onChange={(checked) => setPreferences((current) => ({ ...current, pushNotifications: checked }))}
              />
            </div>
          )}
        </div>

        <div className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <p className="text-[18px] font-semibold text-[#202020]">Types of notifications</p>
          {loading ? (
            <p className="mt-4 text-[13px] text-[#57636c]">Loading your notification types...</p>
          ) : (
            <div className="mt-4 space-y-3">
              <ToggleRow
                label="Orders and payments"
                description="Order confirmations, payment updates, invoice-ready notices, and purchase activity."
                checked={preferences.notificationTopics.orders}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, orders: checked },
                  }))
                }
              />
              <ToggleRow
                label="Delivery and fulfilment"
                description="Dispatch, delivery progress, collection, and arrival-related updates."
                checked={preferences.notificationTopics.delivery}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, delivery: checked },
                  }))
                }
              />
              <ToggleRow
                label="Returns and refunds"
                description="Return case changes, refund progress, and credit note updates."
                checked={preferences.notificationTopics.returns}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, returns: checked },
                  }))
                }
              />
              <ToggleRow
                label="Support tickets"
                description="Replies, reminders, and support ticket status changes."
                checked={preferences.notificationTopics.support}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, support: checked },
                  }))
                }
              />
              <ToggleRow
                label="Promotions and offers"
                description="Deals, sales, marketing offers, and promotional messages from Piessang."
                checked={preferences.notificationTopics.promotions}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, promotions: checked },
                  }))
                }
              />
              <ToggleRow
                label="Followed seller releases"
                description="New product releases from seller profiles you follow."
                checked={preferences.notificationTopics.following}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, following: checked },
                  }))
                }
              />
              <ToggleRow
                label="Favourite product alerts"
                description="Sale changes, back-in-stock, and out-of-stock alerts for products you have favourited."
                checked={preferences.notificationTopics.favorites}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, favorites: checked },
                  }))
                }
              />
              <ToggleRow
                label="Account notices"
                description="Important updates about your account, profile, and customer settings."
                checked={preferences.notificationTopics.account}
                onChange={(checked) =>
                  setPreferences((current) => ({
                    ...current,
                    notificationTopics: { ...current.notificationTopics, account: checked },
                  }))
                }
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="mt-5 inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}
