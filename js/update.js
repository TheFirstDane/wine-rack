// Service Worker registrieren und Updates melden ("Neue Version verfügbar").
// Ablauf: Neue sw.js wird im Hintergrund installiert und wartet. Sobald sie bereit ist, zeigt die
// App ein Banner. Erst nach Tipp auf "Aktualisieren" übernimmt sie, danach lädt die Seite neu.

import { h, nextFrame } from './ui.js';

let registration = null;
let updateRequested = false;

function showBanner(worker) {
  if (document.querySelector('.update-banner')) return;
  const banner = h('div', { class: 'update-banner', role: 'status' },
    h('span', {}, 'Neue Version verfügbar'),
    h('button', { class: 'btn small primary', onclick: () => {
      updateRequested = true;
      banner.querySelector('button').disabled = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    } }, 'Aktualisieren'));
  document.body.append(banner);
  nextFrame(() => banner.classList.add('show'));
}

export async function initUpdates() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // updateViaCache: 'none' → sw.js wird immer frisch geholt (sonst kann der HTTP-Cache Updates verzögern)
    registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  } catch (err) {
    console.warn('Service Worker:', err);
    return;
  }

  // Schon eine neue Version bereit (z. B. beim letzten Mal nicht bestätigt)?
  if (registration.waiting && navigator.serviceWorker.controller) showBanner(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      // "installed" + vorhandener Controller = Update (kein Erstinstall)
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showBanner(worker);
    });
  });

  // Nach dem Umschalten neu laden – aber nur, wenn der Nutzer das Update angefordert hat
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });

  // Beim Zurückkehren in die App nach Updates suchen (iPhone beendet Apps selten wirklich)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) registration.update().catch(() => {});
  });
}

// Für den Knopf in den Einstellungen. Liefert 'available' | 'current' | 'unsupported' | 'error'.
export async function checkForUpdate() {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
    const installing = registration.installing;
    if (installing && installing.state !== 'installed') {
      await new Promise((resolve) => installing.addEventListener('statechange', () => {
        if (['installed', 'redundant', 'activated'].includes(installing.state)) resolve();
      }));
    }
    return registration.waiting ? 'available' : 'current';
  } catch {
    return 'error';
  }
}
