# Photo Journal PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple offline-capable PWA that lets users capture photos with camera, add descriptions and GPS location, save everything to localStorage, and view saved photos in a gallery grid.

**Architecture:** Single-page app with no framework — pure HTML/CSS/JS. A service worker provides offline caching and notification delivery. All data (photos as base64, metadata) lives in `localStorage`. Playwright MCP is used after each visual task to screenshot and verify the UI.

**Tech Stack:** Vanilla HTML5, CSS3, JavaScript (ES5-friendly), Web App Manifest, Service Worker API, Geolocation API, Notification API, localStorage, Python 3 (icon generation), Playwright MCP (testing)

---

## File Map

| File | Responsibility |
|---|---|
| `manifest.json` | PWA identity, icons, install config |
| `sw.js` | Offline caching, push event, notification click |
| `index.html` | App shell: install banner, form, gallery |
| `style.css` | Mobile-first layout, gallery grid, components |
| `app.js` | Camera, location, save/load, gallery render, notifications, install banner |
| `icons/icon-192.png` | 192×192 app icon (generated via Python) |
| `icons/icon-512.png` | 512×512 app icon (generated via Python) |
| `tutorial.md` | Step-by-step rebuild guide for beginners |

---

### Task 1: Generate PNG Icons

**Why PNG?** Chrome requires PNG (not SVG) for PWA installability.

**Files:**
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`

- [ ] **Step 1: Run Python script to generate icons**

```bash
cd /Users/integrasolid/Work/Training/photo-pwa
python3 - <<'EOF'
import struct, zlib, os, math

def make_png(size):
    """
    Creates a PNG icon: blue background, white camera body, dark blue lens.
    Uses only Python stdlib (struct + zlib) — no Pillow needed.
    """
    def chunk(ctype, data):
        # PNG chunk: 4-byte length, 4-byte type, data, 4-byte CRC
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    pixels = []
    cx, cy = size / 2, size / 2

    for y in range(size):
        row = [0]  # filter byte = None (0)
        for x in range(size):
            # Normalized coordinates -1 to 1
            nx = (x - cx) / (size * 0.5)
            ny = (y - cy) / (size * 0.5)

            # Camera body rectangle (80% width, 60% height, centred slightly low)
            in_body = abs(nx) < 0.38 and (ny > -0.15 and ny < 0.35)
            # Camera top bump
            in_bump = abs(nx) < 0.16 and (ny > -0.32 and ny < -0.14)
            # Lens: circle centred in body
            dist = math.sqrt((nx)**2 + (ny - 0.1)**2)
            in_lens_outer = dist < 0.22
            in_lens_inner = dist < 0.13

            if in_lens_inner:
                r, g, b = 21, 101, 192   # dark blue
            elif in_lens_outer:
                r, g, b = 255, 255, 255  # white ring
            elif in_body or in_bump:
                r, g, b = 255, 255, 255  # white body
            else:
                r, g, b = 33, 150, 243  # Material blue background

            row += [r, g, b]
        pixels.append(bytes(row))

    raw = b''.join(pixels)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for sz in [192, 512]:
    with open(f'icons/icon-{sz}.png', 'wb') as f:
        f.write(make_png(sz))
    print(f'Created icons/icon-{sz}.png ({sz}x{sz})')
