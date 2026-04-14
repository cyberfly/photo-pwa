/**
 * app.js — Photo Journal PWA: YOUR IMPLEMENTATION FILE
 *
 * This is your working file. Each function has a description of what
 * it needs to do, broken into TODO steps. Implement them one by one.
 *
 * Functions already implemented for you (don't need to touch):
 *   - resetForm()
 *   - deletePhoto()
 *   - escapeHtml()
 *   - updateNotifyButton()
 *   - showNotification()
 *   - init()
 *
 * Functions you need to implement (marked with TODO):
 *   1. registerServiceWorker()
 *   2. setupInstallBanner()
 *   3. setupCamera()
 *   4. setupLocation()
 *   5. loadPhotos()
 *   6. savePhotos()
 *   7. setupSaveButton()
 *   8. renderGallery()
 *   9. buildPhotoCard()
 *  10. setupNotifications()
 *
 * Tip: Read tutorial.md alongside this file.
 * Tip: Open DevTools (F12) → Console to see your console.log() output.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// GLOBAL VARIABLES
// Shared state between functions — like PHP session variables.
// ═══════════════════════════════════════════════════════════════

/** The selected photo stored as a base64 string. null = no photo yet. */
var currentPhotoDataUrl = null;

/** GPS coordinates from the device. null = location not captured yet. */
var currentLocation = null;

/**
 * The browser's install prompt event, saved for later.
 * We call .prompt() on it when the user clicks the Install button.
 */
var installPromptEvent = null;


// ═══════════════════════════════════════════════════════════════
// 1. REGISTER SERVICE WORKER
// Enables offline mode by registering the sw.js background script.
// ═══════════════════════════════════════════════════════════════

/**
 * Registers sw.js with the browser so offline caching starts.
 *
 * The service worker file must be at the ROOT of the site (same folder
 * as index.html) so it can control the whole app.
 *
 * Reference: tutorial.md → Step 3
 */
function registerServiceWorker() {
  // TODO 1a: Check if service workers are supported.
  //   Hint: if (!('serviceWorker' in navigator)) { return; }

  // TODO 1b: Add a 'load' event listener on window.
  //   Inside the listener:

  //   TODO 1c: Call navigator.serviceWorker.register('sw.js')
  //     .then(function(registration) {
  //       console.log('[App] Service Worker registered. Scope:', registration.scope);
  //     })
  //     .catch(function(err) {
  //       console.error('[App] Service Worker registration failed:', err);
  //     });
}


// ═══════════════════════════════════════════════════════════════
// 2. PWA INSTALL BANNER
// Shows a custom banner when the browser says the app is installable.
// ═══════════════════════════════════════════════════════════════

/**
 * Sets up the install banner that appears when the app can be installed.
 *
 * The browser fires 'beforeinstallprompt' when all install criteria are met:
 *   - Valid manifest.json
 *   - Service worker registered
 *   - Served over HTTPS or localhost
 *
 * Reference: tutorial.md → Step 6.8
 */
function setupInstallBanner() {
  var banner     = document.getElementById('install-banner');
  var installBtn = document.getElementById('install-btn');
  var dismissBtn = document.getElementById('dismiss-btn');

  // TODO 2a: Listen for 'beforeinstallprompt' on window.
  //   Inside the listener:
  //     - Call event.preventDefault()  ← stops browser's default mini-infobar
  //     - Save event to installPromptEvent
  //     - Show the banner: banner.classList.remove('hidden')
  //     - console.log('[App] Install banner shown')

  // TODO 2b: Listen for 'click' on installBtn.
  //   Inside the listener:
  //     - If installPromptEvent is null, return early
  //     - Call installPromptEvent.prompt()  ← shows native install dialog
  //     - Call installPromptEvent.userChoice.then(function(result) {
  //         installPromptEvent = null;               ← can only use once
  //         banner.classList.add('hidden');
  //       });

  // TODO 2c: Listen for 'click' on dismissBtn.
  //   Inside the listener:
  //     - Hide the banner: banner.classList.add('hidden')
}


// ═══════════════════════════════════════════════════════════════
// 3. CAMERA CAPTURE
// Reads the selected image file as a base64 string using FileReader.
// ═══════════════════════════════════════════════════════════════

