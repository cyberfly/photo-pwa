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
