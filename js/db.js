// IndexedDB-Schicht.
//
// Die Versionsnummer SCHEMA_VERSION (siehe migrations.js) ist zugleich die IndexedDB-Version.
// Wird das Datenmodell geändert: dort Nummer erhöhen und Datenschritt ergänzen, hier in
// migrate() bei Bedarf Speicher/Indizes anpassen. Bestehende Daten bleiben so erhalten.
//
// Stores:
//   meta  – einzelne Werte (key/value), z. B. 'shelfConfig', 'lastBackup'
//   wines – ein Eintrag pro Wein (Fotos als Blob direkt im Eintrag)

import { SCHEMA_VERSION, migrateData } from './migrations.js';

export { SCHEMA_VERSION };
const DB_NAME = 'wine-rack';

let dbPromise = null;

// Zählt Schreibzugriffe auf Weine und Regal. Das Tablet-Layout (Master links) merkt sich damit,
// ob die linke Seite neu gezeichnet werden muss, nachdem rechts gespeichert wurde.
let revision = 0;
export const getRevision = () => revision;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => migrate(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist von einem anderen Tab blockiert.'));
  });
  return dbPromise;
}

// Migrationsfunktion: wird bei neuer Datenbank (oldVersion = 0) und bei jedem Versionssprung aufgerufen.
function migrate(db, oldVersion, tx) {
  if (oldVersion < 1) {
    db.createObjectStore('meta', { keyPath: 'key' });
    const wines = db.createObjectStore('wines', { keyPath: 'id', autoIncrement: true });
    wines.createIndex('status', 'status');
  }
  // Strukturänderungen für später, z. B.:
  // if (oldVersion < 2) { tx.objectStore('wines').createIndex('country', 'country'); }

  // Vorhandene Daten auf das neue Modell heben (dieselben Schritte wie beim Import älterer Backups).
  if (oldVersion >= 1 && oldVersion < SCHEMA_VERSION) migrateStoredData(tx, oldVersion);
}

// Liest alle Daten innerhalb der Upgrade-Transaktion, migriert sie und schreibt sie zurück.
// Schlägt eine Migration fehl, bricht die Transaktion ab und die alte Datenbank bleibt unverändert.
function migrateStoredData(tx, oldVersion) {
  const winesStore = tx.objectStore('wines');
  const metaStore = tx.objectStore('meta');
  const winesReq = winesStore.getAll();
  winesReq.onsuccess = () => {
    const cfgReq = metaStore.get('shelfConfig');
    cfgReq.onsuccess = () => {
      let migrated;
      try {
        migrated = migrateData({ wines: winesReq.result, shelfConfig: cfgReq.result?.value }, oldVersion, SCHEMA_VERSION);
      } catch (err) {
        console.error('Migration fehlgeschlagen:', err);
        tx.abort();
        return;
      }
      winesStore.clear();
      for (const w of migrated.wines) winesStore.put(w);
      if (migrated.shelfConfig) metaStore.put({ key: 'shelfConfig', value: migrated.shelfConfig });
      metaStore.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    };
  };
}

// Führt eine Operation in einer Transaktion aus und liefert das Ergebnis.
async function run(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---- meta ----------------------------------------------------------------

export async function getMeta(key) {
  const row = await run('meta', 'readonly', (s) => s.get(key));
  return row ? row.value : undefined;
}

export function setMeta(key, value) {
  return run('meta', 'readwrite', (s) => s.put({ key, value }));
}

// ---- wines ---------------------------------------------------------------

export const getAllWines = () => run('wines', 'readonly', (s) => s.getAll());
export const getWine = (id) => run('wines', 'readonly', (s) => s.get(id));
export const saveWine = (wine) => { revision++; return run('wines', 'readwrite', (s) => s.put(wine)); }; // liefert die id
export const deleteWine = (id) => { revision++; return run('wines', 'readwrite', (s) => s.delete(id)); };
export const countWines = () => run('wines', 'readonly', (s) => s.count());

// ---- Regal-Konfiguration -------------------------------------------------
//
// Form: { version: 1, shelves: [{ id, name, slots, zone: 'upper' | 'lower' }, ...] }
// Die Reihenfolge der Fächer entspricht der Anzeige (oben nach unten).
// Plätze sind je Fach ab 1 nummeriert. Flaschen eines Weins liegen in
// wine.places = [{ shelfId, slot }, ...].

export const getShelfConfig = () => getMeta('shelfConfig');

// Prüft eine neue Konfiguration gegen die vorhandenen Weine. Liefert die
// belegten Plätze, die wegfallen würden (leere Liste = alles in Ordnung).
export async function findOrphanedBottles(newConfig) {
  const wines = await getAllWines();
  const byId = new Map(newConfig.shelves.map((s) => [s.id, s]));
  const orphaned = [];
  for (const wine of wines) {
    if (wine.status === 'archived') continue;
    for (const place of wine.places || []) {
      const shelf = byId.get(place.shelfId);
      if (!shelf || place.slot > shelf.slots) {
        orphaned.push({ wine, place });
      }
    }
  }
  return orphaned;
}

// Speichert die Konfiguration nur, wenn keine belegten Plätze wegfallen.
// Ergebnis: { ok: true } oder { ok: false, orphaned: [...] }.
export async function saveShelfConfig(config) {
  revision++;
  const orphaned = await findOrphanedBottles(config);
  if (orphaned.length) return { ok: false, orphaned };
  await setMeta('shelfConfig', config);
  await setMeta('schemaVersion', SCHEMA_VERSION);
  return { ok: true };
}

// ---- Import ---------------------------------------------------------------------

// Schreibt importierte Weine in EINER Transaktion (alles oder nichts).
//   replace: true  → vorhandene Weine werden vorher gelöscht
//   shelfConfig    → wenn angegeben, ersetzt es die Regal-Konfiguration
export async function importData({ wines, shelfConfig = null, replace = false }) {
  revision++;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['wines', 'meta'], 'readwrite');
    const store = tx.objectStore('wines');
    if (replace) store.clear();
    for (const w of wines) {
      const { id, ...rest } = w; // neue ids vergibt die Datenbank
      store.add(rest);
    }
    if (shelfConfig) {
      tx.objectStore('meta').put({ key: 'shelfConfig', value: shelfConfig });
      tx.objectStore('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
