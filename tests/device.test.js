// Tests für die Geräteprofile (js/device.js): Erkennung, Auswahl, Rückfall, Speicherort.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  detectProfile, resolveProfile, readChoice, DEVICE_CHOICES, COMPACT_MAX, TABLET_MIN, TABLET_TOO_SMALL_HINT,
} from '../js/device.js';
import { createBackup } from '../js/backup.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

// ---- Automatische Erkennung (kürzere Fensterseite) ----

test('Erkennung: die drei Zielgeräte, hoch und quer', () => {
  assert.equal(detectProfile(390, 844), 'compact');   // iPhone 13
  assert.equal(detectProfile(844, 390), 'compact');   // iPhone 13 quer: kein Tablet
  assert.equal(detectProfile(440, 956), 'large');     // iPhone 18 Pro Max
  assert.equal(detectProfile(956, 440), 'large');     // quer: kurze Seite 440
  assert.equal(detectProfile(1032, 1376), 'tablet');  // iPad Pro 13 hochkant
  assert.equal(detectProfile(1376, 1032), 'tablet');  // quer
});

test('Erkennung: Grenzen 410 / 411 / 599 / 600', () => {
  assert.equal(COMPACT_MAX, 410);
  assert.equal(TABLET_MIN, 600);
  assert.equal(detectProfile(410, 900), 'compact');
  assert.equal(detectProfile(411, 900), 'large');
  assert.equal(detectProfile(599, 900), 'large');
  assert.equal(detectProfile(600, 900), 'tablet');
  assert.equal(detectProfile(410.5, 900), 'large');
});

test('Erkennung: kleine und sehr breite Fenster', () => {
  assert.equal(detectProfile(320, 568), 'compact');   // iPhone SE
  assert.equal(detectProfile(1920, 1080), 'tablet');  // Desktop-Browser
  assert.equal(detectProfile(2000, 380), 'compact', 'maßgeblich ist die kürzere Seite');
});

// ---- Auswahl und Rückfall ----

test('Auswahl: Automatisch nimmt das erkannte Profil', () => {
  assert.deepEqual(resolveProfile('auto', 390, 844), { choice: 'auto', profile: 'compact', detected: 'compact', fellBack: false });
  assert.equal(resolveProfile('auto', 1376, 1032).profile, 'tablet');
});

test('Auswahl: jedes Profil wirkt, wenn das Fenster passt', () => {
  assert.equal(resolveProfile('compact', 390, 844).profile, 'compact');
  assert.equal(resolveProfile('large', 440, 956).profile, 'large');
  assert.equal(resolveProfile('tablet', 1032, 1376).profile, 'tablet');
  assert.equal(resolveProfile('tablet', 1376, 1032).fellBack, false);
});

test('Rückfall: Tablet-Profil auf dem Handy nimmt das Handy-Layout und meldet es', () => {
  const r = resolveProfile('tablet', 390, 844);
  assert.equal(r.profile, 'compact');
  assert.equal(r.fellBack, true);
  assert.equal(resolveProfile('tablet', 440, 956).profile, 'large');
  assert.equal(resolveProfile('tablet', 844, 390).profile, 'compact', 'auch im Querformat');
  assert.match(TABLET_TOO_SMALL_HINT, /zu klein für das Tablet-Layout/);
});

test('Handy-Profil auf dem iPad bleibt Handy (zentrierte Spalte), ohne Rückfall', () => {
  for (const choice of ['compact', 'large']) {
    const r = resolveProfile(choice, 1032, 1376);
    assert.equal(r.profile, choice);
    assert.equal(r.detected, 'tablet');
    assert.equal(r.fellBack, false);
  }
});

test('Auswahl: unbekannter Wert wird wie Automatisch behandelt', () => {
  assert.equal(resolveProfile('quatsch', 390, 844).choice, 'auto');
  assert.equal(resolveProfile(undefined, 1032, 1376).profile, 'tablet');
});

test('Auswahlkarten: vier Einträge, Automatisch zuerst, Maße als Hinweis', () => {
  assert.deepEqual(DEVICE_CHOICES.map((c) => c.key), ['auto', 'compact', 'large', 'tablet']);
  assert.match(DEVICE_CHOICES[1].size, /390 × 844/);
  assert.match(DEVICE_CHOICES[2].size, /440 × 956/);
  assert.match(DEVICE_CHOICES[3].size, /1032 × 1376/);
  assert.match(DEVICE_CHOICES[3].size, /1376 × 1032/);
});

// ---- Speichern: nur lokal, nicht im Backup ----

test('Speichern: ohne localStorage oder mit Unsinn gilt Automatisch', () => {
  assert.equal(readChoice(), 'auto');
  globalThis.localStorage = { getItem: () => 'unsinn' };
  assert.equal(readChoice(), 'auto');
  globalThis.localStorage = { getItem: () => { throw new Error('gesperrt'); } };
  assert.equal(readChoice(), 'auto');
  globalThis.localStorage = { getItem: () => 'tablet' };
  assert.equal(readChoice(), 'tablet');
  delete globalThis.localStorage;
});

test('Backup: enthält keine Geräteauswahl, und Export/Import-Code kennt sie nicht', async () => {
  const text = JSON.stringify(await createBackup({
    wines: [{ name: 'A', type: 'red', count: 1, places: [], status: 'active', photo: null, crop: null }],
    shelfConfig: { version: 1, shelves: [{ id: 'a', name: 'F', slots: 2, zone: 'upper' }] }, appVersion: 't',
  }));
  assert.ok(!/device|wine-rack\.device/i.test(text));
  for (const file of ['js/backup.js', 'js/backup-flow.js', 'js/db.js', 'js/migrations.js']) {
    assert.ok(!/device/i.test(read(file)), `${file} darf die Geräteauswahl nicht anfassen`);
  }
});

test('Datenmodell bleibt bei Version 2 (Geräteauswahl braucht keine Migration)', async () => {
  const { SCHEMA_VERSION } = await import('../js/migrations.js');
  assert.equal(SCHEMA_VERSION, 2);
});

// ---- Kopf der Seite und Manifest ----

test('index.html: viewport-fit=cover und Icon für den Home-Bildschirm', () => {
  const html = read('index.html');
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
});

test('Manifest: standalone und Ausrichtung frei (Hoch- und Querformat)', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'any');
});

test('CSS: Sicherheitsabstände und Geräteprofile sind da, Eingabeschrift mindestens 16 px', () => {
  const css = read('css/style.css');
  for (const side of ['top', 'right', 'bottom', 'left']) assert.match(css, new RegExp(`env\\(safe-area-inset-${side}`));
  for (const d of ['compact', 'large', 'tablet']) assert.match(css, new RegExp(`data-device="${d}"`));
  assert.match(css, /font-size: max\(16px, 1rem\)/);
});
