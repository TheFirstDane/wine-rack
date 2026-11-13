// Tests: Zuschnitt-Mathe, Migration auf Version 2, Backup mit/ohne Zuschnitt, Suche und Filter im Regal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCrop, MAX_CROP_ZOOM, validateWineInput, mergeInto, matchesShelfFilter, EMPTY_SHELF_FILTER,
  activeFilterChips, removeFilterChip, hasActiveFilter, placeOptions,
} from '../js/logic.js';
import { migrateData, SCHEMA_VERSION } from '../js/migrations.js';
import { createBackup, parseBackup, BACKUP_FORMAT } from '../js/backup.js';
import { DEFAULT_CROP_PARAMS } from '../js/constants.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);

// ---- Zuschnitt ----

test('Zuschnitt: Vorgabe ist das mittige größte Quadrat (Querformat und Hochformat)', () => {
  const land = normalizeCrop(2000, 1000);
  assert.deepEqual([land.side, land.sx, land.sy], [1000, 500, 0]);
  const port = normalizeCrop(1000, 2000);
  assert.deepEqual([port.side, port.sx, port.sy], [1000, 0, 500]);
});

test('Zuschnitt: Zoom verkleinert das Quadrat, Mittelpunkt bleibt', () => {
  const n = normalizeCrop(1000, 1000, { cx: 0.5, cy: 0.5, zoom: 2 });
  assert.deepEqual([n.side, n.sx, n.sy], [500, 250, 250]);
});

test('Zuschnitt: Quadrat bleibt immer innerhalb des Bildes', () => {
  const n = normalizeCrop(1000, 1000, { cx: 0.99, cy: 0.01, zoom: 4 });
  assert.ok(n.sx >= 0 && n.sx + n.side <= 1000 + 1e-9);
  assert.ok(n.sy >= 0 && n.sy + n.side <= 1000 + 1e-9);
  const edge = normalizeCrop(1600, 1200, { cx: -3, cy: 9, zoom: 1.5 });
  assert.ok(edge.sx >= 0 && edge.sy >= 0 && edge.sx + edge.side <= 1600 + 1e-9 && edge.sy + edge.side <= 1200 + 1e-9);
});

test('Zuschnitt: Zoom wird auf 1 bis Maximum begrenzt, ungültige Werte fallen auf die Vorgabe', () => {
  assert.equal(normalizeCrop(1000, 1000, { cx: .5, cy: .5, zoom: 0.2 }).zoom, 1);
  assert.equal(normalizeCrop(1000, 1000, { cx: .5, cy: .5, zoom: 99 }).zoom, MAX_CROP_ZOOM);
  const bad = normalizeCrop(1000, 800, { cx: 'x', cy: null, zoom: undefined });
  close(bad.cx, 0.5); close(bad.cy, 0.5); assert.equal(bad.zoom, 1);
});

test('Zuschnitt: erneutes Normalisieren ändert nichts (stabil)', () => {
  const a = normalizeCrop(1600, 1200, { cx: 0.8, cy: 0.3, zoom: 2.5 });
  const b = normalizeCrop(1600, 1200, a);
  for (const k of ['cx', 'cy', 'zoom', 'side', 'sx', 'sy']) close(a[k], b[k], k);
});

test('Formular: Zuschnitt wird übernommen, sonst Vorgabe; Zusammenführen behält den vorhandenen', () => {
  const photo = { p: 1 }; const crop = { c: 1 };
  const withCrop = validateWineInput({ photo, name: 'A', type: 'red', crop, cropParams: { cx: .4, cy: .6, zoom: 2 } }).wine;
  assert.equal(withCrop.crop, crop);
  assert.deepEqual(withCrop.cropParams, { cx: .4, cy: .6, zoom: 2 });
  const without = validateWineInput({ photo, name: 'A', type: 'red' }).wine;
  assert.equal(without.crop, null);
  assert.deepEqual(without.cropParams, DEFAULT_CROP_PARAMS);
  const merged = mergeInto({ name: 'A', count: 1, places: [], crop: 'alt', cropParams: { cx: .1, cy: .1, zoom: 3 } }, withCrop);
  assert.equal(merged.crop, 'alt');
  assert.deepEqual(merged.cropParams, { cx: .1, cy: .1, zoom: 3 });
});

