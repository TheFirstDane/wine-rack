// Tests für js/logic.js – reines Node.js, keine Abhängigkeiten.
// Ausführen:  node --test tests/*.test.js    (oder: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWineInput, findMatches, mergeInto, occupiedMap, validatePlaces,
  firstFreeSlots, drinkingStatus, normalizeText, parseNumber,
} from '../js/logic.js';

const NOW = new Date(2026, 5, 15);
const photo = { fake: 'blob' };
const config = {
  version: 1,
  shelves: [
    { id: 'a', name: 'Fach 1', slots: 3, zone: 'upper' },
    { id: 'b', name: 'Fach 2', slots: 2, zone: 'lower' },
  ],
};
const valid = (over = {}) => validateWineInput(
  { photo, name: 'Barolo', type: 'red', winery: 'Conterno', vintage: '2018', count: '1', ...over }, { now: NOW });
const stored = (over = {}) => ({ id: 1, status: 'active', name: 'Barolo', winery: 'Conterno', vintage: 2018,
  bottleSize: '0,75 l', count: 2, places: [], ...over });

// ---- Pflichtfelder ----

test('Pflichtfelder: Foto, Name und Typ fehlen', () => {
  const { errors } = validateWineInput({}, { now: NOW });
  assert.ok(errors.photo && errors.name && errors.type);
});

test('Pflichtfelder: gültige Eingabe hat keine Fehler und Standardwerte', () => {
  const { errors, wine } = valid();
  assert.deepEqual(errors, {});
  assert.equal(wine.bottleSize, '0,75 l');
  assert.equal(wine.storedAt, '2026-06-15');
  assert.equal(wine.status, 'active');
});

test('Pflichtfelder: Leerzeichen allein zählen nicht als Name', () => {
  assert.ok(valid({ name: '   ' }).errors.name);
});

test('Zahlen: Komma wird akzeptiert, Unsinn abgelehnt', () => {
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('abc'), null);
  assert.equal(valid({ abv: '13,5' }).wine.abv, 13.5);
  assert.ok(valid({ abv: '150' }).errors.abv);
  assert.ok(valid({ vintage: '1750' }).errors.vintage);
  assert.ok(valid({ count: '0' }).errors.count);
});

test('Trinkfenster: "bis" vor "von" ist ein Fehler', () => {
  assert.ok(valid({ drinkFrom: '2030', drinkTo: '2025' }).errors.drinkTo);
  assert.deepEqual(valid({ drinkFrom: '2025', drinkTo: '2030' }).errors, {});
});

test('Herkunft: Händler nur bei Kauf, Schenker nur bei Geschenk', () => {
  const bought = valid({ origin: 'bought', boughtAt: 'Weinhandel', giftFrom: 'Onkel' }).wine;
  assert.equal(bought.boughtAt, 'Weinhandel');
  assert.equal(bought.giftFrom, '');
  const gift = valid({ origin: 'gift', boughtAt: 'Weinhandel', giftFrom: 'Onkel' }).wine;
  assert.equal(gift.giftFrom, 'Onkel');
  assert.equal(gift.boughtAt, '');
});

test('Mehr Plätze als Flaschen ist ein Fehler', () => {
  const places = [{ shelfId: 'a', slot: 1 }, { shelfId: 'a', slot: 2 }];
  assert.ok(valid({ count: '1', places }).errors.places);
  assert.deepEqual(valid({ count: '2', places }).errors, {});
});

// ---- Zusammenführen ----

test('Zusammenführen: gleicher Wein wird trotz Schreibweise erkannt', () => {
  const cand = { name: ' barolo ', winery: 'CONTERNO', vintage: 2018, bottleSize: '0,75 l' };
  assert.equal(findMatches([stored()], cand).exact.id, 1);
  assert.equal(normalizeText('Château Léoville'), 'chateau leoville');
});

test('Zusammenführen: anderer Jahrgang → kein Treffer, aber Hinweis', () => {
  const cand = { name: 'Barolo', winery: 'Conterno', vintage: 2019, bottleSize: '0,75 l' };
  const { exact, related } = findMatches([stored()], cand);
  assert.equal(exact, null);
  assert.equal(related.length, 1);
});

