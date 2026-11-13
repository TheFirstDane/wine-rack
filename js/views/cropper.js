// Zuschnitt-Ansicht: Das Foto liegt hinter einer runden Maske und lässt sich verschieben
// (ein Finger) und vergrößern (zwei Finger, Zoom-Regler oder Mausrad), bis das Etikett im Kreis liegt.
// Gesten laufen über Pointer Events, ohne Bibliothek.
//
// openCropper({ blob, params }) liefert:
//   { params }       – "Übernehmen" (params = { cx, cy, zoom }, siehe normalizeCrop in logic.js)
//   { retake: true } – "Neu aufnehmen"
//   null             – abgebrochen (✕)

import { h } from '../ui.js';
import { normalizeCrop, MAX_CROP_ZOOM } from '../logic.js';
import { DEFAULT_CROP_PARAMS } from '../constants.js';

export function openCropper({ blob, params = DEFAULT_CROP_PARAMS }) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = h('img', { class: 'crop-img', src: url, alt: '', draggable: 'false' });
    const mask = h('div', { class: 'crop-mask' });
    const stage = h('div', { class: 'crop-stage' }, img, mask);
    const slider = h('input', {
      class: 'crop-zoom', type: 'range', min: '1', max: String(MAX_CROP_ZOOM), step: '0.01', value: '1',
      'aria-label': 'Zoom',
    });

    let w = 0;   // Bildgröße in Bildpunkten (nach dem Laden)
    let hgt = 0;
    const view = { ...DEFAULT_CROP_PARAMS, ...params }; // cx, cy (Anteile 0–1), zoom

    // Positioniert das Bild so, dass der gewählte Ausschnitt die Bühne (Quadrat) füllt.
    function apply() {
      if (!w) return;
      const S = stage.clientWidth;
      const n = normalizeCrop(w, hgt, view);
      Object.assign(view, { cx: n.cx, cy: n.cy, zoom: n.zoom });
      const k = S / n.side; // Bildschirmpixel pro Bildpunkt
      img.style.width = `${w * k}px`;
      img.style.height = `${hgt * k}px`;
      img.style.transform = `translate(${S / 2 - n.cx * w * k}px, ${S / 2 - n.cy * hgt * k}px)`;
      slider.value = String(n.zoom);
    }
    const pxPerPoint = () => stage.clientWidth / normalizeCrop(w, hgt, view).side;

    // ---- Gesten ----
    const pointers = new Map(); // pointerId → { x, y }
    let pinch = null;           // { dist, zoom } beim Zwei-Finger-Zoom

    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    stage.addEventListener('pointerdown', (e) => {
      try { stage.setPointerCapture(e.pointerId); } catch { /* z. B. künstliche Ereignisse: dann ohne Capture */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinch = { dist: distance(), zoom: view.zoom };
    });

    stage.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev || !w) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (pointers.size === 1) {
        const k = pxPerPoint();
        view.cx -= dx / (k * w);
        view.cy -= dy / (k * hgt);
      } else if (pointers.size === 2 && pinch && pinch.dist > 0) {
        view.zoom = pinch.zoom * (distance() / pinch.dist);
        // Der Mittelpunkt der zwei Finger zieht das Bild mit (jeder Finger trägt die Hälfte bei)
        const k = pxPerPoint();
        view.cx -= dx / 2 / (k * w);
        view.cy -= dy / 2 / (k * hgt);
      }
      apply();
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      pinch = pointers.size === 2 ? { dist: distance(), zoom: view.zoom } : null;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    // Mausrad (Computer)
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      view.zoom *= Math.exp(-e.deltaY * 0.002);
      apply();
    }, { passive: false });

    slider.addEventListener('input', () => { view.zoom = Number(slider.value); apply(); });
    window.addEventListener('resize', apply);

    // ---- Aufbau ----
    const close = (result) => {
      window.removeEventListener('resize', apply);
      overlay.classList.remove('show');
      setTimeout(() => { overlay.remove(); URL.revokeObjectURL(url); }, 220);
      resolve(result);
    };

    const overlay = h('div', { class: 'cropper', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Zuschnitt' },
      h('div', { class: 'cropper-head' },
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Abbrechen', onclick: () => close(null) }, '✕'),
        h('h2', {}, 'Etikett in den Kreis legen')),
      h('p', { class: 'muted cropper-hint' }, 'Mit einem Finger verschieben, mit zwei Fingern oder dem Regler vergrößern.'),
      stage,
      h('label', { class: 'crop-zoom-row' }, h('span', { class: 'muted small' }, 'Zoom'), slider),
      h('div', { class: 'cropper-actions' },
        h('button', { class: 'btn big', type: 'button', onclick: () => close({ retake: true }) }, 'Neu aufnehmen'),
        h('button', { class: 'btn primary big grow', type: 'button', onclick: () => close({ params: { cx: view.cx, cy: view.cy, zoom: view.zoom } }) }, 'Übernehmen')));

    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    img.decode().catch(() => {}).then(() => {
      w = img.naturalWidth;
      hgt = img.naturalHeight;
      apply();
    });
  });
}
