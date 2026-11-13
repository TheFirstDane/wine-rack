// Wein-Detail: großes Foto, alle Angaben, Trinkfenster, Trinken, Bearbeiten und Löschen.

import { h, toast, dialog } from '../ui.js';
import { getWine, deleteWine } from '../db.js';
import { placeLabel } from '../logic.js';
import { photoImg, typeBadge, statusBadge, stars, fmtDate } from './wines.js';
import { drinkWine } from './drink.js';

const fmtMoney = (n) => (n == null ? '' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));

export async function createDetailView(config, id) {
  const wine = await getWine(id);
  if (!wine) {
    return h('div', { class: 'view' }, h('div', { class: 'empty' }, h('p', {}, 'Diesen Wein gibt es nicht mehr.'),
      h('a', { class: 'btn block', href: '#/weine' }, 'Zur Weinliste')));
  }
  const archived = wine.status === 'archived';

  const window_ = [wine.drinkFrom, wine.drinkTo].some(Boolean)
    ? `${wine.drinkFrom || '…'} – ${wine.drinkTo || '…'}` : '';

  // Nur Zeilen mit Inhalt anzeigen
  const rows = [
    ['Getrunken am', fmtDate(wine.drunkAt)],
    ['Bewertung', wine.rating != null ? `${stars(wine.rating)}  ${String(wine.rating).replace('.', ',')} von 5` : ''],
    ['Weingut', wine.winery],
    ['Jahrgang', wine.vintage],
    ['Flaschengröße', wine.bottleSize],
    ['Land', wine.country],
    ['Region', wine.region],
    ['Rebsorten', wine.grapes],
    ['Alkohol', wine.abv != null ? `${String(wine.abv).replace('.', ',')} % vol.` : ''],
    ['Trinkfenster', window_],
    ['Kaufpreis', fmtMoney(wine.price)],
    ['Marktwert', fmtMoney(wine.marketValue)],
    ['Herkunft', wine.origin === 'gift' ? 'Geschenk' : 'Gekauft'],
    [wine.origin === 'gift' ? 'Geschenk von' : 'Gekauft bei', wine.origin === 'gift' ? wine.giftFrom : wine.boughtAt],
    [wine.origin === 'gift' ? 'Erhalten am' : 'Gekauft am', fmtDate(wine.acquiredDate)],
    ['Eingelagert am', fmtDate(wine.storedAt)],
    ['Speiseempfehlung', wine.pairing],
  ].filter(([, v]) => v !== '' && v != null);

  const placed = wine.places || [];
  const unplaced = wine.count - placed.length;

  async function onDelete() {
    const ok = await dialog({
      title: 'Wein löschen?',
      message: `„${wine.name}“${archived ? '' : ` mit ${wine.count} ${wine.count === 1 ? 'Flasche' : 'Flaschen'}`} wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
      buttons: [{ label: 'Endgültig löschen', value: true, danger: true }, { label: 'Abbrechen', value: false, primary: true }],
    });
    if (!ok) return;
    await deleteWine(wine.id);
    toast('Wein gelöscht');
    location.hash = archived ? '#/archiv' : '#/weine';
  }

  return h('div', { class: 'view' },
    h('header', { class: 'view-header' },
      h('button', { class: 'back', onclick: () => history.back() }, '‹ Zurück'),
      h('h1', {}, wine.name)),
    photoImg(wine.photo, wine.name, 'detail-photo'),
    h('div', { class: 'detail-badges' }, typeBadge(wine.type),
      archived ? h('span', { class: 'status archived' }, 'Getrunken') : statusBadge(wine)),

    !archived && h('button', { class: 'btn primary big block', onclick: () => drinkWine(wine, config) }, '🍷 Wein trinken'),

    !archived && h('div', { class: 'card' },
      h('div', { class: 'row' }, h('strong', {}, 'Flaschen'), h('strong', {}, String(wine.count))),
      h('div', { class: 'row top' }, h('span', {}, 'Lagerplatz'),
        h('span', { class: 'muted right' },
          placed.length ? placed.map((p) => h('div', {}, placeLabel(config, p))) : 'kein Platz zugewiesen',
          placed.length && unplaced > 0 ? h('div', {}, `${unplaced} ohne Platz`) : null))),

    h('div', { class: 'card' }, rows.map(([k, v]) =>
      h('div', { class: 'row top' }, h('span', { class: 'muted' }, k), h('span', { class: 'right' }, String(v))))),

    wine.notes && h('div', { class: 'card' }, h('strong', {}, 'Verkostungsnotiz'), h('p', { class: 'notes' }, wine.notes)),

    h('div', { class: 'detail-actions' },
      !archived && h('a', { class: 'btn big grow', href: `#/wein/${wine.id}/bearbeiten` }, 'Bearbeiten'),
      h('button', { class: 'btn big danger' + (archived ? ' grow' : ''), onclick: onDelete }, 'Löschen')));
}