EOF
```

Expected output:
```
Created icons/icon-192.png (192x192)
Created icons/icon-512.png (512x512)
```

- [ ] **Step 2: Verify files exist**

```bash
ls -lh icons/
```

Expected: two `.png` files, each a few KB.

---

### Task 2: Create `manifest.json`

**Files:**
- Create: `manifest.json`

The manifest tells the browser this is an installable PWA.

- [ ] **Step 1: Write manifest.json**

```json
{
  "name": "Photo Journal",
  "short_name": "PhotoJournal",
  "description": "Capture photos with description and GPS location. Works offline.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2196F3",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

Save to: `manifest.json`

---

### Task 3: Create `sw.js` (Service Worker)

**Files:**
- Create: `sw.js`

The service worker is a background script that intercepts network requests and enables offline mode. Think of it as a PHP caching proxy that lives in the browser.

- [ ] **Step 1: Write sw.js**

```javascript
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
        // Nothing we can do; the browser will show its default error.
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
```

Save to: `sw.js`

---

### Task 4: Create `style.css`

**Files:**
- Create: `style.css`

- [ ] **Step 1: Write style.css**

```css
/*
 * style.css — Photo Journal PWA Styles
 *
 * Design approach: mobile-first.
 * We design for small screens first, then add rules for larger screens.
 * No CSS framework — just plain CSS so you can see exactly what each
 * rule does.
 */

/* ════════════════════════════════════════════════════════════
   RESET
   Browsers add their own margin/padding by default.
   This zeroes them out so we start with a clean slate.
   ════════════════════════════════════════════════════════════ */
* {
  box-sizing: border-box; /* padding & border included in width/height */
  margin: 0;
  padding: 0;
}

/* ════════════════════════════════════════════════════════════
   BASE BODY
   ════════════════════════════════════════════════════════════ */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  background-color: #f0f4f8;
  color: #333;
  line-height: 1.6;
  min-height: 100vh;
}

/* ════════════════════════════════════════════════════════════
   UTILITY
   ════════════════════════════════════════════════════════════ */
/* Used by JavaScript to hide elements */
.hidden {
  display: none !important;
}

/* ════════════════════════════════════════════════════════════
   INSTALL BANNER
   Shown at the top when the PWA can be installed.
   JavaScript shows/hides this.
   ════════════════════════════════════════════════════════════ */
.install-banner {
  background-color: #1565C0;
  color: white;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 100;
}

.install-banner p {
  flex: 1;           /* Take remaining space */
  font-weight: 500;
  font-size: 0.9rem;
}

/* ════════════════════════════════════════════════════════════
   HEADER
   Top navigation bar with app title
   ════════════════════════════════════════════════════════════ */
header {
  background-color: #2196F3;
  color: white;
  padding: 16px 20px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

header h1 {
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* ════════════════════════════════════════════════════════════
   MAIN CONTENT AREA
   Centred column, max 600px wide (phone-optimised)
   ════════════════════════════════════════════════════════════ */
main {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px;
}

/* ════════════════════════════════════════════════════════════
   CARD SECTIONS
   White rounded panels for each feature block
   ════════════════════════════════════════════════════════════ */
.card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card h2 {
  font-size: 1rem;
  font-weight: 700;
  color: #1565C0;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #E3F2FD;
}

/* ════════════════════════════════════════════════════════════
   FORM ELEMENTS
   ════════════════════════════════════════════════════════════ */
.form-group {
  margin-bottom: 14px;
}

label {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  color: #555;
  margin-bottom: 6px;
}

/* File input for camera */
input[type="file"] {
  width: 100%;
  padding: 12px;
  border: 2px dashed #90CAF9;
  border-radius: 8px;
  background-color: #E3F2FD;
  cursor: pointer;
  font-size: 0.9rem;
}

/* Description textarea */
textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  min-height: 80px;
  font-size: 0.95rem;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s;
}

textarea:focus {
  outline: none;
  border-color: #2196F3;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.15);
}

/* ════════════════════════════════════════════════════════════
   PHOTO PREVIEW
   Shown after the user selects a photo
   ════════════════════════════════════════════════════════════ */
.photo-preview {
  margin-top: 10px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #90CAF9;
}

.photo-preview img {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  display: block;
}

/* ════════════════════════════════════════════════════════════
   LOCATION DISPLAY
   Small info text showing GPS coordinates
   ════════════════════════════════════════════════════════════ */
.location-text {
  margin-top: 8px;
  font-size: 0.85rem;
  color: #666;
  padding: 8px 10px;
  background: #f5f5f5;
  border-radius: 6px;
  min-height: 36px;
}

/* ════════════════════════════════════════════════════════════
   BUTTONS
   ════════════════════════════════════════════════════════════ */
.btn {
  display: inline-block;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: opacity 0.15s, transform 0.1s;
  font-family: inherit;
}

.btn:active {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary — main action (Save) */
.btn-primary {
  background-color: #2196F3;
  color: white;
  width: 100%;
  padding: 14px;
  font-size: 1rem;
  margin-bottom: 8px;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

/* Secondary — optional actions */
.btn-secondary {
  background-color: #e0e0e0;
  color: #333;
  width: 100%;
  margin-bottom: 8px;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #d0d0d0;
}

/* Danger — delete */
.btn-danger {
  background-color: #ef5350;
  color: white;
  padding: 6px 12px;
  font-size: 0.8rem;
  margin-top: 6px;
}

/* Install banner buttons */
.install-banner .btn {
  padding: 7px 14px;
  width: auto;
  font-size: 0.85rem;
}

#install-btn {
  background-color: #FFC107;
  color: #333;
}

#dismiss-btn {
  background-color: transparent;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.6);
}

/* ════════════════════════════════════════════════════════════
   GALLERY GRID
   Responsive grid of photo cards
   ════════════════════════════════════════════════════════════ */
.gallery-grid {
  display: grid;
  /* auto-fill: create as many columns as fit; min 140px, max 1fr */
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

/* Message shown when gallery is empty */
.gallery-empty {
  color: #aaa;
  text-align: center;
  padding: 32px 16px;
  font-size: 0.95rem;
  grid-column: 1 / -1; /* Span all grid columns */
}

/* Individual photo card */
.photo-card {
  background: #fafafa;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s;
}

.photo-card:hover {
  transform: translateY(-2px);
}

/* The thumbnail image */
.photo-card img {
  width: 100%;
  height: 130px;
  object-fit: cover;
  display: block;
}

/* Text info below the thumbnail */
.card-meta {
  padding: 8px 10px;
}

.card-meta .desc {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
  /* Cut off long text with "..." */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
}

.card-meta .loc,
.card-meta .date {
  font-size: 0.72rem;
  color: #999;
  margin-bottom: 2px;
}
```

Save to: `style.css`

---

### Task 5: Create `index.html`

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <!--
    viewport: makes the page scale correctly on mobile.
    Without this, mobile browsers zoom out and show a tiny desktop view.
    Equivalent concept: PHP setting headers for correct encoding.
  -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Color of the browser address bar on Android -->
  <meta name="theme-color" content="#2196F3">

  <!-- iOS PWA support (Apple-specific meta tags) -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="PhotoJournal">

  <title>Photo Journal</title>

  <!-- Link to the PWA manifest (like a package.json for your app) -->
  <link rel="manifest" href="manifest.json">

  <!-- App icon for iOS (Apple does not read manifest icons) -->
  <link rel="apple-touch-icon" href="icons/icon-192.png">

  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!--
    INSTALL BANNER
    Hidden by default. JavaScript shows it when the browser fires
    the 'beforeinstallprompt' event, meaning the app can be installed.
  -->
  <div id="install-banner" class="install-banner hidden">
    <p>📲 Add Photo Journal to your home screen!</p>
    <button id="install-btn" class="btn">Install</button>
    <button id="dismiss-btn" class="btn">✕</button>
  </div>

  <!-- ── HEADER ── -->
  <header>
    <h1>📷 Photo Journal</h1>
  </header>

  <main>

    <!-- ── CAPTURE SECTION ── -->
    <section class="card">
      <h2>Add New Photo</h2>

      <!-- Camera / file input -->
      <div class="form-group">
        <label for="camera-input">Take or Choose a Photo</label>
        <!--
          capture="environment" opens the back camera on phones.
          accept="image/*" limits selection to image files only.
          On desktop browsers this opens the file picker instead.
        -->
        <input
          type="file"
          id="camera-input"
          accept="image/*"
          capture="environment"
        >
        <!-- Photo preview (hidden until a photo is selected) -->
        <div id="photo-preview" class="photo-preview hidden">
          <img id="preview-img" src="" alt="Selected photo preview">
        </div>
      </div>

      <!-- Description -->
      <div class="form-group">
        <label for="description">Description</label>
        <textarea
          id="description"
          placeholder="Write something about this photo..."
          maxlength="500"
        ></textarea>
      </div>

      <!-- Location -->
      <div class="form-group">
        <button id="get-location-btn" class="btn btn-secondary">
          📍 Get My Location
        </button>
        <!-- Shows coordinates after user clicks the button above -->
        <p id="location-text" class="location-text">No location added yet.</p>
      </div>

      <!-- Save -->
      <button id="save-btn" class="btn btn-primary">💾 Save Photo</button>

      <!-- Notification permission -->
      <button id="notify-btn" class="btn btn-secondary">
        🔔 Enable Notifications
      </button>
    </section>

    <!-- ── GALLERY SECTION ── -->
    <section class="card">
      <h2>My Photos</h2>
      <!--
        The gallery grid.
        JavaScript populates this with photo cards from localStorage.
      -->
      <div id="gallery" class="gallery-grid">
        <p class="gallery-empty">No photos yet. Take your first one above!</p>
      </div>
    </section>

  </main>

  <!-- Load our app logic last so the DOM is ready -->
  <script src="app.js"></script>
</body>
</html>
```

Save to: `index.html`

---

### Task 6: Create `app.js`

**Files:**
- Create: `app.js`

- [ ] **Step 1: Write app.js**

```javascript
/**
 * app.js — Photo Journal PWA: Main Application Logic
 *
 * This file ties everything together. It handles:
 *   1. Service worker registration (offline support)
 *   2. PWA install banner
 *   3. Camera photo capture + preview
 *   4. GPS location
 *   5. Saving photos to localStorage
 *   6. Loading and rendering the gallery
 *   7. Deleting photos
 *   8. Push notifications (local, triggered on save)
 *
 * PHP analogy:
 *   - localStorage  ≈  a simple flat-file database (JSON stored by the browser)
 *   - Service Worker ≈  a PHP-powered caching proxy / background job runner
 *   - Promises (.then) ≈  PHP callbacks / async operations
 */

'use strict'; // Catch common mistakes (undeclared variables, etc.)

// ══════════════════════════════════════════════════════════════
// GLOBAL STATE
// Variables that need to live between function calls.
// ══════════════════════════════════════════════════════════════

/** Stores the base64 data URL of the photo the user just selected. */
var currentPhotoDataUrl = null;

/** Stores the GPS coordinates the user captured. null if not set. */
var currentLocation = null;

/**
 * Stores the browser's 'beforeinstallprompt' event.
 * We save it so we can call .prompt() later when user clicks Install.
 */
var installPromptEvent = null;

// ══════════════════════════════════════════════════════════════
// 1. SERVICE WORKER REGISTRATION
// Registers sw.js with the browser so offline caching starts.
// ══════════════════════════════════════════════════════════════

/**
 * Registers the service worker (sw.js).
 *
 * Must be called on page load. The service worker file must be at
 * the ROOT of your site (same level as index.html), not inside a
 * sub-folder, so its "scope" covers the whole app.
 */
function registerServiceWorker() {
  // 'serviceWorker' in navigator checks browser support
  if (!('serviceWorker' in navigator)) {
    console.log('[App] Service workers not supported in this browser.');
    return;
  }

  // Wait for the page to fully load before registering
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('sw.js') // Path to our service worker file
      .then(function (registration) {
        console.log('[App] Service Worker registered. Scope:', registration.scope);
      })
      .catch(function (err) {
        console.error('[App] Service Worker registration failed:', err);
      });
  });
}

