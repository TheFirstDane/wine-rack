// Prüft die PWA-Dateien: Cache-Liste vollständig, Versionen gleich, alle Pfade relativ (Unterpfad-Hosting).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/constants.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const sw = read('sw.js');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('Service Worker: jede Datei der Cache-Liste existiert', () => {
  for (const a of assets) {
    if (a === './') continue;
    assert.ok(existsSync(join(root, a)), `${a} fehlt`);
  }
});

test('Service Worker: alle App-Dateien stehen in der Cache-Liste', () => {
  const appFiles = [
    'index.html', 'manifest.webmanifest',
    ...walk('css'), ...walk('js'), ...walk('icons'),
  ];
  const missing = appFiles.filter((f) => !assets.includes(f));
  assert.deepEqual(missing, [], `Nicht im Cache: ${missing.join(', ')}`);
});

test('Service Worker: Versionsnummer stimmt mit APP_VERSION überein', () => {
  const version = sw.match(/const VERSION = '([^']+)'/)[1];
  assert.equal(version, APP_VERSION, 'sw.js VERSION und js/constants.js APP_VERSION müssen gleich sein (tools/bump_version.py)');
  assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}\$\{VERSION\}`/, 'Cache-Name muss die Versionsnummer enthalten');
});

test('Manifest: relative start_url und scope, Pflicht-Icons vorhanden', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.ok(!m.start_url.startsWith('/') && !/^https?:/.test(m.start_url));
  assert.ok(!m.scope.startsWith('/') && !/^https?:/.test(m.scope));
  assert.equal(m.display, 'standalone');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const i of m.icons) {
    assert.ok(!i.src.startsWith('/'), `Icon-Pfad absolut: ${i.src}`);
    assert.ok(existsSync(join(root, i.src)), `${i.src} fehlt`);
  }
});

test('Unterpfad: keine absoluten Pfade in HTML, CSS, JS und Manifest', () => {
  const files = ['index.html', 'manifest.webmanifest', 'sw.js', ...walk('css'), ...walk('js')];
  const patterns = [
    [/(?:href|src)\s*=\s*["']\/(?!\/)/, 'href/src mit führendem /'],
    [/url\(\s*["']?\/(?!\/)/, 'url(/…)'],
    [/(?:fetch|register|import)\(\s*["'`]\//, 'fetch/register/import mit /'],
    [/from\s+["']\//, 'import from "/…"'],
    [/https?:\/\/(?!www\.w3\.org)/, 'absolute URL'],
    [/location\.(?:pathname|href)\s*=/, 'Zuweisung an pathname/href'],
  ];
  const problems = [];
  for (const f of files) {
    const text = read(f);
    for (const [re, label] of patterns) {
      if (re.test(text)) problems.push(`${relative('.', f)}: ${label}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('Service Worker: Registrierung mit relativem Pfad', () => {
  assert.match(read('js/update.js'), /register\('sw\.js'/);
});

test('index.html: eingebundene Dateien existieren', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    assert.ok(existsSync(join(root, m[1])), `${m[1]} fehlt`);
  }
});