/**
 * Sets up the camera file input.
 *
 * When a photo is selected, FileReader converts the binary file into
 * a base64 text string we can store in localStorage.
 *
 * PHP analogy: base64_encode(file_get_contents($uploadedFile))
 *
 * Reference: tutorial.md → Step 6.1
 */
function setupCamera() {
  var cameraInput = document.getElementById('camera-input');
  var previewDiv  = document.getElementById('photo-preview');
  var previewImg  = document.getElementById('preview-img');

  // TODO 3a: Listen for 'change' on cameraInput.
  //   Inside the listener:

  //   TODO 3b: Get the selected file:
  //     var file = event.target.files[0];

  //   TODO 3c: If no file, return early.

  //   TODO 3d: Create a FileReader:
  //     var reader = new FileReader();

  //   TODO 3e: Set reader.onload = function(e) { ... }
  //     Inside onload:
  //       - Store e.target.result in currentPhotoDataUrl
  //         (e.target.result is the base64 string: "data:image/jpeg;base64,...")
  //       - Set previewImg.src = currentPhotoDataUrl
  //       - Show previewDiv: previewDiv.classList.remove('hidden')

  //   TODO 3f: Start reading the file as base64:
  //     reader.readAsDataURL(file);
}


// ═══════════════════════════════════════════════════════════════
// 4. LOCATION
// Gets the device's GPS coordinates using the Geolocation API.
// ═══════════════════════════════════════════════════════════════

/**
 * Sets up the "Get My Location" button.
 *
 * The browser asks the user for location permission.
 * On success, we store { latitude, longitude } in currentLocation.
 *
 * Reference: tutorial.md → Step 6.2
 */
function setupLocation() {
  var locationBtn  = document.getElementById('get-location-btn');
  var locationText = document.getElementById('location-text');

  // TODO 4a: Listen for 'click' on locationBtn.
  //   Inside the listener:

  //   TODO 4b: Check if geolocation is supported:
  //     if (!navigator.geolocation) {
  //       locationText.textContent = 'Geolocation not supported.';
  //       return;
  //     }

  //   TODO 4c: Show a loading message:
  //     locationText.textContent = '⏳ Getting location...';

  //   TODO 4d: Request the position:
  //     navigator.geolocation.getCurrentPosition(
  //       function(position) { ... },   ← success callback
  //       function(error) { ... }       ← error callback
  //     );

  //   TODO 4e — success callback: store and display coordinates:
  //     currentLocation = {
  //       latitude:  position.coords.latitude,
  //       longitude: position.coords.longitude
  //     };
  //     locationText.textContent = '📍 Lat: ' + currentLocation.latitude.toFixed(5)
  //                              + ', Lng: ' + currentLocation.longitude.toFixed(5);

  //   TODO 4f — error callback: show the error:
  //     locationText.textContent = '❌ ' + error.message;
}


// ═══════════════════════════════════════════════════════════════
// 5 & 6. LOCAL STORAGE — LOAD AND SAVE
// localStorage stores data as text strings, so we use JSON.
// PHP analogy: file_get_contents / file_put_contents with json_encode
// ═══════════════════════════════════════════════════════════════

/**
 * Loads the photos array from localStorage.
 * Returns an empty array if nothing has been saved yet.
 *
 * @returns {Array}
 */
function loadPhotos() {
  // TODO 5a: Read from storage:
  //   var raw = localStorage.getItem('photos');
  //   (returns null if the key does not exist)

  // TODO 5b: If raw is null, return []

  // TODO 5c: Parse and return the array:
  //   return JSON.parse(raw);
}

/**
 * Saves the photos array to localStorage.
 *
 * @param {Array} photos
 */
function savePhotos(photos) {
  // TODO 6a: Convert to JSON string and store:
  //   localStorage.setItem('photos', JSON.stringify(photos));
}


// ═══════════════════════════════════════════════════════════════
// 7. SAVE BUTTON
// Collects photo + description + location, builds a photo object,
// saves it to localStorage, refreshes the gallery.
// ═══════════════════════════════════════════════════════════════

/**
 * Sets up the Save button.
 *
 * Reference: tutorial.md → Step 6.4
 */
