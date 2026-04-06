"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { clientApp } from "@/lib/firebase";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function getMessagingSupport() {
  if (typeof window === "undefined") return false;
  try {
    const messaging = await import("firebase/messaging");
    return await messaging.isSupported();
  } catch {
    return false;
  }
}

async function ensureWebPushToken(uid: string) {
  const vapidKey = String(process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_VAPID_KEY || "").trim();
  if (!vapidKey || typeof window === "undefined") {
    throw new Error("Web push is not configured yet.");
  }

  const messagingSdk = await import("firebase/messaging");
  const supported = await messagingSdk.isSupported();
  if (!supported) {
    throw new Error("This browser does not support web push.");
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = messagingSdk.getMessaging(clientApp);
  const token = await messagingSdk.getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("Could not get a push token from the browser.");
  }

  await fetch("/api/client/v1/notifications/push/tokens/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      permission: Notification.permission,
      platform: "web",
      scope: registration.scope,
      userAgent: navigator.userAgent,
      uid,
    }),
  });

  window.localStorage.setItem("piessang_push_token", token);
  return token;
}

export function FooterAppActions() {
  const { isAuthenticated, uid } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushSupported, setPushSupported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"install" | "notifications" | null>(null);
  const [ios, setIos] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const messageTimeoutRef = useRef<number | null>(null);

  const standalone = useMemo(() => isStandaloneMode(), []);

  useEffect(() => {
    let cancelled = false;
    setIos(isIosDevice());
    void getMessagingSupport().then((supported) => {
      if (cancelled) return;
      setPushSupported(supported);
      setNotificationPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      tokenRef.current = window.localStorage.getItem("piessang_push_token");
    });

    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallEvent(null);
      setMessage("Piessang is now installed on this device.");
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    if (messageTimeoutRef.current) {
      window.clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = window.setTimeout(() => {
      setMessage(null);
    }, 4000);

    return () => {
      if (messageTimeoutRef.current) {
        window.clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [message]);

  useEffect(() => {
    let detach = () => {};
    let cancelled = false;

    async function setupForegroundMessaging() {
      if (!uid || !isAuthenticated || notificationPermission !== "granted") return;
      try {
        await ensureWebPushToken(uid);
        if (cancelled) return;
        const messagingSdk = await import("firebase/messaging");
        const supported = await messagingSdk.isSupported();
        if (!supported || cancelled) return;
        const messaging = messagingSdk.getMessaging(clientApp);
        detach = messagingSdk.onMessage(messaging, (payload) => {
          const title = payload?.notification?.title || "Piessang Notification";
          const body = payload?.notification?.body || "You have a new message.";
          setMessage(`${title}: ${body}`);
        });
      } catch {
        // ignore silent registration errors here; explicit CTA handles user-facing feedback
      }
    }

    void setupForegroundMessaging();
    return () => {
      cancelled = true;
      detach();
    };
  }, [uid, isAuthenticated, notificationPermission]);

  async function handleInstall() {
    setBusyAction("install");
    setMessage(null);
    try {
      if (installEvent) {
        await installEvent.prompt();
        const result = await installEvent.userChoice;
        setInstallEvent(null);
        if (result?.outcome !== "accepted") {
          setMessage("Install prompt dismissed.");
          return;
        }
        setMessage("Piessang is being installed on this device.");
        return;
      }
      if (ios && !standalone) {
        setShowIosHelp(true);
        return;
      }
      setMessage("Install is not available on this browser right now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete install.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleNotifications() {
    if (!uid || !isAuthenticated) {
      setMessage("Sign in on this device to enable Piessang notifications.");
      return;
    }
    setBusyAction("notifications");
    setMessage(null);
    try {
      if (!pushSupported) {
        throw new Error("This browser does not support web push notifications.");
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }
      tokenRef.current = await ensureWebPushToken(uid);
      setMessage("Notifications are now enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    } finally {
      setBusyAction(null);
    }
  }

  const canInstall = !standalone;
  const canEnableNotifications = pushSupported && notificationPermission !== "granted";
  const hideOnSellerBilling = pathname === "/seller/dashboard" && searchParams.get("section") === "billing";

  if (hideOnSellerBilling) return null;

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-[14px] border border-[#e7deca] bg-[linear-gradient(180deg,#fffaf1_0%,#fffdf8_100%)] px-5 py-5 text-center shadow-[0_10px_28px_rgba(20,24,27,0.05)]">
        <div
          className="pointer-events-none absolute inset-0 bg-center bg-cover bg-no-repeat opacity-[0.08]"
          style={{ backgroundImage: "url('/backgrounds/piessang-repeat-background.png')" }}
        />
        <div className="relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#907d4c]">Get More From Piessang</p>
          <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">Keep Piessang close by</h3>
          <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-[1.7] text-[#6b7280]">
            Install Piessang for faster access from your home screen, then switch on notifications so you never miss order updates, support replies, or important account activity.
          </p>

          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {canInstall ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={busyAction === "install"}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#202020] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#343434] disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <rect x="4" y="18" width="16" height="3" rx="1.5" />
                </svg>
                <span>{ios ? "Install app" : "Install Piessang"}</span>
              </button>
            ) : null}

            {pushSupported ? (
              <button
                type="button"
                onClick={() => void handleNotifications()}
                disabled={busyAction === "notifications" || notificationPermission === "granted"}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[#d8cfb7] bg-white px-5 text-[13px] font-semibold text-[#5f4d21] transition-colors hover:border-[#cbb26b] hover:bg-[#fff8eb] disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9a6 6 0 1 1 12 0v4l1.5 2.5H4.5L6 13z" />
                  <path d="M10 18a2 2 0 0 0 4 0" />
                </svg>
                <span>{notificationPermission === "granted" ? "Notifications enabled" : "Enable notifications"}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {message ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex max-w-[min(92vw,560px)] -translate-x-1/2 items-start gap-3 rounded-[10px] bg-[#202020] px-4 py-3 text-left text-[12px] font-medium text-white shadow-[0_14px_36px_rgba(20,24,27,0.28)]">
          <span className="min-w-0 flex-1">{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close notification"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6 18 18" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
      ) : null}

      {showIosHelp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-[420px] rounded-[12px] bg-white p-5 shadow-[0_16px_40px_rgba(20,24,27,0.24)]">
            <p className="text-[18px] font-semibold text-[#202020]">Install Piessang on iPhone or iPad</p>
            <p className="mt-2 text-[14px] leading-6 text-[#57636c]">
              Open the Share menu in Safari, then choose <strong>Add to Home Screen</strong>. Once the app is on your home screen, open it again and you can enable notifications from the same footer action.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowIosHelp(false)}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
