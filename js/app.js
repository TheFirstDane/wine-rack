// Einstiegspunkt: Start, Routing (per #hash) und Ansichtswechsel.
//
// Adressen:  #/regal  #/weine  #/archiv  #/einstellungen
//            #/einlagern            #/einlagern/<fachId>/<platz>
//            #/wein/<id>            #/wein/<id>/bearbeiten
//
// Handy: eine Ansicht auf einmal (untere Tab-Leiste).
// Tablet: Seitenleiste + Master-Detail. Links steht Regal, Weine oder Archiv (Master), rechts das Wein-Detail
// oder das Formular (Detail). Ein Antippen ersetzt nur die rechte Seite, das Regal links bleibt stehen.

import { h, rotateUrls, useUrlScope } from './ui.js';
import { openDB, getShelfConfig, getWine, getRevision } from './db.js';
import { initDevice, isTablet } from './device.js';
import { nav } from './nav.js';
import { icon } from './icons.js';
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
import { ensureCrops } from './crops.js';

const appEl = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

let config = null;       // Regal-Konfiguration
let currentHash = null;

const MASTERS = ['regal', 'weine', 'archiv'];     // Tablet: stehen links
const DETAILS = ['wein', 'einlagern'];            // Tablet: stehen rechts

// Baut die Ansicht für eine Adresse. Liefert [Ansicht, aktiver Tab].
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

const parse = (hash) => {
  const [name, ...args] = hash.replace(/^#\/?/, '').split('/');
  return routes[name] ? { name, args } : { name: 'regal', args: [] };
};

function setActiveTab(tab) {
  for (const a of tabbar.querySelectorAll('a')) {
    const active = a.dataset.route === tab;
    a.classList.toggle('active', active);
    active ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
}

// Backup-Erinnerung oben in Regal und Weinliste
async function addNotice(view, name) {
  if (name !== 'regal' && name !== 'weine') return;
  const notice = await backupNotice();
  if (notice) view.querySelector('.view-header')?.after(notice);
}

// ---- Handy: eine Ansicht ----------------------------------------------------------------

async function renderPhone(hash, { name, args }) {
  appEl.classList.remove('md-host');
  // Bild-URLs: die neue Ansicht beginnt mit leerem Pool, die der alten werden nach dem Austausch freigegeben
  const free = rotateUrls('view');
  useUrlScope('view');
  try {
    const [view, tab] = await routes[name](args);
    if (hash !== currentHash) return; // inzwischen woandershin navigiert
    setActiveTab(tab);
    await addNotice(view, name);
    if (hash !== currentHash) return;
    view.classList.add('view-enter');
    appEl.replaceChildren(view);
    view.dispatchEvent(new Event('wr:attached')); // Ansichten, die Maße brauchen (Regal), rechnen jetzt
    window.scrollTo(0, 0);
  } finally {
    free();
  }
}

// ---- Tablet: Master-Detail ---------------------------------------------------------------

// Zustand der zwei Seiten, damit nur das Nötige neu gebaut wird
const md = { host: null, master: null, detail: null, masterName: null, masterRevision: -1 };

function emptyDetail() {
  return h('div', { class: 'view detail-empty' },
    h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icon('pointer')),
      h('p', {}, 'Wähle im Regal oder in der Liste einen Wein, dann erscheint er hier.')));
}

// Markiert den gewählten Wein im Master (Ring bzw. Hervorhebung)
function markSelected(wineId) {
  for (const el of appEl.querySelectorAll('[data-wine-id]')) {
    el.classList.toggle('is-selected', wineId != null && el.dataset.wineId === String(wineId));
  }
}