// ---- Migration 1 → 2 ----

test('Migration 1→2: Version ist 2, neue Felder kommen dazu, nichts geht verloren', () => {
  assert.equal(SCHEMA_VERSION, 2);
  const photo = { fake: 'photo' };
  const input = {
    wines: [{ id: 1, name: 'Barolo', count: 2, photo, places: [{ shelfId: 'a', slot: 1 }], rating: 4 },
      { id: 2, name: 'Ohne Foto', count: 1, photo: null, places: [] }],
    shelfConfig: { shelves: [{ id: 'a' }] },
  };
  const snapshot = JSON.stringify(input);
  const out = migrateData(input, 1);
  assert.equal(JSON.stringify(input), snapshot, 'Eingabe bleibt unverändert');
  assert.equal(out.wines.length, 2);
  assert.deepEqual(out.wines[0], { ...input.wines[0], crop: null, cropParams: DEFAULT_CROP_PARAMS });
  assert.equal(out.wines[0].photo, photo);
  assert.equal(out.shelfConfig, input.shelfConfig);
  assert.notEqual(out.wines[0].cropParams, out.wines[1].cropParams, 'jeder Wein bekommt ein eigenes Objekt');
});

test('Migration 1→2: bereits gesetzte Zuschnitte werden nicht überschrieben, leere Liste geht', () => {
  const crop = { c: 1 };
  const out = migrateData({ wines: [{ name: 'A', crop, cropParams: { cx: .2, cy: .8, zoom: 2 } }] }, 1);
  assert.equal(out.wines[0].crop, crop);
  assert.deepEqual(out.wines[0].cropParams, { cx: .2, cy: .8, zoom: 2 });
  assert.deepEqual(migrateData({ wines: [] }, 1).wines, []);
});

// ---- Backup ----

const config = { version: 1, shelves: [{ id: 'a', name: 'Fach 1', slots: 3, zone: 'upper' }] };
const blob = (bytes, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });
const bytesOf = async (b) => [...new Uint8Array(await b.arrayBuffer())];

test('Backup: Zuschnitt-Bild und -Parameter überstehen Export und Import', async () => {
  const wine = { id: 1, name: 'Barolo', type: 'red', count: 1, places: [], status: 'active', drunkAt: null,
    photo: blob([1, 2, 3]), crop: blob([9, 8, 7, 6]), cropParams: { cx: 0.3, cy: 0.7, zoom: 2.5 } };
  const text = JSON.stringify(await createBackup({ wines: [wine], shelfConfig: config, appVersion: 't' }));
  const res = parseBackup(text);
  assert.equal(res.ok, true);
  const [w] = res.data.wines;
  assert.deepEqual(await bytesOf(w.crop), [9, 8, 7, 6]);
  assert.deepEqual(await bytesOf(w.photo), [1, 2, 3]);
  assert.deepEqual(w.cropParams, { cx: 0.3, cy: 0.7, zoom: 2.5 });
});

test('Backup: alte Datei (Version 1, ohne Zuschnitt) lässt sich importieren und wird migriert', async () => {
  const photo = 'data:image/jpeg;base64,AQID';
  const old = {
    format: BACKUP_FORMAT, schemaVersion: 1, appVersion: '0.4.0', exportedAt: '2026-06-01T10:00:00Z',
    shelfConfig: config,
    wines: [{ name: 'Alter Wein', type: 'white', count: 2, status: 'active', drunkAt: null, photo,
      places: [{ shelfId: 'a', slot: 2 }] }],
  };
  const res = parseBackup(JSON.stringify(old));
  assert.equal(res.ok, true, res.error);
  const [w] = res.data.wines;
  assert.equal(w.name, 'Alter Wein');
  assert.equal(w.crop, null);
  assert.deepEqual(w.cropParams, DEFAULT_CROP_PARAMS);
  assert.deepEqual(await bytesOf(w.photo), [1, 2, 3]);
  assert.deepEqual(w.places, [{ shelfId: 'a', slot: 2 }]);
});

