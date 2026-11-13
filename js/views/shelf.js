// Regalansicht: Raster des Schranks, getrennt nach Temperaturzonen.
//   Belegter Platz → Wein-Detail, freier Platz → "Wein einlagern" mit diesem Platz.
//   Trink-Modus ("Wein trinken"): Flasche im Regal antippen, um genau diese zu entnehmen.
// Belegte Plätze zeigen das runde Etikett-Bild mit Farbring in der Farbe des Weintyps; ein kleiner
// Punkt zeigt das Trinkfenster. Suche und Filter dunkeln alle Plätze ab, die nicht passen.

import { h, toast, blobUrl } from '../ui.js';
import { getAllWines } from '../db.js';
import { WINE_TYPES, ZONES } from '../constants.js';
import {
  drinkingStatus, occupiedMap, EMPTY_SHELF_FILTER, matchesShelfFilter, hasActiveFilter,
  activeFilterChips, removeFilterChip,
} from '../logic.js';
import { STATUS } from './wines.js';
import { drinkWine } from './drink.js';
import { openFilterSheet } from './filtersheet.js';

const typeVar = Object.fromEntries(WINE_TYPES.map((t) => [t.key, t.cssVar]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const freshFilter = () => ({ ...EMPTY_SHELF_FILTER, types: [] });

// Suche und Filter bleiben beim Wechsel zwischen den Ansichten erhalten,
// und werden beim Neustart der App zurückgesetzt (Modul wird neu geladen).
let shelfFilter = freshFilter();

// Mindestgröße einer Tippfläche und Abstand im Raster (siehe css/style.css, .slots)
const MIN_SLOT = 44;
const SLOT_GAP = 8;

export async function createShelfView(config) {
  const wines = (await getAllWines()).filter((w) => w.status !== 'archived');
  const occupied = occupiedMap(wines);

  const totalSlots = config.shelves.reduce((a, s) => a + s.slots, 0);
  const used = occupied.size;
  const withoutPlace = wines.reduce((a, w) => a + (w.count - (w.places || []).length), 0);
  const typesPresent = new Set(wines.map((w) => w.type));

  let drinkMode = false;

  // ---- Übersicht ----
  const overview = h('div', { class: 'card overview' },
    h('div', { class: 'overview-numbers' },
      h('div', {}, h('strong', {}, String(used)), h('span', { class: 'muted small' }, 'belegt')),
      h('div', {}, h('strong', {}, String(totalSlots - used)), h('span', { class: 'muted small' }, 'frei')),
      h('div', {}, h('strong', {}, String(totalSlots)), h('span', { class: 'muted small' }, 'Plätze'))),
    h('div', { class: 'meter', role: 'img', 'aria-label': `${used} von ${totalSlots} Plätzen belegt` },
      h('div', { class: 'meter-fill', style: { width: `${totalSlots ? (used / totalSlots) * 100 : 0}%` } })),
    withoutPlace > 0 && h('a', { class: 'small unplaced', href: '#/weine' },
      `${withoutPlace} ${withoutPlace === 1 ? 'Flasche hat' : 'Flaschen haben'} noch keinen Platz ›`));

  // ---- Legende (nur Typen, die vorkommen) ----
  const legend = typesPresent.size
    ? h('div', { class: 'legend' },
      WINE_TYPES.filter((t) => typesPresent.has(t.key)).map((t) =>
        h('span', { class: 'legend-item', style: { '--chip-color': `var(${t.cssVar})` } }, h('span', { class: 'dot' }), t.label)),
      h('span', { class: 'legend-item' }, h('span', { class: 'mark ready' }), 'trinkreif'),
      h('span', { class: 'legend-item' }, h('span', { class: 'mark past' }), 'überschritten'))
    : null;

  // ---- Schaltflächen ----
  const banner = h('div', { class: 'drink-banner', hidden: true }, 'Tippe die Flasche, die du entnimmst.');
  const drinkBtn = h('button', { class: 'btn big', onclick: () => setDrinkMode(!drinkMode) }, '🍷 Trinken');
  const root = h('div', { class: 'view' });

  function setDrinkMode(on) {
    if (on && !wines.length) { toast('Es liegt noch kein Wein im Regal.'); return; }
    drinkMode = on;
    root.classList.toggle('drink-mode', on);
    banner.hidden = !on;
    drinkBtn.textContent = on ? 'Abbrechen' : '🍷 Trinken';
  }

  function onSlot(shelf, slot, wine) {
    if (!drinkMode) {
      location.hash = wine ? `#/wein/${wine.id}` : `#/einlagern/${shelf.id}/${slot}`;
      return;
    }
    if (!wine) { toast('Dieser Platz ist leer.'); return; }
    drinkWine(wine, config, { place: { shelfId: shelf.id, slot } });
  }

  // ---- Plätze ----
  const slotRefs = []; // { el, wine } – für Suche und Filter

  function buildSlot(shelf, slot) {
    const wine = occupied.get(`${shelf.id}:${slot}`);
    const status = wine ? drinkingStatus(wine) : null;
    const statusText = status ? `, ${STATUS[status].label}` : '';
    const image = wine && (wine.crop || wine.photo); // das kleine Bild; Foto nur als Übergang nach dem Update
    const el = h('button', {
      class: 'slot' + (wine ? ' filled' : '') + (image ? ' has-img' : ''),
      style: wine ? { '--slot-color': `var(${typeVar[wine.type] || '--type-other'})` } : null,
      'data-status': status,
      'aria-label': wine ? `${wine.name}, Platz ${slot}${statusText}` : `Platz ${slot}, frei`,
      onclick: () => onSlot(shelf, slot, wine),
    }, image ? h('img', { class: 'slot-img', src: blobUrl(image), alt: '', draggable: 'false' }) : String(slot));
    slotRefs.push({ el, wine });
    return el;
  }

  // ---- Zonen und Fächer ----
  const slotGrids = [];
  const zones = ZONES.map((zone) => {
    const shelves = config.shelves.filter((s) => s.zone === zone.key);
    if (!shelves.length) return null;
    const zoneTotal = shelves.reduce((a, s) => a + s.slots, 0);
    const zoneUsed = shelves.reduce((a, s) => a + Array.from({ length: s.slots }, (_, i) => occupied.has(`${s.id}:${i + 1}`)).filter(Boolean).length, 0);
    return h('section', { class: 'zone' },
      h('div', { class: 'zone-head' },
        h('h2', { class: 'zone-title' }, zone.label),
        h('span', { class: 'muted small' }, `${zoneUsed} belegt · ${zoneTotal - zoneUsed} frei`)),
      shelves.map((shelf) => {
        const filled = Array.from({ length: shelf.slots }, (_, i) => occupied.has(`${shelf.id}:${i + 1}`)).filter(Boolean).length;
        const grid = h('div', { class: 'slots', 'data-count': shelf.slots },
          Array.from({ length: shelf.slots }, (_, i) => buildSlot(shelf, i + 1)));
        slotGrids.push(grid);
        return h('div', { class: 'card shelf' },
          h('div', { class: 'shelf-head' },
            h('strong', {}, shelf.name),
            h('span', { class: 'muted small' }, `${filled} / ${shelf.slots}`)),
          grid);
      }));
  });
  const zonesBox = h('div', { class: 'zones' }, zones);

  // Spaltenzahl je Fach: so viele Plätze pro Zeile, wie mit mindestens 44 px Breite passen; die Plätze
  // verteilen sich gleichmäßig auf die Zeilen (9 Plätze → 5 + 4 statt 6 + 3). Kein seitliches Scrollen.
  function layoutSlots() {
    for (const grid of slotGrids) {
      const width = grid.clientWidth;
      if (!width) continue;
      const count = Number(grid.dataset.count);
      const maxCols = Math.max(1, Math.floor((width + SLOT_GAP) / (MIN_SLOT + SLOT_GAP)));
      const rows = Math.ceil(count / maxCols);
      grid.style.setProperty('--cols', String(Math.ceil(count / rows)));
    }
  }
  // Läuft, sobald die Ansicht im Dokument ist (Ereignis aus app.js), und bei jeder Größenänderung (Drehen des Geräts)
  root.addEventListener('wr:attached', layoutSlots);
  new ResizeObserver(layoutSlots).observe(root);

  // ---- Suche und Filter ----
  const clearBtn = h('button', { class: 'search-clear', type: 'button', hidden: true, 'aria-label': 'Suche löschen',
    onclick: () => { shelfFilter.query = ''; searchInput.value = ''; searchInput.focus(); applyFilter(); } }, '×');
  const searchInput = h('input', {
    class: 'input search-input', type: 'search', placeholder: 'Wein suchen …', value: shelfFilter.query,
    'aria-label': 'Wein im Regal suchen', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
    oninput: (e) => { shelfFilter.query = e.target.value; applyFilter(); },
  });
  const filterBadge = h('span', { class: 'badge-count', hidden: true });
  const filterBtn = h('button', { class: 'btn filter-btn', type: 'button', onclick: openSheet }, 'Filter', filterBadge);
  const searchRow = h('div', { class: 'search-row' }, h('div', { class: 'search-box' }, searchInput, clearBtn), filterBtn);
  const chipsRow = h('div', { class: 'fchips', hidden: true });
  const resultLine = h('div', { class: 'result-line', hidden: true, 'aria-live': 'polite' });
  const noHit = h('div', { class: 'card no-hit', hidden: true },
    h('strong', {}, 'Kein Wein gefunden'),
    h('p', { class: 'muted' }, 'Zu Suche und Filtern passt kein Wein.'),
    h('button', { class: 'btn', onclick: resetFilter }, 'Filter zurücksetzen'));
  const unplacedBox = h('div', { class: 'card unplaced-list', hidden: true });

  function resetFilter() {
    shelfFilter = freshFilter();
    searchInput.value = '';
    applyFilter();
  }

  function matches(wine) { return matchesShelfFilter(wine, shelfFilter, config); }

  // Aktualisiert Abdunklung, Chips, Trefferzahl und die Liste "ohne Lagerplatz" – ohne das Regal neu aufzubauen
  function applyFilter() {
    const active = hasActiveFilter(shelfFilter);
    const hits = active ? wines.filter(matches) : wines;
    const hitIds = new Set(hits.map((w) => w.id));

    for (const { el, wine } of slotRefs) {
      const hit = active && wine && hitIds.has(wine.id);
      el.classList.toggle('hit', !!hit);
      el.classList.toggle('dim', active && !hit);
    }

    clearBtn.hidden = !shelfFilter.query;
    const chips = activeFilterChips(shelfFilter);
    filterBadge.hidden = !chips.length;
    filterBadge.textContent = String(chips.length);

    chipsRow.hidden = !active;
    chipsRow.replaceChildren(
      ...chips.map((chip) => h('button', {
        class: 'fchip', type: 'button', 'aria-label': `Filter „${chip.label}“ entfernen`,
        onclick: () => { shelfFilter = removeFilterChip(shelfFilter, chip); applyFilter(); },
      }, chip.label, h('span', { class: 'x', 'aria-hidden': 'true' }, '×'))),
      h('button', { class: 'btn small', type: 'button', onclick: resetFilter }, 'Zurücksetzen'));

    resultLine.hidden = !active;
    const bottles = hits.reduce((a, w) => a + w.count, 0);
    resultLine.textContent = hits.length ? `${plural(hits.length, 'Wein', 'Weine')}, ${plural(bottles, 'Flasche', 'Flaschen')}` : 'Keine Treffer';

    noHit.hidden = !(active && !hits.length);
    zonesBox.hidden = active && !hits.length;
    legend?.toggleAttribute('hidden', active && !hits.length);

    // Treffer, von denen Flaschen keinen Platz haben, stehen nicht im Regal: eigene Liste
    const loose = active ? hits.filter((w) => w.count - (w.places || []).length > 0) : [];
    unplacedBox.hidden = !loose.length;
    unplacedBox.replaceChildren(...(loose.length ? [
      h('strong', {}, `${plural(loose.length, 'Treffer', 'Treffer')} ohne Lagerplatz`),
      ...loose.map((w) => {
        const n = w.count - (w.places || []).length;
        return h('a', { class: 'loose-row', href: `#/wein/${w.id}` },
          h('span', { class: 'loose-name' }, w.name, w.vintage ? ` ${w.vintage}` : ''),
          h('span', { class: 'muted small' }, `${plural(n, 'Flasche', 'Flaschen')} ohne Platz ›`));
      }),
    ] : []));
  }

  function openSheet() {
    openFilterSheet({
      wines,
      get: () => shelfFilter,
      set: (next) => { shelfFilter = next; searchInput.value = next.query; applyFilter(); },
      countHits: () => wines.filter(matches).length,
    });
  }

  root.append(...[
    h('header', { class: 'view-header' }, h('h1', {}, 'Regal')),
    h('div', { class: 'action-row' },
      h('a', { class: 'btn primary big grow', href: '#/einlagern' }, '＋ Einlagern'), drinkBtn),
    searchRow, chipsRow, resultLine, noHit,
    banner, overview, legend, zonesBox, unplacedBox,
  ].filter(Boolean));

  applyFilter();
  return root;
}