async function renderTablet(hash, { name, args }, { force = false } = {}) {
  // Einstellungen: eine Spalte
  if (name === 'einstellungen') {
    md.host = null;
    appEl.classList.remove('md-host');
    const free = rotateUrls('view');
    useUrlScope('view');
    try {
      const [view] = await routes[name](args);
      if (hash !== currentHash) return;
      setActiveTab('einstellungen');
      view.classList.add('view-enter');
      appEl.replaceChildren(h('div', { class: 'single-pane' }, view));
      window.scrollTo(0, 0);
    } finally { free(); }
    return;
  }

  const isMaster = MASTERS.includes(name);
  if (isMaster) nav.lastMaster = name;
  const masterName = isMaster ? name : nav.lastMaster;
  const showDetail = !isMaster || name === 'regal';      // Weine/Archiv ohne Auswahl: ganze Breite für die Karten
  const selectedId = name === 'wein' ? Number(args[0]) : null;

  // Aufbau der zwei Seiten, falls noch nicht vorhanden
  if (!md.host || !md.host.isConnected) {
    md.master = h('section', { class: 'md-pane md-master', 'aria-label': 'Übersicht' });
    md.detail = h('section', { class: 'md-pane md-detail', 'aria-label': 'Wein' });
    md.host = h('div', { class: 'md' }, md.master, md.detail);
    md.masterName = null;
    appEl.replaceChildren(md.host);
  }
  appEl.classList.add('md-host');
  md.host.classList.toggle('is-wide', !showDetail);

  // Master neu bauen, wenn der Bereich wechselt, sich Daten geändert haben oder ein Neuaufbau verlangt ist
  const revision = getRevision();
  if (force || md.masterName !== masterName || md.masterRevision !== revision) {
    const scrollTop = md.masterName === masterName ? md.master.scrollTop : 0;
    const free = rotateUrls('master');
    useUrlScope('master');
    try {
      const [view] = await routes[masterName]([]);
      if (hash !== currentHash) return;
      await addNotice(view, masterName);
      if (hash !== currentHash) return;
      md.master.replaceChildren(view);
      view.dispatchEvent(new Event('wr:attached'));
      md.master.scrollTop = scrollTop;
      md.masterName = masterName;
      md.masterRevision = revision;
    } finally { free(); }
  }
  setActiveTab(masterName);

  // Detail (rechts) immer neu
  const free = rotateUrls('detail');
  useUrlScope('detail');
  try {
    let view;
    if (DETAILS.includes(name)) [view] = await routes[name](args);
    else view = emptyDetail();
    if (hash !== currentHash) return;
    view.classList.add('view-enter');
    md.detail.replaceChildren(view);
    md.detail.scrollTop = 0;
  } finally { free(); }
  markSelected(selectedId);
}

// ---- Gemeinsam ----------------------------------------------------------------------------

async function render(hash, opts) {
  const route = parse(hash);
  if (isTablet()) await renderTablet(hash, route, opts);
  else { md.host = null; await renderPhone(hash, route); }
}

async function navigate({ force = false } = {}) {
  if (!config) return;
  const hash = location.hash || '#/regal';
  if (hash === currentHash && !force) return;
  currentHash = hash;
  try {
    await render(hash, { force });
  } catch (err) {
    console.error(err);
    appEl.replaceChildren(h('div', { class: 'view' }, h('div', { class: 'empty' }, h('p', {}, 'Fehler: ' + err.message))));
  }
}

// Alles neu aufbauen (z. B. nach dem Trinken, beim Wechsel des Profils)
const rebuild = () => { md.host = null; md.masterName = null; return navigate({ force: true }); };

// Einrichtungsassistent im Vollbild (Tab-Leiste bzw. Seitenleiste ausgeblendet).
function showSetup(existing) {
  document.body.classList.add('is-setup');
  appEl.classList.remove('md-host');
  md.host = null;
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
  appEl.replaceChildren(h('div', { class: 'single-pane' }, view));
}

async function boot() {
  initDevice(); // data-device am <html>: Handy kompakt/groß oder Tablet, siehe device.js
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

  window.addEventListener('hashchange', () => navigate());
  // Ansicht neu laden, z. B. nach dem Trinken einer Flasche
  window.addEventListener('wr:refresh', () => { currentHash = null; rebuild(); });
  // Profilwechsel (Auswahl in den Einstellungen, Drehen/Größe): Aufbau passt sich an
  window.addEventListener('wr:device', () => {
    if (!config || document.body.classList.contains('is-setup')) return;
    currentHash = null;
    rebuild();
  });
  if (!config) showSetup(null);
  else await navigate();

  // Fehlende Zuschnitt-Bilder (nach dem Update auf Datenmodell 2) im Hintergrund erzeugen
  ensureCrops()
    .then((n) => { if (n && (location.hash === '' || location.hash === '#/regal')) window.dispatchEvent(new Event('wr:refresh')); })
    .catch((err) => console.warn('Zuschnitte:', err));
}

boot();
