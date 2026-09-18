importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB63lPTtic1RUjfq-KXWrvtisSGIetXL6k",
  authDomain: "distilleryhub-b1d2d.firebaseapp.com",
  projectId: "distilleryhub-b1d2d",
  storageBucket: "distilleryhub-b1d2d.firebasestorage.app",
  messagingSenderId: "221084904588",
  appId: "1:221084904588:web:f1c47a722b2a7c98509fa9",
});

const messaging = firebase.messaging();

// self.registration.scope is the SW's own root URL (e.g.
// "https://site.pages.dev/" or "https://user.github.io/DistilleryHub/") —
// reading the path out of it gives us the same '/' vs '/DistilleryHub/'
// value Vite's BASE_URL gives the app at build time, but computed here at
// runtime so this file needs zero per-platform edits.
const BASE_URL = new URL(self.registration.scope).pathname; // '/' or '/DistilleryHub/'

// App band ho ya background mein ho, tab yeh chalega
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'DistilleryHub';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: `${BASE_URL}icon-192.png`,
    badge: `${BASE_URL}icon-192.png`,
    data: { url: payload.data?.url || BASE_URL },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || BASE_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ---------------- Purana caching logic — bilkul waisa hi, unchanged ----------------

const CACHE_NAME = 'distilleryhub-v4';
const OFFLINE_URL = BASE_URL;

const PRECACHE_ASSETS = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}styles.css`,
  `${BASE_URL}manifest.json`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (
    request.url.includes('firestore.googleapis.com') ||
    request.url.includes('googleapis.com') ||
    request.url.includes('cloudinary.com') ||
    request.url.includes('firebaseapp.com')
  ) {
    return;
  }

  if (request.method !== 'GET') return;

  const isStaticAsset =
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.url.includes('fonts.googleapis.com') ||
    request.url.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match(OFFLINE_URL);
        })
      )
  );
});
