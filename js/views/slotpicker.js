// Regal zum Auswählen von Lagerplätzen (im Formular "Wein einlagern/bearbeiten").
// Freie Plätze lassen sich antippen (an/aus), von anderen Weinen belegte sind gesperrt.

import { h, toast } from '../ui.js';
import { ZONES, WINE_TYPES } from '../constants.js';
import { occupiedMap, slotKey } from '../logic.js';

const typeVar = Object.fromEntries(WINE_TYPES.map((t) => [t.key, t.cssVar]));

// config, wines: alle Weine, excludeId: der Wein, den wir gerade bearbeiten,
// initial: schon gewählte Plätze, getMax(): aktuelle Flaschenzahl.
export function createSlotPicker({ config, wines, excludeId = null, initial = [], getMax, onChange = () => {} }) {
  const occupied = occupiedMap(wines, excludeId);
  const selected = new Map(initial.map((p) => [slotKey(p), { shelfId: p.shelfId, slot: p.slot }]));
  const buttons = new Map(); // key → Button

  const refresh = () => {
    for (const [key, btn] of buttons) btn.classList.toggle('selected', selected.has(key));
    summary.textContent = `${selected.size} von ${getMax()} Flaschen mit Platz`;
  };

  const toggle = (shelf, slot) => {
    const key = `${shelf.id}:${slot}`;
    if (selected.has(key)) selected.delete(key);
    else if (selected.size >= getMax()) {
      // Bei einer Flasche wird der Platz einfach ersetzt, sonst Hinweis
      if (getMax() === 1) { selected.clear(); selected.set(key, { shelfId: shelf.id, slot }); }
      else { toast('Mehr Plätze als Flaschen. Erhöhe die Anzahl.'); return; }
    } else selected.set(key, { shelfId: shelf.id, slot });
    refresh();
    onChange();
  };

  const summary = h('span', { class: 'muted small' });
  const zones = ZONES.map((zone) => {
    const shelves = config.shelves.filter((s) => s.zone === zone.key);
    if (!shelves.length) return null;
    return h('div', { class: 'picker-zone' },
      h('div', { class: 'picker-zone-title' }, zone.label),
      shelves.map((shelf) => h('div', { class: 'picker-shelf' },
        h('div', { class: 'picker-shelf-name' }, shelf.name),
        h('div', { class: 'slots small-slots' },
          Array.from({ length: shelf.slots }, (_, i) => {
            const slot = i + 1;
            const key = `${shelf.id}:${slot}`;
            const other = occupied.get(key);
            const btn = h('button', {
              type: 'button',
              class: 'slot' + (other ? ' filled locked' : ''),
              style: other ? { '--slot-color': `var(${typeVar[other.type] || '--type-other'})` } : null,
              disabled: !!other,
              'aria-label': other ? `Platz ${slot}, belegt mit ${other.name}` : `${shelf.name}, Platz ${slot}`,
              onclick: () => toggle(shelf, slot),
            }, String(slot));
            buttons.set(key, btn);
            return btn;
          })))));
  });

  const el = h('div', { class: 'picker' }, h('div', { class: 'picker-head' }, summary), zones);
  refresh();

  return {
    el,
    getPlaces: () => [...selected.values()],
    // Wird aufgerufen, wenn sich die Flaschenzahl ändert
    refresh,
    // Ersetzt die Auswahl (z. B. durch "nächste freie Plätze")
    setPlaces(places) {
      selected.clear();
      for (const p of places) selected.set(slotKey(p), p);
      refresh();
      onChange();
    },
  };
}
