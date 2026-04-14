# Building a Photo Journal PWA — Step-by-Step Tutorial

> **Who is this for?**
> Developers familiar with PHP who are new to Progressive Web Apps (PWA) and vanilla JavaScript.
> PHP analogies are used throughout to help you connect new concepts to what you already know.

---

## What Is a PWA?

A **Progressive Web App (PWA)** is a regular website that gains native app-like features through two extra files:

| Extra File | What It Does |
|---|---|
| `manifest.json` | Declares your app's identity (name, icon, how it launches) |
| `sw.js` (Service Worker) | Runs in the background, caches files for offline use, handles notifications |

| PWA Feature | How It Works |
|---|---|
| Works offline | Service Worker caches your files (like a PHP reverse proxy cache) |
| Installable | The browser reads `manifest.json` and shows an "Install" prompt |
| Push notifications | Service Worker listens for push events (even when browser is closed) |
| Feels native | `display: standalone` in manifest hides the browser UI chrome |

**The key insight:** It's just a website. Add `manifest.json` + `sw.js` and you unlock app features.

---

## Project Structure

```
photo-pwa/
├── index.html        ← App shell (all the HTML)
├── style.css         ← All CSS styles
├── app.js            ← All JavaScript logic
├── manifest.json     ← PWA identity & install config
├── sw.js             ← Service worker (offline + notifications)
├── tutorial.md       ← This file
└── icons/
    ├── icon-192.png  ← Required for PWA install (Chrome needs PNG)
    └── icon-512.png  ← Required for splash screens
```

**Serving requirement:** PWA features (service worker, install prompt) only work when served over **HTTP or HTTPS** — not from a `file://` URL. Always use a local server.

---

## Step 1 — Generate the App Icons

Chrome requires **PNG icons** for PWA installability. SVG is not accepted in `manifest.json`.

We use Python's standard library (`struct` + `zlib`) to generate valid PNG files without needing any external libraries like Pillow.

**Run this once from your project folder:**

```bash
python3 - <<'EOF'
import struct, zlib, os, math

def make_png(size):
    """Generates a PNG: blue background with a white camera icon."""
    def chunk(ctype, data):
        # A PNG chunk: length + type + data + CRC checksum
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    pixels = []
    cx, cy = size / 2, size / 2

    for y in range(size):
        row = [0]  # PNG filter byte: 0 = no filter
        for x in range(size):
            # Normalise pixel position to -1..1 range
            nx = (x - cx) / (size * 0.5)
            ny = (y - cy) / (size * 0.5)

            # Camera body, top bump, and lens shapes
            in_body = abs(nx) < 0.38 and (ny > -0.15 and ny < 0.35)
            in_bump = abs(nx) < 0.16 and (ny > -0.32 and ny < -0.14)
            dist = math.sqrt(nx**2 + (ny - 0.1)**2)

            if dist < 0.13:              # Lens inner (dark blue)
                r, g, b = 21, 101, 192
            elif dist < 0.22:            # Lens outer ring (white)
                r, g, b = 255, 255, 255
            elif in_body or in_bump:     # Camera body (white)
                r, g, b = 255, 255, 255
            else:                        # Background (Material blue)
                r, g, b = 33, 150, 243

            row += [r, g, b]
        pixels.append(bytes(row))

    raw = b''.join(pixels)
    sig  = b'\x89PNG\r\n\x1a\n'   # PNG file signature (magic bytes)
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(raw, 9))  # Compressed pixel data
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for sz in [192, 512]:
    with open(f'icons/icon-{sz}.png', 'wb') as f:
        f.write(make_png(sz))
    print(f'Created icons/icon-{sz}.png')
EOF
```

**How this works:**
- A PNG file is just: magic signature + compressed pixel rows + checksum chunks
- `struct.pack('>I', ...)` writes binary integers in big-endian format (required by PNG spec)
- `zlib.compress()` compresses the raw pixel data
- No external libraries needed — only Python stdlib

For production apps, replace these with properly designed PNG icons (use a tool like Figma or GIMP to export them).

---

## Step 2 — Create `manifest.json`

The manifest is a JSON file that describes your app to the browser. Think of it like `composer.json` — metadata your app needs, but for the browser's install system.

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

**Key fields explained:**

| Field | What It Does |
|---|---|
| `name` | Full app name shown during installation |
| `short_name` | Name shown under the home screen icon |
| `start_url` | URL opened when user taps the installed icon |
| `display: standalone` | Hides browser UI — the app looks native |
| `theme_color` | Colours the Android status bar / Chrome address bar |
| `icons` | PNG icons required for install. Must include 192×192 at minimum |

**Link it in your HTML `<head>`:**