test('Zusammenführen: andere Flaschengröße → kein Treffer, aber Hinweis', () => {
  const cand = { name: 'Barolo', winery: 'Conterno', vintage: 2018, bottleSize: '1,5 l' };
  const { exact, related } = findMatches([stored()], cand);
  assert.equal(exact, null);
  assert.equal(related.length, 1);
});

test('Zusammenführen: archivierte Weine und der eigene Eintrag werden ignoriert', () => {
  const cand = { name: 'Barolo', winery: 'Conterno', vintage: 2018, bottleSize: '0,75 l' };
  assert.equal(findMatches([stored({ status: 'archived' })], cand).exact, null);
  assert.equal(findMatches([stored()], cand, { ignoreId: 1 }).exact, null);
});

test('Zusammenführen: Anzahl und Plätze addieren, vorhandene Angaben bleiben', () => {
  const existing = stored({ count: 2, places: [{ shelfId: 'a', slot: 1 }], country: 'Italien', photo: 'alt' });
  const incoming = { count: 3, places: [{ shelfId: 'b', slot: 2 }], country: 'Frankreich', region: 'Piemont', photo: 'neu' };
  const merged = mergeInto(existing, incoming);
  assert.equal(merged.count, 5);
  assert.equal(merged.places.length, 2);
  assert.equal(merged.country, 'Italien');
  assert.equal(merged.region, 'Piemont');
  assert.equal(merged.photo, 'alt');
});

// ---- Platzvergabe ----

test('Plätze: belegte Plätze werden erkannt, eigener Wein ausgenommen', () => {
  const w = stored({ places: [{ shelfId: 'a', slot: 2 }] });
  assert.ok(occupiedMap([w]).has('a:2'));
  assert.ok(!occupiedMap([w], 1).has('a:2'));
});

test('Plätze: ein Platz hält nur eine Flasche', () => {
  const w = stored({ places: [{ shelfId: 'a', slot: 2 }] });
  assert.match(validatePlaces(config, [w], [{ shelfId: 'a', slot: 2 }], 1), /belegt/);
  assert.equal(validatePlaces(config, [w], [{ shelfId: 'a', slot: 1 }], 1), null);
  assert.equal(validatePlaces(config, [w], [{ shelfId: 'a', slot: 2 }], 1, 1), null); // eigener Wein
});

test('Plätze: doppelte, unbekannte und zu viele Plätze werden abgelehnt', () => {
  const p = { shelfId: 'a', slot: 1 };
  assert.match(validatePlaces(config, [], [p, p], 2), /doppelt/);
  assert.match(validatePlaces(config, [], [{ shelfId: 'a', slot: 4 }], 1), /existiert nicht/);
  assert.match(validatePlaces(config, [], [{ shelfId: 'x', slot: 1 }], 1), /existiert nicht/);
  assert.match(validatePlaces(config, [], [p, { shelfId: 'a', slot: 2 }], 1), /Mehr Plätze/);
});

test('Plätze: Weine ohne Platz sind erlaubt', () => {
  assert.equal(validatePlaces(config, [], [], 3), null);
});

test('Plätze: nächste freie Plätze überspringen belegte', () => {
  const w = stored({ places: [{ shelfId: 'a', slot: 1 }, { shelfId: 'a', slot: 3 }] });
  const free = firstFreeSlots(config, [w], 2);
  assert.deepEqual(free, [{ shelfId: 'a', slot: 2 }, { shelfId: 'b', slot: 1 }]);
  assert.equal(firstFreeSlots(config, [w], 9).length, 3); // nur 3 frei (5 Plätze, 2 belegt)
});

// ---- Trinkfenster ----

test('Trinkfenster: zu früh, trinkreif, überschritten, keine Angabe', () => {
  const w = { drinkFrom: 2025, drinkTo: 2030 };
  assert.equal(drinkingStatus(w, 2024), 'early');
  assert.equal(drinkingStatus(w, 2027), 'ready');
  assert.equal(drinkingStatus(w, 2031), 'past');
  assert.equal(drinkingStatus({}, 2027), null);
  assert.equal(drinkingStatus({ drinkFrom: 2025 }, 2040), 'ready');
});

