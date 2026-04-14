/**
 * sw.js — Service Worker for Photo Journal PWA
 *
 * You do NOT need to edit this file to complete the exercises.
 * It handles offline caching and notifications automatically.
 *
 * How it works:
 *   install  → saves all app files to the browser cache
 *   activate → deletes old caches when you update the version
 *   fetch    → serves cached files so the app works offline
 *   push     → shows a notification sent from a server
 */

// Change this version string whenever you update your app files.
// The activate event will then clean up the old cache automatically.
var CACHE_NAME = 'photo-journal-v1';

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

// ── install: cache all files for offline use ──────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching app files');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ── activate: delete old caches ───────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ── fetch: serve from cache, fall back to network ─────────────
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) return cachedResponse; // Serve offline copy
      return fetch(event.request).catch(function() {
        console.log('[SW] Fetch failed (offline):', event.request.url);
      });
    })
  );
});

// ── push: show notification from server ───────────────────────
self.addEventListener('push', function(event) {
  var data  = event.data ? event.data.json() : {};
  var title = data.title || 'Photo Journal';
  var body  = data.body  || 'New notification';
  event.waitUntil(
    self.registration.showNotification(title, { body: body, icon: '/icons/icon-192.png' })
  );
});

// ── notificationclick: open the app when notification tapped ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
