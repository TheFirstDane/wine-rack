// Einrichtungsassistent für das Regal.
// Schritt 1: Anzahl der Fächer. Schritt 2: je Fach Name, Plätze und Zone.
// Wird beim ersten Start gezeigt und später aus den Einstellungen erneut geöffnet.

import { h, alertDialog, stepper } from '../ui.js';
import { icon } from '../icons.js';
import { createDeviceChooser } from './devicechooser.js';
import { saveShelfConfig } from '../db.js';
import { ZONES, DEFAULT_SHELF_COUNT, DEFAULT_TOTAL_SLOTS } from '../constants.js';

const MAX_SHELVES = 20;
const MAX_SLOTS = 40;

let idCounter = 0;
const newShelfId = () => 'f' + Date.now().toString(36) + (idCounter++).toString(36);

// Startwerte: 77 Plätze gleichmäßig auf die Fächer verteilt, obere Hälfte = obere Zone.
function defaultShelves(count) {
  const base = Math.floor(DEFAULT_TOTAL_SLOTS / count);
  const extra = DEFAULT_TOTAL_SLOTS % count;
  const upperCount = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => ({
    id: newShelfId(),
    name: `Fach ${i + 1}`,
    slots: base + (i < extra ? 1 : 0),
    zone: i < upperCount ? 'upper' : 'lower',
  }));
}

// existing: bisherige Konfiguration (Bearbeiten) oder undefined (Ersteinrichtung)
// onDone(config): nach erfolgreichem Speichern; onCancel: nur beim Bearbeiten
// onImport: nur bei der Ersteinrichtung – stellt stattdessen eine Sicherung wieder her
export function createSetupView({ existing, onDone, onCancel, onImport }) {
  let shelves = existing
    ? existing.shelves.map((s) => ({ ...s }))
    : defaultShelves(DEFAULT_SHELF_COUNT);

  const root = h('div', { class: 'setup' });

  // ---- Schritt 0: Gerät (nur beim ersten Start) -------------------------
  function renderStepDevice() {
    root.replaceChildren(
      h('div', { class: 'setup-body step-enter' },
        h('div', { class: 'setup-logo' }, icon('glass', 'logo')),
        h('h1', {}, 'Willkommen bei Wine rack'),
        h('p', { class: 'lead' }, 'Wähle zuerst dein Gerät. „Automatisch“ passt die Darstellung an die Bildschirmgröße an. Das lässt sich später in den Einstellungen ändern.'),
        h('div', { class: 'card' }, createDeviceChooser())),
      h('div', { class: 'setup-footer' },
        onImport && h('button', { class: 'btn', onclick: onImport }, 'Aus Sicherung'),
        h('button', { class: 'btn primary grow', onclick: renderStep1 }, 'Weiter')));
  }

  // ---- Schritt 1: Anzahl ------------------------------------------------
  function renderStep1() {
    root.replaceChildren(
      h('div', { class: 'setup-body step-enter' },
        h('h1', {}, existing ? 'Regal bearbeiten' : 'Regal einrichten'),
        h('p', { class: 'lead' }, existing
          ? 'Passe Fächer und Plätze deines Schranks an.'
          : 'Das dauert nur eine Minute und lässt sich später ändern.'),
        h('div', { class: 'card setup-card' },
          h('div', { class: 'row' },
            h('div', {}, h('strong', {}, 'Anzahl der Fächer'),
              h('div', { class: 'muted small' }, 'Zähle einen Boden mit, falls dort Flaschen liegen.')),
            stepper(shelves.length, 1, MAX_SHELVES, (n) => {
              while (shelves.length < n) {
                shelves.push({ id: newShelfId(), name: `Fach ${shelves.length + 1}`, slots: 8, zone: 'lower' });
              }
              shelves.length = n;
            }))),
      ),
      h('div', { class: 'setup-footer' },
        existing ? h('button', { class: 'btn', onclick: onCancel }, 'Abbrechen') : h('button', { class: 'btn', onclick: renderStepDevice }, 'Zurück'),
        h('button', { class: 'btn primary grow', onclick: renderStep2 }, 'Weiter')));
  }

  // ---- Schritt 2: Details je Fach ---------------------------------------
  function renderStep2() {
    const total = h('strong', {});
    const updateTotal = () => {
      const sum = shelves.reduce((a, s) => a + s.slots, 0);
      total.textContent = `${sum} Plätze`;
    };

    const cards = shelves.map((shelf, i) => {
      const zoneButtons = ZONES.map((z) => {
        const btn = h('button', {
          type: 'button',
          class: 'seg' + (shelf.zone === z.key ? ' active' : ''),
          onclick: () => {
            shelf.zone = z.key;
            zoneButtons.forEach((b, j) => b.classList.toggle('active', ZONES[j].key === z.key));
          },
        }, z.label);
        return btn;
      });
      return h('div', { class: 'card shelf-card' },
        h('div', { class: 'shelf-card-head' },
          h('span', { class: 'shelf-no' }, String(i + 1)),
          h('input', {
            class: 'input', type: 'text', value: shelf.name, maxlength: '30',
            'aria-label': `Name von Fach ${i + 1}`,
            oninput: (e) => { shelf.name = e.target.value; },
          })),
        h('div', { class: 'row' },
          h('span', {}, 'Plätze'),
          stepper(shelf.slots, 1, MAX_SLOTS, (n) => { shelf.slots = n; updateTotal(); })),
        h('div', { class: 'segmented' }, zoneButtons));
    });

    updateTotal();
    root.replaceChildren(
      h('div', { class: 'setup-body step-enter' },
        h('h1', {}, 'Fächer einrichten'),
        h('p', { class: 'lead' }, 'Name, Plätze und Temperaturzone je Fach. Das oberste Fach steht zuerst.'),
        cards),
      h('div', { class: 'setup-footer sticky' },
        h('button', { class: 'btn', onclick: renderStep1 }, 'Zurück'),
        h('div', { class: 'total' }, h('span', { class: 'muted small' }, 'Gesamt'), total),
        h('button', { class: 'btn primary', onclick: save }, 'Speichern')));
  }

  async function save() {
    // Leere Namen durch Standardnamen ersetzen
    const config = {
      version: 1,
      shelves: shelves.map((s, i) => ({ ...s, name: s.name.trim() || `Fach ${i + 1}` })),
    };
    const result = await saveShelfConfig(config);
    if (!result.ok) {
      const list = result.orphaned.slice(0, 5)
        .map((o) => `${o.wine.name} (Platz ${o.place.slot})`).join(', ');
      await alertDialog('Belegte Plätze fallen weg',
        `Diese Flaschen liegen auf Plätzen, die es nicht mehr gäbe: ${list}. Verschiebe sie zuerst auf andere Plätze.`);
      return;
    }
    onDone(config);
  }

  if (existing) renderStep1(); else renderStepDevice();
  return root;
}
