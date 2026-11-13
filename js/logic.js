// Reine Logik ohne Browser-Abhängigkeiten (läuft auch in Node, siehe tests/).
// Alles, was Weine prüft, zusammenführt oder Plätze vergibt, steht hier.

import { WINE_TYPES, DEFAULT_CROP_PARAMS } from './constants.js';

export const BOTTLE_SIZES = ['0,375 l', '0,5 l', '0,75 l', '1,5 l', '3 l', '6 l'];
export const DEFAULT_BOTTLE_SIZE = '0,75 l';

// ---- Hilfen ----------------------------------------------------------------

// Vergleichsform für Texte: Kleinschreibung, ohne Akzente, Leerraum zusammengefasst.
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// "12,5" und "12.5" → 12.5; leer oder ungültig → null
export function parseNumber(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Heutiges Datum als "JJJJ-MM-TT" in Ortszeit
export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const slotKey = (place) => `${place.shelfId}:${place.slot}`;

// ---- Pflichtfelder & Formular ----------------------------------------------

// Prüft die Rohwerte aus dem Formular (meist Strings) und baut den Wein.
// Liefert { errors, wine }; errors ist leer, wenn alles passt.
// raw.photo muss ein Blob (oder anderes truthy Objekt) sein.
export function validateWineInput(raw, { now = new Date() } = {}) {
  const errors = {};
  const str = (v) => String(v ?? '').trim();
  const thisYear = now.getFullYear();

  if (!raw.photo) errors.photo = 'Bitte ein Foto aufnehmen.';
  if (!str(raw.name)) errors.name = 'Bitte den Weinnamen eingeben.';
  if (!WINE_TYPES.some((t) => t.key === raw.type)) errors.type = 'Bitte einen Weintyp wählen.';

  let vintage = null;
  if (str(raw.vintage) !== '') {
    vintage = parseNumber(raw.vintage);
    if (!Number.isInteger(vintage) || vintage < 1800 || vintage > thisYear + 1) {
      errors.vintage = `Jahrgang zwischen 1800 und ${thisYear + 1}.`;
    }
  }

  const count = str(raw.count) === '' ? 1 : parseNumber(raw.count);
  if (!Number.isInteger(count) || count < 1 || count > 999) errors.count = 'Mindestens 1 Flasche.';

  const year = (v, field) => {
    if (str(v) === '') return null;
    const n = parseNumber(v);
    if (!Number.isInteger(n) || n < 1800 || n > 2300) { errors[field] = 'Ungültiges Jahr.'; return null; }
    return n;
  };
  const drinkFrom = year(raw.drinkFrom, 'drinkFrom');
  const drinkTo = year(raw.drinkTo, 'drinkTo');
  if (drinkFrom && drinkTo && drinkFrom > drinkTo) errors.drinkTo = '„bis“ darf nicht vor „von“ liegen.';

  const num = (v, field, min, max) => {
    if (str(v) === '') return null;
    const n = parseNumber(v);
    if (n === null || n < min || n > max) { errors[field] = 'Ungültiger Wert.'; return null; }
    return n;
  };
  const price = num(raw.price, 'price', 0, 1e7);
  const marketValue = num(raw.marketValue, 'marketValue', 0, 1e7);
  const abv = num(raw.abv, 'abv', 0, 100);
  const rating = num(raw.rating, 'rating', 0, 5);

  const origin = raw.origin === 'gift' ? 'gift' : 'bought';
  const places = raw.places || [];
  if (!errors.count && places.length > count) errors.places = 'Mehr Plätze gewählt als Flaschen.';

  const wine = {
    name: str(raw.name),
    winery: str(raw.winery),
    type: raw.type,
    vintage,
    bottleSize: str(raw.bottleSize) || DEFAULT_BOTTLE_SIZE,
    count,
    places: places.map((p) => ({ shelfId: p.shelfId, slot: p.slot })),
    photo: raw.photo || null,
    country: str(raw.country),
    region: str(raw.region),
    price, drinkFrom, drinkTo, marketValue, abv, rating,
    origin,
    acquiredDate: str(raw.acquiredDate),
    boughtAt: origin === 'bought' ? str(raw.boughtAt) : '',
    giftFrom: origin === 'gift' ? str(raw.giftFrom) : '',
    storedAt: str(raw.storedAt) || todayISO(now),
    grapes: str(raw.grapes),
    notes: str(raw.notes),
    pairing: str(raw.pairing),
    status: 'active',
    drunkAt: null,
    crop: raw.crop || null,
    cropParams: raw.cropParams ? { ...raw.cropParams } : { ...DEFAULT_CROP_PARAMS },
  };
  return { errors, wine };
}

// ---- Zusammenführen ---------------------------------------------------------

const sameText = (a, b) => normalizeText(a) === normalizeText(b);

// Ein Wein ist durch Name + Weingut + Jahrgang + Flaschengröße bestimmt.
export function isSameWine(a, b) {
  return sameText(a.name, b.name) && sameText(a.winery, b.winery)
    && (a.vintage ?? null) === (b.vintage ?? null)
    && sameText(a.bottleSize, b.bottleSize);
}

// Sucht unter den aktiven Weinen:
//   exact   – derselbe Wein (Flaschen können dazukommen)
//   related – gleicher Name + Weingut, aber anderer Jahrgang oder andere Größe
//             (wird immer ein neuer Wein; die App weist darauf hin)
export function findMatches(wines, candidate, { ignoreId = null } = {}) {
  const active = wines.filter((w) => w.status !== 'archived' && w.id !== ignoreId);
  const exact = active.find((w) => isSameWine(w, candidate)) || null;
  const related = active.filter((w) => !isSameWine(w, candidate)
    && sameText(w.name, candidate.name) && sameText(w.winery, candidate.winery));
  return { exact, related };
}

// Fügt die Flaschen von `incoming` zu `existing` hinzu. Das Foto und alle bereits
// ausgefüllten Angaben des vorhandenen Weins bleiben; leere Felder werden ergänzt.
export function mergeInto(existing, incoming) {
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (['id', 'count', 'places', 'photo', 'crop', 'cropParams', 'status', 'drunkAt', 'storedAt'].includes(k)) continue;
    const empty = merged[k] == null || merged[k] === '';
    if (empty && v != null && v !== '') merged[k] = v;
  }
  merged.count = existing.count + incoming.count;
  merged.places = [...(existing.places || []), ...(incoming.places || [])];
  return merged;
}

