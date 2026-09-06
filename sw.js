// DEPRECATED — this file is no longer used.
// Its caching logic has been merged into firebase-messaging-sw.js because a
// page can only be controlled by one service worker per scope, and this
// file was never actually registered anywhere in index.html (it was dead
// code). It is kept here only so that, if it was ever manually registered,
// the browser will fetch this stub, see it does nothing, and clean up.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});
