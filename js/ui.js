// Kleine UI-Helfer ohne Framework.

// Führt fn im nächsten Frame aus (damit CSS-Übergänge starten). Rückfall per Timer, falls der Browser
// keine Frames zeichnet (z. B. Seite im Hintergrund): sonst bliebe ein Dialog unsichtbar.
export function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 60);
}

// h('div', { class: 'x', onclick: fn }, 'Text', childElement) → DOM-Element
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // CSS-Variablen (--name) gehen nur über setProperty
      for (const [prop, val] of Object.entries(v)) {
        prop.startsWith('--') ? el.style.setProperty(prop, val) : (el.style[prop] = val);
      }
    }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

// Kurze Meldung unten über der Tab-Leiste.
export function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  nextFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// Einfacher Dialog. buttons: [{ label, value, primary?, danger? }]
// Liefert das value des gedrückten Knopfes (null beim Schließen über den Hintergrund).
export function dialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const close = (value) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && close(null) },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('h2', {}, title),
        message && h('p', {}, message),
        h('div', { class: 'dialog-buttons' },
          buttons.map((b) => h('button', {
            class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''),
            onclick: () => close(b.value),
          }, b.label)))));
    document.body.append(overlay);
    nextFrame(() => overlay.classList.add('show'));
  });
}

export const alertDialog = (title, message) =>
  dialog({ title, message, buttons: [{ label: 'OK', value: true, primary: true }] });

// Zahlenfeld mit - / + Knöpfen (44 px Tippfläche). onChange bekommt den neuen Wert.
// Liefert das Element; el.value ist der aktuelle Wert.
export function stepper(value, min, max, onChange = () => {}) {
  const out = h('output', { class: 'stepper-value' }, String(value));
  const el = h('div', { class: 'stepper' },
    h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Weniger', onclick: () => set(value - 1) }, '−'),
    out,
    h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Mehr', onclick: () => set(value + 1) }, '+'));
  function set(v) {
    value = Math.min(max, Math.max(min, v));
    out.textContent = String(value);
    el.value = value;
    onChange(value);
  }
  el.value = value;
  return el;
}

// ---- Object-URLs für Bilder (Blobs) ---------------------------------------------------
// blobUrl(blob) liefert pro Blob dieselbe URL, solange der Bereich lebt, in dem sie entstand.
// Bereiche ("scopes"): Handy 'view'; Tablet 'master' (links) und 'detail' (rechts), damit eine
// Seite neu gebaut werden kann, ohne dass die Bilder der anderen kaputtgehen.
// Ablauf beim Aufbau eines Bereichs:  const free = rotateUrls(scope);  useUrlScope(scope);  …bauen…;
// nach dem Austausch im DOM: free() gibt die URLs der alten Ansicht frei.
const pools = { view: new Map(), master: new Map(), detail: new Map() };
let activeScope = 'view';

export function useUrlScope(scope) { activeScope = scope; }

export function blobUrl(blob) {
  if (!blob) return '';
  const pool = pools[activeScope];
  let url = pool.get(blob);
  if (!url) { url = URL.createObjectURL(blob); pool.set(blob, url); }
  return url;
}

export function rotateUrls(scope = 'view') {
  const old = pools[scope];
  pools[scope] = new Map();
  return () => { for (const url of old.values()) URL.revokeObjectURL(url); };
}
