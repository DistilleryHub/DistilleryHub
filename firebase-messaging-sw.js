// firebase-messaging-sw.js — must be served from the site ROOT (not a subfolder)
// so its scope covers the whole origin.
//
// FIX (bug): this used to be registered *alongside* a separate sw.js that
// also claimed the root scope for offline caching. A page can only be
// controlled by ONE service worker per scope, so whichever one registered
// last silently took over and the other's logic (including all of the
// offline caching in the old sw.js) never ran. This file now does both
// jobs — push notifications AND offline caching — so there is only one
// service worker for the app to register.

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
    // FIX (bug): SVG is not a supported notification icon format in Chrome/
    // Edge/most browsers — the icon silently failed to show. Use the PNG.
    icon: "/icon-192.png",
    badge: "/icon-192.png"
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.FCM_MSG?.fcmOptions?.link || "/";
  event.waitUntil(clients.openWindow(link));
});

/* ---------------------------------------------------------------- */
/* Offline caching (merged in from the former standalone sw.js)      */
/* ---------------------------------------------------------------- */

const CACHE = "tdm-v23";
const ASSETS = ["/", "/index.html", "/robots.txt", "/sitemap.xml", "/manifest.json",
  "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