test('Backup: ungültiger Zuschnitt in der Datei wird abgelehnt', async () => {
  const raw = JSON.parse(JSON.stringify(await createBackup({
    wines: [{ name: 'A', type: 'red', count: 1, places: [], status: 'active', photo: null, crop: null }],
    shelfConfig: config, appVersion: 't' })));
  raw.wines[0].crop = 'http://x/y.jpg';
  assert.match(parseBackup(JSON.stringify(raw)).error, /Bildausschnitt/);
});

// ---- Suche und Filter im Regal ----

const cfg = { shelves: [{ id: 'u1', zone: 'upper' }, { id: 'l1', zone: 'lower' }] };
const wines = [
  { id: 1, name: 'Château Margaux', winery: 'Margaux', type: 'red', country: 'Frankreich', region: 'Bordeaux', grapes: 'Cabernet Sauvignon', vintage: 2015, count: 2, places: [{ shelfId: 'u1', slot: 1 }, { shelfId: 'l1', slot: 4 }], drinkFrom: 2020, drinkTo: 2040 },
  { id: 2, name: 'Riesling', winery: 'Prüm', type: 'white', country: 'Deutschland', region: 'Mosel', vintage: 2020, count: 3, places: [{ shelfId: 'l1', slot: 1 }], drinkFrom: 2018, drinkTo: 2024 },
  { id: 3, name: 'Brut', winery: 'Bollinger', type: 'champagne', country: 'Frankreich', region: 'Champagne', count: 1, places: [] },
  { id: 4, name: 'Barolo', winery: 'Conterno', type: 'red', country: 'Italien', region: 'Piemont', vintage: 2018, count: 1, places: [{ shelfId: 'u1', slot: 2 }], drinkFrom: 2030 },
];
const run = (patch) => wines.filter((w) => matchesShelfFilter(w, { ...EMPTY_SHELF_FILTER, ...patch }, cfg, 2026)).map((w) => w.id);

test('Regal-Suche: ohne Filter passt alles', () => assert.deepEqual(run({}), [1, 2, 3, 4]));

test('Regal-Suche: Name, Weingut, Land, Region, Rebsorte und Jahrgang', () => {
  assert.deepEqual(run({ query: 'margaux' }), [1]);
  assert.deepEqual(run({ query: 'conterno' }), [4]);
  assert.deepEqual(run({ query: 'italien' }), [4]);
  assert.deepEqual(run({ query: 'mosel' }), [2]);
  assert.deepEqual(run({ query: 'cabernet' }), [1]);
  assert.deepEqual(run({ query: '2020' }), [2]);
  assert.deepEqual(run({ query: 'frankreich' }), [1, 3]);
  assert.deepEqual(run({ query: 'xyz' }), []);
});

test('Regal-Suche: ohne Groß-/Kleinschreibung und Akzente, in beide Richtungen', () => {
  assert.deepEqual(run({ query: 'CHATEAU' }), [1]);
  assert.deepEqual(run({ query: 'château' }), [1]);
  assert.deepEqual(run({ query: 'prum' }), [2]);
  assert.deepEqual(run({ query: 'PRÜM' }), [2]);
  assert.deepEqual(run({ query: '  barolo   2018 ' }), [4]);
});

test('Filter: Weintyp mit Mehrfachauswahl', () => {
  assert.deepEqual(run({ types: ['red'] }), [1, 4]);
  assert.deepEqual(run({ types: ['red', 'white'] }), [1, 2, 4]);
});

