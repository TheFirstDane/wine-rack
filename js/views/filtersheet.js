// Filterblatt für die Regalansicht: Bottom Sheet (von unten, daumenfreundlich).
// Änderungen wirken sofort im Regal dahinter; "N Weine anzeigen" schließt das Blatt.

import { h, nextFrame } from '../ui.js';
import { WINE_TYPES } from '../constants.js';
import { EMPTY_SHELF_FILTER, placeOptions } from '../logic.js';

// get(): aktueller Filter, set(neuerFilter): übernehmen, countHits(): Zahl der passenden Weine
export function openFilterSheet({ wines, get, set, countHits }) {
  const { countries, regions } = placeOptions(wines);
  const update = (patch) => { set({ ...get(), ...patch }); sync(); };

  // ---- Weintyp (Mehrfachauswahl) ----
  const typeBtns = WINE_TYPES.map((t) => h('button', {
    type: 'button', class: 'chip', 'data-type': t.key, style: { '--chip-color': `var(${t.cssVar})` },
    onclick: () => {
      const types = get().types.includes(t.key) ? get().types.filter((x) => x !== t.key) : [...get().types, t.key];
      update({ types });
    },
  }, h('span', { class: 'dot' }), t.label));

  // ---- Produktionsjahr ----
  const yearInput = (key, label) => h('input', {
    class: 'input', type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: label, autocomplete: 'off',
    'aria-label': `Produktionsjahr ${label}`,
    oninput: (e) => update({ [key]: e.target.value.replace(/\D/g, '') }),
  });
  const fromInput = yearInput('vintageFrom', 'von');
  const toInput = yearInput('vintageTo', 'bis');

  // ---- Land / Region ----
  const placeSelect = h('select', { class: 'input', 'aria-label': 'Land oder Region', onchange: (e) => update({ place: e.target.value }) },
    h('option', { value: '' }, 'Alle'),
    countries.length ? h('optgroup', { label: 'Land' }, countries.map((c) => h('option', { value: `c:${c}` }, c))) : null,
    regions.length ? h('optgroup', { label: 'Region' }, regions.map((r) => h('option', { value: `r:${r}` }, r))) : null);

  // ---- Zone ----
  const zoneBtns = [['', 'Alle'], ['upper', 'Obere Zone'], ['lower', 'Untere Zone']].map(([value, label]) =>
    h('button', { type: 'button', class: 'seg', 'data-zone': value, onclick: () => update({ zone: value }) }, label));

  // ---- Schalter ----
  const toggle = (key, title, hint) => {
    const el = h('button', { type: 'button', class: 'toggle', role: 'switch', 'data-key': key, onclick: () => update({ [key]: !get()[key] }) },
      h('span', { class: 'toggle-text' }, h('strong', {}, title), h('span', { class: 'muted small' }, hint)),
      h('span', { class: 'switch', 'aria-hidden': 'true' }));
    return el;
  };
  const drinkableToggle = toggle('drinkable', 'Jetzt trinkbar', 'Liegt im Trinkfenster');
  const unplacedToggle = toggle('unplaced', 'Ohne Lagerplatz', 'Flaschen, die noch keinen Platz haben');

  const showBtn = h('button', { class: 'btn primary big grow', type: 'button', onclick: () => close() });
  const resetBtn = h('button', { class: 'btn big', type: 'button', onclick: () => { set({ ...EMPTY_SHELF_FILTER, types: [] }); sync(); } }, 'Zurücksetzen');

  // Stellt alle Bedienelemente passend zum aktuellen Filter ein
  function sync() {
    const f = get();
    typeBtns.forEach((b) => b.classList.toggle('active', f.types.includes(b.dataset.type)));
    if (document.activeElement !== fromInput) fromInput.value = f.vintageFrom;
    if (document.activeElement !== toInput) toInput.value = f.vintageTo;
    placeSelect.value = f.place;
    zoneBtns.forEach((b) => b.classList.toggle('active', b.dataset.zone === f.zone));
    for (const [el, key] of [[drinkableToggle, 'drinkable'], [unplacedToggle, 'unplaced']]) {
      el.classList.toggle('on', !!f[key]);
      el.setAttribute('aria-checked', String(!!f[key]));
    }
    const n = countHits();
    showBtn.textContent = n === 1 ? '1 Wein anzeigen' : `${n} Weine anzeigen`;
  }

  const section = (title, ...content) => h('div', { class: 'sheet-section' }, h('div', { class: 'sheet-label' }, title), ...content);

  const close = () => {
    overlay.classList.remove('show');
    document.body.classList.remove('no-scroll');
    setTimeout(() => overlay.remove(), 280);
  };

  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Filter' },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Filter'),
      h('button', { class: 'btn', type: 'button', 'aria-label': 'Schließen', onclick: () => close() }, '✕')),
    h('div', { class: 'sheet-body' },
      section('Weintyp', h('div', { class: 'chips' }, typeBtns)),
      section('Produktionsjahr', h('div', { class: 'two-col' }, fromInput, toInput)),
      section('Land / Region', placeSelect),
      section('Zone im Schrank', h('div', { class: 'segmented' }, zoneBtns)),
      section('Weitere', drinkableToggle, unplacedToggle)),
    h('div', { class: 'sheet-footer' }, resetBtn, showBtn));

  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => e.target === overlay && close() }, sheet);
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  sync();
  nextFrame(() => overlay.classList.add('show'));
}