// ══════════════════════════════════════════════════════════════
// 2. PWA INSTALL BANNER
// The browser fires 'beforeinstallprompt' when the app is
// installable. We intercept it and show our own banner.
// ══════════════════════════════════════════════════════════════

/**
 * Sets up the custom PWA install banner.
 *
 * The browser normally shows a mini-infobar. We suppress that and
 * show our own banner at the top of the page instead, so we can
 * style it to match the app.
 */
function setupInstallBanner() {
  var banner     = document.getElementById('install-banner');
  var installBtn = document.getElementById('install-btn');
  var dismissBtn = document.getElementById('dismiss-btn');

  // This event fires when Chrome decides the app is installable.
  // Criteria: valid manifest, registered SW, served over HTTPS/localhost.
  window.addEventListener('beforeinstallprompt', function (event) {
    // Stop the browser's default mini-infobar from appearing
    event.preventDefault();

    // Save the event — we'll trigger it when the user clicks Install
    installPromptEvent = event;

    // Show our custom banner
    banner.classList.remove('hidden');
    console.log('[App] PWA is installable — showing install banner.');
  });

  // ── Install button clicked ──
  installBtn.addEventListener('click', function () {
    if (!installPromptEvent) return;

    // Trigger the browser's native install dialog
    installPromptEvent.prompt();

    // Find out what the user chose
    installPromptEvent.userChoice.then(function (result) {
      console.log('[App] Install choice:', result.outcome); // 'accepted' or 'dismissed'
      installPromptEvent = null; // The event can only be used once
      banner.classList.add('hidden');
    });
  });

  // ── Dismiss button clicked ──
  dismissBtn.addEventListener('click', function () {
    banner.classList.add('hidden');
  });

  // Hide the banner once the app is successfully installed
  window.addEventListener('appinstalled', function () {
    banner.classList.add('hidden');
    console.log('[App] App installed successfully!');
  });
}

