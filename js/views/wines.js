// Weinliste mit Suche, Filtern (Typ, Land, Trinkfenster) und Sortierung.
// Außerdem gemeinsame Bausteine für Karten, die auch Archiv und Detail nutzen.

import { h } from '../ui.js';
import { getAllWines } from '../db.js';
import { WINE_TYPES } from '../constants.js';
import { drinkingStatus, filterWines, sortWines, uniqueCountries, WINDOW_OPTIONS, SORT_OPTIONS } from '../logic.js';

const typeInfo = Object.fromEntries(WINE_TYPES.map((t) => [t.key, t]));

export const STATUS = {
  early: { label: 'Noch zu früh', cls: 'early' },
  ready: { label: 'Trinkreif', cls: 'ready' },
  past: { label: 'Überschritten', cls: 'past' },
};

export const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE') : '');

// "★★★☆☆" für eine Bewertung von 0–5
export const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

// Kleiner Helfer: Blob → Bild-Element
export function photoImg(blob, alt, cls = '') {
  const img = h('img', { class: cls, alt, loading: 'lazy' });
  if (blob) img.src = URL.createObjectURL(blob);
  return img;
}

export function typeBadge(typeKey) {
  const t = typeInfo[typeKey] || typeInfo.other;
  return h('span', { class: 'badge', style: { '--chip-color': `var(${t.cssVar})` } }, h('span', { class: 'dot' }), t.label);
}

// Pille "Trinkreif" usw.; nichts, wenn kein Trinkfenster angegeben ist.
export function statusBadge(wine) {
  const s = STATUS[drinkingStatus(wine)];
  return s ? h('span', { class: `status ${s.cls}` }, s.label) : null;
}

// Filter und Sortierung bleiben beim Wechsel zwischen Tabs erhalten (bis die App neu geladen wird).
const viewState = { query: '', type: '', country: '', window: '', sort: 'name' };

export async function createWinesView() {
  const all = (await getAllWines()).filter((w) => w.status !== 'archived');
  const bottles = all.reduce((a, w) => a + w.count, 0);

  const header = h('header', { class: 'view-header' },
    h('h1', {}, 'Weine'),
    h('p', { class: 'muted' }, all.length
      ? `${all.length} ${all.length === 1 ? 'Wein' : 'Weine'} · ${bottles} ${bottles === 1 ? 'Flasche' : 'Flaschen'}`
      : 'Noch keine Weine'));
  const addBtn = h('a', { class: 'btn primary big block', href: '#/einlagern' }, '＋ Wein einlagern');

  if (!all.length) {
    return h('div', { class: 'view' }, header,
      h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '🍾'),
        h('p', {}, 'Lagere deinen ersten Wein ein. Ein Foto vom Etikett genügt für den Anfang.')),
      addBtn);
  }

  // ---- Bedienelemente ----
  const select = (key, label, options) => {
    const el = h('select', { class: 'input', 'aria-label': label,
      onchange: (e) => { viewState[key] = e.target.value; renderList(); } },
      options.map(([value, text]) => h('option', { value, selected: viewState[key] === value }, text)));
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
  };

  const search = h('input', {
    class: 'input search', type: 'search', placeholder: 'Suchen nach Name, Weingut, Region …', value: viewState.query,
    'aria-label': 'Suche', autocomplete: 'off',
    oninput: (e) => { viewState.query = e.target.value; renderList(); },
  });

  const filters = h('div', { class: 'filters' },
    select('type', 'Typ', [['', 'Alle Typen'], ...WINE_TYPES.map((t) => [t.key, t.label])]),
    select('country', 'Land', [['', 'Alle Länder'], ...uniqueCountries(all).map((c) => [c, c])]),
    select('window', 'Trinkfenster', [['', 'Alle'], ...WINDOW_OPTIONS.map((o) => [o.key, o.label])]),
    select('sort', 'Sortierung', SORT_OPTIONS.map((o) => [o.key, o.label])));

  const info = h('div', { class: 'list-info muted small' });
  const resetBtn = h('button', { class: 'btn small', onclick: () => {
    Object.assign(viewState, { query: '', type: '', country: '', window: '' });
    search.value = '';
    filters.querySelectorAll('select').forEach((s) => { if (s.getAttribute('aria-label') !== 'Sortierung') s.value = ''; });
    renderList();
  } }, 'Filter zurücksetzen');
  const list = h('div', { class: 'cards' });

  // ---- Liste neu aufbauen ----
  function renderList() {
    const shown = sortWines(filterWines(all, viewState), viewState.sort);
    const filtered = !!(viewState.query || viewState.type || viewState.country || viewState.window);
    info.replaceChildren(
      h('span', {}, filtered ? `${shown.length} von ${all.length} Weinen` : `${all.length} ${all.length === 1 ? 'Wein' : 'Weine'}`),
      ...(filtered ? [resetBtn] : []));
    if (!shown.length) {
      list.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Kein Wein passt zu Suche und Filtern.')));
      return;
    }
    list.replaceChildren(...shown.map((w, i) => h('a', { class: 'wine-card', href: `#/wein/${w.id}`, style: { '--i': Math.min(i, 12) } },
      photoImg(w.photo, w.name, 'wine-thumb'),
      h('div', { class: 'wine-card-body' },
        h('strong', { class: 'wine-name' }, w.name),
        h('span', { class: 'muted small' }, [w.winery, w.vintage].filter(Boolean).join(' · ') || 'ohne Weingut'),
        h('div', { class: 'wine-card-meta' }, typeBadge(w.type), statusBadge(w),
          w.bottleSize !== '0,75 l' && h('span', { class: 'muted small' }, w.bottleSize))),
      h('div', { class: 'count-pill', 'aria-label': `${w.count} Flaschen` }, String(w.count), h('span', {}, '×')))));
  }
  renderList();

  return h('div', { class: 'view' }, header, addBtn, search, filters, info, list);
}
