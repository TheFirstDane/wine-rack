// Oberfläche für Export und Import (nutzt die reine Logik aus backup.js).

import { h, toast, dialog, alertDialog } from './ui.js';
import { getAllWines, getShelfConfig, getMeta, setMeta, importData } from './db.js';
import { createBackup, parseBackup, planMerge } from './backup.js';
import { APP_VERSION } from './constants.js';
import { todayISO } from './logic.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : 'unbekanntem Datum');

function download(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Exportiert alle Daten als eine JSON-Datei: Teilen-Dialog (iPhone), sonst Download.
// Das Backup-Datum wird erst gemerkt, wenn der Export nicht abgebrochen wurde.
export async function exportBackup() {
  try {
    const [wines, shelfConfig] = await Promise.all([getAllWines(), getShelfConfig()]);
    if (!shelfConfig) { await alertDialog('Nichts zu sichern', 'Richte zuerst das Regal ein.'); return false; }
    const backup = await createBackup({ wines, shelfConfig, appVersion: APP_VERSION });
    const file = new File([JSON.stringify(backup)], `wine-rack-backup-${todayISO()}.json`, { type: 'application/json' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Wine rack Backup' });
      } catch (err) {
        if (err.name === 'AbortError') return false; // Teilen-Dialog geschlossen: kein Backup
        download(file);                              // Teilen nicht möglich: Download als Rückfall
      }
    } else {
      download(file);
    }
    await setMeta('lastBackup', new Date().toISOString());
    toast('Backup erstellt');
    return true;
  } catch (err) {
    await alertDialog('Export fehlgeschlagen', err.message);
    return false;
  }
}

// Öffnet die Dateiauswahl; liefert die Datei oder null.
export function pickBackupFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// Liest, prüft und importiert eine Sicherung. Überschreibt nie ungefragt:
//   Gerät ohne Weine  → Wiederherstellen (nach Rückfrage)
//   Gerät mit Weinen  → Zusammenführen (nichts geht verloren) oder Ersetzen (nach zweiter Rückfrage)
export async function importBackup(file) {
  let result;
  try {
    result = parseBackup(await file.text());
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  if (!result.ok) { await alertDialog('Import nicht möglich', result.error); return false; }

  const { wines, shelfConfig, exportedAt } = result.data;
  const active = wines.filter((w) => w.status !== 'archived');
  const bottles = active.reduce((a, w) => a + w.count, 0);
  const archived = wines.length - active.length;
  const summary = `Sicherung vom ${fmtDate(exportedAt)}: ${plural(active.length, 'Wein', 'Weine')} (${plural(bottles, 'Flasche', 'Flaschen')}), ${archived} im Archiv.`;

  const [existingWines, existingConfig] = await Promise.all([getAllWines(), getShelfConfig()]);
  let done;

  try {
    if (existingWines.length === 0) {
      const ok = await dialog({
        title: 'Sicherung wiederherstellen?',
        message: `${summary}${existingConfig ? ' Die Regal-Konfiguration wird aus der Sicherung übernommen.' : ''}`,
        buttons: [{ label: 'Wiederherstellen', value: true, primary: true }, { label: 'Abbrechen', value: false }],
      });
      if (!ok) return false;
      await importData({ wines, shelfConfig, replace: true });
      await setMeta('lastBackup', exportedAt || new Date().toISOString());
      done = `${plural(wines.length, 'Wein', 'Weine')} wiederhergestellt.`;
    } else {
      const choice = await dialog({
        title: 'Auf diesem Gerät sind schon Weine',
        message: `${summary} Zusammenführen behält alle jetzigen Daten und ergänzt, was fehlt.`,
        buttons: [
          { label: 'Zusammenführen (empfohlen)', value: 'merge', primary: true },
          { label: 'Alles ersetzen …', value: 'replace', danger: true },
          { label: 'Abbrechen', value: null },
        ],
      });
      if (!choice) return false;

      if (choice === 'merge') {
        const { toAdd, skipped, droppedPlaces } = planMerge(existingWines, existingConfig, wines);
        await importData({ wines: toAdd });
        done = `${plural(toAdd.length, 'Wein', 'Weine')} hinzugefügt, ${skipped} schon vorhanden (unverändert).`;
        if (droppedPlaces) done += ` Bei ${plural(droppedPlaces, 'Flasche', 'Flaschen')} war der Platz belegt oder fehlt im Regal; sie haben jetzt keinen Platz.`;
      } else {
        const sure = await dialog({
          title: 'Wirklich alles ersetzen?',
          message: `Alle ${plural(existingWines.length, 'Wein', 'Weine')} auf diesem Gerät werden gelöscht und durch die Sicherung ersetzt. Das lässt sich nicht rückgängig machen. Tipp: Erstelle vorher ein Backup.`,
          buttons: [{ label: 'Abbrechen', value: false, primary: true }, { label: 'Ja, alles ersetzen', value: true, danger: true }],
        });
        if (!sure) return false;
        await importData({ wines, shelfConfig, replace: true });
        await setMeta('lastBackup', exportedAt || new Date().toISOString());
        done = `${plural(wines.length, 'Wein', 'Weine')} aus der Sicherung übernommen.`;
      }
    }
  } catch (err) {
    await alertDialog('Import fehlgeschlagen', `Es wurde nichts verändert. (${err.message})`);
    return false;
  }

  await alertDialog('Import abgeschlossen', done);
  location.hash = '#/regal';
  location.reload(); // Konfiguration und Listen frisch laden
  return true;
}

export async function importFromPicker() {
  const file = await pickBackupFile();
  return file ? importBackup(file) : false;
}
