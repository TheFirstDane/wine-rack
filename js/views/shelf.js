// Regalansicht: Raster des Schranks, getrennt nach Temperaturzonen.
//   Belegter Platz → Wein-Detail, freier Platz → "Wein einlagern" mit diesem Platz.
//   Trink-Modus ("Wein trinken"): Flasche im Regal antippen, um genau diese zu entnehmen.
// Plätze sind nach Weintyp gefärbt; ein kleiner Punkt zeigt das Trinkfenster.

import { h, toast } from '../ui.js';
import { getAllWines } from '../db.js';
import { WINE_TYPES, ZONES } from '../constants.js';
import { drinkingStatus, occupiedMap } from '../logic.js';
import { STATUS } from './wines.js';
import { drinkWine } from './drink.js';

const typeVar = Object.fromEntries(WINE_TYPES.map((t) => [t.key, t.cssVar]));

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

  // ---- Zonen und Fächer ----
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
        return h('div', { class: 'card shelf' },
          h('div', { class: 'shelf-head' },
            h('strong', {}, shelf.name),
            h('span', { class: 'muted small' }, `${filled} / ${shelf.slots}`)),
          h('div', { class: 'slots' },
            Array.from({ length: shelf.slots }, (_, i) => {
              const slot = i + 1;
              const wine = occupied.get(`${shelf.id}:${slot}`);
              const status = wine ? drinkingStatus(wine) : null;
              const statusText = status ? `, ${STATUS[status].label}` : '';
              return h('button', {
                class: 'slot' + (wine ? ' filled' : ''),
                style: wine ? { '--slot-color': `var(${typeVar[wine.type] || '--type-other'})` } : null,
                'data-status': status,
                'aria-label': wine ? `${wine.name}, Platz ${slot}${statusText}` : `Platz ${slot}, frei`,
                onclick: () => onSlot(shelf, slot, wine),
              }, String(slot));
            })));
      }));
  });

  root.append(...[
    h('header', { class: 'view-header' }, h('h1', {}, 'Regal')),
    h('div', { class: 'action-row' },
      h('a', { class: 'btn primary big grow', href: '#/einlagern' }, '＋ Einlagern'), drinkBtn),
    banner, overview, legend, ...zones,
  ].filter(Boolean));
  return root;
}
