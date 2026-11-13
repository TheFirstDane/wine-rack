// Einstiegspunkt: Start, Routing (per #hash) und Ansichtswechsel.
//
// Adressen:  #/regal  #/weine  #/archiv  #/einstellungen
//            #/einlagern            #/einlagern/<fachId>/<platz>
//            #/wein/<id>            #/wein/<id>/bearbeiten

import { h } from './ui.js';
import { openDB, getShelfConfig, getWine } from './db.js';
import { createSetupView } from './views/setup.js';
import { createShelfView } from './views/shelf.js';
import { createSettingsView } from './views/settings.js';
import { createArchiveView } from './views/archive.js';
import { createWinesView } from './views/wines.js';
import { createDetailView } from './views/detail.js';
import { createWineForm } from './views/wineform.js';
import { backupNotice } from './views/notices.js';
import { importFromPicker } from './backup-flow.js';
import { initUpdates } from './update.js';

const appEl = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

let config = null;       // Regal-Konfiguration
let currentHash = null;

// Jede Route bekommt die Teile hinter dem Namen (z. B. ['12', 'bearbeiten']) und liefert [Ansicht, aktiver Tab].
const routes = {
  regal: async () => [await createShelfView(config), 'regal'],
  weine: async () => [await createWinesView(), 'weine'],
  archiv: async () => [await createArchiveView(), 'archiv'],
  einstellungen: async () => [await createSettingsView(config, { onEditShelf: () => showSetup(config) }), 'einstellungen'],
  einlagern: async ([shelfId, slot]) => [
    await createWineForm({ config, prefillPlace: shelfId ? { shelfId, slot: Number(slot) } : null }), 'regal'],
  wein: async ([id, action]) => {
    const wineId = Number(id);
    if (action === 'bearbeiten') {
      const existing = await getWine(wineId);
      if (existing) return [await createWineForm({ config, existing }), 'weine'];
    }
    return [await createDetailView(config, wineId), 'weine'];
  },
};

// Ansicht austauschen; die neue blendet weich ein.
async function render(hash) {
  const [name, ...args] = hash.replace(/^#\/?/, '').split('/');
  const route = routes[name] ? name : 'regal';
  const [view, tab] = await routes[route](routes[name] ? args : []);
  if (hash !== currentHash) return; // inzwischen woandershin navigiert
  for (const a of tabbar.querySelectorAll('a')) {
    const active = a.dataset.route === tab;
    a.classList.toggle('active', active);
    active ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  // Backup-Erinnerung oben in Regal und Weinliste
  if (route === 'regal' || route === 'weine') {
    const notice = await backupNotice();
    if (hash !== currentHash) return;
    if (notice) view.querySelector('.view-header')?.after(notice);
  }
  view.classList.add('view-enter');
  appEl.replaceChildren(view);
  window.scrollTo(0, 0);
}

async function navigate() {
  if (!config) return;
  const hash = location.hash || '#/regal';
  if (hash === currentHash) return;
  currentHash = hash;
  try {
    await render(hash);
  } catch (err) {
    console.error(err);
    appEl.replaceChildren(h('div', { class: 'view' }, h('div', { class: 'empty' }, h('p', {}, 'Fehler: ' + err.message))));
  }
}

// Einrichtungsassistent im Vollbild (Tab-Leiste ausgeblendet).
function showSetup(existing) {
  document.body.classList.add('is-setup');
  const view = createSetupView({
    existing,
    onImport: importFromPicker,
    onDone: async (newConfig) => {
      config = newConfig;
      document.body.classList.remove('is-setup');
      currentHash = null;
      location.hash = '#/regal';
      await navigate();
    },
    onCancel: () => {
      document.body.classList.remove('is-setup');
      currentHash = null;
      navigate();
    },
  });
  view.classList.add('view-enter');
  appEl.replaceChildren(view);
}

async function boot() {
  initUpdates(); // Service Worker und "Neue Version verfügbar"
  // Bitte den Browser, die Daten nicht automatisch zu löschen.
  navigator.storage?.persist?.().catch(() => {});

  try {
    await openDB();
    config = await getShelfConfig();
  } catch (err) {
    appEl.replaceChildren(h('div', { class: 'view' },
      h('div', { class: 'empty' }, h('p', {}, 'Die lokale Datenbank konnte nicht geöffnet werden: ' + err.message))));
    return;
  }

  window.addEventListener('hashchange', navigate);
  // Ansicht neu laden, z. B. nach dem Trinken einer Flasche
  window.addEventListener('wr:refresh', () => { currentHash = null; navigate(); });
  if (!config) showSetup(null);
  else await navigate();
}

boot();