// ══════════════════════════════════════════════════════════════
// 3. CAMERA CAPTURE
// Uses <input type="file" capture="environment"> to open camera.
// FileReader converts the image to a base64 string for storage.
// ══════════════════════════════════════════════════════════════

/**
 * Sets up the camera file input.
 *
 * When the user selects/takes a photo, FileReader reads it as a
 * base64 data URL (a long string starting with "data:image/jpeg;base64,...").
 * We store this string in localStorage because localStorage only holds text.
 */
function setupCamera() {
  var cameraInput = document.getElementById('camera-input');
  var previewDiv  = document.getElementById('photo-preview');
  var previewImg  = document.getElementById('preview-img');

  cameraInput.addEventListener('change', function (event) {
    var file = event.target.files[0]; // The selected image file

    // User cancelled the picker
    if (!file) return;

    // FileReader is a browser API for reading files as text/base64.
    // It's asynchronous (like PHP's file_get_contents but non-blocking).
    var reader = new FileReader();

    // This callback runs when reading is complete
    reader.onload = function (e) {
      currentPhotoDataUrl = e.target.result; // base64 string

      // Show the preview image
      previewImg.src = currentPhotoDataUrl;
      previewDiv.classList.remove('hidden');
    };

    // Start reading the file as a base64 data URL
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════
// 4. LOCATION
// Uses the Geolocation API to get the device's GPS coordinates.
// ══════════════════════════════════════════════════════════════

/**
 * Sets up the "Get My Location" button.
 *
 * navigator.geolocation.getCurrentPosition() asks the browser for
 * the device's location. The user must approve the permission prompt.
 * It works like a PHP function that calls an external API and returns
 * data via a callback (it's asynchronous).
 */
function setupLocation() {
  var locationBtn  = document.getElementById('get-location-btn');
  var locationText = document.getElementById('location-text');

  locationBtn.addEventListener('click', function () {
    // Check browser support
    if (!navigator.geolocation) {
      locationText.textContent = 'Geolocation is not supported by this browser.';
      return;
    }

    locationText.textContent = '⏳ Getting location...';

    navigator.geolocation.getCurrentPosition(
      // ── Success callback ──
      function (position) {
        currentLocation = {
          latitude:  position.coords.latitude,
          longitude: position.coords.longitude
        };

        locationText.textContent =
          '📍 Lat: ' + currentLocation.latitude.toFixed(5) +
          ', Lng: '  + currentLocation.longitude.toFixed(5);

        console.log('[App] Location captured:', currentLocation);
      },

      // ── Error callback ──
      function (error) {
        locationText.textContent = '❌ Could not get location: ' + error.message;
        console.error('[App] Geolocation error:', error);
      }
    );
  });
}

// ══════════════════════════════════════════════════════════════
// 5. LOCAL STORAGE — SAVE & LOAD
// localStorage is a browser key-value store.
// Keys and values are STRINGS — so we use JSON to store arrays.
// PHP analogy: file_get_contents / file_put_contents with JSON.
// ══════════════════════════════════════════════════════════════

/**
 * Loads the photos array from localStorage.
 *
 * @returns {Array} Array of photo objects, or [] if nothing saved yet.
 */
function loadPhotos() {
  var raw = localStorage.getItem('photos'); // returns null if not found
  if (!raw) return [];
  return JSON.parse(raw); // Convert JSON string → JS array
}

/**
 * Saves the photos array to localStorage.
 *
 * @param {Array} photos - The full array of photo objects to save.
 */
function savePhotos(photos) {
  localStorage.setItem('photos', JSON.stringify(photos)); // Array → JSON string
}

// ══════════════════════════════════════════════════════════════
// 6. SAVE BUTTON
// Collects the photo, description, and location, packages them
// into an object, and prepends it to the saved photos list.
// ══════════════════════════════════════════════════════════════

/**
 * Sets up the Save button click handler.
 */
function setupSaveButton() {
  var saveBtn = document.getElementById('save-btn');

  saveBtn.addEventListener('click', function () {

    // Validate: photo is required
    if (!currentPhotoDataUrl) {
      alert('Please take or select a photo first!');
      return;
    }

    var description = document.getElementById('description').value.trim();

    // Build the photo record.
    // Date.now() returns milliseconds since epoch — unique enough for a local ID.
    // PHP equivalent: time() for a timestamp, or an auto-increment primary key.
    var photo = {
      id:          Date.now(),
      dataUrl:     currentPhotoDataUrl,
      description: description,
      location:    currentLocation,        // null if not captured
      timestamp:   new Date().toISOString() // e.g. "2026-04-14T08:00:00.000Z"
    };

    // Load existing, add new at the front (newest first), save back
    var photos = loadPhotos();
    photos.unshift(photo); // unshift = add to beginning (like PHP's array_unshift)
    savePhotos(photos);

    console.log('[App] Photo saved, id:', photo.id);

    // Notify the user
    showNotification('Photo Saved! 📷', description || 'Your photo has been saved.');

    // Refresh gallery and reset form
    renderGallery();
    resetForm();
  });
}

/**
 * Clears the form fields after a successful save.
 */
function resetForm() {
  currentPhotoDataUrl = null;
  currentLocation     = null;

  document.getElementById('camera-input').value     = '';
  document.getElementById('preview-img').src        = '';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('description').value      = '';
  document.getElementById('location-text').textContent = 'No location added yet.';
}

// ══════════════════════════════════════════════════════════════
// 7. GALLERY
// Reads photos from localStorage and builds the grid UI.
// ══════════════════════════════════════════════════════════════

/**
 * Renders (or re-renders) the gallery grid.
 *
 * Clears the gallery div and rebuilds it from localStorage.
 * Called on page load and after every save/delete.
 */
function renderGallery() {
  var gallery = document.getElementById('gallery');
  var photos  = loadPhotos();

  // Clear everything currently in the gallery
  gallery.innerHTML = '';

  if (photos.length === 0) {
    gallery.innerHTML = '<p class="gallery-empty">No photos yet. Take your first one above!</p>';
    return;
  }

  // Build a card for each photo and add it to the grid
  photos.forEach(function (photo) {
    var card = buildPhotoCard(photo);
    gallery.appendChild(card);
  });
}

/**
 * Creates a single photo card DOM element.
 *
 * @param  {Object}      photo - { id, dataUrl, description, location, timestamp }
 * @returns {HTMLElement} The card element ready to insert into the DOM.
 */
function buildPhotoCard(photo) {
  var card = document.createElement('div');
  card.className   = 'photo-card';
  card.dataset.id  = photo.id;

  // Format date — similar to PHP's date('d M Y H:i', strtotime($ts))
  var d       = new Date(photo.timestamp);
  var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  var locStr = 'No location';
  if (photo.location) {
    locStr = photo.location.latitude.toFixed(3) + ', ' + photo.location.longitude.toFixed(3);
  }

  // NOTE: We use escapeHtml() to sanitise user-entered text before
  // inserting it into the DOM, preventing XSS attacks.
  // PHP equivalent: htmlspecialchars($text, ENT_QUOTES, 'UTF-8')
  card.innerHTML =
    '<img src="' + photo.dataUrl + '" alt="' + escapeHtml(photo.description) + '">' +
    '<div class="card-meta">' +
      '<p class="desc">' + escapeHtml(photo.description || '(no description)') + '</p>' +
      '<p class="loc">📍 ' + locStr + '</p>' +
      '<p class="date">🕐 ' + dateStr + '</p>' +
      '<button class="btn btn-danger" onclick="deletePhoto(' + photo.id + ')">Delete</button>' +
    '</div>';

  return card;
}

/**
 * Deletes a photo from localStorage by ID and re-renders the gallery.
 *
 * This is called directly from the onclick attribute in buildPhotoCard().
 * It must be a global function (no 'var' wrapping) for that to work.
 *
 * @param {number} id - The photo's id (timestamp number).
 */
function deletePhoto(id) {
  if (!confirm('Delete this photo? This cannot be undone.')) return;

  var photos = loadPhotos();

  // filter() returns a new array keeping only items where the function returns true.
  // PHP equivalent: array_filter($photos, fn($p) => $p['id'] !== $id)
  var remaining = photos.filter(function (photo) {
    return photo.id !== id;
  });

  savePhotos(remaining);
  renderGallery();
  console.log('[App] Photo deleted, id:', id);
}

/**
 * Sanitises a string for safe insertion into HTML.
 * Prevents XSS by converting < > & " ' to HTML entities.
 * PHP equivalent: htmlspecialchars($str, ENT_QUOTES, 'UTF-8')
 *
 * @param  {string} str - Raw user input.
 * @returns {string}     HTML-safe string.
 */
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ══════════════════════════════════════════════════════════════
// 8. NOTIFICATIONS
// We ask the user for permission once, then show a local
// notification via the service worker each time a photo is saved.
// ══════════════════════════════════════════════════════════════

/**
 * Sets up the "Enable Notifications" button.
 * Updates the button label based on the current permission state.
 */
function setupNotifications() {
  var btn = document.getElementById('notify-btn');

  // If the browser doesn't support the Notification API, disable the button
  if (!('Notification' in window)) {
    btn.textContent = 'Notifications not supported';
    btn.disabled    = true;
    return;
  }

  updateNotifyButton(); // Set initial button label

  btn.addEventListener('click', function () {
    // Ask the user for permission.
    // The browser shows a popup: "Allow notifications from this site?"
    Notification.requestPermission().then(function (permission) {
      console.log('[App] Notification permission:', permission);
      updateNotifyButton();
    });
  });
}

/**
 * Updates the notification button label to reflect current permission.
 * Possible values: 'default' | 'granted' | 'denied'
 */
function updateNotifyButton() {
  var btn = document.getElementById('notify-btn');

  if (Notification.permission === 'granted') {
    btn.textContent = '✅ Notifications Enabled';
    btn.disabled    = true;
  } else if (Notification.permission === 'denied') {
    btn.textContent = '🚫 Notifications Blocked (check browser settings)';
    btn.disabled    = true;
  } else {
    btn.textContent = '🔔 Enable Notifications';
    btn.disabled    = false;
  }
}

/**
 * Shows a notification via the Service Worker.
 *
 * Using registration.showNotification() (rather than new Notification())
 * works even when the app tab is not focused or the app is backgrounded.
 *
 * @param {string} title - Notification title.
 * @param {string} body  - Notification body text.
 */
function showNotification(title, body) {
  // No permission — silently skip
  if (Notification.permission !== 'granted') return;

  // Use the service worker's showNotification for best compatibility
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(function (registration) {
      registration.showNotification(title, {
        body:    body,
        icon:    'icons/icon-192.png',
        badge:   'icons/icon-192.png',
        vibrate: [200, 100, 200] // Vibration: buzz 200ms, pause 100ms, buzz 200ms
      });
    });
  } else {
    // Fallback: basic Notification (works in foreground only)
    new Notification(title, { body: body, icon: 'icons/icon-192.png' });
  }
}

// ══════════════════════════════════════════════════════════════
// 9. INITIALISATION
// Wire everything up when the page finishes loading.
// PHP analogy: code at the bottom of index.php that runs once.
// ══════════════════════════════════════════════════════════════

/**
 * Main init function. Called once the DOM is ready.
 */
function init() {
  console.log('[App] Initialising Photo Journal...');

  registerServiceWorker(); // Must happen first
  setupInstallBanner();    // Listen for installability event
  setupCamera();           // Camera input + preview
  setupLocation();         // Location button
  setupSaveButton();       // Save button
  setupNotifications();    // Notification permission button
  renderGallery();         // Display any previously saved photos

  console.log('[App] Ready.');
}

// DOMContentLoaded fires when the HTML is parsed and the DOM is ready.
// PHP analogy: everything after the closing ?> tag has been parsed.
document.addEventListener('DOMContentLoaded', init);
```

Save to: `app.js`

---

### Task 7: Start Dev Server and First Playwright Test

**Files:** none (server + tests only)

- [ ] **Step 1: Start Python HTTP server**

```bash
cd /Users/integrasolid/Work/Training/photo-pwa
python3 -m http.server 8080 &
sleep 1
echo "Server started on http://localhost:8080"
```

- [ ] **Step 2: Open app in Playwright and screenshot**

Use Playwright MCP tools:
1. `browser_navigate` → `http://localhost:8080`
2. `browser_take_screenshot` — verify the app loads: header visible, form visible, gallery empty message

- [ ] **Step 3: Check console for errors**

Use `browser_console_messages` — verify no errors. Acceptable messages:
- `[App] Initialising Photo Journal...`
- `[App] Service Worker registered...`
- `[App] Ready.`

- [ ] **Step 4: Check manifest and SW**

In browser DevTools (or Playwright evaluate):
```javascript
// Paste in browser_evaluate
navigator.serviceWorker.getRegistration().then(r => console.log('SW scope:', r ? r.scope : 'none'));
```

Expected: SW scope is `http://localhost:8080/`

---

### Task 8: Test Camera + Save Flow via Playwright

**Files:** none (testing only)

Because Playwright cannot access the physical camera, we'll test the save flow by injecting a small test image via JavaScript.

- [ ] **Step 1: Inject a test photo and fill the form**

```javascript
// Use browser_evaluate with this script:
(async function () {
  // Create a tiny 10x10 red PNG as a base64 data URL
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = 10;
  canvas.getContext('2d').fillStyle = 'red';
  canvas.getContext('2d').fillRect(0, 0, 10, 10);

  // Simulate having selected a photo
  window.currentPhotoDataUrl = canvas.toDataURL('image/png');
  document.getElementById('preview-img').src = window.currentPhotoDataUrl;
  document.getElementById('photo-preview').classList.remove('hidden');

  // Fill description
  document.getElementById('description').value = 'Test photo from Playwright';
})();
```

- [ ] **Step 2: Click Save**

Use Playwright MCP:
1. `browser_click` → `#save-btn`
2. `browser_take_screenshot` — verify gallery now shows 1 photo card

- [ ] **Step 3: Verify localStorage**

```javascript
// browser_evaluate:
var photos = JSON.parse(localStorage.getItem('photos') || '[]');
console.log('Photos in storage:', photos.length, photos[0] && photos[0].description);
```

Expected output: `Photos in storage: 1 Test photo from Playwright`

- [ ] **Step 4: Screenshot gallery**

Take screenshot — confirm the photo card is visible with description text.

- [ ] **Step 5: Test delete**

1. `browser_click` → `.btn-danger` (first delete button)
2. `browser_handle_dialog` → accept the confirm dialog
3. `browser_take_screenshot` — gallery should show empty message again

---

### Task 9: Test Offline Mode via Playwright

- [ ] **Step 1: Take the app offline and reload**

```javascript
// browser_evaluate — simulate offline (sets navigator.onLine via SW intercept is handled already)
// We just confirm the SW is serving cached files by checking the network tab
// Instead, verify the SW cache contains our files:
caches.open('photo-journal-v1').then(function(cache) {
  cache.keys().then(function(keys) {
    console.log('Cached files:', keys.map(function(k){ return k.url; }));
  });
});
```

Expected: all 7 URLs from `FILES_TO_CACHE` appear.

- [ ] **Step 2: Screenshot for verification**

Take screenshot confirming gallery and form still render correctly.

---

### Task 10: Write `tutorial.md`

**Files:**
- Create: `tutorial.md`

- [ ] **Step 1: Write tutorial.md**

```markdown
# Building a Photo Journal PWA — Step-by-Step Tutorial

> **Who is this for?**
> Developers familiar with PHP who are new to Progressive Web Apps (PWA) and JavaScript.
> We draw parallels to PHP concepts throughout.

---

## What Is a PWA?

A **Progressive Web App** is a regular website that gains app-like features:

| Feature | How |
|---|---|
| Works offline | Service Worker caches files (like a PHP reverse proxy) |
| Installable | Web App Manifest declares app identity |
| Push notifications | Service Worker listens for push events |
| Feels like a native app | `display: standalone` hides the browser UI |

The key insight: **it's just a website with two extra files** — `manifest.json` and `sw.js`.

---

## Project Structure

```
photo-pwa/
├── index.html        ← App shell (HTML structure)
├── style.css         ← All styles
├── app.js            ← All JavaScript logic
├── manifest.json     ← PWA identity & icons
├── sw.js             ← Service worker (offline + notifications)
├── tutorial.md       ← This file
└── icons/
    ├── icon-192.png  ← App icon (required for install)
    └── icon-512.png  ← App icon (large, for splash screens)
```

---

## Step 1 — Generate the Icons

PWA installation requires **PNG icons** (Chrome does not accept SVG here).

We use Python's built-in `struct` and `zlib` modules to create PNG files — no external libraries needed.

Run this once from your project folder:

```bash
python3 - <<'EOF'
import struct, zlib, os, math

def make_png(size):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    pixels = []
    cx, cy = size / 2, size / 2
    for y in range(size):
        row = [0]
        for x in range(size):
            nx = (x - cx) / (size * 0.5)
            ny = (y - cy) / (size * 0.5)
            in_body = abs(nx) < 0.38 and (ny > -0.15 and ny < 0.35)
            in_bump = abs(nx) < 0.16 and (ny > -0.32 and ny < -0.14)
            dist = math.sqrt(nx**2 + (ny - 0.1)**2)
            if dist < 0.13:
                r, g, b = 21, 101, 192
            elif dist < 0.22:
                r, g, b = 255, 255, 255
            elif in_body or in_bump:
                r, g, b = 255, 255, 255
            else:
                r, g, b = 33, 150, 243
            row += [r, g, b]
        pixels.append(bytes(row))

    raw = b''.join(pixels)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for sz in [192, 512]:
    with open(f'icons/icon-{sz}.png', 'wb') as f:
        f.write(make_png(sz))
    print(f'Created icons/icon-{sz}.png')
EOF
```

**What this does:** builds a PNG binary from scratch using only Python's standard library. A PNG file is just a header, compressed pixel rows, and a checksum — the `struct` module packs binary numbers and `zlib` compresses the pixel data.

---

## Step 2 — Create `manifest.json`

The manifest is a JSON file that describes your app to the browser. Think of it like `composer.json` or `package.json`, but for the browser's install system.

```json
{
  "name": "Photo Journal",
  "short_name": "PhotoJournal",
  "description": "Capture photos with description and GPS location. Works offline.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2196F3",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Key fields:

| Field | Meaning |
|---|---|
| `name` | Full app name (shown at install) |
| `short_name` | Name on home screen icon |
| `start_url` | URL opened when icon is tapped |
| `display: standalone` | Hides browser UI (feels native) |
| `theme_color` | Address bar / status bar colour |
| `icons` | PNG icons required for install |

Link it in `<head>` of your HTML:
```html
<link rel="manifest" href="manifest.json">
```

---

## Step 3 — Create the Service Worker (`sw.js`)

A **service worker** is a JavaScript file that runs **in the background**, separate from your page. Think of it as a PHP middleware layer that intercepts every HTTP request your app makes and can respond from a local cache.

### Key concepts

```
Browser request → Service Worker → Cache (offline) OR Network (online)
```

### The three lifecycle events

**`install`** — Runs once when the SW is first installed. Cache your files here.

```javascript
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('photo-journal-v1').then(function(cache) {
      return cache.addAll([
        '/', '/index.html', '/style.css', '/app.js',
        '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'
      ]);
    })
  );
  self.skipWaiting(); // Activate immediately (don't wait for old SW)
});
```

**`activate`** — Runs after install. Delete old caches here.

```javascript
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(n => n !== 'photo-journal-v1').map(n => caches.delete(n))
      );
    })
  );
  self.clients.claim(); // Take control of all open pages now
});
```

**`fetch`** — Runs on every network request. Serve from cache first.

```javascript
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
      // cached = serve offline copy
      // fetch() = go to network when not cached
    })
  );
});
```

> **Important:** The SW file (`sw.js`) MUST be at the ROOT of your site. If it's in a subfolder, it can only control files in that subfolder.

> **Updating files:** When you change `style.css` or `app.js`, increment the cache version (`photo-journal-v1` → `photo-journal-v2`). The old `activate` handler will delete the stale cache and the browser will download fresh files.

---

## Step 4 — Create `index.html`

The HTML is the app shell. It contains:
- The install banner (hidden until JS shows it)
- A form with camera input, description, and location button
- A gallery section (populated by JS from localStorage)

Key points:

**Camera input** — The `capture` attribute opens the phone camera directly:
```html
<input type="file" id="camera-input" accept="image/*" capture="environment">
```
- `accept="image/*"` — only allow image files
- `capture="environment"` — prefer the back (rear) camera on mobile

**PWA meta tags for iOS:**
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="PhotoJournal">
<link rel="apple-touch-icon" href="icons/icon-192.png">
```
Apple devices do not read `manifest.json` icons, so we add these separately.

**Load JS last** — Put `<script src="app.js"></script>` just before `</body>` so the DOM is fully built before our JS runs. (PHP analogy: running PHP code after all HTML output.)

---

## Step 5 — Create `style.css`

The CSS uses three key techniques:

**1. Mobile-first** — Design for small screens; add media queries for big ones.

**2. CSS Grid for the gallery:**
```css
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
```
`auto-fill` + `minmax` automatically creates as many columns as fit the screen width. No JavaScript needed.

**3. BEM-inspired class names** — `.photo-card`, `.card-meta`, `.btn-primary` are self-describing and easy to maintain.

---

## Step 6 — Create `app.js`

The JavaScript is split into focused functions, each with one job:

### 6.1 Register the Service Worker

```javascript
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').then(function(reg) {
        console.log('SW registered, scope:', reg.scope);
      });
    });
  }
}
```

Call this first. If the browser doesn't support SWs, the rest of the app still works — it just won't work offline.

### 6.2 Install Banner

The browser fires `beforeinstallprompt` when the app meets install criteria. We save the event and show a banner:

```javascript
window.addEventListener('beforeinstallprompt', function(event) {
  event.preventDefault();          // Stop default browser infobar
  installPromptEvent = event;      // Save for later
  document.getElementById('install-banner').classList.remove('hidden');
});
```

When the user clicks Install, we call `installPromptEvent.prompt()` to show the native dialog.

**Install criteria (Chrome):**
1. Valid `manifest.json` (name, icons, start_url, display)
2. Service worker registered
3. Served over HTTPS or `localhost`
4. Not already installed

### 6.3 Camera and FileReader

```javascript
var reader = new FileReader();
reader.onload = function(e) {
  currentPhotoDataUrl = e.target.result; // "data:image/jpeg;base64,..."
};
reader.readAsDataURL(file); // Convert File object → base64 string
```

We store images as **base64 data URLs** in localStorage because localStorage only holds text strings. A base64 string is a text representation of binary data. The downside: images take ~33% more space than binary. For a tutorial app this is fine.

### 6.4 Geolocation

```javascript
navigator.geolocation.getCurrentPosition(
  function(position) {
    // Success: position.coords.latitude, position.coords.longitude
  },
  function(error) {
    // Error: user denied, or GPS unavailable
  }
);
```

The browser asks the user "Allow this site to know your location?" — similar to a PHP script asking the user for a form value, but asynchronous.

### 6.5 LocalStorage

```javascript
// Save (like PHP: file_put_contents('photos.json', json_encode($photos)))
localStorage.setItem('photos', JSON.stringify(photos));