```html
<link rel="manifest" href="manifest.json">
```

**Chrome install criteria** (all must be true):
1. Valid `manifest.json` with `name`, `icons` (≥192px PNG), `start_url`, `display`
2. A Service Worker registered
3. Served over HTTPS or `localhost`
4. The app is not already installed

---

## Step 3 — Create the Service Worker (`sw.js`)

A **service worker** is a JavaScript file that runs **in its own background thread**, completely separate from your web page. Think of it as a PHP middleware layer that intercepts every HTTP request your app makes.

```
Your App  →  Service Worker  →  Local Cache (offline) or Network (online)
PHP equiv:  Browser           PHP middleware             Redis cache / database
```

**Critical rule:** `sw.js` must be at the **root** of your site (same level as `index.html`). Its "scope" is the folder it lives in — if it's in `/js/sw.js`, it can only control files under `/js/`.

### The 3 lifecycle events

**`install`** — Runs once when the SW is first registered. Cache your static files here.

```javascript
var CACHE_NAME = 'photo-journal-v1'; // Change version when updating files!
var FILES_TO_CACHE = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json',
                      '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', function(event) {
  event.waitUntil(                    // Keep install step open until done
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(FILES_TO_CACHE); // Fetch + cache every file
    })
  );
  self.skipWaiting(); // Don't wait for old SW to stop — activate immediately
});
```

**`activate`** — Runs after install. Clean up old caches here.

```javascript
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name !== CACHE_NAME) {
            return caches.delete(name); // Delete stale old caches
          }
        })
      );
    })
  );
  self.clients.claim(); // Control all open tabs immediately
});
```

**`fetch`** — Runs on every network request. Serve from cache first ("cache-first" strategy).

```javascript
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) return cachedResponse; // Serve offline copy
      return fetch(event.request);               // Fall back to network
    })
  );
});
```

**Updating your app:** When you change `style.css` or `app.js`, bump the cache version:
- Change `'photo-journal-v1'` → `'photo-journal-v2'`
- On the next visit, the `activate` handler deletes the old cache
- Fresh files are downloaded and cached

### Notification events

```javascript
// Fires when a push arrives from a server (real server push)
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Photo Journal', {
      body: data.body || 'New notification',
      icon: '/icons/icon-192.png'
    })
  );
});

// Fires when user clicks a notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/')); // Open the app
});
```

Register the service worker in your `app.js`:

```javascript
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {     // Check browser support
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js')
        .then(function(reg) { console.log('SW registered:', reg.scope); })
        .catch(function(err) { console.error('SW failed:', err); });
    });
  }
}
```

---

## Step 4 — Create `index.html`

The HTML is the app shell. Three key parts:

### 4.1 PWA meta tags in `<head>`

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#2196F3">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="PhotoJournal">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icons/icon-192.png">
```

- `viewport` — Without this, mobile browsers zoom out and show a tiny desktop view
- `apple-mobile-web-app-capable` — Enables iOS standalone mode
- `apple-touch-icon` — iOS ignores manifest icons; this link element handles iOS

### 4.2 Install banner (hidden by default)

```html
<div id="install-banner" class="install-banner hidden">
  <p>📲 Add Photo Journal to your home screen!</p>
  <button id="install-btn" class="btn">Install</button>
  <button id="dismiss-btn" class="btn">✕</button>
</div>
```

JavaScript shows this banner when the browser fires `beforeinstallprompt`.

### 4.3 Camera input

```html
<input type="file" id="camera-input" accept="image/*" capture="environment">
```

- `accept="image/*"` — Only allows image files
- `capture="environment"` — Opens the rear camera on mobile; desktop shows file picker

### 4.4 Script tag position

```html
<!-- At the bottom of <body>, before </body> -->
<script src="app.js"></script>
```

Loading JavaScript at the bottom means the entire HTML is parsed before our code runs. PHP analogy: all your HTML output prints first, then your PHP logic runs at the end of the file.

---

## Step 5 — Create `style.css`

Three CSS techniques worth noting:

### 5.1 Box-sizing reset

```css
* {
  box-sizing: border-box; /* Padding and borders are included in width/height */
  margin: 0;
  padding: 0;
}
```

Without `border-box`, adding `padding: 10px` to a `width: 100%` element makes it overflow its container — a very common beginner bug.

### 5.2 Gallery grid

```css
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
```

`auto-fill` + `minmax(140px, 1fr)` automatically creates as many columns as fit the screen. On a phone: 2 columns. On desktop: 4+ columns. No JavaScript or media queries needed.

### 5.3 Text overflow ellipsis

```css
.desc {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* Shows "..." when text is too long */
}
```

---

## Step 6 — Create `app.js`

The JavaScript is split into focused functions. Each function has one job.

### 6.1 Camera capture and FileReader

```javascript
var currentPhotoDataUrl = null; // Global: stores the selected photo as base64