test('Filter: Produktionsjahr von/bis, Weine ohne Jahrgang fallen heraus', () => {
  assert.deepEqual(run({ vintageFrom: '2016' }), [2, 4]);
  assert.deepEqual(run({ vintageTo: '2016' }), [1]);
  assert.deepEqual(run({ vintageFrom: '2015', vintageTo: '2018' }), [1, 4]);
  assert.deepEqual(run({ vintageFrom: 'abc' }), [1, 2, 3, 4], 'ungültiger Wert wird ignoriert');
});

test('Filter: Land oder Region', () => {
  assert.deepEqual(run({ place: 'c:Frankreich' }), [1, 3]);
  assert.deepEqual(run({ place: 'r:Bordeaux' }), [1]);
  assert.deepEqual(run({ place: 'r:Frankreich' }), [], 'Land ist keine Region');
});

test('Filter: Zone (mindestens eine Flasche dort)', () => {
  assert.deepEqual(run({ zone: 'upper' }), [1, 4]);
  assert.deepEqual(run({ zone: 'lower' }), [1, 2]);
});

test('Filter: Jetzt trinkbar und Ohne Lagerplatz', () => {
  assert.deepEqual(run({ drinkable: true }), [1], 'Wein 2 ist überschritten, 4 noch zu früh, 3 hat kein Fenster');
  assert.deepEqual(run({ unplaced: true }), [2, 3], 'Wein 2: 3 Flaschen, 1 Platz; Wein 3: kein Platz');
});

test('Filter: Wein mit teilweise fehlendem Platz zählt als "ohne Lagerplatz"', () => {
  const partly = { ...wines[1], count: 3, places: [{ shelfId: 'l1', slot: 1 }] };
  assert.equal(matchesShelfFilter(partly, { ...EMPTY_SHELF_FILTER, unplaced: true }, cfg, 2026), true);
  const full = { ...wines[3], count: 1 };
  assert.equal(matchesShelfFilter(full, { ...EMPTY_SHELF_FILTER, unplaced: true }, cfg, 2026), false);
});

test('Filter: Kombinationen sind UND-verknüpft', () => {
  assert.deepEqual(run({ types: ['red'], zone: 'upper', query: 'barolo' }), [4]);
  assert.deepEqual(run({ types: ['white'], zone: 'upper' }), []);
});

test('Chips: aktive Filter werden aufgelistet und einzeln entfernt, Zurücksetzen leert alles', () => {
  const f = { ...EMPTY_SHELF_FILTER, query: 'x', types: ['red', 'white'], vintageFrom: '2010', place: 'c:Italien', zone: 'lower', drinkable: true, unplaced: true };
  const chips = activeFilterChips(f);
  assert.deepEqual(chips.map((c) => c.label), ['Rotwein', 'Weißwein', 'ab 2010', 'Land: Italien', 'Untere Zone', 'Jetzt trinkbar', 'Ohne Lagerplatz']);
  let g = removeFilterChip(f, chips[0]);
  assert.deepEqual(g.types, ['white']);
  assert.deepEqual(f.types, ['red', 'white'], 'Original bleibt unverändert');
  for (const c of activeFilterChips(g)) g = removeFilterChip(g, c);
  assert.deepEqual(g, { ...EMPTY_SHELF_FILTER, query: 'x' });
  assert.equal(hasActiveFilter(g), true, 'Suchtext zählt als aktiv');
  assert.equal(hasActiveFilter(EMPTY_SHELF_FILTER), false);
  assert.equal(activeFilterChips({ ...EMPTY_SHELF_FILTER, vintageFrom: '2010', vintageTo: '2015' })[0].label, 'Jahrgang 2010–2015');
});

test('Auswahllisten: Länder und Regionen eindeutig und sortiert', () => {
  const { countries, regions } = placeOptions(wines);
  assert.deepEqual(countries, ['Deutschland', 'Frankreich', 'Italien']);
  assert.deepEqual(regions, ['Bordeaux', 'Champagne', 'Mosel', 'Piemont']);
});