// Load (like PHP: json_decode(file_get_contents('photos.json'), true))
var photos = JSON.parse(localStorage.getItem('photos') || '[]');
```

localStorage persists across page reloads and browser restarts. It is cleared when the user clears browser data. Limit: ~5–10 MB depending on browser.

### 6.6 Notifications

```javascript
// 1. Ask permission (shows browser popup)
Notification.requestPermission().then(function(permission) { ... });

// 2. Show notification via service worker (works in background)
navigator.serviceWorker.ready.then(function(registration) {
  registration.showNotification('Photo Saved!', {
    body: 'Your photo has been saved.',
    icon: 'icons/icon-192.png'
  });
});
```

`registration.showNotification()` (service worker method) is better than `new Notification()` because it works even when the browser tab is not focused.

### 6.7 XSS Prevention

When inserting user text into HTML, always escape it:

```javascript
function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str)); // createTextNode escapes automatically
  return div.innerHTML;
}
// PHP equivalent: htmlspecialchars($str, ENT_QUOTES, 'UTF-8')
```

---

## Step 7 — Run the App

PWA features (service worker, install prompt) only work when served over HTTP/HTTPS — not from a `file://` URL.

**Start a local server:**

```bash
# Python 3
python3 -m http.server 8080

# PHP (you know this one!)
php -S localhost:8080
```

