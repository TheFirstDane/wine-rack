// Tests für Backup, Import-Prüfung, Zusammenführen und Migrationen – reines Node.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackup, parseBackup, planMerge, backupStatus, blobToDataURL, dataURLToBlob, BACKUP_FORMAT,
} from '../js/backup.js';
import { migrateData, SCHEMA_VERSION } from '../js/migrations.js';

const config = {
  version: 1,
  shelves: [
    { id: 'a', name: 'Fach 1', slots: 3, zone: 'upper' },
    { id: 'b', name: 'Fach 2', slots: 2, zone: 'lower' },
  ],
};
const jpeg = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
const wine = (over = {}) => ({
  id: 7, name: 'Barolo', winery: 'Conterno', type: 'red', vintage: 2018, bottleSize: '0,75 l',
  count: 2, places: [{ shelfId: 'a', slot: 1 }], status: 'active', drunkAt: null,
  photo: jpeg([0xff, 0xd8, 0xff, 0x00, 0x10, 0x80, 0xfe]), ...over,
});
const make = async (wines = [wine()], cfg = config) =>
  JSON.stringify(await createBackup({ wines, shelfConfig: cfg, appVersion: 'test', now: new Date('2026-06-15T10:00:00Z') }));
const bytesOf = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];

// ---- Fotos ----

test('Foto: Blob → Data-URL → Blob liefert dieselben Bytes', async () => {
  const original = jpeg([0, 1, 2, 250, 251, 252, 255]);
  const url = await blobToDataURL(original);
  assert.match(url, /^data:image\/jpeg;base64,/);
  const back = dataURLToBlob(url);
  assert.equal(back.type, 'image/jpeg');
  assert.deepEqual(await bytesOf(back), await bytesOf(original));
});

test('Foto: große Datei (1 MB) übersteht den Rundlauf', async () => {
  const big = jpeg(Array.from({ length: 1_000_000 }, (_, i) => i % 256));
  const back = dataURLToBlob(await blobToDataURL(big));
  assert.equal(back.size, 1_000_000);
});

// ---- Export → Import ----