// ---- Lagerplätze ------------------------------------------------------------

// "shelfId:slot" → Wein, für alle aktiven Weine (außer excludeId).
export function occupiedMap(wines, excludeId = null) {
  const map = new Map();
  for (const w of wines) {
    if (w.status === 'archived' || w.id === excludeId) continue;
    for (const p of w.places || []) map.set(slotKey(p), w);
  }
  return map;
}

// Prüft gewählte Plätze: existieren, nicht doppelt, nicht von anderen Weinen belegt,
// nicht mehr als Flaschen. Liefert eine Fehlermeldung oder null.
export function validatePlaces(config, wines, places, count, excludeId = null) {
  if (places.length > count) return 'Mehr Plätze gewählt als Flaschen.';
  const occupied = occupiedMap(wines, excludeId);
  const seen = new Set();
  for (const p of places) {
    const shelf = config.shelves.find((s) => s.id === p.shelfId);
    if (!shelf || !Number.isInteger(p.slot) || p.slot < 1 || p.slot > shelf.slots) return 'Ein gewählter Platz existiert nicht.';
    const key = slotKey(p);
    if (seen.has(key)) return 'Ein Platz ist doppelt gewählt.';
    if (occupied.has(key)) return `Platz ${p.slot} in „${shelf.name}“ ist schon belegt.`;
    seen.add(key);
  }
  return null;
}

// Die ersten n freien Plätze in Regalreihenfolge; `preferred` (gewählte) bleiben erhalten.
export function firstFreeSlots(config, wines, n, { excludeId = null, keep = [] } = {}) {
  const occupied = occupiedMap(wines, excludeId);
  const result = [...keep];
  const taken = new Set(keep.map(slotKey));
  for (const shelf of config.shelves) {
    for (let slot = 1; slot <= shelf.slots && result.length < n; slot++) {
      const key = `${shelf.id}:${slot}`;
      if (!occupied.has(key) && !taken.has(key)) result.push({ shelfId: shelf.id, slot });
    }
  }
  return result;
}

export function placeLabel(config, place) {
  const shelf = config.shelves.find((s) => s.id === place.shelfId);
  return `${shelf ? shelf.name : 'Unbekanntes Fach'}, Platz ${place.slot}`;
}

// ---- Trinkfenster -----------------------------------------------------------

// 'early' (noch zu früh) | 'ready' (trinkreif) | 'past' (überschritten) | null (keine Angabe)
export function drinkingStatus(wine, year = new Date().getFullYear()) {
  const { drinkFrom, drinkTo } = wine;
  if (!drinkFrom && !drinkTo) return null;
  if (drinkFrom && year < drinkFrom) return 'early';
  if (drinkTo && year > drinkTo) return 'past';
  return 'ready';
}

// ---- Trinken & Archivieren ---------------------------------------------------

// Was muss beim Trinken geklärt werden?
//   needsChoice – es gibt Flaschen mit Platz und mehr als eine Flasche: Nutzer wählt, welche
//   isLast      – die letzte Flasche; danach wandert der Wein ins Archiv
export function drinkChoices(wine) {
  const placed = wine.places || [];
  return {
    placed,
    unplaced: wine.count - placed.length,
    needsChoice: placed.length > 0 && wine.count > 1,
    isLast: wine.count === 1,
  };
}

