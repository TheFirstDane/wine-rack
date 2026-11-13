// Gemeinsame Konstanten der App.

export const APP_VERSION = '0.4.0';

// Der Schrank (Klarstein Vinamour 77 Duo) fasst 77 Flaschen.
export const DEFAULT_TOTAL_SLOTS = 77;
export const DEFAULT_SHELF_COUNT = 9;

// Weintypen. "key" wird gespeichert, "cssVar" verweist auf die Farbe in css/style.css.
export const WINE_TYPES = [
  { key: 'red',       label: 'Rotwein',    cssVar: '--type-red' },
  { key: 'white',     label: 'Weißwein',   cssVar: '--type-white' },
  { key: 'rose',      label: 'Rosé',       cssVar: '--type-rose' },
  { key: 'champagne', label: 'Champagner', cssVar: '--type-champagne' },
  { key: 'sparkling', label: 'Schaumwein', cssVar: '--type-sparkling' },
  { key: 'other',     label: 'Sonstige',   cssVar: '--type-other' },
];

// Temperaturzonen des Schranks.
export const ZONES = [
  { key: 'upper', label: 'Obere Zone' },
  { key: 'lower', label: 'Untere Zone' },
];
