// Auswahl "Gerät und Darstellung": große Karten (Radio-Auswahl), Tippfläche mindestens 44 pt.
// Gilt sofort ohne Neustart. Wird in den Einstellungen und im Einrichtungsassistenten benutzt.

import { h, toast } from '../ui.js';
import {
  DEVICE_CHOICES, PROFILE_LABELS, TABLET_TOO_SMALL_HINT, readChoice, setDeviceChoice, getDevice,
} from '../device.js';

export function createDeviceChooser() {
  const status = h('p', { class: 'device-status muted small', 'aria-live': 'polite' });
  const cards = DEVICE_CHOICES.map((c) => h('button', {
    type: 'button', class: 'choice-card', role: 'radio', 'data-choice': c.key,
    onclick: () => choose(c.key),
  },
    h('span', { class: 'radio', 'aria-hidden': 'true' }),
    h('span', { class: 'choice-text' },
      h('strong', {}, c.title),
      h('span', { class: 'muted small' }, c.desc),
      c.size && h('span', { class: 'muted small' }, c.size))));

  // Zeigt Auswahl und das tatsächlich genutzte Layout
  function sync() {
    const choice = readChoice();
    const d = getDevice();
    cards.forEach((el) => {
      const on = el.dataset.choice === choice;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-checked', String(on));
    });
    const size = `${Math.round(d.width)} × ${Math.round(d.height)} pt`;
    status.textContent = d.fellBack
      ? `${TABLET_TOO_SMALL_HINT} (Fenster ${size})`
      : `Aktuelles Layout: ${PROFILE_LABELS[d.profile]} (Fenster ${size})`;
    status.classList.toggle('warn', d.fellBack);
  }

  function choose(key) {
    const result = setDeviceChoice(key);
    if (result.fellBack) toast(TABLET_TOO_SMALL_HINT);
    sync();
  }

  // Bei Drehen oder Größenänderung die Anzeige aktuell halten; Listener entfernen, wenn die Ansicht weg ist
  function onChange() {
    if (!el.isConnected) {
      window.removeEventListener('wr:device', onChange);
      window.removeEventListener('resize', onChange);
      return;
    }
    setTimeout(sync, 120);
  }
  window.addEventListener('wr:device', onChange);
  window.addEventListener('resize', onChange);

  const el = h('div', { class: 'device-chooser' },
    h('div', { class: 'choice-list', role: 'radiogroup', 'aria-label': 'Gerät und Darstellung' }, cards), status);
  sync();
  return el;
}
