// Archiv: getrunkene Weine mit Datum, Bewertung und Notiz.

import { h } from '../ui.js';
import { getAllWines } from '../db.js';
import { sortArchive } from '../logic.js';
import { photoImg, typeBadge, stars, fmtDate } from './wines.js';

export async function createArchiveView() {
  const wines = sortArchive((await getAllWines()).filter((w) => w.status === 'archived'));

  const header = h('header', { class: 'view-header' },
    h('h1', {}, 'Archiv'),
    h('p', { class: 'muted' }, wines.length ? `${wines.length} ${wines.length === 1 ? 'Wein' : 'Weine'} getrunken` : 'Noch nichts getrunken'));

  if (!wines.length) {
    return h('div', { class: 'view' }, header,
      h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '📖'),
        h('p', {}, 'Wenn du die letzte Flasche eines Weins trinkst, erscheint er hier mit Datum, Bewertung und Notiz.')));
  }

  return h('div', { class: 'view' }, header,
    h('div', { class: 'cards' }, wines.map((w, i) => h('a', { class: 'wine-card archive-card', href: `#/wein/${w.id}`, style: { '--i': i } },
      photoImg(w.photo, w.name, 'wine-thumb'),
      h('div', { class: 'wine-card-body' },
        h('strong', { class: 'wine-name' }, w.name),
        h('span', { class: 'muted small' }, [w.winery, w.vintage].filter(Boolean).join(' · ') || 'ohne Weingut'),
        h('span', { class: 'small' }, `Getrunken am ${fmtDate(w.drunkAt)}`),
        w.rating != null && h('span', { class: 'rating', 'aria-label': `${w.rating} von 5 Sternen` }, stars(w.rating)),
        w.notes && h('span', { class: 'muted small clamp' }, w.notes),
        h('div', { class: 'wine-card-meta' }, typeBadge(w.type)))))));
}
