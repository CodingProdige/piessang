export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentType = "application/javascript; charset=utf-8";

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_APP_ID || "",
  };

  const body = `
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notification = payload && payload.notification ? payload.notification : {};
  const data = payload && payload.data ? payload.data : {};
  const title = notification.title || "Piessang Notification";
  const options = {
    body: notification.body || "You have a new message.",
    icon: "/favicon-for-public/web-app-manifest-192x192.png",
    badge: "/favicon-for-public/web-app-manifest-192x192.png",
    data: {
      link: data.link || data.deeplink || "/",
    },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const target = event.notification && event.notification.data && event.notification.data.link
    ? event.notification.data.link
    : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
      return undefined;
    })
  );
});
`;

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
