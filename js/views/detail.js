// Wein-Detail: großes Foto, alle Angaben, Trinkfenster, Trinken, Bearbeiten und Löschen.

import { h, toast, dialog, blobUrl } from '../ui.js';
import { getWine, saveWine, deleteWine } from '../db.js';
import { resizeImage, renderCrop } from '../image.js';
import { openCropper } from './cropper.js';
import { DEFAULT_CROP_PARAMS } from '../constants.js';
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

  // "Zuschnitt ändern": gleicher Zuschnitt-Schritt mit dem vorhandenen Foto.
  // "Neu aufnehmen" im Zuschnitt öffnet die Kamera und ersetzt danach Foto und Zuschnitt.
  const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  async function changeCrop(photo = wine.photo, params = wine.cropParams || DEFAULT_CROP_PARAMS) {
    try {
      const res = await openCropper({ blob: photo, params });
      if (!res) return;
      if (res.retake) { cameraInput.click(); return; }
      const { blob, params: finalParams } = await renderCrop(photo, res.params);
      const current = (await getWine(wine.id)) || wine;
      await saveWine({ ...current, photo, crop: blob, cropParams: finalParams });
      toast('Zuschnitt gespeichert');
      window.dispatchEvent(new Event('wr:refresh'));
    } catch (err) {
      toast(err.message);
    }
  }
  cameraInput.addEventListener('change', async () => {
    const file = cameraInput.files[0];
    cameraInput.value = '';
    if (!file) return;
    try { await changeCrop(await resizeImage(file), { ...DEFAULT_CROP_PARAMS }); } catch (err) { toast(err.message); }
  });

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
    !archived && wine.photo && h('div', { class: 'crop-row' },
      h('img', { class: 'round-preview small', src: blobUrl(wine.crop || wine.photo), alt: 'Bild im Regal' }),
      h('div', { class: 'crop-row-text' },
        h('strong', {}, 'Bild im Regal'),
        h('span', { class: 'muted small' }, 'So erscheint der Wein im Regal.')),
      h('button', { class: 'btn', onclick: () => changeCrop() }, 'Zuschnitt ändern'),
      cameraInput),
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
