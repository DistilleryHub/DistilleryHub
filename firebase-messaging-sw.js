// firebase-messaging-sw.js — must be served from the site ROOT (not a subfolder)
// so its scope covers the whole origin. Handles push notifications that
// arrive while the app is closed or in the background.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Keep this in sync with the firebaseConfig in index.html.
firebase.initializeApp({
  apiKey: "AIzaSyB63lPTtic1RUjfq-KXWrvtisSGIetXL6k",
  authDomain: "distilleryhub-b1d2d.firebaseapp.com",
  projectId: "distilleryhub-b1d2d",
  storageBucket: "distilleryhub-b1d2d.firebasestorage.app",
  messagingSenderId: "221084904588",
  appId: "1:221084904588:web:f1c47a722b2a7c98509fa9"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "DistilleryHub";
  const body = payload.notification?.body || "You have a new notification";
  self.registration.showNotification(title, {
    body,
    icon: "/favicon.svg",
    badge: "/favicon.svg"
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.FCM_MSG?.fcmOptions?.link || "/";
  event.waitUntil(clients.openWindow(link));
});
