const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export function GET() {
  const source = `
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload && payload.data && typeof payload.data === "object" ? payload.data : {};
  const notification = payload && payload.notification && typeof payload.notification === "object" ? payload.notification : {};
  self.registration.showNotification(notification.title || "Task Reminder", {
    body: notification.body || "A task is scheduled to start now.",
    data: {
      route: String(data.route || "/tasklaunch"),
      taskId: String(data.taskId || ""),
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification && event.notification.data && typeof event.notification.data === "object"
    ? event.notification.data
    : {};
  const route = String(data.route || "/tasklaunch");
  const taskId = String(data.taskId || "");
  event.notification && event.notification.close && event.notification.close();
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const targetUrl = new URL(route, self.location.origin).toString();
    for (const client of clientList) {
      client.postMessage({ type: "tasktimer-push-click", route, taskId });
      if ("focus" in client) {
        await client.focus();
      }
      return;
    }
    const opened = await clients.openWindow(targetUrl);
    if (opened) {
      opened.postMessage({ type: "tasktimer-push-click", route, taskId });
    }
  })());
});
`.trim();

  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
