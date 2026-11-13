// Einstellungen: Regal-Konfiguration, Backup (Export/Import), Update, Info.

import { h, toast } from '../ui.js';
import { getMeta, SCHEMA_VERSION } from '../db.js';
import { ZONES, APP_VERSION } from '../constants.js';
import { backupStatus } from '../backup.js';
import { exportBackup, importFromPicker } from '../backup-flow.js';
import { checkForUpdate } from '../update.js';

export async function createSettingsView(config, { onEditShelf }) {
  const total = config.shelves.reduce((a, s) => a + s.slots, 0);
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const lastBackup = await getMeta('lastBackup');
  const status = backupStatus(lastBackup, { hasWines: true });

  const zoneSummary = ZONES.map((z) => {
    const shelves = config.shelves.filter((s) => s.zone === z.key);
    const slots = shelves.reduce((a, s) => a + s.slots, 0);
    return h('div', { class: 'row' }, h('span', {}, z.label),
      h('span', { class: 'muted' }, `${shelves.length} Fächer · ${slots} Plätze`));
  });

  const backupText = status.never ? 'noch nie'
    : `${new Date(lastBackup).toLocaleDateString('de-DE')} (vor ${status.days} ${status.days === 1 ? 'Tag' : 'Tagen'})`;

  const updateBtn = h('button', { class: 'btn block', onclick: async () => {
    updateBtn.disabled = true;
    const result = await checkForUpdate();
    updateBtn.disabled = false;
    toast({
      available: 'Neue Version gefunden. Bitte unten „Aktualisieren“ tippen.',
      current: 'Du hast die neueste Version.',
      unsupported: 'Update-Suche ist hier nicht verfügbar.',
      error: 'Update-Suche fehlgeschlagen. Bist du online?',
    }[result]);
  } }, 'Nach Update suchen');

  return h('div', { class: 'view' },
    h('header', { class: 'view-header' }, h('h1', {}, 'Einstellungen')),

    h('h2', { class: 'section-title' }, 'Regal'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('strong', {}, 'Gesamt'), h('strong', {}, `${config.shelves.length} Fächer · ${total} Plätze`)),
      zoneSummary,
      h('button', { class: 'btn block', onclick: onEditShelf }, 'Regal-Konfiguration ändern')),

    h('h2', { class: 'section-title' }, 'Backup'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', {}, 'Letztes Backup'),
        h('span', { class: status.due ? 'warn' : 'muted' }, backupText)),
      status.due && h('p', { class: 'warn small' }, status.never ? 'Du hast noch kein Backup gemacht. Bitte sichere deine Daten.' : 'Das Backup ist älter als 30 Tage. Bitte sichere deine Daten.'),
      h('button', { class: 'btn primary block', onclick: async () => { if (await exportBackup()) window.dispatchEvent(new Event('wr:refresh')); } }, 'Backup exportieren'),
      h('button', { class: 'btn block', onclick: importFromPicker }, 'Backup importieren'),
      h('p', { class: 'muted small' }, 'Das Backup ist eine Datei mit allen Weinen und Fotos. Speichere sie in „Dateien“ oder iCloud Drive, nicht nur auf dem iPhone.')),

    h('h2', { class: 'section-title' }, 'Speicher & Version'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', {}, 'Dauerhafter Speicher'),
        h('span', { class: 'muted' }, persisted ? 'gewährt' : 'nicht bestätigt')),
      h('div', { class: 'row' }, h('span', {}, 'App-Version'), h('span', { class: 'muted' }, APP_VERSION)),
      h('div', { class: 'row' }, h('span', {}, 'Datenmodell'), h('span', { class: 'muted' }, `Version ${SCHEMA_VERSION}`)),
      updateBtn,
      h('p', { class: 'muted small' }, 'Alle Daten bleiben lokal auf diesem Gerät.')));
}