// Entnimmt eine Flasche. place = Platz der Flasche, null = eine Flasche ohne Platz.
// Der Platz wird frei, die Anzahl sinkt um eins. Bei 0 wird der Wein archiviert
// (Status, Trinkdatum, optional Bewertung und Notiz). Ändert `wine` nicht, liefert eine Kopie.
export function drinkBottle(wine, place = null, { now = new Date(), rating = null, notes = '' } = {}) {
  if (wine.status === 'archived' || wine.count < 1) throw new Error('Von diesem Wein ist nichts mehr da.');
  const places = [...(wine.places || [])];

  if (place) {
    const i = places.findIndex((p) => slotKey(p) === slotKey(place));
    if (i < 0) throw new Error('Diese Flasche liegt nicht auf diesem Platz.');
    places.splice(i, 1);
  } else if (places.length >= wine.count) {
    // Alle Flaschen haben einen Platz: nur eindeutig, wenn es genau eine ist
    if (places.length !== 1) throw new Error('Bitte eine Flasche auswählen.');
    places.splice(0, 1);
  }

  const updated = { ...wine, count: wine.count - 1, places };
  const archived = updated.count === 0;
  if (archived) {
    updated.status = 'archived';
    updated.drunkAt = todayISO(now);
    updated.places = [];
    const r = Number(rating);
    if (rating != null && r >= 0 && r <= 5) updated.rating = r;
    if (String(notes).trim()) updated.notes = String(notes).trim();
  }
  return { wine: updated, archived };
}

// ---- Suche, Filter, Sortierung ------------------------------------------------

// 'none' im Trinkfenster-Filter = Wein ohne Angabe
export const WINDOW_OPTIONS = [
  { key: 'early', label: 'Noch zu früh' },
  { key: 'ready', label: 'Trinkreif' },
  { key: 'past', label: 'Überschritten' },
  { key: 'none', label: 'Ohne Angabe' },
];

export const SORT_OPTIONS = [
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'stored', label: 'Zuletzt eingelagert' },
  { key: 'vintage-desc', label: 'Jahrgang (neu → alt)' },
  { key: 'vintage-asc', label: 'Jahrgang (alt → neu)' },
  { key: 'count', label: 'Anzahl (viele zuerst)' },
  { key: 'drink', label: 'Bald trinken (Fenster endet zuerst)' },
];

// Alle Suchwörter müssen irgendwo in Name, Weingut, Land, Region, Rebsorten oder Jahrgang vorkommen.
export function filterWines(wines, { query = '', type = '', country = '', window = '' } = {}, year = new Date().getFullYear()) {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  return wines.filter((w) => {
    if (type && w.type !== type) return false;
    if (country && w.country !== country) return false;
    if (window && (drinkingStatus(w, year) ?? 'none') !== window) return false;
    if (!tokens.length) return true;
    return matchesTokens(w, tokens);
  });
}

// Alle Suchwörter müssen in Name, Weingut, Land, Region, Rebsorten oder Jahrgang vorkommen.
function matchesTokens(w, tokens) {
  if (!tokens.length) return true;
  const hay = normalizeText([w.name, w.winery, w.country, w.region, w.grapes, w.vintage].join(' '));
  return tokens.every((t) => hay.includes(t));
}

export function sortWines(wines, key = 'name') {
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  const last = (v) => (v == null ? Infinity : v); // fehlende Werte ans Ende
  const cmp = {
    name: byName,
    stored: (a, b) => String(b.storedAt || '').localeCompare(String(a.storedAt || '')) || byName(a, b),
    'vintage-desc': (a, b) => (b.vintage ?? -Infinity) - (a.vintage ?? -Infinity) || byName(a, b),
    'vintage-asc': (a, b) => last(a.vintage) - last(b.vintage) || byName(a, b),
    count: (a, b) => b.count - a.count || byName(a, b),
    drink: (a, b) => last(a.drinkTo) - last(b.drinkTo) || byName(a, b),
  }[key] || byName;
  return [...wines].sort(cmp);
}