Then open: `http://localhost:8080`

**What to expect:**
1. App loads with header and empty gallery
2. Open DevTools → Application tab → Service Workers: SW should be registered
3. Take a photo, add description, click Save
4. Photo appears in gallery
5. Reload: photo is still there (localStorage persists)

---

## Step 8 — Test Offline Mode

1. Open DevTools → Network tab → set throttling to **Offline**
2. Reload the page
3. The app should still load (served from cache)
4. Previously saved photos still show (from localStorage)

> You cannot save new photos while offline (camera works, but if you relied on a network for anything it would fail — we don't, so saving still works!).

---

## Step 9 — Test Notifications

1. Click **Enable Notifications** → allow the browser prompt
2. Save a photo → a notification should appear
3. If no notification: check browser settings → Site Notifications

---

## Step 10 — Install the PWA

1. Open `http://localhost:8080` in Chrome
2. The install banner should appear (may take a few seconds)
3. Click **Install**
4. The app opens as a standalone window — no address bar!

On Android: tap the three-dot menu → "Add to Home Screen"
On iOS Safari: tap Share → "Add to Home Screen" (banner doesn't work on iOS)

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| SW not registering | Make sure `sw.js` is at the root, not in a subfolder |
| Install banner not showing | Must be served over HTTPS or `localhost`; check manifest is valid |
| Old cached files after update | Change `CACHE_NAME` version in `sw.js` |
| Notification not showing | Check Notification.permission is 'granted'; check browser settings |
| Camera not opening | `capture` attribute only works on mobile; desktop shows file picker |
| Photos lost after clearing data | localStorage is browser storage — it's cleared with "Clear site data" |

---

## Going Further

| Feature | How |
|---|---|
| Real server push notifications | Add a push server + VAPID keys; use `pushManager.subscribe()` |
| Sync photos to a server | Background Sync API (`SyncManager`) |
| Better image compression | Use `canvas.toBlob()` with quality parameter before storing |
| IndexedDB instead of localStorage | For larger data; IndexedDB has no 5 MB limit |
| Geocoding (address from GPS) | Call a free API like `nominatim.openstreetmap.org` |
| Share photo | Web Share API: `navigator.share({ files: [...] })` |

---

*Built as a learning project. All data stays on your device — nothing is sent to any server.*
```

Save to: `tutorial.md`

---

### Task 11: Final Playwright Verification

- [ ] **Step 1: Screenshot full page**

Use Playwright MCP `browser_take_screenshot` to capture the final app.

- [ ] **Step 2: Verify page title**

```javascript
// browser_evaluate:
document.title
```
Expected: `"Photo Journal"`

- [ ] **Step 3: Verify manifest is linked**

```javascript
// browser_evaluate:
document.querySelector('link[rel="manifest"]').href
```
Expected: `"http://localhost:8080/manifest.json"`

- [ ] **Step 4: Final accessibility check**

Use `browser_snapshot` to get the accessibility tree and confirm:
- Header h1 exists
- Form controls have labels
- Gallery section exists

---

## Self-Review Checklist

- [x] **Spec coverage:** Camera ✓, description ✓, location ✓, localStorage ✓, gallery ✓, push notifications ✓, install banner ✓, offline ✓, comments ✓, tutorial ✓
- [x] **No placeholders:** All code blocks are complete and runnable
- [x] **Type consistency:** `loadPhotos()` / `savePhotos()` used consistently; `currentPhotoDataUrl` / `currentLocation` global names match across all tasks
- [x] **File paths:** All paths are exact and consistent (`icons/icon-192.png` everywhere)
- [x] **Function names:** `deletePhoto(id)` referenced in `buildPhotoCard()` onclick and defined in same file ✓
- [x] **escapeHtml()** defined before `buildPhotoCard()` uses it ✓

---

*Plan written 2026-04-14 for Photo Journal PWA.*
