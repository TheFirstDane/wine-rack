// Backup: Export-Format, Prüfung beim Import und Zusammenführen (reine Logik, in Node testbar).
//
// Format (eine JSON-Datei):
//   { format: 'wine-rack-backup', schemaVersion, appVersion, exportedAt,
//     shelfConfig: {...}, wines: [{ ...Wein, photo: 'data:image/jpeg;base64,...' }] }

import { SCHEMA_VERSION, migrateData } from './migrations.js';
import { WINE_TYPES, ZONES } from './constants.js';
import { isSameWine, occupiedMap, slotKey } from './logic.js';

export const BACKUP_FORMAT = 'wine-rack-backup';
export const BACKUP_MAX_AGE_DAYS = 30;

// ---- Fotos: Blob <-> Data-URL ---------------------------------------------

export async function blobToDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function dataURLToBlob(url) {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(url);
  if (!m) throw new Error('Ungültiges Bildformat.');
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

// ---- Export -----------------------------------------------------------------

export async function createBackup({ wines, shelfConfig, appVersion, now = new Date() }) {
  const out = [];
  for (const w of wines) {
    out.push({ ...w, photo: w.photo ? await blobToDataURL(w.photo) : null });
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    shelfConfig,
    wines: out,
  };
}

// ---- Import: Prüfen ---------------------------------------------------------

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const fail = (error) => ({ ok: false, error });

function checkShelfConfig(config) {
  if (!isObj(config) || !Array.isArray(config.shelves) || !config.shelves.length) return 'Die Regal-Konfiguration fehlt oder ist leer.';
  const ids = new Set();
  for (const s of config.shelves) {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string') return 'Ein Fach in der Regal-Konfiguration ist ungültig.';
    if (!Number.isInteger(s.slots) || s.slots < 1 || s.slots > 200) return `Fach „${s.name}“ hat eine ungültige Platzzahl.`;
    if (!ZONES.some((z) => z.key === s.zone)) return `Fach „${s.name}“ hat eine ungültige Zone.`;
    if (ids.has(s.id)) return 'Die Regal-Konfiguration enthält ein Fach doppelt.';
    ids.add(s.id);
  }
  return null;
}

function checkWine(w, config) {
  if (!isObj(w)) return 'Ein Eintrag ist kein Wein.';
  if (typeof w.name !== 'string' || !w.name.trim()) return 'Ein Wein hat keinen Namen.';
  const label = `„${w.name}“`;
  if (!WINE_TYPES.some((t) => t.key === w.type)) return `Wein ${label} hat einen unbekannten Typ.`;
  if (!Number.isInteger(w.count) || w.count < 0) return `Wein ${label} hat eine ungültige Anzahl.`;
  if (w.status !== 'active' && w.status !== 'archived') return `Wein ${label} hat einen ungültigen Status.`;
  if (w.photo != null && (typeof w.photo !== 'string' || !w.photo.startsWith('data:image/'))) return `Das Foto von ${label} ist ungültig.`;
  if (!Array.isArray(w.places)) return `Wein ${label} hat ungültige Lagerplätze.`;
  const seen = new Set();
  for (const p of w.places) {
    const shelf = isObj(p) && config.shelves.find((s) => s.id === p.shelfId);
    if (!shelf || !Number.isInteger(p.slot) || p.slot < 1 || p.slot > shelf.slots) return `Wein ${label} liegt auf einem Platz, den es nicht gibt.`;
    if (seen.has(slotKey(p))) return `Wein ${label} belegt einen Platz doppelt.`;
    seen.add(slotKey(p));
  }
  if (w.status === 'active' && w.places.length > w.count) return `Wein ${label} hat mehr Plätze als Flaschen.`;
  return null;
}

// Liest den Text einer Backup-Datei. Ergebnis:
//   { ok: false, error }  – mit deutscher Fehlermeldung
//   { ok: true, data: { wines (Fotos als Blob), shelfConfig, exportedAt, appVersion, schemaVersion } }
// Ältere Backups werden mit den Migrationen auf das aktuelle Datenmodell gehoben.
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return fail('Die Datei ist keine gültige JSON-Datei.'); }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return fail('Das ist keine Wine-rack-Sicherung.');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) return fail('Die Versionsnummer der Sicherung fehlt oder ist ungültig.');
  if (raw.schemaVersion > SCHEMA_VERSION) {
    return fail(`Die Sicherung stammt von einer neueren App (Datenmodell ${raw.schemaVersion}, diese App: ${SCHEMA_VERSION}). Bitte zuerst die App aktualisieren.`);
  }
  if (!Array.isArray(raw.wines)) return fail('In der Sicherung fehlt die Weinliste.');

  let data;
  try {
    data = migrateData({ wines: raw.wines, shelfConfig: raw.shelfConfig }, raw.schemaVersion);
  } catch (err) {
    return fail(err.message);
  }

  const configError = checkShelfConfig(data.shelfConfig);
  if (configError) return fail(configError);
  for (const w of data.wines) {
    const wineError = checkWine(w, data.shelfConfig);
    if (wineError) return fail(wineError);
  }

  try {
    const wines = data.wines.map((w) => {
      const { id, ...rest } = w; // Neue ids vergibt die Datenbank
      return { ...rest, photo: w.photo ? dataURLToBlob(w.photo) : null };
    });
    return {
      ok: true,
      data: {
        wines,
        shelfConfig: data.shelfConfig,
        exportedAt: raw.exportedAt || null,
        appVersion: raw.appVersion || null,
        schemaVersion: raw.schemaVersion,
      },
    };
  } catch (err) {
    return fail(err.message);
  }
}

// ---- Import: Zusammenführen --------------------------------------------------

// Fügt Weine aus einer Sicherung zu den vorhandenen hinzu, ohne etwas zu überschreiben:
//   - Weine, die es schon gibt (gleicher Wein und Status), bleiben unverändert → skipped
//   - Lagerplätze, die schon belegt sind oder im aktuellen Regal fehlen, werden weggelassen → droppedPlaces
export function planMerge(existingWines, shelfConfig, incoming) {
  const occupied = occupiedMap(existingWines);
  const toAdd = [];
  let skipped = 0;
  let droppedPlaces = 0;

  for (const w of incoming) {
    const duplicate = existingWines.some((e) => e.status === w.status && isSameWine(e, w)
      && (w.status !== 'archived' || e.drunkAt === w.drunkAt));
    if (duplicate) { skipped++; continue; }

    const places = [];
    for (const p of w.status === 'archived' ? [] : w.places) {
      const shelf = shelfConfig.shelves.find((s) => s.id === p.shelfId);
      const key = slotKey(p);
      if (!shelf || p.slot > shelf.slots || occupied.has(key)) { droppedPlaces++; continue; }
      occupied.set(key, w);
      places.push(p);
    }
    toAdd.push({ ...w, places });
  }
  return { toAdd, skipped, droppedPlaces };
}

// ---- Erinnerung --------------------------------------------------------------

// Muss ein Backup angemahnt werden? Nur, wenn es überhaupt Weine gibt.
export function backupStatus(lastBackupISO, { now = new Date(), hasWines = true } = {}) {
  if (!lastBackupISO) return { never: true, days: null, due: hasWines };
  const days = Math.floor((now - new Date(lastBackupISO)) / 86400000);
  return { never: false, days, due: hasWines && days > BACKUP_MAX_AGE_DAYS };
}
