// Kleine UI-Helfer ohne Framework.

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
  requestAnimationFrame(() => el.classList.add('show'));
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
    requestAnimationFrame(() => overlay.classList.add('show'));
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
// blobUrl(blob) liefert pro Blob immer dieselbe URL, solange die aktuelle Ansicht lebt.
// rotateUrls() wird beim Ansichtswechsel aufgerufen: neue Ansicht beginnt mit leerem Pool, die
// zurückgegebene Funktion gibt die URLs der alten Ansicht frei (erst aufrufen, wenn sie ersetzt ist).
let urlPool = new Map();

export function blobUrl(blob) {
  if (!blob) return '';
  let url = urlPool.get(blob);
  if (!url) { url = URL.createObjectURL(blob); urlPool.set(blob, url); }
  return url;
}

export function rotateUrls() {
  const old = urlPool;
  urlPool = new Map();
  return () => { for (const url of old.values()) URL.revokeObjectURL(url); };
}
