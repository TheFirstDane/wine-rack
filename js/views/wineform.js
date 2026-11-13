// Formular "Wein einlagern" (neu) und "Wein bearbeiten" (vorhandenen Wein ändern).

import { h, toast, dialog, stepper } from '../ui.js';
import { getAllWines, saveWine } from '../db.js';
import { resizeImage } from '../image.js';
import { WINE_TYPES } from '../constants.js';
import {
  BOTTLE_SIZES, DEFAULT_BOTTLE_SIZE, validateWineInput, findMatches, mergeInto,
  validatePlaces, firstFreeSlots, todayISO,
} from '../logic.js';
import { createSlotPicker } from './slotpicker.js';

// existing: Wein, den wir bearbeiten (oder undefined für neu)
// prefillPlace: { shelfId, slot } wenn man aus der Regalansicht auf einen leeren Platz getippt hat
export async function createWineForm({ config, existing, prefillPlace }) {
  const editing = !!existing;
  const wines = await getAllWines();

  // Aktueller Zustand des Formulars
  const state = {
    photo: existing?.photo || null,
    type: existing?.type || null,
    origin: existing?.origin || 'bought',
    count: existing?.count || 1,
  };
  const inputs = {};      // Feldname → Eingabeelement
  const errorEls = {};    // Feldname → Element für die Fehlermeldung

  // ---- kleine Bausteine ----
  const showError = (key, msg) => { if (errorEls[key]) errorEls[key].textContent = msg || ''; };

  function field(key, label, input, { hint } = {}) {
    inputs[key] = input;
    errorEls[key] = h('div', { class: 'field-error', role: 'alert' });
    return h('label', { class: 'field' },
      h('span', { class: 'field-label' }, label),
      input,
      hint && h('span', { class: 'muted small' }, hint),
      errorEls[key]);
  }
  const text = (key, label, opts = {}) => field(key, label, h('input', {
    class: 'input', type: opts.type || 'text', value: existing?.[key] ?? opts.value ?? '',
    inputmode: opts.inputmode, placeholder: opts.placeholder, autocomplete: 'off', maxlength: opts.maxlength || '120',
  }), opts);
  const area = (key, label) => field(key, label, h('textarea', { class: 'input', rows: '3', maxlength: '2000' }, existing?.[key] ?? ''));

  // ---- Foto ----
  const preview = h('img', { class: 'photo-preview', alt: 'Foto des Weins', hidden: true });
  const photoStatus = h('span', { class: 'muted small' }, 'Pflichtfeld');
  const fileInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoBtn = h('button', { type: 'button', class: 'photo-btn', onclick: () => fileInput.click() },
    preview,
    h('span', { class: 'photo-cta' }, h('span', { class: 'photo-icon' }, '📷'), h('span', {}, 'Foto aufnehmen')),
    photoStatus);
  errorEls.photo = h('div', { class: 'field-error', role: 'alert' });

  function setPhoto(blob) {
    state.photo = blob;
    preview.src = URL.createObjectURL(blob);
    preview.hidden = false;
    photoBtn.classList.add('has-photo');
    photoStatus.textContent = 'Tippen zum Ersetzen';
    showError('photo', '');
  }
  if (state.photo) setPhoto(state.photo);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    photoStatus.textContent = 'Foto wird verkleinert …';
    try {
      setPhoto(await resizeImage(file));
    } catch (err) {
      photoStatus.textContent = 'Pflichtfeld';
      showError('photo', err.message);
    }
    fileInput.value = '';
  });

  // ---- Weintyp ----
  const typeButtons = WINE_TYPES.map((t) => h('button', {
    type: 'button', class: 'chip', 'data-type': t.key,
    style: { '--chip-color': `var(${t.cssVar})` },
    onclick: () => selectType(t.key),
  }, h('span', { class: 'dot' }), t.label));
  function selectType(key) {
    state.type = key;
    typeButtons.forEach((b) => b.classList.toggle('active', b.dataset.type === key));
    showError('type', '');
  }
  errorEls.type = h('div', { class: 'field-error', role: 'alert' });

  // ---- Anzahl & Lagerplatz ----
  const countStepper = stepper(state.count, 1, 999, (n) => { state.count = n; picker.refresh(); showError('places', ''); });
  const initialPlaces = existing?.places || (prefillPlace ? [prefillPlace] : []);
  const picker = createSlotPicker({
    config, wines, excludeId: existing?.id ?? null, initial: initialPlaces,
    getMax: () => state.count, onChange: () => showError('places', ''),
  });
  errorEls.places = h('div', { class: 'field-error', role: 'alert' });

  // ---- Herkunft ----
  const boughtRow = text('boughtAt', 'Gekauft bei', { placeholder: 'Händler oder Ort' });
  const giftRow = text('giftFrom', 'Geschenk von', { placeholder: 'Person' });
  const originBtns = [['bought', 'Gekauft'], ['gift', 'Geschenk']].map(([key, label]) => h('button', {
    type: 'button', class: 'seg', 'data-origin': key, onclick: () => setOrigin(key),
  }, label));
  function setOrigin(key) {
    state.origin = key;
    originBtns.forEach((b) => b.classList.toggle('active', b.dataset.origin === key));
    boughtRow.hidden = key !== 'bought';
    giftRow.hidden = key !== 'gift';
  }

  const sizeSelect = h('select', { class: 'input' },
    BOTTLE_SIZES.map((s) => h('option', { value: s, selected: s === (existing?.bottleSize || DEFAULT_BOTTLE_SIZE) }, s)));

  // ---- Absenden ----
  const submitBtn = h('button', { type: 'submit', class: 'btn primary big grow' }, editing ? 'Änderungen speichern' : 'Einlagern');

  async function onSubmit(e) {
    e.preventDefault();
    Object.keys(errorEls).forEach((k) => showError(k, ''));
    const raw = { photo: state.photo, type: state.type, origin: state.origin, count: state.count, places: picker.getPlaces() };
    for (const [k, el] of Object.entries(inputs)) raw[k] = el.value;

    const { errors, wine } = validateWineInput(raw);
    const placeError = !errors.places && !errors.count
      ? validatePlaces(config, wines, wine.places, wine.count, existing?.id ?? null) : null;
    if (placeError) errors.places = placeError;

    if (Object.keys(errors).length) {
      for (const [k, msg] of Object.entries(errors)) showError(k, msg);
      const first = Object.keys(errors).map((k) => errorEls[k]).find((el) => el && el.textContent);
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Bitte die markierten Felder prüfen.');
      return;
    }

    submitBtn.disabled = true;
    try {
      const id = await store(wine);
      if (id != null) location.hash = `#/wein/${id}`;
    } catch (err) {
      toast('Speichern fehlgeschlagen: ' + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  // Entscheidet, ob ein neuer Wein angelegt oder zusammengeführt wird. Liefert die id oder null (abgebrochen).
  async function store(wine) {
    if (editing) {
      const updated = { ...existing, ...wine, id: existing.id, status: existing.status, drunkAt: existing.drunkAt, storedAt: wine.storedAt };
      await saveWine(updated);
      toast('Gespeichert');
      return existing.id;
    }

    const { exact, related } = findMatches(wines, wine);
    if (exact) {
      const choice = await dialog({
        title: 'Diesen Wein gibt es schon',
        message: `„${exact.name}“${exact.winery ? ` von ${exact.winery}` : ''}${exact.vintage ? ` (${exact.vintage})` : ''} liegt bereits mit ${exact.count} ${exact.count === 1 ? 'Flasche' : 'Flaschen'} im Bestand. Sollen die ${wine.count} neuen Flaschen dazukommen?`,
        buttons: [
          { label: 'Ja, Flaschen hinzufügen', value: 'merge', primary: true },
          { label: 'Als neuen Eintrag anlegen', value: 'new' },
          { label: 'Zurück zum Formular', value: null },
        ],
      });
      if (choice === 'merge') {
        await saveWine(mergeInto(exact, wine));
        toast(`${wine.count} ${wine.count === 1 ? 'Flasche' : 'Flaschen'} hinzugefügt`);
        return exact.id;
      }
      if (choice !== 'new') return null;
    } else if (related.length) {
      const diffs = related.map((r) => {
        const parts = [];
        if ((r.vintage ?? null) !== (wine.vintage ?? null)) parts.push(`Jahrgang ${r.vintage ?? 'ohne Angabe'}`);
        if (r.bottleSize !== wine.bottleSize) parts.push(`Flaschengröße ${r.bottleSize}`);
        return parts.join(', ');
      });
      const choice = await dialog({
        title: 'Anderer Jahrgang oder andere Größe',
        message: `Es gibt schon „${wine.name}“ mit ${diffs.join(' und ')}. Dieser Wein wird als eigener Eintrag angelegt.`,
        buttons: [
          { label: 'Neuen Wein anlegen', value: 'new', primary: true },
          { label: 'Zurück zum Formular', value: null },
        ],
      });
      if (choice !== 'new') return null;
    }

    const id = await saveWine(wine);
    toast('Eingelagert');
    return id;
  }

  // ---- Aufbau ----
  const form = h('form', { class: 'form', novalidate: true, onsubmit: onSubmit },
    h('div', { class: 'field' }, photoBtn, fileInput, errorEls.photo),
    text('name', 'Weinname *', { placeholder: 'z. B. Barolo Cannubi' }),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Weintyp *'),
      h('div', { class: 'chips' }, typeButtons), errorEls.type),
    text('winery', 'Weingut'),
    h('div', { class: 'two-col' },
      text('vintage', 'Jahrgang', { inputmode: 'numeric', placeholder: 'z. B. 2018', maxlength: '4' }),
      field('bottleSize', 'Flaschengröße', sizeSelect)),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Anzahl der Flaschen'),
      countStepper, errorEls.count = h('div', { class: 'field-error', role: 'alert' })),

    h('details', { class: 'card fold', open: true },
      h('summary', {}, 'Lagerplatz ', h('span', { class: 'muted small' }, '(optional)')),
      h('div', { class: 'picker-actions' },
        h('button', { type: 'button', class: 'btn small', onclick: () => picker.setPlaces(firstFreeSlots(config, wines, state.count, { excludeId: existing?.id ?? null, keep: picker.getPlaces() })) }, 'Nächste freie Plätze'),
        h('button', { type: 'button', class: 'btn small', onclick: () => picker.setPlaces([]) }, 'Leeren')),
      picker.el, errorEls.places),

    h('details', { class: 'card fold' },
      h('summary', {}, 'Weitere Angaben'),
      text('country', 'Land'),
      text('region', 'Region'),
      h('div', { class: 'two-col' },
        text('drinkFrom', 'Trinkfenster von', { inputmode: 'numeric', placeholder: 'Jahr', maxlength: '4' }),
        text('drinkTo', 'Trinkfenster bis', { inputmode: 'numeric', placeholder: 'Jahr', maxlength: '4' })),
      text('price', 'Kaufpreis pro Flasche (€)', { inputmode: 'decimal' }),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Herkunft'), h('div', { class: 'segmented' }, originBtns)),
      boughtRow, giftRow,
      text('acquiredDate', 'Kauf- oder Erhaltsdatum', { type: 'date' }),
      text('storedAt', 'Eingelagert am', { type: 'date', value: todayISO() })),

    h('details', { class: 'card fold' },
      h('summary', {}, 'Optionale Angaben'),
      text('grapes', 'Rebsorten'),
      h('div', { class: 'two-col' },
        text('abv', 'Alkohol (% vol.)', { inputmode: 'decimal' }),
        text('rating', 'Bewertung (0–5)', { inputmode: 'decimal' })),
      text('marketValue', 'Marktwert pro Flasche (€)', { inputmode: 'decimal' }),
      area('notes', 'Verkostungsnotiz'),
      area('pairing', 'Speiseempfehlung')),

    h('div', { class: 'form-footer' }, submitBtn));

  // Anfangszustand setzen
  selectType(state.type);
  setOrigin(state.origin);
  // Optionale Bereiche öffnen, wenn beim Bearbeiten schon etwas drinsteht
  if (editing) {
    const hasMore = ['country', 'region', 'price', 'drinkFrom', 'drinkTo', 'acquiredDate', 'boughtAt', 'giftFrom'].some((k) => existing[k]);
    form.querySelectorAll('details.fold')[1].open = hasMore;
  }

  return h('div', { class: 'view' },
    h('header', { class: 'view-header' },
      editing && h('button', { class: 'back', onclick: () => history.back() }, '‹ Zurück'),
      h('h1', {}, editing ? 'Wein bearbeiten' : 'Wein einlagern'),
      prefillPlace && !editing && h('p', { class: 'muted' }, 'Für den gewählten Platz')),
    form);
}
