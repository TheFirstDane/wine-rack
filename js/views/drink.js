// Ablauf "Wein trinken": ggf. Flasche wählen, bestätigen, speichern.
// Bei der letzten Flasche wird nach Bewertung und Notiz gefragt und der Wein archiviert.

import { h, toast, dialog } from '../ui.js';
import { saveWine } from '../db.js';
import { drinkChoices, drinkBottle, placeLabel } from '../logic.js';

// Fragt optional nach Bewertung (1–5 Sterne) und Verkostungsnotiz.
// Liefert { rating, notes } oder null bei "Abbrechen".
function askTasting(wine) {
  return new Promise((resolve) => {
    let rating = null;
    const stars = [1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button', class: 'star', 'aria-label': `${n} ${n === 1 ? 'Stern' : 'Sterne'}`,
      onclick: () => { rating = rating === n ? null : n; paint(); },
    }, '★'));
    const paint = () => stars.forEach((s, i) => s.classList.toggle('on', rating != null && i < rating));
    const notes = h('textarea', { class: 'input', rows: '3', maxlength: '2000', placeholder: 'Verkostungsnotiz (optional)' });

    const close = (value) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && close(null) },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('h2', {}, 'Das war die letzte Flasche'),
        h('p', {}, `„${wine.name}“ wandert ins Archiv. Wie war er?`),
        h('div', { class: 'stars' }, stars),
        notes,
        h('div', { class: 'dialog-buttons' },
          h('button', { class: 'btn primary', onclick: () => close({ rating, notes: notes.value }) }, 'Ins Archiv verschieben'),
          h('button', { class: 'btn', onclick: () => close(null) }, 'Abbrechen'))));
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
}

// wine: der Wein; place: schon bekannte Flasche (z. B. im Regal angetippt) oder null.
// Liefert true, wenn getrunken wurde.
export async function drinkWine(wine, config, { place = null } = {}) {
  const { placed, unplaced, needsChoice, isLast } = drinkChoices(wine);
  let chosen = place;

  if (!chosen && needsChoice) {
    const buttons = placed.map((p, i) => ({ label: placeLabel(config, p), value: i }));
    if (unplaced > 0) buttons.push({ label: unplaced === 1 ? 'Die Flasche ohne Platz' : 'Eine Flasche ohne Platz', value: 'none' });
    buttons.push({ label: 'Abbrechen', value: null });
    const v = await dialog({ title: 'Welche Flasche nimmst du?', message: wine.name, buttons });
    if (v == null) return false;
    chosen = v === 'none' ? null : placed[v];
  } else if (!isLast) {
    const ok = await dialog({
      title: 'Eine Flasche trinken?',
      message: `„${wine.name}“: danach bleiben ${wine.count - 1} ${wine.count - 1 === 1 ? 'Flasche' : 'Flaschen'}.`,
      buttons: [{ label: 'Prost!', value: true, primary: true }, { label: 'Abbrechen', value: false }],
    });
    if (!ok) return false;
  }

  let tasting = {};
  if (isLast) {
    tasting = await askTasting(wine);
    if (!tasting) return false;
  }

  try {
    const { wine: updated, archived } = drinkBottle(wine, chosen, tasting);
    await saveWine(updated);
    toast(archived ? 'Im Archiv gelandet' : `Prost! Noch ${updated.count} ${updated.count === 1 ? 'Flasche' : 'Flaschen'}`);
    if (archived) location.hash = '#/archiv';
    else window.dispatchEvent(new Event('wr:refresh'));
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}