function setupCamera() {
  var cameraInput = document.getElementById('camera-input');

  cameraInput.addEventListener('change', function(event) {
    var file = event.target.files[0]; // The selected File object
    if (!file) return;

    // FileReader converts the File object to a base64 string
    // PHP analogy: base64_encode(file_get_contents($path))
    var reader = new FileReader();
    reader.onload = function(e) {
      currentPhotoDataUrl = e.target.result; // "data:image/jpeg;base64,..."
      document.getElementById('preview-img').src = currentPhotoDataUrl;
      document.getElementById('photo-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file); // Starts reading asynchronously
  });
}
```

**Why base64?** `localStorage` only stores text strings. Base64 converts binary image data to text. The trade-off: base64 is ~33% larger than the original binary. For a local app this is acceptable.

### 6.2 Geolocation

```javascript
var currentLocation = null; // Global: stores GPS coordinates

function setupLocation() {
  document.getElementById('get-location-btn').addEventListener('click', function() {

    // Ask the device for its GPS position — asynchronous
    // Browser shows a permission popup first
    navigator.geolocation.getCurrentPosition(
      function(position) {
        // Success: store latitude and longitude
        currentLocation = {
          latitude:  position.coords.latitude,
          longitude: position.coords.longitude
        };
      },
      function(error) {
        // Error: user denied, or GPS unavailable
        console.error('Location error:', error.message);
      }
    );
  });
}
```

### 6.3 LocalStorage — saving and loading

```javascript
// PHP: file_put_contents('photos.json', json_encode($photos))
function savePhotos(photos) {
  localStorage.setItem('photos', JSON.stringify(photos));
}

// PHP: json_decode(file_get_contents('photos.json'), true) ?? []
function loadPhotos() {
  var raw = localStorage.getItem('photos');
  if (!raw) return [];
  return JSON.parse(raw);
}
```

**LocalStorage facts:**
- Stores key-value pairs as strings (must use `JSON.stringify` / `JSON.parse`)
- Persists across page reloads and browser restarts
- Cleared when user clears "Site Data" in browser settings
- Limit: ~5–10 MB depending on browser (sufficient for a small gallery)
- Scope: per origin (`localhost:8080` has its own storage, separate from `localhost:3000`)

### 6.4 Saving a photo

```javascript
function setupSaveButton() {
  document.getElementById('save-btn').addEventListener('click', function() {
    if (!currentPhotoDataUrl) {
      alert('Please select a photo first!');
      return;
    }

    var photo = {
      id:          Date.now(),                // Unique ID — PHP: microtime(true)
      dataUrl:     currentPhotoDataUrl,       // base64 image
      description: document.getElementById('description').value.trim(),
      location:    currentLocation,           // null if not captured
      timestamp:   new Date().toISOString()   // PHP: date('c')
    };

    var photos = loadPhotos();
    photos.unshift(photo);   // Add to front (newest first) — PHP: array_unshift()
    savePhotos(photos);

    renderGallery();          // Refresh the gallery
    showNotification('Photo Saved! 📷', photo.description || 'Saved.');
    resetForm();
  });
}
```

### 6.5 Rendering the gallery

```javascript
function renderGallery() {
  var gallery = document.getElementById('gallery');
  var photos  = loadPhotos();

  gallery.innerHTML = ''; // Clear existing cards

  if (photos.length === 0) {
    gallery.innerHTML = '<p class="gallery-empty">No photos yet.</p>';
    return;
  }

  // PHP: foreach ($photos as $photo) { echo buildCard($photo); }
  photos.forEach(function(photo) {
    gallery.appendChild(buildPhotoCard(photo));
  });
}
```

### 6.6 XSS prevention

Any time you insert user-entered text into HTML, you must escape it. Otherwise, a description like `<script>alert('hacked')</script>` would execute as JavaScript.

```javascript
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str)); // createTextNode escapes automatically
  return div.innerHTML;
  // PHP equivalent: htmlspecialchars($str, ENT_QUOTES, 'UTF-8')
}
```

### 6.7 Notifications

```javascript
// Step 1: Ask permission (shows browser popup, one-time)
Notification.requestPermission().then(function(permission) {
  console.log('Permission:', permission); // 'granted', 'denied', or 'default'
});