function setupSaveButton() {
  var saveBtn = document.getElementById('save-btn');

  // TODO 7a: Listen for 'click' on saveBtn.
  //   Inside the listener:

  //   TODO 7b: Validate — if currentPhotoDataUrl is null, alert and return:
  //     alert('Please take or select a photo first!');

  //   TODO 7c: Build the photo object:
  //     var photo = {
  //       id:          Date.now(),      ← unique ID (PHP: time() or auto-increment)
  //       dataUrl:     currentPhotoDataUrl,
  //       description: document.getElementById('description').value.trim(),
  //       location:    currentLocation, ← null if user skipped location
  //       timestamp:   new Date().toISOString()  ← PHP: date('c')
  //     };

  //   TODO 7d: Load, prepend, save:
  //     var photos = loadPhotos();
  //     photos.unshift(photo);    ← add to front (newest first) — PHP: array_unshift()
  //     savePhotos(photos);

  //   TODO 7e: Show a notification:
  //     showNotification('Photo Saved! 📷', photo.description || 'Your photo has been saved.');

  //   TODO 7f: Refresh the gallery and clear the form:
  //     renderGallery();
  //     resetForm();
}

/**
 * Clears all form fields after saving. Already implemented.
 */
function resetForm() {
  currentPhotoDataUrl = null;
  currentLocation     = null;
  document.getElementById('camera-input').value        = '';
  document.getElementById('preview-img').src           = '';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('description').value         = '';
  document.getElementById('location-text').textContent = 'No location added yet.';
}


// ═══════════════════════════════════════════════════════════════
// 8 & 9. GALLERY
// Read photos from localStorage and build the grid of cards.
// ═══════════════════════════════════════════════════════════════

/**
 * Renders the gallery grid from localStorage.
 * Called on page load and after every save or delete.
 *
 * Reference: tutorial.md → Step 6.5
 */
function renderGallery() {
  var gallery = document.getElementById('gallery');
  var photos  = loadPhotos();

  // TODO 8a: Clear the gallery:
  //   gallery.innerHTML = '';

  // TODO 8b: If no photos, show the empty message and return:
  //   gallery.innerHTML = '<p class="gallery-empty">No photos yet. Take your first one above!</p>';

  // TODO 8c: Otherwise, loop and append a card for each photo:
  //   photos.forEach(function(photo) {
  //     var card = buildPhotoCard(photo);
  //     gallery.appendChild(card);
  //   });
}

/**
 * Builds a single photo card element.
 *
 * @param  {Object}      photo — { id, dataUrl, description, location, timestamp }
 * @returns {HTMLElement} The card <div> ready to insert into the gallery.
 *
 * Reference: tutorial.md → Step 6.5
 */
function buildPhotoCard(photo) {
  // Create the card container div
  var card = document.createElement('div');
  card.className  = 'photo-card';
  card.dataset.id = photo.id;

  // Format the date — PHP equivalent: date('d M Y H:i', strtotime($ts))
  var d       = new Date(photo.timestamp);
  var dateStr = d.toLocaleDateString() + ' ' +
                d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Build the location string
  var locStr = 'No location';
  if (photo.location) {
    locStr = photo.location.latitude.toFixed(3) + ', ' + photo.location.longitude.toFixed(3);
  }

  // TODO 9: Set card.innerHTML to display the photo card.
  //
  // Use escapeHtml() around any user-entered text to prevent XSS.
  // PHP equivalent: htmlspecialchars($text, ENT_QUOTES, 'UTF-8')
  //
  // The card needs these elements:
  //   - <img> with src=photo.dataUrl and a descriptive alt attribute
  //   - <div class="card-meta"> containing:
  //       <p class="desc">  ← photo description (use escapeHtml)
  //       <p class="loc">   ← locStr
  //       <p class="date">  ← dateStr
  //       <button class="btn btn-danger" onclick="deletePhoto(photo.id)"> Delete </button>
  //
  // Example:
  // card.innerHTML =
  //   '<img src="' + photo.dataUrl + '" alt="' + escapeHtml(photo.description) + '">' +
  //   '<div class="card-meta">' +
  //     '<p class="desc">' + escapeHtml(photo.description || '(no description)') + '</p>' +
  //     '<p class="loc">📍 ' + locStr + '</p>' +
  //     '<p class="date">🕐 ' + dateStr + '</p>' +
  //     '<button class="btn btn-danger" onclick="deletePhoto(' + photo.id + ')">Delete</button>' +
  //   '</div>';

  return card; // ← return the card so renderGallery can append it
}