export function uniqueCountries(wines) {
  return [...new Set(wines.map((w) => w.country).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

// Archiv: zuletzt getrunkene zuerst
export const sortArchive = (wines) =>
  [...wines].sort((a, b) => String(b.drunkAt || '').localeCompare(String(a.drunkAt || '')));

// ---- Zuschnitt (rundes Etikett-Bild) -----------------------------------------

export const MAX_CROP_ZOOM = 5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Rechnet gewählte Parameter in ein Quadrat im Foto um und hält es innerhalb des Bildes.
//   params: { cx, cy } = Mittelpunkt als Anteil von Breite/Höhe (0–1), zoom ≥ 1
//   zoom 1 = größtmögliches Quadrat, zoom 2 = halbe Kantenlänge usw.
// Liefert { cx, cy, zoom, side, sx, sy } (side/sx/sy in Bildpunkten).
export function normalizeCrop(width, height, params = DEFAULT_CROP_PARAMS) {
  const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
  const zoom = clamp(num(params.zoom, 1), 1, MAX_CROP_ZOOM);
  const side = Math.min(width, height) / zoom;
  const cx = clamp(num(params.cx, 0.5), side / 2 / width, 1 - side / 2 / width);
  const cy = clamp(num(params.cy, 0.5), side / 2 / height, 1 - side / 2 / height);
  return { cx, cy, zoom, side, sx: cx * width - side / 2, sy: cy * height - side / 2 };
}

// ---- Suche und Filter im Regal ----------------------------------------------------

export const EMPTY_SHELF_FILTER = {
  query: '',
  types: [],          // Weintypen (Mehrfachauswahl)
  vintageFrom: '',    // Produktionsjahr von/bis (Text aus dem Eingabefeld)
  vintageTo: '',
  place: '',          // 'c:Italien' (Land) oder 'r:Piemont' (Region)
  zone: '',           // 'upper' | 'lower'
  drinkable: false,   // "Jetzt trinkbar"
  unplaced: false,    // "Ohne Lagerplatz"
};

export const hasActiveFilter = (f) => activeFilterChips(f).length > 0 || normalizeText(f.query) !== '';

// Chips für aktive Filter (ohne Suchtext): [{ key, label, value? }]
// key sagt, welcher Filter beim Entfernen zurückgesetzt wird; value nur bei Weintypen.
export function activeFilterChips(f) {
  const chips = [];
  for (const key of f.types) {
    const t = WINE_TYPES.find((x) => x.key === key);
    chips.push({ key: 'types', value: key, label: t ? t.label : key });
  }
  const from = String(f.vintageFrom ?? '').trim();
  const to = String(f.vintageTo ?? '').trim();
  if (from || to) chips.push({ key: 'vintage', label: from && to ? `Jahrgang ${from}–${to}` : from ? `ab ${from}` : `bis ${to}` });
  if (f.place) chips.push({ key: 'place', label: `${f.place.startsWith('c:') ? 'Land' : 'Region'}: ${f.place.slice(2)}` });
  if (f.zone) chips.push({ key: 'zone', label: f.zone === 'upper' ? 'Obere Zone' : 'Untere Zone' });
  if (f.drinkable) chips.push({ key: 'drinkable', label: 'Jetzt trinkbar' });
  if (f.unplaced) chips.push({ key: 'unplaced', label: 'Ohne Lagerplatz' });
  return chips;
}

// Entfernt einen Chip (liefert einen neuen Filter).
export function removeFilterChip(f, chip) {
  const next = { ...f, types: [...f.types] };
  if (chip.key === 'types') next.types = next.types.filter((t) => t !== chip.value);
  else if (chip.key === 'vintage') { next.vintageFrom = ''; next.vintageTo = ''; }
  else next[chip.key] = EMPTY_SHELF_FILTER[chip.key];
  return next;
}

// Passt der Wein zu Suche und allen Filtern (UND-verknüpft)?
export function matchesShelfFilter(wine, f, config, year = new Date().getFullYear()) {
  const tokens = normalizeText(f.query).split(' ').filter(Boolean);
  if (!matchesTokens(wine, tokens)) return false;
  if (f.types.length && !f.types.includes(wine.type)) return false;

  const from = parseNumber(f.vintageFrom);
  const to = parseNumber(f.vintageTo);
  if (from !== null || to !== null) {
    if (wine.vintage == null) return false;
    if (from !== null && wine.vintage < from) return false;
    if (to !== null && wine.vintage > to) return false;
  }

  if (f.place) {
    const value = f.place.slice(2);
    if ((f.place.startsWith('c:') ? wine.country : wine.region) !== value) return false;
  }

  if (f.zone) {
    const zoneShelves = new Set(config.shelves.filter((s) => s.zone === f.zone).map((s) => s.id));
    if (!(wine.places || []).some((p) => zoneShelves.has(p.shelfId))) return false;
  }

  if (f.drinkable && drinkingStatus(wine, year) !== 'ready') return false;
  if (f.unplaced && wine.count - (wine.places || []).length <= 0) return false;
  return true;
}

// Auswahllisten für das Filterblatt aus den vorhandenen Weinen
export function placeOptions(wines) {
  const uniq = (key) => [...new Set(wines.map((w) => w[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  return { countries: uniq('country'), regions: uniq('region') };
}
