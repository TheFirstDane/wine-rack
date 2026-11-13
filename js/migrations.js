// Datenmodell-Version und Migrationen (reine Logik, auch in Node testbar).
//
// SCHEMA_VERSION ist zugleich die IndexedDB-Version (siehe db.js) und steht in jedem Backup.
//
// So fügst du später eine Änderung am Datenmodell hinzu (Beispiel: Version 2):
//   1. SCHEMA_VERSION auf 2 erhöhen.
//   2. Hier in STEPS einen Schritt "1" ergänzen, der Daten von Version 1 auf 2 hebt:
//        1: (data) => ({ ...data, wines: data.wines.map((w) => ({ ...w, neuesFeld: '' })) }),
//   3. Falls sich Speicher/Indizes ändern: in db.js migrate() einen "if (oldVersion < 2)"-Block ergänzen.
// Dieselben Schritte laufen beim Update der App (IndexedDB) und beim Import älterer Backups.

export const SCHEMA_VERSION = 1;

// STEPS[n] hebt { wines, shelfConfig } von Version n auf n + 1.
// Schritte dürfen die Eingabe nicht verändern, sondern liefern neue Objekte.
export const STEPS = {};

export function migrateData(data, from, to = SCHEMA_VERSION, steps = STEPS) {
  if (from > to) {
    throw new Error(`Die Daten haben Version ${from}, diese App kennt nur Version ${to}. Bitte die App aktualisieren.`);
  }
  let current = data;
  for (let v = from; v < to; v++) {
    if (!steps[v]) throw new Error(`Es fehlt die Migration von Version ${v} auf ${v + 1}.`);
    current = steps[v](current);
  }
  return current;
}