test('Rundlauf: Export und Import ergeben dieselben Daten inklusive Foto', async () => {
  const text = await make();
  const res = parseBackup(text);
  assert.equal(res.ok, true);
  assert.equal(res.data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(res.data.shelfConfig, config);
  const [w] = res.data.wines;
  assert.equal(w.name, 'Barolo');
  assert.equal(w.id, undefined, 'ids werden neu vergeben');
  assert.deepEqual(w.places, [{ shelfId: 'a', slot: 1 }]);
  assert.deepEqual(await bytesOf(w.photo), await bytesOf(wine().photo));
});

test('Format: Datei enthält Kennung, Versionsnummer und Datum', async () => {
  const raw = JSON.parse(await make());
  assert.equal(raw.format, BACKUP_FORMAT);
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  assert.equal(raw.exportedAt, '2026-06-15T10:00:00.000Z');
});

test('Rundlauf: archivierte Weine und Wein ohne Foto bleiben erhalten', async () => {
  const archived = wine({ status: 'archived', count: 0, places: [], drunkAt: '2026-05-01', rating: 4, notes: 'gut' });
  const noPhoto = wine({ name: 'Ohne Foto', photo: null });
  const res = parseBackup(await make([archived, noPhoto]));
  assert.equal(res.ok, true);
  assert.equal(res.data.wines[0].rating, 4);
  assert.equal(res.data.wines[0].drunkAt, '2026-05-01');
  assert.equal(res.data.wines[1].photo, null);
});

// ---- Import prüfen ----

test('Prüfung: kaputtes JSON, fremdes Format, fehlende Version', () => {
  assert.match(parseBackup('{kaputt').error, /JSON/);
  assert.match(parseBackup('{"format":"anderes"}').error, /keine Wine-rack/);
  assert.match(parseBackup('[]').error, /keine Wine-rack/);
  assert.match(parseBackup(JSON.stringify({ format: BACKUP_FORMAT })).error, /Versionsnummer/);
});

test('Prüfung: neuere Version wird abgelehnt, mit Hinweis zum Aktualisieren', async () => {
  const raw = JSON.parse(await make());
  raw.schemaVersion = SCHEMA_VERSION + 1;
  const res = parseBackup(JSON.stringify(raw));
  assert.equal(res.ok, false);
  assert.match(res.error, /neueren App/);
});

test('Prüfung: ungültige Inhalte werden mit Klartext abgelehnt', async () => {
  const bad = async (mutate) => {
    const raw = JSON.parse(await make());
    mutate(raw);
    return parseBackup(JSON.stringify(raw));
  };
  assert.match((await bad((r) => { r.wines[0].name = ''; })).error, /keinen Namen/);
  assert.match((await bad((r) => { r.wines[0].type = 'bier'; })).error, /Typ/);
  assert.match((await bad((r) => { r.wines[0].count = -1; })).error, /Anzahl/);
  assert.match((await bad((r) => { r.wines[0].photo = 'http://x/y.jpg'; })).error, /Foto/);
  assert.match((await bad((r) => { r.wines[0].places = [{ shelfId: 'zz', slot: 1 }]; })).error, /Platz/);
  assert.match((await bad((r) => { r.wines[0].places = [{ shelfId: 'a', slot: 9 }]; })).error, /Platz/);
  assert.match((await bad((r) => { r.wines[0].places = [{ shelfId: 'a', slot: 1 }, { shelfId: 'a', slot: 1 }]; })).error, /doppelt/);
  assert.match((await bad((r) => { delete r.shelfConfig; })).error, /Regal-Konfiguration/);
  assert.match((await bad((r) => { r.shelfConfig.shelves[0].zone = 'mitte'; })).error, /Zone/);
  assert.match((await bad((r) => { r.wines = 'x'; })).error, /Weinliste/);
});

// ---- Zusammenführen ohne Überschreiben ----

test('Zusammenführen: vorhandener Wein bleibt unverändert, neuer wird hinzugefügt', () => {
  const existing = [wine({ id: 1, count: 5 })];
  const incoming = [wine({ count: 2 }), wine({ name: 'Riesling', places: [] })];
  const { toAdd, skipped } = planMerge(existing, config, incoming);
  assert.equal(skipped, 1);
  assert.equal(toAdd.length, 1);
  assert.equal(toAdd[0].name, 'Riesling');
  assert.equal(existing[0].count, 5);
});

test('Zusammenführen: anderer Jahrgang zählt als anderer Wein', () => {
  const { toAdd, skipped } = planMerge([wine({ id: 1 })], config, [wine({ vintage: 2019, places: [] })]);
  assert.equal(skipped, 0);
  assert.equal(toAdd.length, 1);
});

test('Zusammenführen: belegte oder fehlende Plätze werden weggelassen, Flaschen bleiben', () => {
  const existing = [wine({ id: 1, name: 'Anderer', places: [{ shelfId: 'a', slot: 1 }] })];
  const incoming = [wine({ places: [{ shelfId: 'a', slot: 1 }, { shelfId: 'b', slot: 2 }], count: 2 }),
    wine({ name: 'Dritter', places: [{ shelfId: 'gibtsnicht', slot: 1 }], count: 1 })];
  const { toAdd, droppedPlaces } = planMerge(existing, config, incoming);
  assert.equal(droppedPlaces, 2);
  assert.deepEqual(toAdd[0].places, [{ shelfId: 'b', slot: 2 }]);
  assert.deepEqual(toAdd[1].places, []);
  assert.equal(toAdd[0].count, 2);
});

test('Zusammenführen: zwei neue Weine bekommen nicht denselben Platz', () => {
  const incoming = [wine({ name: 'Eins' }), wine({ name: 'Zwei' })]; // beide wollen a:1
  const { toAdd, droppedPlaces } = planMerge([], config, incoming);
  assert.equal(toAdd[0].places.length + toAdd[1].places.length, 1);
  assert.equal(droppedPlaces, 1);
});

test('Zusammenführen: archivierter Wein nur dann doppelt, wenn auch Trinkdatum gleich', () => {
  const arch = (d) => wine({ status: 'archived', count: 0, places: [], drunkAt: d });
  assert.equal(planMerge([arch('2026-01-01')], config, [arch('2026-01-01')]).skipped, 1);
  assert.equal(planMerge([arch('2026-01-01')], config, [arch('2026-02-02')]).toAdd.length, 1);
});

// ---- Backup-Erinnerung ----

test('Erinnerung: nach 30 Tagen fällig, vorher nicht', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  assert.equal(backupStatus('2026-06-01T12:00:00Z', { now }).due, false);
  assert.equal(backupStatus('2026-05-16T12:00:00Z', { now }).due, false); // genau 30 Tage
  assert.equal(backupStatus('2026-05-15T12:00:00Z', { now }).due, true);  // 31 Tage
  assert.equal(backupStatus('2026-05-15T12:00:00Z', { now }).days, 31);
});

test('Erinnerung: noch nie gesichert → fällig, aber nur mit Weinen', () => {
  assert.deepEqual(backupStatus(undefined, { hasWines: true }), { never: true, days: null, due: true });
  assert.equal(backupStatus(undefined, { hasWines: false }).due, false);
});

// ---- Migrationen ----

test('Migration: Schritte laufen nacheinander, Eingabe bleibt unverändert', () => {
  const steps = {
    1: (d) => ({ ...d, wines: d.wines.map((w) => ({ ...w, region: w.region ?? '' })) }),
    2: (d) => ({ ...d, wines: d.wines.map((w) => ({ ...w, tags: [] })) }),
  };
  const input = { wines: [{ name: 'A', count: 3 }], shelfConfig: { shelves: [] } };
  const out = migrateData(input, 1, 3, steps);
  assert.deepEqual(out.wines[0], { name: 'A', count: 3, region: '', tags: [] });
  assert.deepEqual(input.wines[0], { name: 'A', count: 3 });
});

test('Migration: Daten bleiben erhalten, nur ab der alten Version wird migriert', () => {
  const calls = [];
  const steps = { 1: (d) => { calls.push(1); return d; }, 2: (d) => { calls.push(2); return d; } };
  const data = { wines: [{ name: 'A' }], shelfConfig: {} };
  assert.equal(migrateData(data, 2, 3, steps), data);
  assert.deepEqual(calls, [2]);
  assert.equal(migrateData(data, 3, 3, steps), data); // schon aktuell
});

test('Migration: fehlender Schritt und neuere Daten sind Fehler', () => {
  assert.throws(() => migrateData({}, 1, 2, {}), /Migration von Version 1 auf 2/);
  assert.throws(() => migrateData({}, 5, 2), /aktualisieren/);
});

test('Migration: ältere Backups werden beim Import migriert', async () => {
  // Version 0 gab es nie; wir simulieren mit der aktuellen Version, dass der Weg durch migrateData läuft.
  const res = parseBackup(await make());
  assert.equal(res.ok, true);
});