// ================= Phase 3 =================
import { drinkChoices, drinkBottle, filterWines, sortWines, sortArchive, uniqueCountries } from '../js/logic.js';

const P = (shelfId, slot) => ({ shelfId, slot });

// ---- Trinken ----

test('Trinken: Anzahl sinkt um eins, der gewählte Platz wird frei', () => {
  const w = stored({ count: 3, places: [P('a', 1), P('a', 2), P('b', 1)] });
  const { wine, archived } = drinkBottle(w, P('a', 2), { now: NOW });
  assert.equal(wine.count, 2);
  assert.equal(archived, false);
  assert.deepEqual(wine.places, [P('a', 1), P('b', 1)]);
  assert.ok(!occupiedMap([wine]).has('a:2'));
  assert.equal(w.count, 3, 'Original bleibt unverändert');
});

test('Trinken: Flasche ohne Platz entnehmen lässt alle Plätze bestehen', () => {
  const w = stored({ count: 3, places: [P('a', 1)] });
  const { wine } = drinkBottle(w, null, { now: NOW });
  assert.equal(wine.count, 2);
  assert.deepEqual(wine.places, [P('a', 1)]);
});

test('Trinken: nachfragen, wenn mehrere Flaschen und mindestens eine mit Platz', () => {
  assert.equal(drinkChoices(stored({ count: 3, places: [P('a', 1), P('a', 2)] })).needsChoice, true);
  assert.equal(drinkChoices(stored({ count: 2, places: [P('a', 1)] })).needsChoice, true); // 1 mit, 1 ohne Platz
  assert.equal(drinkChoices(stored({ count: 3, places: [] })).needsChoice, false);
  assert.equal(drinkChoices(stored({ count: 1, places: [P('a', 1)] })).needsChoice, false);
  assert.equal(drinkChoices(stored({ count: 1 })).isLast, true);
  assert.equal(drinkChoices(stored({ count: 3, places: [P('a', 1)] })).unplaced, 2);
});

test('Trinken: ohne Angabe bei lauter Plätzen und mehreren Flaschen ist ein Fehler', () => {
  const w = stored({ count: 2, places: [P('a', 1), P('a', 2)] });
  assert.throws(() => drinkBottle(w, null), /auswählen/);
});

test('Trinken: Platz, auf dem keine Flasche dieses Weins liegt, wird abgelehnt', () => {
  assert.throws(() => drinkBottle(stored({ count: 2, places: [P('a', 1)] }), P('a', 3)), /nicht auf diesem Platz/);
});

// ---- Archivieren ----

test('Archivieren: letzte Flasche → Archiv mit Datum, Platz frei', () => {
  const w = stored({ count: 1, places: [P('a', 1)] });
  const { wine, archived } = drinkBottle(w, null, { now: NOW });
  assert.equal(archived, true);
  assert.equal(wine.count, 0);
  assert.equal(wine.status, 'archived');
  assert.equal(wine.drunkAt, '2026-06-15');
  assert.deepEqual(wine.places, []);
  assert.equal(occupiedMap([wine]).size, 0);
});

test('Archivieren: Bewertung und Notiz sind optional und werden übernommen', () => {
  const w = stored({ count: 1, notes: 'alt' });
  const plain = drinkBottle(w, null, { now: NOW }).wine;
  assert.equal(plain.notes, 'alt');
  assert.equal(plain.rating, undefined);
  const rated = drinkBottle(w, null, { now: NOW, rating: 4, notes: '  Wunderbar  ' }).wine;
  assert.equal(rated.rating, 4);
  assert.equal(rated.notes, 'Wunderbar');
});

test('Archivieren: Bewertung und Notiz zählen nur bei der letzten Flasche', () => {
  const { wine } = drinkBottle(stored({ count: 2 }), null, { now: NOW, rating: 5, notes: 'x' });
  assert.equal(wine.rating, undefined);
  assert.equal(wine.status, 'active');
});