// Step 2: Show a notification via the service worker
// (works even when the tab is not focused)
function showNotification(title, body) {
  if (Notification.permission !== 'granted') return;

  navigator.serviceWorker.ready.then(function(registration) {
    registration.showNotification(title, {
      body:    body,
      icon:    'icons/icon-192.png',
      vibrate: [200, 100, 200] // buzz, pause, buzz
    });
  });
}
```

**Why `registration.showNotification()` instead of `new Notification()`?**
`registration.showNotification()` works even when the app is in the background. `new Notification()` only works when the tab is in focus.

### 6.8 Install banner

```javascript
var installPromptEvent = null; // Save the browser's event for later

window.addEventListener('beforeinstallprompt', function(event) {
  event.preventDefault();       // Stop the browser's default mini-infobar
  installPromptEvent = event;   // Save it
  document.getElementById('install-banner').classList.remove('hidden'); // Show ours
});

document.getElementById('install-btn').addEventListener('click', function() {
  if (!installPromptEvent) return;
  installPromptEvent.prompt(); // Show the native install dialog
  installPromptEvent.userChoice.then(function(result) {
    installPromptEvent = null; // Can only be used once
    document.getElementById('install-banner').classList.add('hidden');
  });
});
```

---

## Step 7 — Run the App

**Start a local HTTP server (choose any option):**

```bash
# Python 3
python3 -m http.server 8080

# PHP (you already know this one!)
php -S localhost:8080

# Node.js (if installed)
npx serve .
```

Open: **`http://localhost:8080`**

**Check DevTools (F12):**
- Application tab → Service Workers: should show `sw.js` as "Activated and running"
- Application tab → Cache Storage → `photo-journal-v1`: should list all 7 files
- Application tab → Manifest: should show your app name and icons

---

## Step 8 — Test Each Feature

### Camera
- Click "Take or Choose a Photo" — desktop opens file picker, mobile opens camera
- Select any image — preview should appear below the input

### Location
- Click "📍 Get My Location"
- Browser asks for location permission — allow it
- Coordinates appear below the button

### Save & Gallery
- Select a photo, write a description, optionally get location
- Click "💾 Save Photo"
- Photo appears in the gallery grid
- Reload the page — photo is still there (localStorage persists)

### Notifications
- Click "🔔 Enable Notifications" — browser asks for permission
- Allow it — button changes to "✅ Notifications Enabled"
- Save a photo — a notification appears

### Delete
- Click "Delete" on any gallery card
- Confirm the dialog — card is removed from gallery and localStorage

---

## Step 9 — Test Offline Mode

1. Open DevTools → Network tab → change throttling to **Offline**
2. Reload the page (`Ctrl+R` / `Cmd+R`)
3. The app loads from the service worker cache — no network needed
4. Your saved photos are still visible (from localStorage)
5. You can still save new photos (localStorage is local, no network needed)

---

## Step 10 — Install the PWA

### Desktop (Chrome)
1. Open `http://localhost:8080` in Chrome
2. The install banner appears (may take a few seconds for Chrome to decide)
3. Click **Install** — the app opens as a standalone window without browser chrome

### Android
- Open in Chrome → tap the three-dot menu → **Add to Home Screen**

### iOS (Safari)
- Open in Safari → tap the Share button → **Add to Home Screen**
- Note: The `beforeinstallprompt` banner does NOT fire on iOS. The install banner in our app won't appear on iOS — users must manually add via the Share menu.

---

## Common Mistakes and Fixes

| Mistake | Symptom | Fix |
|---|---|---|
| `sw.js` not at root | Service worker registers but scope is wrong | Move `sw.js` to the same folder as `index.html` |
| Opening via `file://` | SW registration fails with error | Use `python3 -m http.server 8080` |
| Old cached files after update | Changes don't appear after page reload | Change `CACHE_NAME` to a new version |
| File missing from `FILES_TO_CACHE` | App fails offline for that file | Add every file the app needs to the array |
| Notification not showing | Nothing happens after save | Check `Notification.permission` in console — must be `'granted'` |
| Install banner not appearing | No banner visible | Check DevTools → Application → Manifest for errors |
| Photos lost | Gallery empty after clearing browser data | Expected — localStorage is browser storage |

---

## Going Further

| Feature | Technology |
|---|---|
| Real server push notifications | Push API + VAPID keys + a push server |
| Sync photos to a server when back online | Background Sync API |
| Better image compression | `canvas.toBlob(callback, 'image/jpeg', 0.7)` |
| Store more data (no 5 MB limit) | IndexedDB instead of localStorage |
| Show a map for the location | Leaflet.js + OpenStreetMap |
| Share a photo | Web Share API: `navigator.share({ files: [file] })` |
| Scan a QR code | BarcodeDetector API |

---

*All data in this app stays on your device. Nothing is sent to any server.*
