// Geräteprofile: Handy kompakt, Handy groß, Tablet.
//
// Das Profil steuert über das Attribut data-device am <html>-Element, wie die App aussieht
// (Schriftgröße, Abstände, Navigation, Regal, Tablet-Aufteilung). Die Logik ist rein und in Node testbar;
// alles mit Browser-Zugriff steckt in Funktionen weiter unten.
//
// Erkennung nur über die Fenstergröße, nie über den User-Agent (iPadOS meldet sich wie ein Mac):
// kürzere Fensterseite bis 410 pt = kompakt, 411 bis 599 pt = groß, ab 600 pt = Tablet.
// Dadurch bleibt ein iPhone im Querformat (kurze Seite 390 bis 440 pt) ein Handy.
//
// Die Wahl des Nutzers liegt nur lokal auf dem Gerät (localStorage). Sie gehört nicht ins Backup
// und wird beim Import nicht überschrieben, weil Backups zwischen Geräten ausgetauscht werden.

export const COMPACT_MAX = 410;   // kürzere Seite bis hier: Handy kompakt
export const TABLET_MIN = 600;    // ab hier: Tablet

// Angezeigte Auswahl. Die Maße sind Richtwerte (Punkte im Hochformat), keine festen Pixel im Layout.
export const DEVICE_CHOICES = [
  { key: 'auto', title: 'Automatisch (empfohlen)', desc: 'Erkennt das Gerät an der Fenstergröße.', size: '' },
  { key: 'compact', title: 'Handy kompakt', desc: 'iPhone 13 und ähnliche Geräte', size: '390 × 844 pt' },
  { key: 'large', title: 'Handy groß', desc: 'iPhone 18 Pro Max und ähnliche Geräte', size: '440 × 956 pt' },
  { key: 'tablet', title: 'Tablet', desc: 'iPad Pro 13 Zoll', size: '1032 × 1376 pt hochkant, 1376 × 1032 pt quer' },
];

export const PROFILE_LABELS = { compact: 'Handy kompakt', large: 'Handy groß', tablet: 'Tablet' };

export const TABLET_TOO_SMALL_HINT = 'Dieses Gerät ist zu klein für das Tablet-Layout. Es wird das Handy-Layout verwendet.';

const isChoice = (v) => DEVICE_CHOICES.some((c) => c.key === v);

// Profil für eine Fenstergröße: 'compact' | 'large' | 'tablet'
export function detectProfile(width, height) {
  const short = Math.min(width, height);
  if (short <= COMPACT_MAX) return 'compact';
  if (short < TABLET_MIN) return 'large';
  return 'tablet';
}

// Wahl + echte Fenstergröße → tatsächlich genutztes Profil.
//   auto                → erkanntes Profil
//   Handy-Profil        → bleibt, auch auf großen Fenstern (dort zentrierte Spalte, siehe CSS)
//   Tablet auf kleinem Fenster → fällt auf das erkannte Handy-Profil zurück (fellBack = true)
// Liefert { choice, profile, detected, fellBack }.
export function resolveProfile(choice, width, height) {
  const detected = detectProfile(width, height);
  const picked = isChoice(choice) ? choice : 'auto';
  if (picked === 'auto') return { choice: picked, profile: detected, detected, fellBack: false };
  if (picked === 'tablet' && detected !== 'tablet') return { choice: picked, profile: detected, detected, fellBack: true };
  return { choice: picked, profile: picked, detected, fellBack: false };
}

// ---- Speichern (nur lokal, nicht im Backup) --------------------------------------------

const STORAGE_KEY = 'wine-rack.device';
let memoryChoice = null; // Rückfall, falls localStorage nicht geht (z. B. privater Modus)

export function readChoice() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isChoice(v)) return v;
  } catch { /* localStorage nicht verfügbar */ }
  return isChoice(memoryChoice) ? memoryChoice : 'auto';
}

function writeChoice(choice) {
  memoryChoice = choice;
  try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* bleibt im Speicher */ }
}

// ---- Anwenden im Browser ----------------------------------------------------------------

let state = { choice: 'auto', profile: 'compact', detected: 'compact', fellBack: false, width: 0, height: 0, orientation: 'portrait' };

export const getDevice = () => state;
export const isTablet = () => state.profile === 'tablet';

// Setzt data-device usw. aus Wahl und aktueller Fenstergröße. Meldet "wr:device",
// wenn sich das Profil ändert (dann baut die App die Ansicht neu auf, z. B. Tablet-Aufteilung).
export function applyDevice() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const next = { ...resolveProfile(readChoice(), width, height), width, height, orientation: width >= height ? 'landscape' : 'portrait' };
  const root = document.documentElement;
  root.dataset.device = next.profile;
  root.dataset.deviceChoice = next.choice;
  root.dataset.orientation = next.orientation;
  const changed = next.profile !== state.profile;
  state = next;
  if (changed) window.dispatchEvent(new CustomEvent('wr:device', { detail: next }));
  window.dispatchEvent(new CustomEvent('wr:layout', { detail: next })); // Größe oder Ausrichtung kann sich geändert haben
  return next;
}

// Beim Start einmal aufrufen; hält das Profil bei Drehen und Größenänderung aktuell.
export function initDevice() {
  state = { ...state, profile: '' }; // erstes applyDevice() zählt nicht als Änderung der Ansicht
  const first = applyDevice();
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(applyDevice, 60); };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  return first;
}

// Wahl speichern und sofort anwenden (ohne Neustart). Liefert das neue Ergebnis;
// bei fellBack zeigt der Aufrufer TABLET_TOO_SMALL_HINT.
export function setDeviceChoice(choice) {
  writeChoice(isChoice(choice) ? choice : 'auto');
  return applyDevice();
}
