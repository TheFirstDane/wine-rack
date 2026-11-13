// Service Worker: cacht beim Installieren alle App-Dateien, danach läuft alles offline.
//
// UPDATES: Bei jeder Änderung an einer App-Datei VERSION erhöhen (gleichzeitig mit APP_VERSION in
// js/constants.js, am einfachsten mit `python3 tools/bump_version.py 0.5.0`). Neue Dateien auch in
// ASSETS eintragen (tests/pwa.test.js prüft beides). Der neue Service Worker lädt alles im
// Hintergrund und wartet; die App zeigt "Neue Version verfügbar", erst nach Tipp auf
// "Aktualisieren" wird umgeschaltet. Die Daten (IndexedDB) sind vom Cache unabhängig und bleiben erhalten.

const VERSION = '0.4.0';
const CACHE_PREFIX = 'wine-rack-v';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// Relative Pfade: lösen sich gegen den Ort von sw.js auf, funktioniert also auch unter /wine-rack/.
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/backup-flow.js',
  'js/backup.js',
  'js/constants.js',
  'js/db.js',
  'js/image.js',
  'js/logic.js',
  'js/migrations.js',
  'js/ui.js',
  'js/update.js',
  'js/views/archive.js',
  'js/views/detail.js',
  'js/views/drink.js',
  'js/views/notices.js',
  'js/views/settings.js',
  'js/views/setup.js',
  'js/views/shelf.js',
  'js/views/slotpicker.js',
  'js/views/wineform.js',
  'js/views/wines.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien im Cache landen.
  // Bewusst KEIN skipWaiting() hier: die App entscheidet über die Umschaltung (siehe unten).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
});

// Auf Wunsch der App ("Aktualisieren") sofort übernehmen
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Alte Cache-Versionen löschen, Seiten übernehmen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache zuerst, Netz nur als Rückfall
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).catch(() => {
        // Offline und unbekannte Adresse: für Seitenaufrufe die App selbst liefern
        if (request.mode === 'navigate') return caches.match('./');
        return Response.error();
      });
    })
  );
});
