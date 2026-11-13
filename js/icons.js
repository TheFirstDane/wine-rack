// UI-Grafiken als SVG: scharf auf jedem Display, Farbe über currentColor (CSS).
// Die Zeichenfolgen sind feste Texte aus diesem Projekt, keine Nutzereingaben.

const PATHS = {
  // Weinglas
  glass: '<path d="M7 3h10l-.4 6.2A4.6 4.6 0 0 1 12 13.500 4.600 4.600 0 0 1 7.400 9.200z"/><path d="M12 13.500V20M8 21h8"/><path d="M7.200 8h9.600"/>',
  // Kamera
  camera: '<path d="M4 8h3l1.500-2.500h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.500"/>',
  // Flasche
  bottle: '<path d="M10 2h4v4.500c0 1 .8 1.600 1.600 2.300.9.900 1.400 1.900 1.400 3.200v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8c0-1.200.5-2.300 1.400-3.200C9.200 8.100 10 7.500 10 6.500z"/><path d="M7 14h10"/>',
  // Archiv
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12.500h4"/>',
  // Hinweis (leere Detailansicht)
  pointer: '<path d="M9 4v10.500l-2-2-1.500 1.500L10 18.500h6.500a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H13V6a2 2 0 0 0-4 0"/>',
};

// icon('glass') → <svg class="icon">; size über CSS (.icon { width: 1.25em })
export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.innerHTML = PATHS[name] || '';
  return svg;
}
