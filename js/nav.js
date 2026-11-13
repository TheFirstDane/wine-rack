// Gemeinsamer Navigationszustand (Tablet: welcher Bereich links im Master-Detail steht).

import { isTablet } from './device.js';

export const nav = { lastMaster: 'regal' }; // 'regal' | 'weine' | 'archiv'

// Wohin nach Löschen o. Ä.? Handy: die Liste (fallback). Tablet: im aktuellen Bereich bleiben.
export const homeHash = (fallback) => (isTablet() ? `#/${nav.lastMaster}` : fallback);