test('Archivieren: archivierter Wein kann nicht erneut getrunken werden', () => {
  assert.throws(() => drinkBottle(stored({ status: 'archived', count: 0 })), /nichts mehr/);
});

test('Archivieren: beim Zusammenführen zählt der archivierte Wein nicht', () => {
  const archived = drinkBottle(stored({ count: 1 }), null, { now: NOW }).wine;
  const cand = { name: 'Barolo', winery: 'Conterno', vintage: 2018, bottleSize: '0,75 l' };
  assert.equal(findMatches([archived], cand).exact, null);
});

test('Archiv: zuletzt getrunkene zuerst', () => {
  const list = sortArchive([{ id: 1, drunkAt: '2026-01-01' }, { id: 2, drunkAt: '2026-05-01' }]);
  assert.deepEqual(list.map((w) => w.id), [2, 1]);
});

// ---- Suche, Filter, Sortierung ----

const lib = [
  { id: 1, name: 'Barolo', winery: 'Conterno', type: 'red', country: 'Italien', region: 'Piemont', vintage: 2018, count: 2, drinkFrom: 2025, drinkTo: 2035, storedAt: '2026-01-01' },
  { id: 2, name: 'Riesling Kabinett', winery: 'Prüm', type: 'white', country: 'Deutschland', vintage: 2020, count: 6, drinkFrom: 2020, drinkTo: 2024, storedAt: '2026-03-01' },
  { id: 3, name: 'Brut', winery: 'Bollinger', type: 'champagne', country: 'Frankreich', count: 1, storedAt: '2026-02-01' },
  { id: 4, name: 'Syrah', winery: 'Jaboulet', type: 'red', country: 'Frankreich', vintage: 2022, count: 3, drinkFrom: 2030, drinkTo: 2040, storedAt: '2025-12-01' },
];
const ids = (l) => l.map((w) => w.id);

test('Suche: mehrere Wörter, ohne Akzente, in verschiedenen Feldern', () => {
  assert.deepEqual(ids(filterWines(lib, { query: 'barolo 2018' })), [1]);
  assert.deepEqual(ids(filterWines(lib, { query: 'prum' })), [2]);
  assert.deepEqual(ids(filterWines(lib, { query: 'piemont' })), [1]);
  assert.deepEqual(ids(filterWines(lib, { query: 'xyz' })), []);
});

test('Filter: Typ, Land und Kombination', () => {
  assert.deepEqual(ids(filterWines(lib, { type: 'red' })), [1, 4]);
  assert.deepEqual(ids(filterWines(lib, { country: 'Frankreich' })), [3, 4]);
  assert.deepEqual(ids(filterWines(lib, { type: 'red', country: 'Frankreich' })), [4]);
});

test('Filter: Trinkfenster', () => {
  assert.deepEqual(ids(filterWines(lib, { window: 'ready' }, 2026)), [1]);
  assert.deepEqual(ids(filterWines(lib, { window: 'past' }, 2026)), [2]);
  assert.deepEqual(ids(filterWines(lib, { window: 'early' }, 2026)), [4]);
  assert.deepEqual(ids(filterWines(lib, { window: 'none' }, 2026)), [3]);
});

test('Sortierung: Name, Jahrgang, Anzahl, Einlagerung, Trinkfenster', () => {
  assert.deepEqual(ids(sortWines(lib, 'name')), [1, 3, 2, 4]);
  assert.deepEqual(ids(sortWines(lib, 'vintage-desc')), [4, 2, 1, 3]);
  assert.deepEqual(ids(sortWines(lib, 'vintage-asc')), [1, 2, 4, 3]);
  assert.deepEqual(ids(sortWines(lib, 'count')), [2, 4, 1, 3]);
  assert.deepEqual(ids(sortWines(lib, 'stored')), [2, 3, 1, 4]);
  assert.deepEqual(ids(sortWines(lib, 'drink')), [2, 1, 4, 3]);
  assert.equal(lib[0].id, 1, 'Eingabe bleibt unverändert');
});

test('Länderliste: eindeutig und sortiert', () => {
  assert.deepEqual(uniqueCountries(lib), ['Deutschland', 'Frankreich', 'Italien']);
});
