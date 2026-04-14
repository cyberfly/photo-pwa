/**
 * sw.js — Service Worker for Photo Journal PWA
 *
 * A Service Worker runs in the background, separate from your web page.
 * Think of it like a PHP middleware: it intercepts every request the app
 * makes (for HTML, CSS, JS, images) and can serve from a local cache
 * instead of the network. This makes the app work offline.
 *
 * Lifecycle events:
 *   install  → save files to cache
 *   activate → clean up old caches
 *   fetch    → serve from cache or network
 *   push     → show a notification from a server (optional)
 */

// Cache name with a version number.
// IMPORTANT: change 'v1' to 'v2' when you update your files,
// so users get fresh content instead of stale cached files.
var CACHE_NAME = 'photo-journal-v1';

// Files we want to save offline.
// Every file your app needs to run must be listed here.
var FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ──────────────────────────────────────────────────────────────
// EVENT: install
// Runs once when the service worker is first installed.
// We use it to pre-cache all our app files.
// ──────────────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing service worker...');

  // event.waitUntil() keeps the install step open until our
  // async caching work is finished.
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching app files for offline use');
      // addAll() fetches and stores every file in FILES_TO_CACHE
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  // skipWaiting() forces this new SW to activate immediately,
  // instead of waiting for old tabs to close first.
  self.skipWaiting();
});

// ──────────────────────────────────────────────────────────────
// EVENT: activate
// Runs after install, when the SW takes control of the page.
// We use it to delete old caches from previous app versions.
// ──────────────────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    // caches.keys() returns an array of all cache names
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // Delete any cache that is NOT our current version
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // clients.claim() makes this SW control all open pages immediately
  self.clients.claim();
});

// ──────────────────────────────────────────────────────────────
// EVENT: fetch
// Runs every time the app requests any file over the network.
// We check the cache first; if not found, try the network.
// ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  event.respondWith(
    // Look for the requested URL in our cache
    caches.match(event.request).then(function(cachedResponse) {

      // Cache hit: return the cached file immediately (works offline!)
      if (cachedResponse) {
        return cachedResponse;
      }

      // Cache miss: try to fetch from the network
      return fetch(event.request).catch(function() {
        // Network also failed — we're offline with no cache for this file.
        console.log('[SW] Fetch failed (offline, not cached):', event.request.url);
      });
    })
  );
});

// ──────────────────────────────────────────────────────────────
// EVENT: push
// Fires when a push message arrives from a remote server.
// For this demo app we trigger notifications locally in app.js;
// this handler is here so you can extend to real server push later.
// ──────────────────────────────────────────────────────────────
self.addEventListener('push', function(event) {
  console.log('[SW] Push message received');

  // Parse the JSON payload the server sent
  var data = event.data ? event.data.json() : {};
  var title = data.title || 'Photo Journal';
  var body  = data.body  || 'You have a new notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192.png'
    })
  );
});

// ──────────────────────────────────────────────────────────────
// EVENT: notificationclick
// Fires when the user taps a notification.
// We close it and open the app.
// ──────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked');
  event.notification.close();

  // Open (or focus) the app window
  event.waitUntil(
    clients.openWindow('/')
  );
});