/**
 * Deletes a photo by ID. Called from the onclick on each Delete button.
 * Already implemented — this shows how filter() works like PHP's array_filter().
 *
 * @param {number} id
 */
function deletePhoto(id) {
  if (!confirm('Delete this photo? This cannot be undone.')) return;

  var photos    = loadPhotos();
  var remaining = photos.filter(function(photo) { return photo.id !== id; });
  savePhotos(remaining);
  renderGallery();
}

/**
 * Escapes a string for safe insertion into HTML (prevents XSS).
 * Already implemented — PHP equivalent: htmlspecialchars($str, ENT_QUOTES, 'UTF-8')
 *
 * @param  {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}


// ═══════════════════════════════════════════════════════════════
// 10. NOTIFICATIONS
// Ask for permission, then show a notification when a photo is saved.
// ═══════════════════════════════════════════════════════════════

/**
 * Sets up the "Enable Notifications" button.
 *
 * Reference: tutorial.md → Step 6.7
 */
function setupNotifications() {
  var btn = document.getElementById('notify-btn');

  // TODO 10a: Check if the Notification API is supported:
  //   if (!('Notification' in window)) {
  //     btn.textContent = 'Notifications not supported';
  //     btn.disabled    = true;
  //     return;
  //   }

  // TODO 10b: Call updateNotifyButton() to set the correct label on load.

  // TODO 10c: Listen for 'click' on btn.
  //   Inside the listener:
  //     Notification.requestPermission().then(function() {
  //       updateNotifyButton();
  //     });
}

/**
 * Updates the notification button label based on current permission.
 * Already implemented — called by setupNotifications() and after permission changes.
 */
function updateNotifyButton() {
  var btn = document.getElementById('notify-btn');
  if (Notification.permission === 'granted') {
    btn.textContent = '✅ Notifications Enabled';
    btn.disabled    = true;
  } else if (Notification.permission === 'denied') {
    btn.textContent = '🚫 Notifications Blocked';
    btn.disabled    = true;
  } else {
    btn.textContent = '🔔 Enable Notifications';
    btn.disabled    = false;
  }
}

/**
 * Shows a notification via the Service Worker.
 * Already implemented — called by setupSaveButton() after saving.
 *
 * Using registration.showNotification() (not new Notification()) works even
 * when the browser tab is not focused.
 *
 * @param {string} title
 * @param {string} body
 */
function showNotification(title, body) {
  if (Notification.permission !== 'granted') return;

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(function(registration) {
      registration.showNotification(title, {
        body:    body,
        icon:    'icons/icon-192.png',
        vibrate: [200, 100, 200]
      });
    });
  } else {
    new Notification(title, { body: body, icon: 'icons/icon-192.png' });
  }
}


// ═══════════════════════════════════════════════════════════════
// INIT — Wires everything up when the page finishes loading.
// Already implemented. Once you implement all TODO functions above,
// everything will work automatically.
// ═══════════════════════════════════════════════════════════════

/**
 * Main entry point. Called once the DOM is ready.
 * PHP analogy: code at the bottom of index.php that runs on every page load.
 */
function init() {
  console.log('[App] Starting Photo Journal...');

  registerServiceWorker(); // 1. Enable offline mode
  setupInstallBanner();    // 2. Show install banner when ready
  setupCamera();           // 3. Camera input + preview
  setupLocation();         // 4. GPS location button
  setupSaveButton();       // 5–7. Save button (uses loadPhotos + savePhotos)
  setupNotifications();    // 10. Notification permission button
  renderGallery();         // 8–9. Show saved photos on load

  console.log('[App] Ready! Implement the TODO functions in app.js to make it work.');
}

// DOMContentLoaded fires when HTML is parsed and the DOM is ready.
// PHP analogy: this is like everything after the closing ?> tag has been output.
document.addEventListener('DOMContentLoaded', init);
